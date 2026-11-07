import { describe, expect, it, vi } from "vitest";

import { InMemoryOrderRepository } from "@guardmesh/orders-domain";

import { OrderForbiddenError, OrdersService } from "../src/orders-service.js";

const actor = { actorId: "cashier-1", roles: ["cashier"], locationId: "loc-a" };
const input = { requestFingerprint: "fingerprint-1", items: [{ sku: "sku-1", quantity: 2 }] };
const allow = {
  allow: true,
  reason: "action permitted by policy",
  policyVersion: "guardmesh-policy-v1",
};
const deny = {
  allow: false,
  reason: "action denied by policy",
  policyVersion: "guardmesh-policy-v1",
};

function createService(decision = allow) {
  const repository = new InMemoryOrderRepository();
  const authorize = vi.fn().mockResolvedValue(decision);
  const service = new OrdersService(
    repository,
    { authorize },
    () => "order-1",
    () => "2026-11-07T12:00:00.000Z",
  );

  return { authorize, repository, service };
}

describe("orders service", () => {
  it("authorizes and creates a pending order", async () => {
    const { authorize, service } = createService();

    await expect(service.createOrder(actor, input)).resolves.toMatchObject({
      orderId: "order-1",
      actorId: "cashier-1",
      locationId: "loc-a",
      status: "PENDING_STOCK",
    });
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("denies before creating an order", async () => {
    const { authorize, repository, service } = createService(deny);

    await expect(service.createOrder(actor, input)).rejects.toBeInstanceOf(OrderForbiddenError);
    expect(authorize).toHaveBeenCalledOnce();
    await expect(repository.findById("order-1")).resolves.toBeUndefined();
  });

  it("returns an authorized idempotent replay without inserting again", async () => {
    const { authorize, repository, service } = createService();
    const first = await service.createOrder(actor, input);
    const second = await service.createOrder(actor, input);

    expect(second).toEqual(first);
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("does not reveal a prior replay when authorization is revoked", async () => {
    const { authorize, service } = createService();
    await service.createOrder(actor, input);
    authorize.mockResolvedValueOnce(deny);

    await expect(service.createOrder(actor, input)).rejects.toBeInstanceOf(OrderForbiddenError);
  });

  it("rejects malformed input before policy evaluation", async () => {
    const { authorize, service } = createService();

    await expect(service.createOrder(actor, { requestFingerprint: "fingerprint-1", items: [] })).rejects.toThrow();
    expect(authorize).not.toHaveBeenCalled();
  });

  it("reads an order only after a matching-location policy decision", async () => {
    const { service } = createService();
    const created = await service.createOrder(actor, input);

    await expect(service.getOrder(actor, created.orderId)).resolves.toEqual(created);
  });

  it("does not disclose an order from another location", async () => {
    const { service } = createService();
    const created = await service.createOrder(actor, input);

    await expect(
      service.getOrder({ ...actor, locationId: "loc-b" }, created.orderId),
    ).resolves.toBeUndefined();
  });
});
