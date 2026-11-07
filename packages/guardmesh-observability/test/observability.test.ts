import { describe, expect, it } from "vitest";

import { CounterRegistry, getOrCreateCorrelationId, guardMeshMetrics, ReadinessState, withSpan } from "../src/observability.js";

describe("observability helpers", () => {
  it("preserves safe correlation IDs and replaces invalid ones", () => {
    expect(getOrCreateCorrelationId("request-1")).toBe("request-1");
    expect(getOrCreateCorrelationId("not safe/for logs", () => "generated")).toBe("generated");
  });

  it("tracks named counters", () => {
    const counters = new CounterRegistry();
    counters.increment(guardMeshMetrics.authorizationDenied);
    counters.increment(guardMeshMetrics.authorizationDenied, 2);
    expect(counters.read(guardMeshMetrics.authorizationDenied)).toBe(3);
    expect(counters.snapshot()).toEqual({ [guardMeshMetrics.authorizationDenied]: 3 });
    expect(counters.renderPrometheus()).toBe(`${guardMeshMetrics.authorizationDenied} 3\n`);
  });

  it("ends spans on success and failure", async () => {
    const end = () => undefined;
    const tracer = {
      startActiveSpan: async (_name: string, _options: unknown, callback: (span: { recordException: () => void; end: () => void }) => Promise<unknown>) =>
        callback({ recordException: () => undefined, end }),
    } as never;

    await expect(withSpan(tracer, "test", {}, async () => "ok")).resolves.toBe("ok");
    await expect(withSpan(tracer, "test", {}, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
  });

  it("starts unready and becomes ready explicitly", () => {
    const readiness = new ReadinessState();
    expect(readiness.status("orders-api")).toEqual({ status: "starting", service: "orders-api" });
    readiness.markReady();
    expect(readiness.status("orders-api")).toEqual({ status: "ok", service: "orders-api" });
  });
});
