import type { Channel, ConsumeMessage, Options } from "amqplib";

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
