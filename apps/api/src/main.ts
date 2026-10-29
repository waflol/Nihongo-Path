import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

/**
 * Entrypoint.
 *
 * NOTE: `AppModule`'s first static import (`./bootstrap/env.js`) loads
 * `.env` / `.env.local` before any module body evaluates, so the MongoDB
 * decision in `buildDatabaseModule()` and the ConfigModule validation below
 * both see the full environment.
 *
 * Nothing in this file logs environment values — secrets stay out of logs
 * (spec §12).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);

  // CORS — the UI runs on a different port/origin in local dev (`WEB_ORIGIN`,
  // comma-separated). Requests without an Origin header (curl, health checks)
  // are unaffected.
  const webOrigins = configService
    .get<string>("WEB_ORIGIN")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (webOrigins && webOrigins.length > 0) {
    app.enableCors({ origin: webOrigins, credentials: true });
  }

  // Swagger/OpenAPI docs — dev & test only, never served in production.
  const nodeEnv = configService.get("NODE_ENV") ?? "development";
  if (nodeEnv !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Nihongo Path API")
        .setDescription(
          "REST API for the Nihongo Path Japanese-learning platform. " +
            "Bootstrap: health endpoints only; domain modules land in later sprints.",
        )
        .setVersion("0.1.0")
        .addTag("health", "Liveness & readiness probes")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }

  // PORT is validated/coerced to a number by `validateEnv`
  // (ConfigModule.forRoot({ validate }) in AppModule); the validated value
  // is assigned back to process.env, so read it through ConfigService.
  const port = Number(configService.get("PORT") ?? 3000);
  await app.listen(port);

  Logger.log(`Nihongo Path API listening on port ${port}`, "Bootstrap");
}

void bootstrap();
