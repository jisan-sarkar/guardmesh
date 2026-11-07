import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";

import { SecurityEventValidationError } from "@guardmesh/security-core";
import { SecurityService } from "@guardmesh/security-service";
import { defaultMetrics, defaultReadiness } from "@guardmesh/observability";
import { SecurityAuthGuard, SecurityOperatorGuard, SecurityProducerGuard, type SecurityRequest } from "./auth.guard.js";

@Controller("security")
@UseGuards(SecurityAuthGuard)
export class SecurityController {
  public constructor(@Inject(SecurityService) private readonly security: SecurityService) {}

  @Post("events")
  @UseGuards(SecurityProducerGuard)
  public async ingest(@Body() body: unknown) {
    try {
      return await this.security.ingest(body);
    } catch (error) {
      if (error instanceof SecurityEventValidationError) throw new BadRequestException("invalid security event");
      throw error;
    }
  }

  @Get("events")
  @UseGuards(SecurityOperatorGuard)
  public events(@Req() request: SecurityRequest, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.security.listEventsPage(request.actor!, parsePage(limit, offset));
  }

  @Get("alerts")
  @UseGuards(SecurityOperatorGuard)
  public alerts(
    @Req() request: SecurityRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
  ) {
    if (status !== undefined && status !== "OPEN" && status !== "ACKNOWLEDGED") {
      throw new BadRequestException("invalid alert status");
    }
    const page = parsePage(limit, offset);
    return this.security.listAlertsPage(
      request.actor!,
      status === undefined ? page : { ...page, status: status as "OPEN" | "ACKNOWLEDGED" },
    );
  }

  @Post("alerts/:alertId/acknowledge")
  @UseGuards(SecurityOperatorGuard)
  public acknowledge(@Req() request: SecurityRequest, @Param("alertId") alertId: string) {
    return this.security.acknowledge(request.actor!, alertId);
  }
}

function parsePage(limitInput?: string, offsetInput?: string): { limit: number; offset: number } {
  const limit = limitInput === undefined ? 50 : Number(limitInput);
  const offset = offsetInput === undefined ? 0 : Number(offsetInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    throw new BadRequestException("invalid pagination");
  }
  return { limit, offset };
}

@Controller("security/health")
export class HealthController {
  @Get("live")
  public live() {
    return { status: "ok" };
  }

  @Get("ready")
  public ready(@Res({ passthrough: true }) response: { statusCode: number }) {
    const status = defaultReadiness.status("security-api");
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
