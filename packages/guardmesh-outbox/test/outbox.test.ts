import { describe, expect, it, vi } from "vitest";

import { InMemoryOutboxStore, OutboxRelay } from "../src/outbox.js";

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
});
