import {
  type SecurityAlert,
  type SecurityEvent,
  type SecurityEventStore,
  SecurityAlertEvaluator,
  sanitizeSecurityEvent,
} from "@guardmesh/security-core";

export class SecurityOperatorRequiredError extends Error {
  public constructor() {
    super("security operator role required");
    this.name = "SecurityOperatorRequiredError";
  }
}

export type Operator = Readonly<{ roles: string[] }>;

function requireOperator(operator: Operator): void {
  if (!operator.roles.includes("security-operator")) {
    throw new SecurityOperatorRequiredError();
  }
}

export class SecurityService {
  public constructor(
    private readonly store: SecurityEventStore,
    private readonly evaluator: SecurityAlertEvaluator,
  ) {}

  public async ingest(input: unknown): Promise<Readonly<{ event: SecurityEvent; alert?: SecurityAlert }>> {
    const event = sanitizeSecurityEvent(input);
    await this.store.append(event);
    const alert = await this.evaluator.evaluate(event);
    return alert === undefined ? { event } : { event, alert };
  }

  public async listEvents(operator: Operator): Promise<SecurityEvent[]> {
    requireOperator(operator);
    return this.store.list();
  }

  public async listAlerts(operator: Operator): Promise<SecurityAlert[]> {
    requireOperator(operator);
    return this.store.listAlerts();
  }

  public async acknowledge(operator: Operator, alertId: string): Promise<void> {
    requireOperator(operator);
    await this.store.acknowledgeAlert(alertId);
  }
}
