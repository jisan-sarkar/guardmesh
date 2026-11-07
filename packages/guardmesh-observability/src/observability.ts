import { context, trace, type Span, type Tracer } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

const correlationPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

let telemetrySdk: NodeSDK | undefined;

/** Start OTLP export only when explicitly configured; local core stays dependency-free. */
export async function startTelemetry(serviceName: string): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/u, "");
  if (!endpoint || telemetrySdk) return;

  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    })],
    instrumentations: [new HttpInstrumentation()],
  });
  await telemetrySdk.start();
  process.once("SIGTERM", () => void telemetrySdk?.shutdown());
}

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

  public isReady(): boolean {
    return this.ready;
  }
}

export const defaultReadiness = new ReadinessState();

export type GuardMeshMetrics = Readonly<{
  httpRequests: string;
  authAccepted: string;
  authRejected: string;
  authorizationAllowed: string;
  authorizationDenied: string;
  policyFailures: string;
  outboxBacklog: string;
  brokerDeadLetters: string;
}>;

export const guardMeshMetrics: GuardMeshMetrics = {
  httpRequests: "guardmesh_http_requests_total",
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
