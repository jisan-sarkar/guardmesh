import { z } from "zod";

export const orderStatusSchema = z.enum(["PENDING_STOCK", "CONFIRMED", "REJECTED"]);

export const orderItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const createOrderCommandSchema = z.object({
  actorId: z.string().min(1),
  orderId: z.string().min(1),
  requestFingerprint: z.string().min(1),
  locationId: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
});

export const stockOutcomeSchema = z.object({
  orderId: z.string().min(1),
  requestFingerprint: z.string().min(1),
  locationId: z.string().min(1),
  result: z.enum(["RESERVED", "REJECTED"]),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type CreateOrderCommand = z.infer<typeof createOrderCommandSchema>;
export type StockOutcome = z.infer<typeof stockOutcomeSchema>;

export type Order = Readonly<{
  actorId: string;
  orderId: string;
  requestFingerprint: string;
  locationId: string;
  items: OrderItem[];
  status: OrderStatus;
  version: number;
  createdAt: string;
}>;

export class InvalidOrderTransitionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidOrderTransitionError";
  }
}

export function createPendingOrder(input: unknown, createdAt: string): Order {
  const command = createOrderCommandSchema.parse(input);

  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("createdAt must be an ISO date string");
  }

  return {
    ...command,
    status: "PENDING_STOCK",
    version: 1,
    createdAt,
  };
}

export function applyStockOutcome(order: Order, input: unknown): Order {
  const outcome = stockOutcomeSchema.parse(input);

  if (order.status !== "PENDING_STOCK") {
    throw new InvalidOrderTransitionError("only pending orders can receive a stock outcome");
  }

  if (order.orderId !== outcome.orderId) {
    throw new InvalidOrderTransitionError("stock outcome order does not match");
  }

  if (order.requestFingerprint !== outcome.requestFingerprint) {
    throw new InvalidOrderTransitionError("stock outcome request does not match");
  }

  if (order.locationId !== outcome.locationId) {
    throw new InvalidOrderTransitionError("stock outcome location does not match");
  }

  return {
    ...order,
    status: outcome.result === "RESERVED" ? "CONFIRMED" : "REJECTED",
    version: order.version + 1,
  };
}
