import { describe, expect, it } from "vitest";

import { parseOrderCreatedEvent, parseStockReservationResultEvent } from "../src/events.js";

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

describe("event contracts", () => {
  it("parses a versioned order-created event", () => {
    expect(parseOrderCreatedEvent(event)).toEqual(event);
  });

  it("accepts bounded trace context on event envelopes", () => {
    expect(parseOrderCreatedEvent({
      ...event,
      traceId: "0123456789abcdef0123456789abcdef",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    })).toMatchObject({ traceId: expect.any(String), traceparent: expect.any(String) });
  });

  it("rejects a mismatched producer or event type", () => {
    expect(() => parseOrderCreatedEvent({ ...event, producer: "inventory-api" })).toThrow();
    expect(() => parseOrderCreatedEvent({ ...event, type: "orders.order-created.v2" })).toThrow();
  });

  it("parses a correlated stock result", () => {
    expect(
      parseStockReservationResultEvent({
        version: 1,
        eventId: "event-2",
        type: "inventory.stock-reservation-result.v1",
        occurredAt: "2026-11-07T12:00:01.000Z",
        correlationId: "order-1",
        causationId: "event-1",
        producer: "inventory-api",
        payload: {
          orderId: "order-1",
          requestFingerprint: "fingerprint-1",
          locationId: "loc-a",
          result: "RESERVED",
        },
      }),
    ).toMatchObject({ type: "inventory.stock-reservation-result.v1" });
  });
});
