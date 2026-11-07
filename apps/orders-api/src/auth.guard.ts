import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import { defaultMetrics, guardMeshMetrics } from "@guardmesh/observability";

import type { ActorDirectory } from "./actor-directory.js";

type TokenVerifier = (token: string) => Promise<VerifiedAccessToken>;

export type AuthenticatedRequest = FastifyRequest & {
  actor: Awaited<ReturnType<ActorDirectory["findBySubject"]>>;
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

    if (!token) {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }

    try {
      const verified = await this.verifyToken(token);
      const actor = await this.actorDirectory.findBySubject(verified.subject);
      if (!actor) {
        throw new UnauthorizedException();
      }

      request.actor = actor;
      defaultMetrics.increment(guardMeshMetrics.authAccepted);
      return true;
    } catch {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }
  }
}
