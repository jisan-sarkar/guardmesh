import { describe, expect, it, vi } from "vitest";
import type { ConsumeMessage } from "amqplib";

import { RabbitMqPublisher, configureTopology, consumeWithAck } from "../src/rabbitmq.js";

const topology = {
  exchange: "guardmesh.events",
  queue: "inventory.orders",
  routingKey: "orders.order-created.v1",
  deadLetterExchange: "guardmesh.dlx",
  deadLetterRoutingKey: "inventory.orders.failed",
};

describe("RabbitMQ transport", () => {
  it("configures durable exchanges, queue, dead-lettering, and binding", async () => {
    const channel = {
      assertExchange: vi.fn().mockResolvedValue({}),
      assertQueue: vi.fn().mockResolvedValue({}),
      bindQueue: vi.fn().mockResolvedValue(undefined),
    };

    await configureTopology(channel as never, topology);

    expect(channel.assertExchange).toHaveBeenCalledWith("guardmesh.events", "topic", { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith("inventory.orders", {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "guardmesh.dlx",
        "x-dead-letter-routing-key": "inventory.orders.failed",
      },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      "inventory.orders",
      "guardmesh.events",
      "orders.order-created.v1",
    );
  });

  it("publishes persistent JSON with message and correlation IDs", () => {
    const publish = vi.fn().mockReturnValue(true);
    const publisher = new RabbitMqPublisher({ publish }, "guardmesh.events", "orders.order-created.v1");

    publisher.publish({ eventId: "event-1", correlationId: "order-1", type: "orders.order-created.v1" });

    expect(publish).toHaveBeenCalledWith(
      "guardmesh.events",
      "orders.order-created.v1",
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, messageId: "event-1", correlationId: "order-1" }),
    );
  });

  it("waits for publisher confirms when the channel supports them", async () => {
    const publish = vi.fn().mockReturnValue(true);
    const waitForConfirms = vi.fn().mockResolvedValue(undefined);
    const publisher = new RabbitMqPublisher({ publish, waitForConfirms }, "guardmesh.events", "orders.order-created.v1");

    await publisher.publishConfirmed({ eventId: "event-1", type: "orders.order-created.v1" });
    expect(waitForConfirms).toHaveBeenCalledOnce();
  });

  it("acknowledges successfully handled messages", async () => {
    const raw = { content: Buffer.from('{"eventId":"event-1"}') } as ConsumeMessage;
    const consume = vi.fn().mockImplementation(async (_queue, callback) => callback(raw));
    const ack = vi.fn();
    const nack = vi.fn();

    await consumeWithAck({ consume, ack, nack } as never, "inventory.orders", async (message) => {
      expect(message).toEqual({ eventId: "event-1" });
    });

    expect(ack).toHaveBeenCalledWith(raw);
    expect(nack).not.toHaveBeenCalled();
  });

  it("dead-letters malformed or failed messages", async () => {
    const raw = { content: Buffer.from("not-json") } as ConsumeMessage;
    const consume = vi.fn().mockImplementation(async (_queue, callback) => callback(raw));
    const ack = vi.fn();
    const nack = vi.fn();

    await consumeWithAck({ consume, ack, nack } as never, "inventory.orders", async () => {
      throw new Error("handler failure");
    });

    expect(nack).toHaveBeenCalledWith(raw, false, false);
    expect(ack).not.toHaveBeenCalled();
  });
});
