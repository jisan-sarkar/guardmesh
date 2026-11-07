import type { Order } from "./order.js";

export type OrderOutboxEvent = Readonly<{
  eventId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export interface OrderRepository {
  findById(orderId: string): Promise<Order | undefined>;
  findByActorAndFingerprint(actorId: string, requestFingerprint: string): Promise<Order | undefined>;
  insert(order: Order): Promise<void>;
  update(order: Order): Promise<void>;
  insertWithOutbox?(order: Order, event: OrderOutboxEvent): Promise<void>;
  applyStockOutcomeOnce?(eventId: string, input: unknown): Promise<Order | undefined>;
}

export class DuplicateOrderError extends Error {
  public constructor(message = "order already exists") {
    super(message);
    this.name = "DuplicateOrderError";
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  public async findById(orderId: string): Promise<Order | undefined> {
    return this.orders.get(orderId);
  }

  public async findByActorAndFingerprint(
    actorId: string,
    requestFingerprint: string,
  ): Promise<Order | undefined> {
    return [...this.orders.values()].find(
      (order) => order.actorId === actorId && order.requestFingerprint === requestFingerprint,
    );
  }

  public async insert(order: Order): Promise<void> {
    if (this.orders.has(order.orderId)) {
      throw new DuplicateOrderError();
    }

    if (await this.findByActorAndFingerprint(order.actorId, order.requestFingerprint)) {
      throw new DuplicateOrderError("request fingerprint already exists for actor");
    }

    this.orders.set(order.orderId, order);
  }

  public async update(order: Order): Promise<void> {
    if (!this.orders.has(order.orderId)) {
      throw new Error("order does not exist");
    }

    this.orders.set(order.orderId, order);
  }

  public async insertWithOutbox(order: Order): Promise<void> {
    await this.insert(order);
  }
}
