import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";

import { InventoryService } from "@guardmesh/inventory-service";
import { defaultMetrics } from "@guardmesh/observability";

import { AccessTokenGuard, InternalCatalogScopeGuard, type AuthenticatedRequest } from "./auth.guard.js";

@Controller("inventory")
@UseGuards(AccessTokenGuard)
export class InventoryController {
  public constructor(private readonly inventory: InventoryService) {}

  @Get()
  public list(@Req() request: AuthenticatedRequest) {
    return this.inventory.getItems(request.actor!);
  }

  @Post(":sku/adjust")
  public adjust(
    @Req() request: AuthenticatedRequest,
    @Param("sku") sku: string,
    @Body() body: { locationId: string; delta: number },
  ) {
    return this.inventory.adjustStock(request.actor!, { sku, ...body });
  }
}

@Controller("internal/inventory")
@UseGuards(AccessTokenGuard, InternalCatalogScopeGuard)
export class InternalInventoryController {
  public constructor(private readonly inventory: InventoryService) {}

  @Get("catalogue")
  public catalogue(@Req() request: AuthenticatedRequest) {
    if (!request.actor) throw new ForbiddenException();
    return this.inventory.getItems(request.actor);
  }
}

@Controller("inventory/health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }

  @Get("ready")
  public ready() {
    return { status: "ok", service: "inventory-api" };
  }

}

@Controller("metrics")
export class MetricsController {
  @Get()
  public metrics() {
    return defaultMetrics.renderPrometheus();
  }
}
