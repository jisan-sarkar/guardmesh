import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { InventoryService } from "@guardmesh/inventory-service";

import { AccessTokenGuard, type AuthenticatedRequest } from "./auth.guard.js";

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

@Controller("health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }
}
