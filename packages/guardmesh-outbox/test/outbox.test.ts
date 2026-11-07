import { describe, expect, it, vi } from "vitest";

import { InMemoryOutboxStore, OutboxRelay, PostgresOutboxRelay } from "../src/outbox.js";

const record = {
  eventId: "event-1",
  type: "orders.order-created.v1",
  payload: { eventId: "event-1", type: "orders.order-created.v1" },
  attempts: 0,
};

describe("outbox relay", () => {
  it("publishes and removes successful records", async () => {
    const store = new InMemoryOutboxStore();
    const publish = vi.fn();
    store.add(record);

    await expect(new OutboxRelay(store, { publish }).runOnce(10)).resolves.toEqual({
      published: 1,
      failed: 0,
    });
    expect(publish).toHaveBeenCalledWith(record.payload);
    await expect(store.claim(10)).resolves.toEqual([]);
  });

  it("retains failed records and increments attempts", async () => {
    const store = new InMemoryOutboxStore();
    store.add(record);
    const relay = new OutboxRelay(store, {
      publish: vi.fn().mockRejectedValue(new Error("broker unavailable")),
    });

    await expect(relay.runOnce(10)).resolves.toEqual({ published: 0, failed: 1 });
    await expect(store.claim(10)).resolves.toEqual([{ ...record, attempts: 1 }]);
  });

  it("limits one relay pass", async () => {
    const store = new InMemoryOutboxStore();
    store.add(record);
    store.add({ ...record, eventId: "event-2", payload: { eventId: "event-2" } });
    const publish = vi.fn();

    await expect(new OutboxRelay(store, { publish }).runOnce(1)).resolves.toEqual({
      published: 1,
      failed: 0,
    });
    expect(publish).toHaveBeenCalledOnce();
  });

  it("keeps the database claim open while publishing", async () => {
    let released = false;
    const queries: string[] = [];
    const client = {
      query: vi.fn(async <T>(sql: string) => {
        queries.push(sql);
        if (sql.includes("SELECT event_id")) {
          return { rows: [{ event_id: record.eventId, payload_json: record.payload }] } as T;
        }
        return { rows: [] } as T;
      }),
      release: vi.fn(() => {
        released = true;
      }),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const publish = vi.fn(async () => {
      expect(released).toBe(false);
    });

    await expect(new PostgresOutboxRelay(pool as never, "orders_outbox", { publish }).runOnce(1))
      .resolves.toEqual({ published: 1, failed: 0 });
    expect(queries).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(released).toBe(true);
  });
});
