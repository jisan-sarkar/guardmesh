import { z } from "zod";

export const orderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1),
  requestFingerprint: z.string().min(1),
  locationId: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});

export const stockReservationResultPayloadSchema = z.object({
  orderId: z.string().min(1),
  requestFingerprint: z.string().min(1),
  locationId: z.string().min(1),
  result: z.enum(["RESERVED", "REJECTED"]),
});

export const orderCreatedEventSchema = z.object({
  version: z.literal(1),
  eventId: z.string().min(1),
  type: z.literal("orders.order-created.v1"),
  occurredAt: z.string().datetime(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  producer: z.literal("orders-api"),
  traceId: z.string().regex(/^[a-f0-9]{32}$/u).optional(),
  traceparent: z.string().regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/u).optional(),
  payload: orderCreatedPayloadSchema,
});

export const stockReservationResultEventSchema = z.object({
  version: z.literal(1),
  eventId: z.string().min(1),
  type: z.literal("inventory.stock-reservation-result.v1"),
  occurredAt: z.string().datetime(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1),
  producer: z.literal("inventory-api"),
  traceId: z.string().regex(/^[a-f0-9]{32}$/u).optional(),
  traceparent: z.string().regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/u).optional(),
  payload: stockReservationResultPayloadSchema,
});

export type OrderCreatedEvent = z.infer<typeof orderCreatedEventSchema>;
export type StockReservationResultEvent = z.infer<typeof stockReservationResultEventSchema>;

export function parseOrderCreatedEvent(input: unknown): OrderCreatedEvent {
  return orderCreatedEventSchema.parse(input);
}

export function parseStockReservationResultEvent(input: unknown): StockReservationResultEvent {
  return stockReservationResultEventSchema.parse(input);
}
