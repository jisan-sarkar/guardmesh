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
import type { InventoryStore } from "./store.js";

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
  ) {}

  public getItems(actor: InventoryActor): Promise<InventoryState["items"]> {
    return this.store.list(actor.locationId);
  }

  public async adjustStock(
    actor: InventoryActor,
    input: Readonly<{ sku: string; locationId: string; delta: number }>,
  ): Promise<InventoryState["items"][string]> {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new Error("stock adjustment delta must be a non-zero integer");
    }

    if (input.locationId !== actor.locationId) {
      throw new Error("inventory item not found");
    }

    const items = await this.store.list(actor.locationId);
    const item = items[input.sku];
    if (!item) throw new Error("inventory item not found");

    const decision = await this.policy.authorize({
      actorId: actor.actorId,
      actorRoles: actor.roles,
      actorLocationId: actor.locationId,
      action: "inventory.adjust",
      resourceType: "inventory",
      resourceId: input.sku,
      resourceLocationId: item.locationId,
    });
    if (!decision.allow) throw new InventoryForbiddenError(decision);

    return this.store.adjust(input.sku, input.locationId, input.delta);
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
