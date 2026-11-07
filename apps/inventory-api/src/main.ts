import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { GuardMeshExceptionFilter, requestBodyLimitFromEnvironment } from "@guardmesh/http";
import { defaultMetrics, guardMeshMetrics, startTelemetry } from "@guardmesh/observability";
import { startInventoryWorkflow } from "./workflow.js";

async function bootstrap(): Promise<void> {
  await startTelemetry("inventory-api");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: requestBodyLimitFromEnvironment() }),
  );
  app.useGlobalFilters(new GuardMeshExceptionFilter());
  app.getHttpAdapter().getInstance().addHook("onResponse", async () => {
    defaultMetrics.increment(guardMeshMetrics.httpRequests);
  });
  registerOpenApi(app);
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3001) });
  void startInventoryWorkflow();
}

function registerOpenApi(app: NestFastifyApplication): void {
  if (process.env.ENABLE_API_DOCS !== "true" || process.env.NODE_ENV === "production") return;
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("GuardMesh Inventory API")
      .setDescription("Generated local contract for the Inventory API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build(),
  );
  const handler = async () => document;
  const http = app.getHttpAdapter().getInstance();
  http.get("/docs/openapi.json", handler);
  http.get("/inventory/docs/openapi.json", handler);
}

void bootstrap();
