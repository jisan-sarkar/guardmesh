import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";

import { AccessTokenGuard } from "../src/auth.guard.js";
import { InMemoryActorDirectory } from "../src/actor-directory.js";

const actor = { actorId: "cashier-1", roles: ["cashier"], locationId: "loc-a" };

function contextFor(authorization?: string): ExecutionContext {
  const request = { headers: { authorization } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("access-token guard", () => {
  it("rejects requests without a bearer token", async () => {
    const guard = new AccessTokenGuard(vi.fn(), new InMemoryActorDirectory(new Map()));

    await expect(guard.canActivate(contextFor())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects invalid tokens", async () => {
    const guard = new AccessTokenGuard(
      vi.fn().mockRejectedValue(new Error("invalid token")),
      new InMemoryActorDirectory(new Map()),
    );

    await expect(guard.canActivate(contextFor("Bearer invalid"))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects valid tokens for unknown actors", async () => {
    const guard = new AccessTokenGuard(
      vi.fn().mockResolvedValue({ subject: "unknown" }),
      new InMemoryActorDirectory(new Map()),
    );

    await expect(guard.canActivate(contextFor("Bearer valid"))).rejects.toMatchObject({ status: 401 });
  });

  it("attaches a server-owned actor for a valid token", async () => {
    const guard = new AccessTokenGuard(
      vi.fn().mockResolvedValue({ subject: "cashier-1" }),
      new InMemoryActorDirectory(new Map([["cashier-1", actor]])),
    );
    const context = contextFor("Bearer valid");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((context.switchToHttp().getRequest() as { actor: unknown }).actor).toEqual(actor);
  });
});
