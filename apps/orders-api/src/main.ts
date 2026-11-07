import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { GuardMeshExceptionFilter } from "@guardmesh/http";
import { defaultMetrics, guardMeshMetrics } from "@guardmesh/observability";
import { startOrdersWorkflow } from "./workflow.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.useGlobalFilters(new GuardMeshExceptionFilter());
  app.getHttpAdapter().getInstance().addHook("onResponse", async () => {
    defaultMetrics.increment(guardMeshMetrics.httpRequests);
  });
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
  void startOrdersWorkflow();
}

void bootstrap();
