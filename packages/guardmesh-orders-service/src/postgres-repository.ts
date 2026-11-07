import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { orderItemSchema, orderStatusSchema, type Order, type OrderRepository } from "@guardmesh/orders-domain";

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
