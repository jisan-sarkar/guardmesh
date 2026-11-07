import { connectWorkflowBroker, consumeWithAck, securityEventsTopology } from "@guardmesh/messaging";
import { SecurityService } from "@guardmesh/security-service";
import { defaultReadiness } from "@guardmesh/observability";
import pg from "pg";

export async function startSecurityWorkflow(security: SecurityService): Promise<void> {
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!brokerUrl) return;

  try {
    const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
    if (pool) {
      await assertMigration(pool, "security_schema_migrations", "001_create_security");
      await pool.end();
    }
    const broker = await connectWorkflowBroker(brokerUrl, { topologies: [securityEventsTopology] });
    await consumeWithAck(broker.channel, "security.events", async (message) => {
      await security.ingest(message);
    }, { retryExchange: "", retryRoutingKey: securityEventsTopology.queue, maxAttempts: 3 });
    defaultReadiness.markReady();
  } catch (error) {
    console.error("security workflow is unavailable", error);
    setTimeout(() => void startSecurityWorkflow(security), 2_000).unref();
  }
}

async function assertMigration(pool: pg.Pool, tableName: string, migrationId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM ${tableName} WHERE migration_id = $1`,
    [migrationId],
  );
  if (result.rowCount !== 1) throw new Error(`required migration is missing: ${migrationId}`);
}
