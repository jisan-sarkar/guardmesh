import { describe, expect, it, vi } from "vitest";

import { PolicyEnforcementAdapter } from "../src/enforcement-adapter.js";

describe("policy enforcement adapter", () => {
  it("constructs a resource-aware request for the policy evaluator", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      allow: true,
      reason: "action permitted by policy",
      policyVersion: "guardmesh-policy-v1",
    });
    const adapter = new PolicyEnforcementAdapter({ evaluate });

    await expect(
      adapter.authorize({
        actorId: "cashier-1",
        actorRoles: ["cashier"],
        actorLocationId: "loc-a",
        action: "order.create",
        resourceType: "order",
        resourceId: "order-1",
        resourceLocationId: "loc-a",
      }),
    ).resolves.toMatchObject({ allow: true });

    expect(evaluate).toHaveBeenCalledWith({
      actorId: "cashier-1",
      actorRoles: ["cashier"],
      actorLocationId: "loc-a",
      action: "order.create",
      resourceType: "order",
      resourceId: "order-1",
      resourceLocationId: "loc-a",
    });
  });

  it("rejects malformed enforcement input before calling the evaluator", async () => {
    const evaluate = vi.fn();
    const adapter = new PolicyEnforcementAdapter({ evaluate });

    expect(() =>
      adapter.authorize({
        actorId: "cashier-1",
        actorRoles: [],
        action: "order.create",
        resourceType: "order",
        resourceId: "",
      }),
    ).toThrow();
    expect(evaluate).not.toHaveBeenCalled();
  });
});
