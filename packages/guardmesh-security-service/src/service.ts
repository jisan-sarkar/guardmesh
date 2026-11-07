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

export type SecurityPage<T> = Readonly<{
  items: T[];
  total: number;
  nextOffset?: number;
}>;

type TransactionalSecurityStore = SecurityEventStore & {
  appendAndEvaluate?: (
    event: SecurityEvent,
    evaluator: SecurityAlertEvaluator,
  ) => Promise<Readonly<{ event: SecurityEvent; alert?: SecurityAlert }>>;
};

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
    const transactionalStore = this.store as TransactionalSecurityStore;
    if (transactionalStore.appendAndEvaluate) {
      return transactionalStore.appendAndEvaluate(event, this.evaluator);
    }
    await this.store.append(event);
    const alert = await this.evaluator.evaluate(event);
    return alert === undefined ? { event } : { event, alert };
  }

  public async listEvents(operator: Operator): Promise<SecurityEvent[]> {
    requireOperator(operator);
    return this.store.list();
  }

  public async listEventsPage(
    operator: Operator,
    options: Readonly<{ limit: number; offset: number }>,
  ): Promise<SecurityPage<SecurityEvent>> {
    requireOperator(operator);
    const events = await this.store.list();
    const items = events.slice(options.offset, options.offset + options.limit);
    return {
      items,
      total: events.length,
      ...(options.offset + items.length < events.length ? { nextOffset: options.offset + items.length } : {}),
    };
  }

  public async listAlerts(operator: Operator): Promise<SecurityAlert[]> {
    requireOperator(operator);
    return this.store.listAlerts();
  }

  public async listAlertsPage(
    operator: Operator,
    options: Readonly<{ limit: number; offset: number; status?: SecurityAlert["status"] }>,
  ): Promise<SecurityPage<SecurityAlert>> {
    requireOperator(operator);
    const alerts = (await this.store.listAlerts()).filter(
      (alert) => options.status === undefined || alert.status === options.status,
    );
    const items = alerts.slice(options.offset, options.offset + options.limit);
    return {
      items,
      total: alerts.length,
      ...(options.offset + items.length < alerts.length ? { nextOffset: options.offset + items.length } : {}),
    };
  }

  public async acknowledge(operator: Operator, alertId: string): Promise<void> {
    requireOperator(operator);
    await this.store.acknowledgeAlert(alertId);
  }
}
