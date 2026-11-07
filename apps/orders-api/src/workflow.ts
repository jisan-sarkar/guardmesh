import { parseStockReservationResultEvent } from "@guardmesh/events";
import { connectWorkflowBroker, consumeWithAck, RabbitMqPublisher, workflowExchange } from "@guardmesh/messaging";
import { PostgresOutboxRelay } from "@guardmesh/outbox";
import pg from "pg";

import { createOrdersDatabase, PostgresOrderRepository } from "@guardmesh/orders-service";

export async function startOrdersWorkflow(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!databaseUrl || !brokerUrl) return;

  try {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders_outbox (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders_inbox (
        event_id TEXT PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL
      );
    `);
    const repository = new PostgresOrderRepository(createOrdersDatabase(databaseUrl));
    const broker = await connectWorkflowBroker(brokerUrl);
    const relay = new PostgresOutboxRelay(pool, "orders_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        new RabbitMqPublisher(broker.channel, workflowExchange, type).publish(event);
      },
    });

    await consumeWithAck(broker.channel, "orders.stock-results", async (message) => {
      const event = parseStockReservationResultEvent(message);
      if (!repository.applyStockOutcomeOnce) throw new Error("orders repository lacks inbox support");
      await repository.applyStockOutcomeOnce(event.eventId, event);
    });

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
    setTimeout(() => void startOrdersWorkflow(), 2_000);
  }
}
