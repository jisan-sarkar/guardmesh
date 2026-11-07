import { describe, expect, it } from "vitest";

import { InMemorySecurityEventStore, SecurityAlertEvaluator } from "@guardmesh/security-core";

import { SecurityOperatorRequiredError, SecurityService } from "../src/service.js";

const event = {
  version: 1,
  eventId: "event-1",
  type: "POLICY_FAILURE",
  occurredAt: "2026-11-07T12:00:00.000Z",
  correlationId: "request-1",
  actorId: "cashier-1",
  action: "order.create",
  outcome: "FAILURE",
  reason: "OPA unavailable",
  metadata: {},
};

function createService() {
  const store = new InMemorySecurityEventStore();
  const evaluator = new SecurityAlertEvaluator(
    store,
    () => "alert-1",
    () => "2026-11-07T12:00:10.000Z",
    { denialThreshold: 2, policyFailureThreshold: 2, windowMs: 60_000 },
  );
  return new SecurityService(store, evaluator);
}

describe("security service", () => {
  it("ingests sanitized events", async () => {
    const service = createService();
    await expect(service.ingest(event)).resolves.toMatchObject({ event });
  });

  it("deduplicates repeated event IDs", async () => {
    const service = createService();
    await service.ingest(event);
    await service.ingest(event);

    await expect(service.listEvents({ roles: ["security-operator"] })).resolves.toHaveLength(1);
  });

  it("protects event and alert reads from non-operators", async () => {
    const service = createService();

    await expect(service.listEvents({ roles: ["cashier"] })).rejects.toBeInstanceOf(
      SecurityOperatorRequiredError,
    );
    await expect(service.listAlerts({ roles: ["cashier"] })).rejects.toBeInstanceOf(
      SecurityOperatorRequiredError,
    );
  });

  it("acknowledges alerts for operators", async () => {
    const service = createService();
    await service.ingest(event);
    await service.ingest({ ...event, eventId: "event-2", correlationId: "request-2" });
    await service.acknowledge({ roles: ["security-operator"] }, "alert-1");

    await expect(service.listAlerts({ roles: ["security-operator"] })).resolves.toMatchObject([
      { alertId: "alert-1", acknowledged: true },
    ]);
  });
});
