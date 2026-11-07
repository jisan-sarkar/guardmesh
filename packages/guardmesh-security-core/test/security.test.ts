import { describe, expect, it } from "vitest";

import {
  InMemorySecurityEventStore,
  SecurityAlertEvaluator,
  sanitizeSecurityEvent,
} from "../src/security.js";

const denial = {
  version: 1,
  eventId: "event-1",
  type: "AUTHORIZATION_DECISION",
  occurredAt: "2026-11-07T12:00:00.000Z",
  correlationId: "request-1",
  actorId: "cashier-1",
  action: "inventory.adjust",
  outcome: "DENY",
  resourceType: "inventory",
  resourceId: "sku-1",
  locationId: "loc-a",
  reason: "role denied",
  metadata: { route: "/inventory/sku-1" },
};

describe("security events and alerts", () => {
  it("accepts a safe event and removes no allowed fields", () => {
    expect(sanitizeSecurityEvent(denial)).toEqual(denial);
  });

  it("rejects secrets in event metadata", () => {
    expect(() => sanitizeSecurityEvent({ ...denial, metadata: { access_token: "secret" } })).toThrow();
  });

  it("creates an alert when authorization denials cross the threshold", async () => {
    const store = new InMemorySecurityEventStore();
    const evaluator = new SecurityAlertEvaluator(
      store,
      () => "alert-1",
      () => "2026-11-07T12:00:10.000Z",
      { denialThreshold: 2, policyFailureThreshold: 2, windowMs: 60_000 },
    );
    await store.append(sanitizeSecurityEvent(denial));
    await store.append(sanitizeSecurityEvent({ ...denial, eventId: "event-2", correlationId: "request-2" }));

    await expect(evaluator.evaluate(sanitizeSecurityEvent({ ...denial, eventId: "event-3" }))).resolves.toMatchObject({
      rule: "REPEATED_AUTHORIZATION_DENIAL",
      count: 3,
      acknowledged: false,
    });
  });

  it("does not alert on an isolated allowed event", async () => {
    const store = new InMemorySecurityEventStore();
    const evaluator = new SecurityAlertEvaluator(
      store,
      () => "alert-1",
      () => "2026-11-07T12:00:10.000Z",
      { denialThreshold: 2, policyFailureThreshold: 2, windowMs: 60_000 },
    );
    const allowed = sanitizeSecurityEvent({ ...denial, outcome: "ALLOW", type: "PRIVILEGED_ACTION" });

    await expect(evaluator.evaluate(allowed)).resolves.toBeUndefined();
  });
});
