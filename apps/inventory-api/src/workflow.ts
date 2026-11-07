import { configureSecurityEventPublisher, connectWorkflowBroker, consumeWithAck, inventoryOrderTopology, RabbitMqPublisher, securityExchange, workflowExchange } from "@guardmesh/messaging";
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
    const store = new PostgresInventoryStore(createInventoryDatabase(databaseUrl));
    const broker = await connectWorkflowBroker(brokerUrl, { topologies: [inventoryOrderTopology], exchanges: [securityExchange] });
    configureSecurityEventPublisher((event) => {
      new RabbitMqPublisher(broker.channel, securityExchange, "security.event.v1").publish(event);
    });
    const relay = new PostgresOutboxRelay(pool, "inventory_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        const exchange = type === "PRIVILEGED_ACTION" ? securityExchange : workflowExchange;
        const routingKey = type === "PRIVILEGED_ACTION" ? "security.event.v1" : type;
        await new RabbitMqPublisher(broker.channel, exchange, routingKey).publishConfirmed(event);
      },
    });

    await consumeWithAck(broker.channel, "inventory.orders", async (message) => {
      await store.processOrderCreated(
        message,
        () => crypto.randomUUID(),
        () => new Date().toISOString(),
      );
    }, { retryExchange: inventoryOrderTopology.exchange, retryRoutingKey: inventoryOrderTopology.routingKey, maxAttempts: 3 });
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
