import { describe, expect, it } from "vitest";

import { InventoryEventConsumer } from "../src/consumer.js";

const initialState = {
  items: { "sku-1": { sku: "sku-1", locationId: "loc-a", available: 2 } },
  reservations: {},
};

const event = {
  version: 1,
  eventId: "event-1",
  type: "orders.order-created.v1",
  occurredAt: "2026-11-07T12:00:00.000Z",
  correlationId: "order-1",
  producer: "orders-api",
  payload: {
    orderId: "order-1",
    requestFingerprint: "fingerprint-1",
    locationId: "loc-a",
    items: [{ sku: "sku-1", quantity: 1 }],
  },
};

function createConsumer() {
  return new InventoryEventConsumer(
    initialState,
    () => "result-event-1",
    () => "2026-11-07T12:00:01.000Z",
  );
}

describe("inventory event consumer", () => {
  it("reserves stock and emits a correlated result", () => {
    const consumer = createConsumer();
    const result = consumer.handleOrderCreated(event);

    expect(result).toMatchObject({
      type: "inventory.stock-reservation-result.v1",
      correlationId: "order-1",
      causationId: "event-1",
      payload: { result: "RESERVED" },
    });
    expect(consumer.getState().items["sku-1"]?.available).toBe(1);
  });

  it("returns the same result on redelivery of the same event", () => {
    const consumer = createConsumer();
    const first = consumer.handleOrderCreated(event);
    const second = consumer.handleOrderCreated(event);

    expect(second).toEqual(first);
    expect(consumer.getState().items["sku-1"]?.available).toBe(1);
  });

  it("rejects a conflicting command for an existing order", () => {
    const consumer = createConsumer();
    consumer.handleOrderCreated(event);

    expect(() => consumer.handleOrderCreated({
      ...event,
      eventId: "event-2",
      payload: { ...event.payload, requestFingerprint: "fingerprint-2", items: [{ sku: "sku-1", quantity: 2 }] },
    })).toThrow("conflicting reservation command for order");
    expect(consumer.getState().items["sku-1"]?.available).toBe(1);
  });

  it("emits a rejection without decrementing insufficient stock", () => {
    const consumer = createConsumer();
    const result = consumer.handleOrderCreated({
      ...event,
      eventId: "event-2",
      payload: { ...event.payload, items: [{ sku: "sku-1", quantity: 3 }] },
    });

    expect(result.payload.result).toBe("REJECTED");
    expect(consumer.getState().items["sku-1"]?.available).toBe(2);
  });

  it("rejects malformed event input before changing state", () => {
    const consumer = createConsumer();

    expect(() => consumer.handleOrderCreated({ ...event, producer: "forged-service" })).toThrow();
    expect(consumer.getState()).toEqual(initialState);
  });
});
