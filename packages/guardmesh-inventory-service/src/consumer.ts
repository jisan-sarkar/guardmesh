import {
  orderCreatedEventSchema,
  type StockReservationResultEvent,
} from "@guardmesh/events";
import {
  reserveStock,
  type InventoryState,
} from "@guardmesh/inventory-domain";
import type { AuthorizationDecision } from "@guardmesh/contracts";
import type { PolicyEnforcementAdapter } from "@guardmesh/policy";
import { PolicyDecisionError } from "@guardmesh/policy";
import type { InventoryStore } from "./store.js";
import { publishSecurityEvent } from "@guardmesh/messaging";
import { defaultMetrics, guardMeshMetrics } from "@guardmesh/observability";
import { z } from "zod";

const stockAdjustmentSchema = z.object({
  sku: z.string().min(1),
  locationId: z.string().min(1),
  delta: z.number().int().refine((value) => value !== 0, "stock adjustment delta must be non-zero"),
}).strict();

export type EventIdFactory = () => string;
export type Clock = () => string;

export type InventoryActor = Readonly<{
  actorId: string;
  roles: string[];
  locationId: string;
}>;

export class InventoryForbiddenError extends Error {
  public constructor(public readonly decision: AuthorizationDecision) {
    super("inventory operation forbidden");
    this.name = "InventoryForbiddenError";
  }
}

export class InventoryService {
  public constructor(
    private readonly store: InventoryStore,
    private readonly policy: Pick<PolicyEnforcementAdapter, "authorize">,
    private readonly eventIdFactory: EventIdFactory = () => crypto.randomUUID(),
    private readonly clock: Clock = () => new Date().toISOString(),
  ) {}

  public async getItems(actor: InventoryActor): Promise<InventoryState["items"]> {
    let decision;
    try {
      decision = await this.policy.authorize({
        actorId: actor.actorId,
        actorRoles: actor.roles,
        actorLocationId: actor.locationId,
        action: "inventory.read",
        resourceType: "inventory",
        resourceId: actor.locationId,
        resourceLocationId: actor.locationId,
      });
    } catch (error) {
      if (error instanceof PolicyDecisionError) {
        defaultMetrics.increment(guardMeshMetrics.policyFailures);
        publishSecurityEvent({
          version: 1,
          eventId: this.eventIdFactory(),
          type: "POLICY_FAILURE",
          occurredAt: this.clock(),
          correlationId: actor.locationId,
          actorId: actor.actorId,
          action: "inventory.read",
          outcome: "FAILURE",
          resourceType: "inventory",
          resourceId: actor.locationId,
          locationId: actor.locationId,
          reason: "authorization policy unavailable",
          metadata: { failureClass: "policy-decision-error", sourceService: "inventory-api" },
        });
      }
      throw error;
    }
    if (!decision.allow) {
      defaultMetrics.increment(guardMeshMetrics.authorizationDenied);
      publishSecurityEvent({
        version: 1,
        eventId: this.eventIdFactory(),
        type: "AUTHORIZATION_DECISION",
        occurredAt: this.clock(),
        correlationId: actor.locationId,
        actorId: actor.actorId,
        action: "inventory.read",
        outcome: "DENY",
        resourceType: "inventory",
        resourceId: actor.locationId,
        locationId: actor.locationId,
        reason: decision.reason,
        metadata: { policyVersion: decision.policyVersion },
      });
      throw new InventoryForbiddenError(decision);
    }

    defaultMetrics.increment(guardMeshMetrics.authorizationAllowed);

    return this.store.list(actor.locationId);
  }

  public async adjustStock(
    actor: InventoryActor,
    input: unknown,
  ): Promise<InventoryState["items"][string]> {
    const adjustment = stockAdjustmentSchema.parse(input);

    if (adjustment.locationId !== actor.locationId) {
      throw new Error("inventory item not found");
    }

    const items = await this.store.list(actor.locationId);
    const item = items[adjustment.sku];
    if (!item) throw new Error("inventory item not found");

    let decision;
    try {
      decision = await this.policy.authorize({
        actorId: actor.actorId,
        actorRoles: actor.roles,
        actorLocationId: actor.locationId,
        action: "inventory.adjust",
        resourceType: "inventory",
        resourceId: adjustment.sku,
        resourceLocationId: item.locationId,
      });
    } catch (error) {
      if (error instanceof PolicyDecisionError) {
        defaultMetrics.increment(guardMeshMetrics.policyFailures);
        publishSecurityEvent({
          version: 1,
          eventId: this.eventIdFactory(),
          type: "POLICY_FAILURE",
          occurredAt: this.clock(),
          correlationId: adjustment.sku,
          actorId: actor.actorId,
          action: "inventory.adjust",
          outcome: "FAILURE",
          resourceType: "inventory",
          resourceId: adjustment.sku,
          locationId: actor.locationId,
          reason: "authorization policy unavailable",
          metadata: { failureClass: "policy-decision-error", sourceService: "inventory-api" },
        });
      }
      throw error;
    }
    if (!decision.allow) {
      defaultMetrics.increment(guardMeshMetrics.authorizationDenied);
      publishSecurityEvent({
        version: 1,
        eventId: this.eventIdFactory(),
        type: "AUTHORIZATION_DECISION",
        occurredAt: this.clock(),
        correlationId: adjustment.sku,
        actorId: actor.actorId,
        action: "inventory.adjust",
        outcome: "DENY",
        resourceType: "inventory",
        resourceId: adjustment.sku,
        locationId: actor.locationId,
        reason: decision.reason,
        metadata: { policyVersion: decision.policyVersion },
      });
      throw new InventoryForbiddenError(decision);
    }

    defaultMetrics.increment(guardMeshMetrics.authorizationAllowed);

    const result = await this.store.adjust(adjustment.sku, adjustment.locationId, adjustment.delta);
    publishSecurityEvent({
      version: 1,
      eventId: this.eventIdFactory(),
      type: "PRIVILEGED_ACTION",
      occurredAt: this.clock(),
      correlationId: adjustment.sku,
      actorId: actor.actorId,
      action: "inventory.adjust",
      outcome: "ALLOW",
      resourceType: "inventory",
      resourceId: adjustment.sku,
      locationId: actor.locationId,
      reason: "inventory adjustment applied",
      metadata: { delta: adjustment.delta, policyVersion: decision.policyVersion },
    });
    return result;
  }
}

export class InventoryEventConsumer {
  private state: InventoryState;
  private readonly processedEventIds = new Map<string, StockReservationResultEvent>();

  public constructor(
    initialState: InventoryState,
    private readonly eventIdFactory: EventIdFactory,
    private readonly clock: Clock,
  ) {
    this.state = initialState;
  }

  public getState(): InventoryState {
    return this.state;
  }

  public handleOrderCreated(input: unknown): StockReservationResultEvent {
    const event = orderCreatedEventSchema.parse(input);
    const replay = this.processedEventIds.get(event.eventId);
    if (replay) {
      return replay;
    }

    const result = reserveStock(this.state, event.payload);
    this.state = result.state;
    const output: StockReservationResultEvent = {
      version: 1,
      eventId: this.eventIdFactory(),
      type: "inventory.stock-reservation-result.v1",
      occurredAt: this.clock(),
      correlationId: event.correlationId,
      causationId: event.eventId,
      producer: "inventory-api",
      payload: {
        orderId: result.reservation.orderId,
        requestFingerprint: result.reservation.requestFingerprint,
        locationId: result.reservation.locationId,
        result: result.reservation.result,
      },
    };
    this.processedEventIds.set(event.eventId, output);
    return output;
  }
}
