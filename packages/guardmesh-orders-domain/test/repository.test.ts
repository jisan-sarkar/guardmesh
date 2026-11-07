import { describe, expect, it } from "vitest";

import { DuplicateOrderError, InMemoryOrderRepository } from "../src/repository.js";
import { createPendingOrder } from "../src/order.js";

const order = createPendingOrder(
  {
    actorId: "cashier-1",
    orderId: "order-1",
    requestFingerprint: "fingerprint-1",
    locationId: "loc-a",
    items: [{ sku: "sku-1", quantity: 1 }],
  },
  "2026-11-07T12:00:00.000Z",
);

describe("in-memory order repository", () => {
  it("finds orders by ID and actor fingerprint", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.insert(order);

    await expect(repository.findById("order-1")).resolves.toEqual(order);
    await expect(repository.findByActorAndFingerprint("cashier-1", "fingerprint-1")).resolves.toEqual(order);
  });

  it("rejects duplicate IDs and actor fingerprints", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.insert(order);

    await expect(repository.insert(order)).rejects.toBeInstanceOf(DuplicateOrderError);
    await expect(
      repository.insert({ ...order, orderId: "order-2" }),
    ).rejects.toBeInstanceOf(DuplicateOrderError);
  });

  it("updates an existing order", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.insert(order);
    const updated = { ...order, status: "CONFIRMED" as const, version: 2 };

    await repository.update(updated);
    await expect(repository.findById("order-1")).resolves.toEqual(updated);
  });
});
