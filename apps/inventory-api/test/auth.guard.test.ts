import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";

import { InMemoryActorDirectory } from "../src/actor-directory.js";
import { AccessTokenGuard } from "../src/auth.guard.js";

function contextFor(authorization?: string): ExecutionContext {
  const request = { headers: { authorization } };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("inventory access-token guard", () => {
  it("rejects missing tokens", async () => {
    const guard = new AccessTokenGuard(vi.fn(), new InMemoryActorDirectory(new Map()));
    await expect(guard.canActivate(contextFor())).rejects.toMatchObject({ status: 401 });
  });

  it("attaches a server-owned actor for valid tokens", async () => {
    const actor = { actorId: "manager-1", roles: ["manager"], locationId: "loc-a" };
    const context = contextFor("Bearer valid");
    const guard = new AccessTokenGuard(
      vi.fn().mockResolvedValue({ subject: "manager-1" }),
      new InMemoryActorDirectory(new Map([["manager-1", actor]])),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((context.switchToHttp().getRequest() as { actor: unknown }).actor).toEqual(actor);
  });
});
