import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { GuardMeshExceptionFilter } from "@guardmesh/http";
import { defaultMetrics, guardMeshMetrics, startTelemetry } from "@guardmesh/observability";
import { SecurityService } from "@guardmesh/security-service";
import { startSecurityWorkflow } from "./workflow.js";

async function bootstrap(): Promise<void> {
  await startTelemetry("security-api");
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalFilters(new GuardMeshExceptionFilter());
  app.getHttpAdapter().getInstance().addHook("onResponse", async () => {
    defaultMetrics.increment(guardMeshMetrics.httpRequests);
  });
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3002) });
  void startSecurityWorkflow(app.get(SecurityService));
}

void bootstrap();
