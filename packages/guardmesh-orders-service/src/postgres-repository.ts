import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import {
  applyStockOutcome,
  orderItemSchema,
  orderStatusSchema,
  stockOutcomeSchema,
  type Order,
  type OrderOutboxEvent,
  type OrderRepository,
} from "@guardmesh/orders-domain";

export type OrdersDatabase = {
  orders: {
    order_id: string;
    actor_id: string;
    request_fingerprint: string;
    location_id: string;
    items_json: unknown;
    status: Order["status"];
    version: number;
    created_at: string | Date;
  };
  orders_outbox: {
    event_id: string;
    event_type: string;
    payload_json: unknown;
    attempts: number;
    published_at: string | Date | null;
    created_at: string | Date;
  };
  orders_inbox: {
    event_id: string;
    received_at: string | Date;
  };
};

export function createOrdersDatabase(connectionString: string): Kysely<OrdersDatabase> {
  return new Kysely<OrdersDatabase>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}

function mapRow(row: OrdersDatabase["orders"]): Order {
  return {
    actorId: row.actor_id,
    orderId: row.order_id,
    requestFingerprint: row.request_fingerprint,
    locationId: row.location_id,
    items: orderItemSchema.array().parse(
      typeof row.items_json === "string" ? JSON.parse(row.items_json) : row.items_json,
    ),
    status: orderStatusSchema.parse(row.status),
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export class PostgresOrderRepository implements OrderRepository {
  public constructor(private readonly db: Kysely<OrdersDatabase>) {}

  public async findById(orderId: string): Promise<Order | undefined> {
    const row = await this.db
      .selectFrom("orders")
      .selectAll()
      .where("order_id", "=", orderId)
      .executeTakeFirst();

    return row === undefined ? undefined : mapRow(row);
  }

  public async findByActorAndFingerprint(
    actorId: string,
    requestFingerprint: string,
  ): Promise<Order | undefined> {
    const row = await this.db
      .selectFrom("orders")
      .selectAll()
      .where("actor_id", "=", actorId)
      .where("request_fingerprint", "=", requestFingerprint)
      .executeTakeFirst();

    return row === undefined ? undefined : mapRow(row);
  }

  public async insert(order: Order): Promise<void> {
    await this.db
      .insertInto("orders")
      .values({
        order_id: order.orderId,
        actor_id: order.actorId,
        request_fingerprint: order.requestFingerprint,
        location_id: order.locationId,
        items_json: JSON.stringify(order.items),
        status: order.status,
        version: order.version,
        created_at: order.createdAt,
      })
      .execute();
  }

  public async insertWithOutbox(order: Order, event: OrderOutboxEvent): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("orders")
        .values({
          order_id: order.orderId,
          actor_id: order.actorId,
          request_fingerprint: order.requestFingerprint,
          location_id: order.locationId,
          items_json: JSON.stringify(order.items),
          status: order.status,
          version: order.version,
          created_at: order.createdAt,
        })
        .execute();
      await transaction
        .insertInto("orders_outbox")
        .values({
          event_id: event.eventId,
          event_type: event.eventType,
          payload_json: JSON.stringify(event.payload),
          attempts: 0,
          published_at: null,
          created_at: event.createdAt,
        })
        .execute();
    });
  }

  public async applyStockOutcomeOnce(eventId: string, input: unknown): Promise<Order | undefined> {
    return this.db.transaction().execute(async (transaction) => {
      const alreadyProcessed = await transaction
        .selectFrom("orders_inbox")
        .select("event_id")
        .where("event_id", "=", eventId)
        .executeTakeFirst();
      if (alreadyProcessed) return undefined;

      const outcome = stockOutcomeSchema.parse(
        (input as { payload?: unknown }).payload ?? input,
      );
      const orderId = outcome.orderId;
      const row = await transaction
        .selectFrom("orders")
        .selectAll()
        .where("order_id", "=", orderId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new Error("order for stock outcome does not exist");

      const current = mapRow(row);
      if (current.status !== "PENDING_STOCK") {
        if (
          current.requestFingerprint !== outcome.requestFingerprint ||
          current.locationId !== outcome.locationId
        ) {
          throw new Error("conflicting stock outcome for finalized order");
        }
        const matchesFinalState =
          (current.status === "CONFIRMED" && outcome.result === "RESERVED") ||
          (current.status === "REJECTED" && outcome.result === "REJECTED");
        if (!matchesFinalState) {
          throw new Error("conflicting stock outcome for finalized order");
        }
        await transaction
          .insertInto("orders_inbox")
          .values({ event_id: eventId, received_at: new Date().toISOString() })
          .execute();
        return current;
      }

      const updated = applyStockOutcome(current, outcome);
      await transaction
        .updateTable("orders")
        .set({ status: updated.status, version: updated.version })
        .where("order_id", "=", updated.orderId)
        .where("version", "=", updated.version - 1)
        .executeTakeFirstOrThrow();
      await transaction
        .insertInto("orders_inbox")
        .values({ event_id: eventId, received_at: new Date().toISOString() })
        .execute();
      return updated;
    });
  }

  public async update(order: Order): Promise<void> {
    const result = await this.db
      .updateTable("orders")
      .set({
        status: order.status,
        version: order.version,
      })
      .where("order_id", "=", order.orderId)
      .where("version", "=", order.version - 1)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) !== 1) {
      throw new Error("order update lost an optimistic concurrency race");
    }
  }
}
