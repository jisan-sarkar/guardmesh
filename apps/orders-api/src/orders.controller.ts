import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "./auth.guard.js";
import { AccessTokenGuard } from "./auth.guard.js";
import { OrderForbiddenError, OrderIdempotencyConflictError, OrdersService } from "@guardmesh/orders-service";
import { PolicyDecisionError } from "@guardmesh/policy";
import { ZodError } from "zod";
import { defaultMetrics, defaultReadiness } from "@guardmesh/observability";

@Controller("orders")
@UseGuards(AccessTokenGuard)
export class OrdersController {
  public constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    try {
      if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/u.test(idempotencyKey)) {
        throw new BadRequestException("Idempotency-Key is required");
      }
      const input = typeof body === "object" && body !== null && !Array.isArray(body)
        ? { ...body, requestFingerprint: idempotencyKey }
        : body;
      return await this.orders.createOrder(request.actor!, input);
    } catch (error) {
      if (error instanceof OrderForbiddenError) throw new ForbiddenException("access denied");
      if (error instanceof OrderIdempotencyConflictError) throw new ConflictException("idempotency key was reused with a different request");
      if (error instanceof PolicyDecisionError) throw new ServiceUnavailableException("authorization policy unavailable");
      if (error instanceof ZodError) throw new BadRequestException("invalid request");
      throw error;
    }
  }

  @Get(":orderId")
  public async get(@Req() request: AuthenticatedRequest, @Param("orderId") orderId: string) {
    let order;
    try {
      order = await this.orders.getOrder(request.actor!, orderId);
    } catch (error) {
      if (error instanceof OrderForbiddenError) throw new ForbiddenException("access denied");
      if (error instanceof PolicyDecisionError) throw new ServiceUnavailableException("authorization policy unavailable");
      throw error;
    }
    if (!order) {
      throw new NotFoundException();
    }

    return order;
  }
}

@Controller("orders/health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }

  @Get("ready")
  public ready(@Res({ passthrough: true }) response: { statusCode: number }) {
    const status = defaultReadiness.status("orders-api");
    if (!defaultReadiness.isReady()) response.statusCode = 503;
    return status;
  }

}

@Controller("metrics")
export class MetricsController {
  @Get()
  public metrics() {
    return defaultMetrics.renderPrometheus();
  }
}
