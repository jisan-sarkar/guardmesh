import { parseStockReservationResultEvent } from "@guardmesh/events";
import { configureSecurityEventPublisher, connectWorkflowBroker, consumeWithAck, ordersStockTopology, RabbitMqPublisher, securityExchange, workflowExchange } from "@guardmesh/messaging";
import { PostgresOutboxRelay } from "@guardmesh/outbox";
import { currentTraceId, currentTraceparent, defaultReadiness } from "@guardmesh/observability";
import pg from "pg";

import { createOrdersDatabase, PostgresOrderRepository } from "@guardmesh/orders-service";

export async function startOrdersWorkflow(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!databaseUrl || !brokerUrl) return;

  let pool: pg.Pool | undefined;
  let broker: Awaited<ReturnType<typeof connectWorkflowBroker>> | undefined;
  try {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await assertMigration(pool, "orders_schema_migrations", "001_create_orders");
    const repository = new PostgresOrderRepository(createOrdersDatabase(databaseUrl));
    const workflowBroker = await connectWorkflowBroker(brokerUrl, { topologies: [ordersStockTopology], exchanges: [securityExchange] });
    broker = workflowBroker;
    configureSecurityEventPublisher((event) => {
      new RabbitMqPublisher(workflowBroker.channel, securityExchange, "security.event.v1").publish({
        ...event,
        traceId: event.traceId ?? currentTraceId(),
        traceparent: event.traceparent ?? currentTraceparent(),
      });
    });
    const relay = new PostgresOutboxRelay(pool, "orders_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        await new RabbitMqPublisher(workflowBroker.channel, workflowExchange, type).publishConfirmed(event);
      },
    });

    await consumeWithAck(workflowBroker.channel, "orders.stock-results", async (message) => {
      const event = parseStockReservationResultEvent(message);
      if (!repository.applyStockOutcomeOnce) throw new Error("orders repository lacks inbox support");
      await repository.applyStockOutcomeOnce(event.eventId, event);
    }, { retryExchange: "", retryRoutingKey: ordersStockTopology.queue, maxAttempts: 3 });
    defaultReadiness.markReady();

    const tick = async () => {
      try {
        await relay.runOnce(20);
      } catch (error) {
        console.error("orders outbox relay failed", error);
      }
    };
    await tick();
    setInterval(() => void tick(), 1_000).unref();
  } catch (error) {
    console.error("orders workflow is unavailable", error);
    await broker?.connection.close().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    setTimeout(() => void startOrdersWorkflow(), 2_000);
  }
}

async function assertMigration(pool: pg.Pool, tableName: string, migrationId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM ${tableName} WHERE migration_id = $1`,
    [migrationId],
  );
  if (result.rowCount !== 1) throw new Error(`required migration is missing: ${migrationId}`);
}
