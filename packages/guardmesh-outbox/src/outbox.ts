export type OutboxRecord = Readonly<{
  eventId: string;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  attempts: number;
}>;

export interface OutboxStore {
  claim(limit: number): Promise<OutboxRecord[]>;
  markPublished(eventId: string): Promise<void>;
  markFailed(eventId: string): Promise<void>;
}

export interface EventPublisher {
  publish(event: Readonly<Record<string, unknown>>): void | Promise<void>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private readonly pending = new Map<string, OutboxRecord>();

  public add(record: OutboxRecord): void {
    if (this.pending.has(record.eventId)) {
      throw new Error("outbox event already exists");
    }
    this.pending.set(record.eventId, record);
  }

  public async claim(limit: number): Promise<OutboxRecord[]> {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("claim limit must be positive");
    return [...this.pending.values()].slice(0, limit);
  }

  public async markPublished(eventId: string): Promise<void> {
    this.pending.delete(eventId);
  }

  public async markFailed(eventId: string): Promise<void> {
    const record = this.pending.get(eventId);
    if (record) this.pending.set(eventId, { ...record, attempts: record.attempts + 1 });
  }
}

export class OutboxRelay {
  public constructor(
    private readonly store: OutboxStore,
    private readonly publisher: EventPublisher,
  ) {}

  public async runOnce(limit: number): Promise<{ published: number; failed: number }> {
    const records = await this.store.claim(limit);
    let published = 0;
    let failed = 0;

    for (const record of records) {
      try {
        await this.publisher.publish(record.payload);
        await this.store.markPublished(record.eventId);
        published += 1;
      } catch {
        await this.store.markFailed(record.eventId);
        failed += 1;
      }
    }

    return { published, failed };
  }
}
import type { Pool } from "pg";


export class PostgresOutboxRelay {
  public constructor(
    private readonly pool: Pool,
    private readonly tableName: string,
    private readonly publisher: EventPublisher,
  ) {
    if (!/^[a-z_]+$/u.test(tableName)) throw new Error("invalid outbox table name");
  }

  public async runOnce(limit: number): Promise<{ published: number; failed: number }> {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("relay limit must be positive");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ event_id: string; payload_json: unknown }>(
        `SELECT event_id, payload_json
           FROM ${this.tableName}
          WHERE published_at IS NULL
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [limit],
      );
      const rows = result.rows;
      if (rows.length > 0) {
        await client.query(
          `UPDATE ${this.tableName}
              SET attempts = attempts + 1
            WHERE event_id = ANY($1::text[])`,
          [rows.map((row) => row.event_id)],
        );
      }

      let published = 0;
      let failed = 0;
      for (const row of rows) {
        const payload = typeof row.payload_json === "string"
          ? JSON.parse(row.payload_json) as Readonly<Record<string, unknown>>
          : row.payload_json as Readonly<Record<string, unknown>>;
        try {
          // Keep the row lock until the broker publish and durable mark complete.
          // A crash can still cause a replay, which downstream inboxes must absorb,
          // but concurrent relay replicas cannot publish the same claim together.
          await this.publisher.publish(payload);
          await client.query(
            `UPDATE ${this.tableName} SET published_at = NOW() WHERE event_id = $1`,
            [row.event_id],
          );
          published += 1;
        } catch {
          failed += 1;
        }
      }

      await client.query("COMMIT");
      return { published, failed };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
