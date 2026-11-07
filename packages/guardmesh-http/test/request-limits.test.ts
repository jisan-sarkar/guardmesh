import { describe, expect, it } from "vitest";

import { parseRequestBodyLimit } from "../src/index.js";

describe("request body limits", () => {
  it("uses a bounded default", () => {
    expect(parseRequestBodyLimit(undefined)).toBe(1_048_576);
  });

  it("accepts an explicit bounded integer", () => {
    expect(parseRequestBodyLimit("2097152")).toBe(2_097_152);
  });

  it("rejects invalid or unbounded values", () => {
    expect(() => parseRequestBodyLimit("0")).toThrow();
    expect(() => parseRequestBodyLimit("1.5")).toThrow();
    expect(() => parseRequestBodyLimit(String(10 * 1_048_576 + 1))).toThrow();
  });
});
