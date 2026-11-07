import { describe, expect, it, vi } from "vitest";

import { InventoryForbiddenError, InventoryService } from "../src/consumer.js";
import { InMemoryInventoryStore } from "../src/store.js";

const state = {
  items: { "sku-1": { sku: "sku-1", locationId: "loc-a", available: 5 } },
  reservations: {},
};
const actor = { actorId: "manager-1", roles: ["manager"], locationId: "loc-a" };
const allow = { allow: true, reason: "permitted", policyVersion: "inventory-v1" };

function createService(decision = allow) {
  const authorize = vi.fn().mockResolvedValue(decision);
  return {
    authorize,
    service: new InventoryService(new InMemoryInventoryStore(state), { authorize }),
  };
}

describe("inventory service", () => {
  it("returns only the actor's location items", async () => {
    const { service } = createService();

    expect(service.getItems(actor)).resolves.toEqual(state.items);
    expect(service.getItems({ ...actor, locationId: "loc-b" })).resolves.toEqual({});
  });

  it("requires policy approval for inventory reads", async () => {
    const { authorize, service } = createService({
      allow: false,
      reason: "role cannot read inventory",
      policyVersion: "inventory-v1",
    });

    await expect(service.getItems(actor)).rejects.toBeInstanceOf(InventoryForbiddenError);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ action: "inventory.read" }));
  });

  it("uses a dedicated policy action for the internal catalogue", async () => {
    const { authorize, service } = createService();
    const serviceActor = { actorId: "orders-service", roles: ["inventory-reader"], locationId: "loc-a" };

    await expect(service.getCatalogue(serviceActor)).resolves.toMatchObject({ "sku-1": { available: 5 } });
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: "inventory.catalogue.read",
      actorId: "orders-service",
    }));
  });

  it("denies catalogue access when the dedicated policy rejects it", async () => {
    const { service } = createService({ allow: false, reason: "not a service identity", policyVersion: "inventory-v1" });
    await expect(service.getCatalogue({ actorId: "manager-1", roles: ["manager"], locationId: "loc-a" }))
      .rejects.toBeInstanceOf(InventoryForbiddenError);
  });

  it("requires policy approval for stock adjustment", async () => {
    const { authorize, service } = createService();

    await expect(service.adjustStock(actor, { sku: "sku-1", locationId: "loc-a", delta: 2 })).resolves.toMatchObject({
      available: 7,
    });
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ action: "inventory.adjust" }));
  });

  it("rejects denied adjustments without changing stock", async () => {
    const { authorize, service } = createService({ allow: false, reason: "cashier cannot adjust", policyVersion: "inventory-v1" });
    authorize.mockResolvedValueOnce({ allow: false, reason: "cashier cannot adjust", policyVersion: "inventory-v1" });
    authorize.mockResolvedValueOnce(allow);

    await expect(service.adjustStock(actor, { sku: "sku-1", locationId: "loc-a", delta: 2 })).rejects.toBeInstanceOf(
      InventoryForbiddenError,
    );
    await expect(service.getItems(actor)).resolves.toMatchObject({ "sku-1": { available: 5 } });
  });

  it("rejects adjustments that would make stock negative", async () => {
    const { service } = createService();

    await expect(service.adjustStock(actor, { sku: "sku-1", locationId: "loc-a", delta: -6 })).rejects.toThrow(
      "stock cannot become negative",
    );
  });
});
