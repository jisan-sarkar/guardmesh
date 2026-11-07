import { context, trace, type Span, type Tracer } from "@opentelemetry/api";

const correlationPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

export function getOrCreateCorrelationId(input: string | undefined, createId: () => string = () => crypto.randomUUID()): string {
  return input && correlationPattern.test(input) ? input : createId();
}

export class CounterRegistry {
  private readonly values = new Map<string, number>();

  public increment(name: string, amount = 1): void {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("counter increment must be positive");
    this.values.set(name, (this.values.get(name) ?? 0) + amount);
  }

  public read(name: string): number {
    return this.values.get(name) ?? 0;
  }

  public snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.values);
  }

  public renderPrometheus(): string {
    return `${[...this.values.entries()]
      .map(([name, value]) => `${name} ${value}`)
      .join("\n")}\n`;
  }
}

export const defaultMetrics = new CounterRegistry();

export class ReadinessState {
  private ready = false;

  public markReady(): void {
    this.ready = true;
  }

  public status(service: string): Readonly<{ status: "ok" | "starting"; service: string }> {
    return { status: this.ready ? "ok" : "starting", service };
  }
}

export const defaultReadiness = new ReadinessState();

export type GuardMeshMetrics = Readonly<{
  authAccepted: string;
  authRejected: string;
  authorizationAllowed: string;
  authorizationDenied: string;
  policyFailures: string;
  outboxBacklog: string;
  brokerDeadLetters: string;
}>;

export const guardMeshMetrics: GuardMeshMetrics = {
  authAccepted: "guardmesh_auth_accepted_total",
  authRejected: "guardmesh_auth_rejected_total",
  authorizationAllowed: "guardmesh_authorization_allowed_total",
  authorizationDenied: "guardmesh_authorization_denied_total",
  policyFailures: "guardmesh_policy_failures_total",
  outboxBacklog: "guardmesh_outbox_backlog",
  brokerDeadLetters: "guardmesh_broker_dead_letters_total",
};

export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await operation(span);
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function currentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId;
  return traceId && traceId !== "00000000000000000000000000000000" ? traceId : undefined;
}
