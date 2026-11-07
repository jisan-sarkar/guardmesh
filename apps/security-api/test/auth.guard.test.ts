import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";

import { SecurityActorDirectory } from "../src/actor-directory.js";
import { SecurityAuthGuard, SecurityOperatorGuard, SecurityProducerGuard } from "../src/auth.guard.js";

function contextFor(actor?: { actorId: string; roles: string[] }): ExecutionContext {
  const request = { headers: { authorization: "Bearer valid" }, actor };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("security API guards", () => {
  it("requires a valid authenticated actor", async () => {
    const guard = new SecurityAuthGuard(vi.fn().mockRejectedValue(new Error()), new SecurityActorDirectory(new Map()));
    await expect(guard.canActivate(contextFor())).rejects.toMatchObject({ status: 401 });
  });

  it("separates producer and operator roles", async () => {
    await expect(new SecurityProducerGuard().canActivate(contextFor({ actorId: "p", roles: ["security-producer"] }))).resolves.toBe(true);
    await expect(new SecurityOperatorGuard().canActivate(contextFor({ actorId: "o", roles: ["security-operator"] }))).resolves.toBe(true);
    await expect(new SecurityOperatorGuard().canActivate(contextFor({ actorId: "p", roles: ["security-producer"] }))).rejects.toMatchObject({ status: 401 });
  });
});
