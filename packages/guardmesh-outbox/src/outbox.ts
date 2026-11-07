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
