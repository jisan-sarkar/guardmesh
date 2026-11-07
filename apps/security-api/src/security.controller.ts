import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { SecurityService } from "@guardmesh/security-service";
import { SecurityAuthGuard, SecurityOperatorGuard, SecurityProducerGuard, type SecurityRequest } from "./auth.guard.js";

@Controller("security")
@UseGuards(SecurityAuthGuard)
export class SecurityController {
  public constructor(private readonly security: SecurityService) {}

  @Post("events")
  @UseGuards(SecurityProducerGuard)
  public ingest(@Body() body: unknown) {
    return this.security.ingest(body);
  }

  @Get("events")
  @UseGuards(SecurityOperatorGuard)
  public events(@Req() request: SecurityRequest) {
    return this.security.listEvents(request.actor!);
  }

  @Get("alerts")
  @UseGuards(SecurityOperatorGuard)
  public alerts(@Req() request: SecurityRequest) {
    return this.security.listAlerts(request.actor!);
  }

  @Post("alerts/:alertId/acknowledge")
  @UseGuards(SecurityOperatorGuard)
  public acknowledge(@Req() request: SecurityRequest, @Param("alertId") alertId: string) {
    return this.security.acknowledge(request.actor!, alertId);
  }
}

@Controller("health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }
}
