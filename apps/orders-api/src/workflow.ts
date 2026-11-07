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

  try {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const repository = new PostgresOrderRepository(createOrdersDatabase(databaseUrl));
    const broker = await connectWorkflowBroker(brokerUrl, { topologies: [ordersStockTopology], exchanges: [securityExchange] });
    configureSecurityEventPublisher((event) => {
      new RabbitMqPublisher(broker.channel, securityExchange, "security.event.v1").publish({
        ...event,
        traceId: event.traceId ?? currentTraceId(),
        traceparent: event.traceparent ?? currentTraceparent(),
      });
    });
    const relay = new PostgresOutboxRelay(pool, "orders_outbox", {
      publish: async (event) => {
        const type = typeof event.type === "string" ? event.type : undefined;
        if (!type) throw new Error("outbox event type is missing");
        await new RabbitMqPublisher(broker.channel, workflowExchange, type).publishConfirmed(event);
      },
    });

    await consumeWithAck(broker.channel, "orders.stock-results", async (message) => {
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
    setTimeout(() => void startOrdersWorkflow(), 2_000);
  }
}
