import { z } from "zod";

export const reservationLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const reserveStockCommandSchema = z.object({
  orderId: z.string().min(1),
  requestFingerprint: z.string().min(1),
  locationId: z.string().min(1),
  items: z.array(reservationLineSchema).min(1),
});

export type ReservationLine = z.infer<typeof reservationLineSchema>;
export type ReserveStockCommand = z.infer<typeof reserveStockCommandSchema>;
export type ReservationResult = "RESERVED" | "REJECTED";

export type InventoryItem = Readonly<{
  sku: string;
  locationId: string;
  available: number;
}>;

export type Reservation = Readonly<{
  orderId: string;
  requestFingerprint: string;
  locationId: string;
  items: ReservationLine[];
  result: ReservationResult;
}>;

export type InventoryState = Readonly<{
  items: Readonly<Record<string, InventoryItem>>;
  reservations: Readonly<Record<string, Reservation>>;
}>;

export class InventoryCommandError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InventoryCommandError";
  }
}

export function reserveStock(
  state: InventoryState,
  input: unknown,
): Readonly<{ state: InventoryState; reservation: Reservation }> {
  const command = reserveStockCommandSchema.parse(input);
  const replay = Object.values(state.reservations).find(
    (reservation) =>
      reservation.orderId === command.orderId &&
      reservation.requestFingerprint === command.requestFingerprint,
  );

  if (replay) {
    return { state, reservation: replay };
  }

  const requestedQuantities = new Map<string, number>();
  for (const line of command.items) {
    requestedQuantities.set(line.sku, (requestedQuantities.get(line.sku) ?? 0) + line.quantity);
  }

  const selectedItems = [...requestedQuantities.entries()].map(([sku, quantity]) => {
    const item = state.items[sku];
    if (!item) {
      throw new InventoryCommandError(`unknown SKU: ${sku}`);
    }
    if (item.locationId !== command.locationId) {
      throw new InventoryCommandError(`SKU belongs to another location: ${sku}`);
    }
    return { item, sku, quantity };
  });

  const hasInsufficientStock = selectedItems.some(
    ({ item, quantity }) => item.available < quantity,
  );
  const result: ReservationResult = hasInsufficientStock ? "REJECTED" : "RESERVED";
  const reservation: Reservation = {
    orderId: command.orderId,
    requestFingerprint: command.requestFingerprint,
    locationId: command.locationId,
    items: command.items,
    result,
  };

  if (result === "REJECTED") {
    return {
      state: {
        ...state,
        reservations: { ...state.reservations, [command.orderId]: reservation },
      },
      reservation,
    };
  }

  const items = { ...state.items };
  for (const { item, sku, quantity } of selectedItems) {
    items[sku] = { ...item, available: item.available - quantity };
  }

  return {
    state: {
      items,
      reservations: { ...state.reservations, [command.orderId]: reservation },
    },
    reservation,
  };
}
