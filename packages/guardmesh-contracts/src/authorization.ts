import { z } from "zod";

export const authorizationRequestSchema = z.object({
  actorId: z.string().min(1),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  actorRoles: z.array(z.string().min(1)).default([]),
  actorLocationId: z.string().min(1).optional(),
  resourceLocationId: z.string().min(1).optional(),
});

export const authorizationDecisionSchema = z.object({
  allow: z.boolean(),
  reason: z.string().min(1),
  policyVersion: z.string().min(1),
});

export type AuthorizationRequest = z.infer<typeof authorizationRequestSchema>;
export type AuthorizationDecision = z.infer<typeof authorizationDecisionSchema>;

export function parseAuthorizationDecision(input: unknown): AuthorizationDecision {
  return authorizationDecisionSchema.parse(input);
}

export function isAuthorizationAllowed(input: unknown): boolean {
  const parsed = authorizationDecisionSchema.safeParse(input);
  return parsed.success && parsed.data.allow;
}
