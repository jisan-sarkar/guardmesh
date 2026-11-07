import { describe, expect, it } from "vitest";

import {
  InvalidOrderTransitionError,
  applyStockOutcome,
  createPendingOrder,
} from "../src/order.js";

const command = {
  actorId: "cashier-1",
  orderId: "order-1",
  requestFingerprint: "fingerprint-1",
  locationId: "loc-a",
  items: [{ sku: "sku-1", quantity: 2 }],
};

describe("order domain", () => {
  it("creates a pending order with version one", () => {
    expect(createPendingOrder(command, "2026-11-07T12:00:00.000Z")).toEqual({
      ...command,
      status: "PENDING_STOCK",
      version: 1,
      createdAt: "2026-11-07T12:00:00.000Z",
    });
  });

  it("confirms a pending order after a matching reservation", () => {
    const order = createPendingOrder(command, "2026-11-07T12:00:00.000Z");

    expect(
      applyStockOutcome(order, {
        orderId: "order-1",
        requestFingerprint: "fingerprint-1",
        locationId: "loc-a",
        result: "RESERVED",
      }),
    ).toMatchObject({ status: "CONFIRMED", version: 2 });
  });

  it("rejects a pending order after a matching stock rejection", () => {
    const order = createPendingOrder(command, "2026-11-07T12:00:00.000Z");

    expect(
      applyStockOutcome(order, {
        orderId: "order-1",
        requestFingerprint: "fingerprint-1",
        locationId: "loc-a",
        result: "REJECTED",
      }),
    ).toMatchObject({ status: "REJECTED", version: 2 });
  });

  it.each([
    ["orderId", { orderId: "other-order" }],
    ["request fingerprint", { requestFingerprint: "other-fingerprint" }],
    ["location", { locationId: "loc-b" }],
  ])("rejects a stock outcome with a mismatched %s", (_label, mismatch) => {
    const order = createPendingOrder(command, "2026-11-07T12:00:00.000Z");

    expect(() =>
      applyStockOutcome(order, {
        orderId: "order-1",
        requestFingerprint: "fingerprint-1",
        locationId: "loc-a",
        result: "RESERVED",
        ...mismatch,
      }),
    ).toThrow(InvalidOrderTransitionError);
  });

  it("does not allow a final order to transition again", () => {
    const pending = createPendingOrder(command, "2026-11-07T12:00:00.000Z");
    const confirmed = applyStockOutcome(pending, {
      orderId: "order-1",
      requestFingerprint: "fingerprint-1",
      locationId: "loc-a",
      result: "RESERVED",
    });

    expect(() =>
      applyStockOutcome(confirmed, {
        orderId: "order-1",
        requestFingerprint: "fingerprint-1",
        locationId: "loc-a",
        result: "REJECTED",
      }),
    ).toThrow(InvalidOrderTransitionError);
  });

  it("rejects invalid order input", () => {
    expect(() => createPendingOrder({ ...command, items: [] }, "2026-11-07T12:00:00.000Z")).toThrow();
    expect(() => createPendingOrder(command, "not-a-date")).toThrow();
  });
});
