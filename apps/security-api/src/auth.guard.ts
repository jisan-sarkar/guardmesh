import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import type { SecurityActorDirectory, SecurityActor } from "./actor-directory.js";
import { defaultMetrics, guardMeshMetrics } from "@guardmesh/observability";

type TokenVerifier = (token: string) => Promise<VerifiedAccessToken>;
export type SecurityRequest = FastifyRequest & { actor?: SecurityActor };

@Injectable()
export class SecurityAuthGuard implements CanActivate {
  public constructor(
    private readonly verifyToken: TokenVerifier,
    private readonly directory: SecurityActorDirectory,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }
    try {
      const verified = await this.verifyToken(token);
      const actor = this.directory.find(verified.subject);
      if (!actor) throw new UnauthorizedException();
      request.actor = actor;
      defaultMetrics.increment(guardMeshMetrics.authAccepted);
      return true;
    } catch {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }
  }
}

@Injectable()
export class SecurityProducerGuard implements CanActivate {
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const actor = context.switchToHttp().getRequest<SecurityRequest>().actor;
    if (!actor?.roles.includes("security-producer")) throw new UnauthorizedException();
    return true;
  }
}

@Injectable()
export class SecurityOperatorGuard implements CanActivate {
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const actor = context.switchToHttp().getRequest<SecurityRequest>().actor;
    if (!actor?.roles.includes("security-operator")) throw new UnauthorizedException();
    return true;
  }
}
