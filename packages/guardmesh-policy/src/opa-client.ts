import {
  authorizationDecisionSchema,
  authorizationRequestSchema,
  type AuthorizationDecision,
  type AuthorizationRequest,
} from "@guardmesh/contracts";

export type PolicyClientConfig = Readonly<{
  endpoint: URL;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}>;

export class PolicyDecisionError extends Error {
  public constructor(message = "policy decision unavailable") {
    super(message);
    this.name = "PolicyDecisionError";
  }
}

type OpaResponse = Readonly<{
  result: unknown;
}>;

function isOpaResponse(input: unknown): input is OpaResponse {
  return typeof input === "object" && input !== null && "result" in input;
}

export class OpaPolicyClient {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(config: PolicyClientConfig) {
    if (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0) {
      throw new Error("policy timeout must be a positive integer");
    }

    this.endpoint = config.endpoint;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const normalizedRequest = authorizationRequestSchema.parse(request);
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: normalizedRequest }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PolicyDecisionError("policy backend returned an unsuccessful response");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new PolicyDecisionError("policy backend returned invalid JSON");
      }

      if (!isOpaResponse(body)) {
        throw new PolicyDecisionError("policy backend response is missing result");
      }

      const decision = authorizationDecisionSchema.safeParse(body.result);
      if (!decision.success) {
        throw new PolicyDecisionError("policy backend returned a malformed decision");
      }

      return decision.data;
    } catch (error) {
      if (error instanceof PolicyDecisionError) {
        throw error;
      }

      throw new PolicyDecisionError("policy backend is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}
