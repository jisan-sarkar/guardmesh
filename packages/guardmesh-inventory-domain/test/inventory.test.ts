import { describe, expect, it } from "vitest";

import { InventoryCommandError, reserveStock, type InventoryState } from "../src/inventory.js";

const initialState: InventoryState = {
  items: {
    "sku-1": { sku: "sku-1", locationId: "loc-a", available: 5 },
    "sku-2": { sku: "sku-2", locationId: "loc-a", available: 1 },
  },
  reservations: {},
};

const command = {
  orderId: "order-1",
  requestFingerprint: "fingerprint-1",
  locationId: "loc-a",
  items: [
    { sku: "sku-1", quantity: 2 },
    { sku: "sku-2", quantity: 1 },
  ],
};

describe("inventory domain", () => {
  it("reserves all lines atomically", () => {
    const result = reserveStock(initialState, command);

    expect(result.reservation.result).toBe("RESERVED");
    expect(result.state.items["sku-1"]?.available).toBe(3);
    expect(result.state.items["sku-2"]?.available).toBe(0);
  });

  it("does not partially decrement stock when one line is insufficient", () => {
    const result = reserveStock(initialState, {
      ...command,
      items: [
        { sku: "sku-1", quantity: 2 },
        { sku: "sku-2", quantity: 2 },
      ],
    });

    expect(result.reservation.result).toBe("REJECTED");
    expect(result.state.items).toEqual(initialState.items);
  });

  it("aggregates duplicate SKU lines before decrementing", () => {
    const result = reserveStock(initialState, {
      ...command,
      items: [
        { sku: "sku-1", quantity: 2 },
        { sku: "sku-1", quantity: 2 },
      ],
    });

    expect(result.reservation.result).toBe("RESERVED");
    expect(result.state.items["sku-1"]?.available).toBe(1);
  });

  it("returns the prior result without applying a duplicate reservation", () => {
    const first = reserveStock(initialState, command);
    const second = reserveStock(first.state, command);

    expect(second.reservation).toEqual(first.reservation);
    expect(second.state).toEqual(first.state);
  });

  it("rejects a conflicting command for an existing order", () => {
    const first = reserveStock(initialState, command);

    expect(() => reserveStock(first.state, {
      ...command,
      requestFingerprint: "fingerprint-2",
      items: [{ sku: "sku-1", quantity: 1 }],
    })).toThrow("conflicting reservation command for order");
    expect(first.state.items["sku-1"]?.available).toBe(3);
  });

  it("rejects an item owned by another location", () => {
    expect(() =>
      reserveStock(initialState, { ...command, locationId: "loc-b" }),
    ).toThrow(InventoryCommandError);
  });

  it("rejects an unknown SKU without changing state", () => {
    expect(() =>
      reserveStock(initialState, {
        ...command,
        items: [{ sku: "missing", quantity: 1 }],
      }),
    ).toThrow(InventoryCommandError);
  });
});
