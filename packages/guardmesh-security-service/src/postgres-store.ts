import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";

import {
  securityEventSchema,
  type SecurityAlert,
  type SecurityEvent,
  type SecurityEventStore,
  SecurityAlertEvaluator,
} from "@guardmesh/security-core";

type SecurityDatabaseConnection = Kysely<SecurityDatabase> | Transaction<SecurityDatabase>;

type SecurityDatabase = {
  security_inbox: {
    event_id: string;
    received_at: string;
  };
  security_events: {
    event_id: string;
    event_json: unknown;
    occurred_at: string;
  };
  security_alerts: {
    alert_id: string;
    alert_json: unknown;
    acknowledged: boolean;
    status: "OPEN" | "ACKNOWLEDGED";
    created_at: string;
  };
};

export function createSecurityDatabase(connectionString: string): Kysely<SecurityDatabase> {
  return new Kysely<SecurityDatabase>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}

export class PostgresSecurityEventStore implements SecurityEventStore {
  public constructor(private readonly db: SecurityDatabaseConnection) {}

  public async appendAndEvaluate(
    event: SecurityEvent,
    evaluator: SecurityAlertEvaluator,
  ): Promise<Readonly<{ event: SecurityEvent; alert?: SecurityAlert }>> {
    return this.db.transaction().execute(async (transaction) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('guardmesh.security.alert-evaluator'))`.execute(transaction);
      const existing = await transaction
        .selectFrom("security_inbox")
        .select("event_id")
        .where("event_id", "=", event.eventId)
        .executeTakeFirst();
      if (existing) return { event };

      await transaction
        .insertInto("security_inbox")
        .values({ event_id: event.eventId, received_at: new Date().toISOString() })
        .execute();
      const txStore = new PostgresSecurityEventStore(transaction);
      await txStore.append(event);
      const alert = await evaluator.evaluateInTransaction(event, txStore);
      return alert === undefined ? { event } : { event, alert };
    });
  }

  public async append(event: SecurityEvent): Promise<void> {
    await this.db
      .insertInto("security_events")
      .values({ event_id: event.eventId, event_json: JSON.stringify(event), occurred_at: event.occurredAt })
      .onConflict((conflict) => conflict.column("event_id").doNothing())
      .execute();
  }

  public async list(): Promise<SecurityEvent[]> {
    const rows = await this.db
      .selectFrom("security_events")
      .select("event_json")
      .orderBy("occurred_at", "asc")
      .execute();
    return rows.map((row) => securityEventSchema.parse(
      typeof row.event_json === "string" ? JSON.parse(row.event_json) : row.event_json,
    ));
  }

  public async appendAlert(alert: SecurityAlert): Promise<void> {
    await this.db
      .insertInto("security_alerts")
      .values({
        alert_id: alert.alertId,
        alert_json: JSON.stringify(alert),
        acknowledged: alert.acknowledged,
        status: alert.status,
        created_at: alert.createdAt,
      })
      .onConflict((conflict) => conflict.column("alert_id").doNothing())
      .execute();
  }

  public async listAlerts(): Promise<SecurityAlert[]> {
    const rows = await this.db
      .selectFrom("security_alerts")
      .select(["alert_json", "acknowledged", "status"])
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((row) => (
      {
        ...(typeof row.alert_json === "string" ? JSON.parse(row.alert_json) : row.alert_json as SecurityAlert),
        acknowledged: row.acknowledged,
        status: row.status,
      } as SecurityAlert
    ));
  }

  public async acknowledgeAlert(alertId: string): Promise<void> {
    await this.db
      .updateTable("security_alerts")
      .set({ acknowledged: true, status: "ACKNOWLEDGED" })
      .where("alert_id", "=", alertId)
      .execute();
  }
}
