import { z } from "zod";

const safeMetadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const forbiddenKeyPattern = /(token|password|secret|authorization|credential|cookie|private.?key)/i;

export const securityEventSchema = z.object({
  version: z.literal(1),
  eventId: z.string().min(1),
  type: z.enum([
    "AUTHENTICATION_FAILURE",
    "AUTHORIZATION_DECISION",
    "POLICY_FAILURE",
    "PRIVILEGED_ACTION",
    "WORKFLOW_FAILURE",
  ]),
  occurredAt: z.string().datetime(),
  correlationId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  action: z.string().min(1),
  outcome: z.enum(["ALLOW", "DENY", "FAILURE"]),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  locationId: z.string().min(1).optional(),
  reason: z.string().min(1),
  metadata: z.record(z.string(), safeMetadataValueSchema).default({}),
});

export type SecurityEvent = z.infer<typeof securityEventSchema>;

export type SecurityAlert = Readonly<{
  alertId: string;
  rule: "REPEATED_AUTHORIZATION_DENIAL" | "REPEATED_POLICY_FAILURE";
  createdAt: string;
  correlationKey: string;
  count: number;
  reason: string;
  acknowledged: boolean;
  status: "OPEN" | "ACKNOWLEDGED";
}>;

export function sanitizeSecurityEvent(input: unknown): SecurityEvent {
  const parsed = securityEventSchema.parse(input);
  for (const key of Object.keys(parsed.metadata)) {
    if (forbiddenKeyPattern.test(key)) {
      throw new Error(`forbidden security metadata key: ${key}`);
    }
  }
  return parsed;
}

export interface SecurityEventStore {
  append(event: SecurityEvent): Promise<void>;
  list(): Promise<SecurityEvent[]>;
  appendAlert(alert: SecurityAlert): Promise<void>;
  listAlerts(): Promise<SecurityAlert[]>;
  acknowledgeAlert(alertId: string): Promise<void>;
}

export class InMemorySecurityEventStore implements SecurityEventStore {
  private readonly events: SecurityEvent[] = [];
  private readonly alerts: SecurityAlert[] = [];

  public async append(event: SecurityEvent): Promise<void> {
    if (this.events.some((existing) => existing.eventId === event.eventId)) return;
    this.events.push(event);
  }

  public async list(): Promise<SecurityEvent[]> {
    return [...this.events];
  }

  public async appendAlert(alert: SecurityAlert): Promise<void> {
    if (this.alerts.some((existing) => existing.alertId === alert.alertId)) return;
    this.alerts.push(alert);
  }

  public async listAlerts(): Promise<SecurityAlert[]> {
    return [...this.alerts];
  }

  public async acknowledgeAlert(alertId: string): Promise<void> {
    const index = this.alerts.findIndex((alert) => alert.alertId === alertId);
    const alert = index >= 0 ? this.alerts[index] : undefined;
    if (alert) this.alerts[index] = { ...alert, acknowledged: true, status: "ACKNOWLEDGED" };
  }
}

export type AlertEvaluatorConfig = Readonly<{
  denialThreshold: number;
  policyFailureThreshold: number;
  windowMs: number;
}>;

export class SecurityAlertEvaluator {
  public constructor(
    private readonly store: SecurityEventStore,
    private readonly alertIdFactory: () => string,
    private readonly clock: () => string,
    private readonly config: AlertEvaluatorConfig,
  ) {}

  public async evaluate(event: SecurityEvent): Promise<SecurityAlert | undefined> {
    return this.evaluateUsing(event, this.store);
  }

  public async evaluateInTransaction(
    event: SecurityEvent,
    transactionalStore: SecurityEventStore,
  ): Promise<SecurityAlert | undefined> {
    return this.evaluateUsing(event, transactionalStore);
  }

  private async evaluateUsing(
    event: SecurityEvent,
    store: SecurityEventStore,
  ): Promise<SecurityAlert | undefined> {
    const events = await store.list();
    const alerts = await store.listAlerts();
    const now = Date.parse(this.clock());
    const observedEvents = events.some((candidate) => candidate.eventId === event.eventId)
      ? events
      : [...events, event];
    const recent = observedEvents.filter(
      (candidate) => now - Date.parse(candidate.occurredAt) <= this.config.windowMs,
    );
    const isDenial = event.type === "AUTHORIZATION_DECISION" && event.outcome === "DENY";
    const isPolicyFailure = event.type === "POLICY_FAILURE" && event.outcome === "FAILURE";
    const rule = isDenial
      ? "REPEATED_AUTHORIZATION_DENIAL"
      : isPolicyFailure
        ? "REPEATED_POLICY_FAILURE"
        : undefined;
    if (!rule) return undefined;

    const correlationKey = rule === "REPEATED_POLICY_FAILURE"
      ? `source:${event.metadata.sourceService ?? event.actorId ?? "unknown"}`
      : `${event.actorId ?? "unknown"}:${event.resourceType ?? "unknown"}`;
    const count = recent.filter((candidate) => {
      if (rule === "REPEATED_AUTHORIZATION_DENIAL") {
        return candidate.type === "AUTHORIZATION_DECISION" && candidate.outcome === "DENY" &&
          `${candidate.actorId ?? "unknown"}:${candidate.resourceType ?? "unknown"}` === correlationKey;
      }
      return candidate.type === "POLICY_FAILURE" && candidate.outcome === "FAILURE" &&
        `source:${candidate.metadata.sourceService ?? candidate.actorId ?? "unknown"}` === correlationKey;
    }).length;
    const threshold = rule === "REPEATED_AUTHORIZATION_DENIAL"
      ? this.config.denialThreshold
      : this.config.policyFailureThreshold;
    if (count < threshold) return undefined;

    const existing = alerts.find(
      (alert) =>
        alert.rule === rule &&
        alert.correlationKey === correlationKey &&
        Date.parse(alert.createdAt) >= now - this.config.windowMs,
    );
    if (existing) return existing;

    const alert: SecurityAlert = {
      alertId: this.alertIdFactory(),
      rule,
      createdAt: this.clock(),
      correlationKey,
      count,
      reason: rule === "REPEATED_AUTHORIZATION_DENIAL"
        ? "authorization denials exceeded the configured threshold"
        : "policy failures exceeded the configured threshold",
      acknowledged: false,
      status: "OPEN",
    };
    await store.appendAlert(alert);
    return alert;
  }
}
