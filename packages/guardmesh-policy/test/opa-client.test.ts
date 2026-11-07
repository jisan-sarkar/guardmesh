import { describe, expect, it, vi } from "vitest";

import { OpaPolicyClient, PolicyDecisionError } from "../src/opa-client.js";

const request = {
  actorId: "cashier-1",
  action: "order.create",
  resourceType: "order",
  resourceId: "order-1",
  actorRoles: ["cashier"],
  actorLocationId: "loc-a",
  resourceLocationId: "loc-a",
};

const allowedDecision = {
  allow: true,
  reason: "role permits order creation",
  policyVersion: "orders-v1",
};

function createResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}

describe("OPA policy client", () => {
  it("posts the authorization input and returns the validated decision", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createResponse({ result: allowedDecision }),
    );
    const client = new OpaPolicyClient({
      endpoint: new URL("http://opa.test/v1/data/guardmesh/authorization"),
      timeoutMs: 100,
      fetchImpl,
    });

    await expect(client.evaluate(request)).resolves.toEqual(allowedDecision);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://opa.test/v1/data/guardmesh/authorization"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ input: request }),
      }),
    );
  });

  it("fails closed when OPA returns a non-success status", async () => {
    const client = new OpaPolicyClient({
      endpoint: new URL("http://opa.test/v1/data/guardmesh/authorization"),
      timeoutMs: 100,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(createResponse({}, false)),
    });

    await expect(client.evaluate(request)).rejects.toBeInstanceOf(PolicyDecisionError);
  });

  it("fails closed when the result is missing or malformed", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createResponse({}))
      .mockResolvedValueOnce(createResponse({ result: { allow: true } }));
    const client = new OpaPolicyClient({
      endpoint: new URL("http://opa.test/v1/data/guardmesh/authorization"),
      timeoutMs: 100,
      fetchImpl,
    });

    await expect(client.evaluate(request)).rejects.toBeInstanceOf(PolicyDecisionError);
    await expect(client.evaluate(request)).rejects.toBeInstanceOf(PolicyDecisionError);
  });

  it("fails closed when the policy backend cannot be reached", async () => {
    const client = new OpaPolicyClient({
      endpoint: new URL("http://opa.test/v1/data/guardmesh/authorization"),
      timeoutMs: 100,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("connection refused")),
    });

    await expect(client.evaluate(request)).rejects.toBeInstanceOf(PolicyDecisionError);
  });

  it("rejects an invalid timeout configuration", () => {
    expect(
      () =>
        new OpaPolicyClient({
          endpoint: new URL("http://opa.test/v1/data/guardmesh/authorization"),
          timeoutMs: 0,
        }),
    ).toThrow("policy timeout must be a positive integer");
  });
});
