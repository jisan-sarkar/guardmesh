import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";

import { InventoryService } from "@guardmesh/inventory-service";
import { InventoryForbiddenError } from "@guardmesh/inventory-service";
import { PolicyDecisionError } from "@guardmesh/policy";
import { ZodError } from "zod";
import { defaultMetrics, defaultReadiness } from "@guardmesh/observability";

import { AccessTokenGuard, InternalCatalogScopeGuard, type AuthenticatedRequest } from "./auth.guard.js";

@Controller("inventory")
@UseGuards(AccessTokenGuard)
export class InventoryController {
  public constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get()
  public list(@Req() request: AuthenticatedRequest) {
    return this.handle(() => this.inventory.getItems(request.actor!));
  }

  @Post(":sku/adjust")
  public adjust(
    @Req() request: AuthenticatedRequest,
    @Param("sku") sku: string,
    @Body() body: { locationId: string; delta: number },
  ) {
    return this.handle(() => this.inventory.adjustStock(request.actor!, { sku, ...body }));
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof InventoryForbiddenError) throw new ForbiddenException("access denied");
      if (error instanceof PolicyDecisionError) throw new ServiceUnavailableException("authorization policy unavailable");
      if (error instanceof ZodError) throw new BadRequestException("invalid request");
      throw error;
    }
  }
}

@Controller("inventory/internal")
@UseGuards(AccessTokenGuard, InternalCatalogScopeGuard)
export class InternalInventoryController {
  public constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get("catalogue")
  public async catalogue(@Req() request: AuthenticatedRequest) {
    if (!request.actor) throw new ForbiddenException();
    try {
      return await this.inventory.getCatalogue(request.actor);
    } catch (error) {
      if (error instanceof InventoryForbiddenError) throw new ForbiddenException("access denied");
      if (error instanceof PolicyDecisionError) throw new ServiceUnavailableException("authorization policy unavailable");
      throw error;
    }
  }
}

@Controller("inventory/health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }

  @Get("ready")
  public ready(@Res({ passthrough: true }) response: { statusCode: number }) {
    const status = defaultReadiness.status("inventory-api");
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
