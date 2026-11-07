import { describe, expect, it } from "vitest";

import {
  authorizationRequestSchema,
  isAuthorizationAllowed,
  parseAuthorizationDecision,
} from "../src/authorization.js";

describe("authorization contracts", () => {
  it("accepts a complete authorization request", () => {
    const result = authorizationRequestSchema.safeParse({
      actorId: "cashier-1",
      action: "order.create",
      resourceType: "order",
      resourceId: "order-1",
      locationId: "loc-a",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an explicit allow decision", () => {
    expect(
      isAuthorizationAllowed({
        allow: true,
        reason: "role permits order creation",
        policyVersion: "orders-v1",
      }),
    ).toBe(true);
  });

  it("returns false for an explicit deny decision", () => {
    expect(
      isAuthorizationAllowed({
        allow: false,
        reason: "location mismatch",
        policyVersion: "orders-v1",
      }),
    ).toBe(false);
  });

  it("fails closed for malformed or unavailable decisions", () => {
    expect(isAuthorizationAllowed(undefined)).toBe(false);
    expect(isAuthorizationAllowed({ allow: true })).toBe(false);
    expect(isAuthorizationAllowed({ allow: "true" })).toBe(false);
  });

  it("rejects malformed decisions when strict parsing is required", () => {
    expect(() => parseAuthorizationDecision({ allow: true })).toThrow();
  });
});
