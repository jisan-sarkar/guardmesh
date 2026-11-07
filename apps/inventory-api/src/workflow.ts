import { configureSecurityEventPublisher, connectWorkflowBroker, consumeWithAck, inventoryOrderTopology, RabbitMqPublisher, securityExchange, workflowExchange } from "@guardmesh/messaging";
import { PostgresOutboxRelay } from "@guardmesh/outbox";
import { currentTraceId, currentTraceparent, defaultReadiness } from "@guardmesh/observability";
import pg from "pg";

import {
  createInventoryDatabase,
  PostgresInventoryStore,
} from "@guardmesh/inventory-service";

export async function startInventoryWorkflow(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!databaseUrl || !brokerUrl) return;

  let pool: pg.Pool | undefined;
  let broker: Awaited<ReturnType<typeof connectWorkflowBroker>> | undefined;
  try {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await assertMigration(pool, "inventory_schema_migrations", "001_create_inventory");
    const store = new PostgresInventoryStore(createInventoryDatabase(databaseUrl));
    const workflowBroker = await connectWorkflowBroker(brokerUrl, { topologies: [inventoryOrderTopology], exchanges: [securityExchange] });
    broker = workflowBroker;
    configureSecurityEventPublisher((event) => {
      new RabbitMqPublisher(workflowBroker.channel, securityExchange, "security.event.v1").publish({
        ...event,
        traceId: event.traceId ?? currentTraceId(),
        traceparent: event.traceparent ?? currentTraceparent(),
      });
    });
    const relay = new PostgresOutboxRelay(pool, "inventory_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        const exchange = type === "PRIVILEGED_ACTION" ? securityExchange : workflowExchange;
        const routingKey = type === "PRIVILEGED_ACTION" ? "security.event.v1" : type;
        await new RabbitMqPublisher(workflowBroker.channel, exchange, routingKey).publishConfirmed(event);
      },
    });

    await consumeWithAck(workflowBroker.channel, "inventory.orders", async (message) => {
      await store.processOrderCreated(
        message,
        () => crypto.randomUUID(),
        () => new Date().toISOString(),
      );
    }, { retryExchange: "", retryRoutingKey: inventoryOrderTopology.queue, maxAttempts: 3 });
    defaultReadiness.markReady();

    const tick = async () => {
      try {
        await relay.runOnce(20);
      } catch (error) {
        console.error("inventory outbox relay failed", error);
      }
    };
    await tick();
    setInterval(() => void tick(), 1_000).unref();
  } catch (error) {
    console.error("inventory workflow is unavailable", error);
    await broker?.connection.close().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    setTimeout(() => void startInventoryWorkflow(), 2_000);
  }
}

async function assertMigration(pool: pg.Pool, tableName: string, migrationId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM ${tableName} WHERE migration_id = $1`,
    [migrationId],
  );
  if (result.rowCount !== 1) throw new Error(`required migration is missing: ${migrationId}`);
}
