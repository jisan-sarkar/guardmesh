import type { Channel, ConsumeMessage, Options } from "amqplib";
import amqp from "amqplib";

export const workflowExchange = "guardmesh.events";
export const deadLetterExchange = "guardmesh.dlx";

export const inventoryOrderTopology: QueueTopology = {
  exchange: workflowExchange,
  queue: "inventory.orders",
  routingKey: "orders.order-created.v1",
  deadLetterExchange,
  deadLetterRoutingKey: "inventory.orders.failed",
};

export const ordersStockTopology: QueueTopology = {
  exchange: workflowExchange,
  queue: "orders.stock-results",
  routingKey: "inventory.stock-reservation-result.v1",
  deadLetterExchange,
  deadLetterRoutingKey: "orders.stock-results.failed",
};

export async function connectWorkflowBroker(url: string): Promise<{
  connection: amqp.ChannelModel;
  channel: amqp.Channel;
}> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await configureTopology(channel, inventoryOrderTopology);
  await configureTopology(channel, ordersStockTopology);
  return { connection, channel };
}

export type QueueTopology = Readonly<{
  exchange: string;
  queue: string;
  routingKey: string;
  deadLetterExchange: string;
  deadLetterRoutingKey: string;
}>;

export async function configureTopology(channel: Channel, topology: QueueTopology): Promise<void> {
  await channel.assertExchange(topology.exchange, "topic", { durable: true });
  await channel.assertExchange(topology.deadLetterExchange, "topic", { durable: true });
  await channel.assertQueue(topology.queue, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": topology.deadLetterExchange,
      "x-dead-letter-routing-key": topology.deadLetterRoutingKey,
    },
  });
  await channel.bindQueue(topology.queue, topology.exchange, topology.routingKey);
  const deadLetterQueue = `${topology.queue}.failed`;
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.bindQueue(
    deadLetterQueue,
    topology.deadLetterExchange,
    topology.deadLetterRoutingKey,
  );
}

export class RabbitMqPublisher {
  public constructor(
    private readonly channel: Pick<Channel, "publish">,
    private readonly exchange: string,
    private readonly routingKey: string,
  ) {}

  public publish(event: Readonly<Record<string, unknown>>): void {
    const eventId = typeof event.eventId === "string" ? event.eventId : undefined;
    const correlationId = typeof event.correlationId === "string" ? event.correlationId : undefined;
    const options: Options.Publish = {
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      ...(eventId ? { messageId: eventId } : {}),
      ...(correlationId ? { correlationId } : {}),
    };

    const accepted = this.channel.publish(
      this.exchange,
      this.routingKey,
      Buffer.from(JSON.stringify(event)),
      options,
    );
    if (!accepted) {
      throw new Error("broker write buffer is full");
    }
  }
}

export type MessageHandler = (message: unknown, raw: ConsumeMessage) => Promise<void>;

export async function consumeWithAck(
  channel: Pick<Channel, "consume" | "ack" | "nack">,
  queue: string,
  handler: MessageHandler,
): Promise<void> {
  await channel.consume(queue, async (raw) => {
    if (!raw) return;

    try {
      const message: unknown = JSON.parse(raw.content.toString("utf8"));
      await handler(message, raw);
      channel.ack(raw);
    } catch {
      channel.nack(raw, false, false);
    }
  });
}
