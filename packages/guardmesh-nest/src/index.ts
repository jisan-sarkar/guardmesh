import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import { defaultMetrics, guardMeshMetrics } from "@guardmesh/observability";

export {
  OpaPolicyClient,
  PolicyDecisionError,
  PolicyEnforcementAdapter,
} from "@guardmesh/policy";

export const GUARDMESH_TOKEN_VERIFIER = "TOKEN_VERIFIER";
export const GUARDMESH_ACTOR_DIRECTORY = "ACTOR_DIRECTORY";

export type GuardMeshActor = Readonly<{
  actorId: string;
  roles: string[];
  locationId: string;
}>;

export interface GuardMeshActorDirectory {
  findBySubject(subject: string): Promise<GuardMeshActor | undefined>;
}

export type GuardMeshTokenVerifier = (token: string) => Promise<VerifiedAccessToken>;

export type GuardMeshAuthenticatedRequest = {
  headers: Readonly<Record<string, string | string[] | undefined>>;
  actor?: GuardMeshActor;
  accessToken?: VerifiedAccessToken;
};

@Injectable()
export class GuardMeshAccessTokenGuard implements CanActivate {
  public constructor(
    @Inject(GUARDMESH_TOKEN_VERIFIER)
    private readonly verifyToken: GuardMeshTokenVerifier,
    @Inject(GUARDMESH_ACTOR_DIRECTORY)
    private readonly actorDirectory: GuardMeshActorDirectory,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardMeshAuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : undefined;

    if (!token) {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }

    try {
      const verified = await this.verifyToken(token);
      const actor = await this.actorDirectory.findBySubject(verified.subject)
        ?? (verified.clientId ? await this.actorDirectory.findBySubject(verified.clientId) : undefined);
      if (!actor) throw new UnauthorizedException();
      request.actor = actor;
      request.accessToken = verified;
      defaultMetrics.increment(guardMeshMetrics.authAccepted);
      return true;
    } catch {
      defaultMetrics.increment(guardMeshMetrics.authRejected);
      throw new UnauthorizedException();
    }
  }
}
