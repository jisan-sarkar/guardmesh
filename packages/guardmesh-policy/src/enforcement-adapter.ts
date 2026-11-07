import {
  authorizationRequestSchema,
  type AuthorizationDecision,
  type AuthorizationRequest,
} from "@guardmesh/contracts";

import type { OpaPolicyClient } from "./opa-client.js";

export type EnforcementAdapterInput = Readonly<{
  actorId: string;
  actorRoles: string[];
  actorLocationId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceLocationId?: string;
}>;

export type PolicyEvaluator = Pick<OpaPolicyClient, "evaluate">;

export class PolicyEnforcementAdapter {
  public constructor(private readonly evaluator: PolicyEvaluator) {}

  public authorize(input: EnforcementAdapterInput): Promise<AuthorizationDecision> {
    const request: AuthorizationRequest = authorizationRequestSchema.parse(input);
    return this.evaluator.evaluate(request);
  }
}
