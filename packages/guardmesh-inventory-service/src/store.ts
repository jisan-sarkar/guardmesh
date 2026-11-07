import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import {
  reservationLineSchema,
  reserveStockCommandSchema,
  type InventoryItem,
  type InventoryState,
  type Reservation,
  type ReserveStockCommand,
} from "@guardmesh/inventory-domain";

export interface InventoryStore {
  list(locationId: string): Promise<Readonly<Record<string, InventoryItem>>>;
  adjust(sku: string, locationId: string, delta: number): Promise<InventoryItem>;
  reserve(command: ReserveStockCommand): Promise<Reservation>;
}

export class InMemoryInventoryStore implements InventoryStore {
  private state: InventoryState;

  public constructor(initialState: InventoryState) {
    this.state = initialState;
  }

  public async list(locationId: string): Promise<Readonly<Record<string, InventoryItem>>> {
    return Object.fromEntries(
      Object.entries(this.state.items).filter(([, item]) => item.locationId === locationId),
    );
  }

  public async adjust(sku: string, locationId: string, delta: number): Promise<InventoryItem> {
    const item = this.state.items[sku];
    if (!item || item.locationId !== locationId) throw new Error("inventory item not found");
    const updated = { ...item, available: item.available + delta };
    if (updated.available < 0) throw new Error("stock cannot become negative");
    this.state = { ...this.state, items: { ...this.state.items, [sku]: updated } };
    return updated;
  }

  public async reserve(command: ReserveStockCommand): Promise<Reservation> {
    const module = await import("@guardmesh/inventory-domain");
    const result = module.reserveStock(this.state, command);
    this.state = result.state;
    return result.reservation;
  }
}

type InventoryDatabase = {
  inventory_items: {
    sku: string;
    location_id: string;
    available: number;
    version: number;
  };
  reservations: {
    order_id: string;
    request_fingerprint: string;
    location_id: string;
    items_json: unknown;
    result: "RESERVED" | "REJECTED";
    created_at: string;
  };
};

export function createInventoryDatabase(connectionString: string): Kysely<InventoryDatabase> {
  return new Kysely<InventoryDatabase>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}

export class PostgresInventoryStore implements InventoryStore {
  public constructor(private readonly db: Kysely<InventoryDatabase>) {}

  public async list(locationId: string): Promise<Readonly<Record<string, InventoryItem>>> {
    const rows = await this.db
      .selectFrom("inventory_items")
      .selectAll()
      .where("location_id", "=", locationId)
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.sku, { sku: row.sku, locationId: row.location_id, available: row.available }]),
    );
  }

  public async adjust(sku: string, locationId: string, delta: number): Promise<InventoryItem> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await transaction
        .selectFrom("inventory_items")
        .selectAll()
        .where("sku", "=", sku)
        .where("location_id", "=", locationId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new Error("inventory item not found");
      if (row.available + delta < 0) throw new Error("stock cannot become negative");

      await transaction
        .updateTable("inventory_items")
        .set({ available: row.available + delta, version: row.version + 1 })
        .where("sku", "=", sku)
        .where("version", "=", row.version)
        .executeTakeFirstOrThrow();
      return { sku, locationId, available: row.available + delta };
    });
  }

  public async reserve(input: ReserveStockCommand): Promise<Reservation> {
    const command = reserveStockCommandSchema.parse(input);
    return this.db.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("reservations")
        .selectAll()
        .where("order_id", "=", command.orderId)
        .where("request_fingerprint", "=", command.requestFingerprint)
        .executeTakeFirst();
      if (existing) {
        return {
          orderId: existing.order_id,
          requestFingerprint: existing.request_fingerprint,
          locationId: existing.location_id,
          items: reservationLineSchema.array().parse(
            typeof existing.items_json === "string"
              ? JSON.parse(existing.items_json)
              : existing.items_json,
          ),
          result: existing.result,
        };
      }

      const quantities = new Map<string, number>();
      for (const line of command.items) {
        quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
      }
      const rows = [];
      for (const [sku, quantity] of quantities) {
        const row = await transaction
          .selectFrom("inventory_items")
          .selectAll()
          .where("sku", "=", sku)
          .where("location_id", "=", command.locationId)
          .forUpdate()
          .executeTakeFirst();
        if (!row) throw new Error("inventory item not found");
        rows.push({ row, quantity });
      }

      const result = rows.some(({ row, quantity }) => row.available < quantity)
        ? "REJECTED"
        : "RESERVED";
      if (result === "RESERVED") {
        for (const { row, quantity } of rows) {
          await transaction
            .updateTable("inventory_items")
            .set({ available: row.available - quantity, version: row.version + 1 })
            .where("sku", "=", row.sku)
            .where("version", "=", row.version)
            .executeTakeFirstOrThrow();
        }
      }

      await transaction
        .insertInto("reservations")
        .values({
          order_id: command.orderId,
          request_fingerprint: command.requestFingerprint,
          location_id: command.locationId,
          items_json: JSON.stringify(command.items),
          result,
          created_at: new Date().toISOString(),
        })
        .execute();
      return {
        orderId: command.orderId,
        requestFingerprint: command.requestFingerprint,
        locationId: command.locationId,
        items: command.items,
        result,
      };
    });
  }
}
