import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import {
  securityEventSchema,
  type SecurityAlert,
  type SecurityEvent,
  type SecurityEventStore,
} from "@guardmesh/security-core";

type SecurityDatabase = {
  security_events: {
    event_id: string;
    event_json: string;
    occurred_at: string;
  };
  security_alerts: {
    alert_id: string;
    alert_json: string;
    acknowledged: boolean;
    created_at: string;
  };
};

export function createSecurityDatabase(connectionString: string): Kysely<SecurityDatabase> {
  return new Kysely<SecurityDatabase>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}

export class PostgresSecurityEventStore implements SecurityEventStore {
  public constructor(private readonly db: Kysely<SecurityDatabase>) {}

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
    return rows.map((row) => securityEventSchema.parse(JSON.parse(row.event_json)));
  }

  public async appendAlert(alert: SecurityAlert): Promise<void> {
    await this.db
      .insertInto("security_alerts")
      .values({
        alert_id: alert.alertId,
        alert_json: JSON.stringify(alert),
        acknowledged: alert.acknowledged,
        created_at: alert.createdAt,
      })
      .onConflict((conflict) => conflict.column("alert_id").doNothing())
      .execute();
  }

  public async listAlerts(): Promise<SecurityAlert[]> {
    const rows = await this.db
      .selectFrom("security_alerts")
      .select("alert_json")
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((row) => JSON.parse(row.alert_json) as SecurityAlert);
  }

  public async acknowledgeAlert(alertId: string): Promise<void> {
    await this.db
      .updateTable("security_alerts")
      .set({ acknowledged: true })
      .where("alert_id", "=", alertId)
      .execute();
  }
}
