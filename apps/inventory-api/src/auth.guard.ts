import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import type { ActorDirectory } from "./actor-directory.js";

type TokenVerifier = (token: string) => Promise<VerifiedAccessToken>;

export type AuthenticatedRequest = FastifyRequest & {
  actor?: Awaited<ReturnType<ActorDirectory["findBySubject"]>>;
  accessToken?: VerifiedAccessToken;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  public constructor(
    private readonly verifyToken: TokenVerifier,
    private readonly actorDirectory: ActorDirectory,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) throw new UnauthorizedException();

    try {
      const verified = await this.verifyToken(token);
      const actor = await this.actorDirectory.findBySubject(verified.subject);
      if (!actor) throw new UnauthorizedException();
      request.actor = actor;
      request.accessToken = verified;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

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
