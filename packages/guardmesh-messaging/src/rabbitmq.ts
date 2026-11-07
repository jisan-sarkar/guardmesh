import type { Channel, ConsumeMessage, Options } from "amqplib";
import amqp from "amqplib";

export const workflowExchange = "guardmesh.events";
export const securityExchange = "guardmesh.security";
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

export const securityEventsTopology: QueueTopology = {
  exchange: securityExchange,
  queue: "security.events",
  routingKey: "security.event.v1",
  deadLetterExchange,
  deadLetterRoutingKey: "security.events.failed",
};

export type BrokerTopologyOptions = Readonly<{
  topologies?: readonly QueueTopology[];
  exchanges?: readonly string[];
}>;

export async function connectWorkflowBroker(
  url: string,
  options: BrokerTopologyOptions = {},
): Promise<{
  connection: amqp.ChannelModel;
  channel: amqp.ConfirmChannel;
}> {
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  const topologies = options.topologies ?? [inventoryOrderTopology, ordersStockTopology, securityEventsTopology];
  const exchanges = new Set(options.exchanges ?? []);
  for (const topology of topologies) {
    await configureTopology(channel, topology);
  }
  for (const exchange of exchanges) {
    await channel.assertExchange(exchange, "topic", { durable: true });
  }
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
    private readonly channel: Pick<Channel, "publish"> & {
      waitForConfirms?: () => Promise<void>;
      on?: (event: string, listener: (message: { properties?: { messageId?: string } }) => void) => void;
      removeListener?: (event: string, listener: (message: { properties?: { messageId?: string } }) => void) => void;
    },
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

  public async publishConfirmed(event: Readonly<Record<string, unknown>>): Promise<void> {
    const channel = this.channel;
    const eventId = typeof event.eventId === "string" ? event.eventId : undefined;
    let returned = false;
    const onReturn = (message: { properties?: { messageId?: string } }) => {
      if (eventId === undefined || message.properties?.messageId === eventId) returned = true;
    };
    channel.on?.("return", onReturn);
    this.publish(event);
    try {
      const waitForConfirms = this.channel.waitForConfirms;
      if (waitForConfirms) await waitForConfirms.call(this.channel);
      if (returned) throw new Error("broker returned an unroutable mandatory message");
    } finally {
      channel.removeListener?.("return", onReturn);
    }
  }
}

let securityEventPublisher: ((event: Readonly<Record<string, unknown>>) => void) | undefined;

export function configureSecurityEventPublisher(
  publisher: (event: Readonly<Record<string, unknown>>) => void,
): void {
  securityEventPublisher = publisher;
}

export function publishSecurityEvent(event: Readonly<Record<string, unknown>>): void {
  securityEventPublisher?.(event);
}

export type MessageHandler = (message: unknown, raw: ConsumeMessage) => Promise<void>;

export type ConsumeRetryOptions = Readonly<{
  retryExchange: string;
  retryRoutingKey: string;
  maxAttempts: number;
}>;

export async function consumeWithAck(
  channel: Pick<Channel, "consume" | "ack" | "nack"> & Partial<Pick<Channel, "publish">>,
  queue: string,
  handler: MessageHandler,
  retryOptions?: ConsumeRetryOptions,
): Promise<void> {
  await channel.consume(queue, async (raw) => {
    if (!raw) return;

    try {
      const message: unknown = JSON.parse(raw.content.toString("utf8"));
      await handler(message, raw);
      channel.ack(raw);
    } catch {
      const headers = raw.properties?.headers ?? {};
      const attempt = typeof headers["x-retry-count"] === "number" ? headers["x-retry-count"] : 0;
      const publish = channel.publish?.bind(channel);
      const canRetry =
        retryOptions !== undefined && attempt < retryOptions.maxAttempts && publish !== undefined;
      if (canRetry) {
        const accepted = publish(
          retryOptions.retryExchange,
          retryOptions.retryRoutingKey,
          raw.content,
          {
            persistent: true,
            contentType: raw.properties?.contentType ?? "application/json",
            headers: { ...headers, "x-retry-count": attempt + 1 },
          },
        );
        if (accepted) {
          channel.ack(raw);
          return;
        }
      }
      channel.nack(raw, false, false);
    }
  });
}
