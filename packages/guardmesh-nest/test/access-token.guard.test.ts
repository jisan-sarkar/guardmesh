import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";

import { GuardMeshAccessTokenGuard, type GuardMeshActor } from "../src/index.js";

function contextFor(authorization?: string): ExecutionContext {
  const request = { headers: { authorization } };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("shared GuardMesh NestJS access-token adapter", () => {
  it("rejects missing credentials with the shared 401 behavior", async () => {
    const guard = new GuardMeshAccessTokenGuard(vi.fn(), { findBySubject: vi.fn() });
    await expect(guard.canActivate(contextFor())).rejects.toMatchObject({ status: 401 });
  });

  it("resolves both user subjects and machine authorized-party ids", async () => {
    const actor: GuardMeshActor = { actorId: "orders-service", roles: ["inventory-reader"], locationId: "loc-a" };
    const directory = { findBySubject: vi.fn().mockImplementation(async (value: string) => value === actor.actorId ? actor : undefined) };
    const verify = vi.fn().mockResolvedValue({
      subject: "ephemeral-service-account",
      clientId: actor.actorId,
      scopes: ["inventory.catalog.read"],
    });
    const context = contextFor("Bearer service-token");
    const guard = new GuardMeshAccessTokenGuard(verify, directory);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((context.switchToHttp().getRequest() as { actor?: GuardMeshActor }).actor).toEqual(actor);
    expect(directory.findBySubject).toHaveBeenCalledWith(actor.actorId);
  });

  it("fails closed when verification or actor resolution fails", async () => {
    const guard = new GuardMeshAccessTokenGuard(vi.fn().mockRejectedValue(new Error("bad token")), { findBySubject: vi.fn() });
    await expect(guard.canActivate(contextFor("Bearer invalid"))).rejects.toMatchObject({ status: 401 });
  });
});
