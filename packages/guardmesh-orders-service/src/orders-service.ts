import { z } from "zod";

import type { AuthorizationDecision } from "@guardmesh/contracts";
import {
  createPendingOrder,
  type Order,
  type OrderItem,
  type OrderRepository,
} from "@guardmesh/orders-domain";
import type { PolicyEnforcementAdapter } from "@guardmesh/policy";
import { publishSecurityEvent } from "@guardmesh/messaging";

const createOrderInputSchema = z.object({
  requestFingerprint: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});

export type OrdersActor = Readonly<{
  actorId: string;
  roles: string[];
  locationId: string;
}>;

export type CreateOrderInput = Readonly<{
  requestFingerprint: string;
  items: OrderItem[];
}>;

export type OrderIdFactory = () => string;
export type Clock = () => string;
export type EventIdFactory = () => string;

export class OrderForbiddenError extends Error {
  public constructor(public readonly decision: AuthorizationDecision) {
    super("order operation forbidden");
    this.name = "OrderForbiddenError";
  }
}

export class OrdersService {
  public constructor(
    private readonly repository: OrderRepository,
    private readonly policy: Pick<PolicyEnforcementAdapter, "authorize">,
    private readonly orderIdFactory: OrderIdFactory,
    private readonly clock: Clock,
    private readonly eventIdFactory: EventIdFactory = orderIdFactory,
  ) {}

  public async createOrder(actor: OrdersActor, input: unknown): Promise<Order> {
    const parsedInput = createOrderInputSchema.parse(input);
    const existing = await this.repository.findByActorAndFingerprint(
      actor.actorId,
      parsedInput.requestFingerprint,
    );
    const targetOrderId = existing?.orderId ?? this.orderIdFactory();

    const decision = await this.policy.authorize({
      actorId: actor.actorId,
      actorRoles: actor.roles,
      actorLocationId: actor.locationId,
      action: "order.create",
      resourceType: "order",
      resourceId: targetOrderId,
      resourceLocationId: actor.locationId,
    });

    if (!decision.allow) {
      publishSecurityEvent({
        version: 1,
        eventId: this.eventIdFactory(),
        type: "AUTHORIZATION_DECISION",
        occurredAt: this.clock(),
        correlationId: targetOrderId,
        actorId: actor.actorId,
        action: "order.create",
        outcome: "DENY",
        resourceType: "order",
        resourceId: targetOrderId,
        locationId: actor.locationId,
        reason: decision.reason,
        metadata: { policyVersion: decision.policyVersion },
      });
      throw new OrderForbiddenError(decision);
    }

    if (existing) {
      return existing;
    }

    const order = createPendingOrder(
      {
        actorId: actor.actorId,
        orderId: targetOrderId,
        requestFingerprint: parsedInput.requestFingerprint,
        locationId: actor.locationId,
        items: parsedInput.items,
      },
      this.clock(),
    );

    if (this.repository.insertWithOutbox) {
      const eventId = this.eventIdFactory();
      await this.repository.insertWithOutbox(order, {
        eventId,
        eventType: "orders.order-created.v1",
        createdAt: order.createdAt,
        payload: {
          version: 1,
          eventId,
          type: "orders.order-created.v1",
          occurredAt: order.createdAt,
          correlationId: order.orderId,
          producer: "orders-api",
          payload: {
            orderId: order.orderId,
            requestFingerprint: order.requestFingerprint,
            locationId: order.locationId,
            items: order.items,
          },
        },
      });
    } else {
      await this.repository.insert(order);
    }
    return order;
  }

  public async getOrder(actor: OrdersActor, orderId: string): Promise<Order | undefined> {
    const order = await this.repository.findById(orderId);
    if (!order || order.locationId !== actor.locationId) {
      return undefined;
    }

    const decision = await this.policy.authorize({
      actorId: actor.actorId,
      actorRoles: actor.roles,
      actorLocationId: actor.locationId,
      action: "order.read",
      resourceType: "order",
      resourceId: order.orderId,
      resourceLocationId: order.locationId,
    });

    if (!decision.allow) {
      publishSecurityEvent({
        version: 1,
        eventId: this.eventIdFactory(),
        type: "AUTHORIZATION_DECISION",
        occurredAt: this.clock(),
        correlationId: order.orderId,
        actorId: actor.actorId,
        action: "order.read",
        outcome: "DENY",
        resourceType: "order",
        resourceId: order.orderId,
        locationId: actor.locationId,
        reason: decision.reason,
        metadata: { policyVersion: decision.policyVersion },
      });
      throw new OrderForbiddenError(decision);
    }

    return order;
  }
}
