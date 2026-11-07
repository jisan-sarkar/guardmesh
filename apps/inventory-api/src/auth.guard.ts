import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import { GuardMeshAccessTokenGuard, GUARDMESH_ACTOR_DIRECTORY, GUARDMESH_TOKEN_VERIFIER, type GuardMeshAuthenticatedRequest } from "@guardmesh/nest";
import type { ActorDirectory } from "./actor-directory.js";

export const INVENTORY_TOKEN_VERIFIER = GUARDMESH_TOKEN_VERIFIER;
export const INVENTORY_ACTOR_DIRECTORY = GUARDMESH_ACTOR_DIRECTORY;

export type AuthenticatedRequest = FastifyRequest & GuardMeshAuthenticatedRequest & {
  actor?: Awaited<ReturnType<ActorDirectory["findBySubject"]>>;
  accessToken?: VerifiedAccessToken;
};

export const AccessTokenGuard = GuardMeshAccessTokenGuard;

@Injectable()
export class InternalCatalogScopeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requiredScope = process.env.INTERNAL_CATALOG_SCOPE ?? "inventory.catalog.read";
    if (!request.accessToken?.scopes.includes(requiredScope)) {
      throw new ForbiddenException("required internal scope is missing");
    }
    return true;
  }
}
