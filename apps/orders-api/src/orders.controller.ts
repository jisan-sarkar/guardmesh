import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "./auth.guard.js";
import { AccessTokenGuard } from "./auth.guard.js";
import { OrdersService } from "@guardmesh/orders-service";
import { defaultMetrics, defaultReadiness } from "@guardmesh/observability";

@Controller("orders")
@UseGuards(AccessTokenGuard)
export class OrdersController {
  public constructor(private readonly orders: OrdersService) {}

  @Post()
  public create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.orders.createOrder(request.actor!, body);
  }

  @Get(":orderId")
  public async get(@Req() request: AuthenticatedRequest, @Param("orderId") orderId: string) {
    const order = await this.orders.getOrder(request.actor!, orderId);
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
  public ready() {
    return defaultReadiness.status("orders-api");
  }

}

@Controller("metrics")
export class MetricsController {
  @Get()
  public metrics() {
    return defaultMetrics.renderPrometheus();
  }
}
