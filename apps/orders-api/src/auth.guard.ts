import type { FastifyRequest } from "fastify";

import type { VerifiedAccessToken } from "@guardmesh/auth";
import { GuardMeshAccessTokenGuard, GUARDMESH_ACTOR_DIRECTORY, GUARDMESH_TOKEN_VERIFIER, type GuardMeshAuthenticatedRequest } from "@guardmesh/nest";

import type { ActorDirectory } from "./actor-directory.js";

export const ORDERS_TOKEN_VERIFIER = GUARDMESH_TOKEN_VERIFIER;
export const ORDERS_ACTOR_DIRECTORY = GUARDMESH_ACTOR_DIRECTORY;

export type AuthenticatedRequest = FastifyRequest & GuardMeshAuthenticatedRequest & {
  actor: Awaited<ReturnType<ActorDirectory["findBySubject"]>>;
};

export const AccessTokenGuard = GuardMeshAccessTokenGuard;
