import { configureSecurityEventPublisher, connectWorkflowBroker, consumeWithAck, RabbitMqPublisher, securityExchange, workflowExchange } from "@guardmesh/messaging";
import { PostgresOutboxRelay } from "@guardmesh/outbox";
import { defaultReadiness } from "@guardmesh/observability";
import pg from "pg";

import {
  createInventoryDatabase,
  PostgresInventoryStore,
} from "@guardmesh/inventory-service";

export async function startInventoryWorkflow(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!databaseUrl || !brokerUrl) return;

  try {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_inbox (
        event_id TEXT PRIMARY KEY,
        result_event_json JSONB NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inventory_outbox (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);
    const store = new PostgresInventoryStore(createInventoryDatabase(databaseUrl));
    const broker = await connectWorkflowBroker(brokerUrl);
    configureSecurityEventPublisher((event) => {
      new RabbitMqPublisher(broker.channel, securityExchange, "security.event.v1").publish(event);
    });
    const relay = new PostgresOutboxRelay(pool, "inventory_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        new RabbitMqPublisher(broker.channel, workflowExchange, type).publish(event);
      },
    });

    await consumeWithAck(broker.channel, "inventory.orders", async (message) => {
      await store.processOrderCreated(
        message,
        () => crypto.randomUUID(),
        () => new Date().toISOString(),
      );
    });
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
    setTimeout(() => void startInventoryWorkflow(), 2_000);
  }
}
