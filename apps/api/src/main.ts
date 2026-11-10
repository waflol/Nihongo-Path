import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { DbLogger } from "./logs/db-logger.js";

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
  // JSON bodies up to 400 kB: flashcards may carry a small (client-resized)
  // image as a data URL. Express' default 100 kB would reject those.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new DbLogger(),
  });
  app.useBodyParser("json", { limit: "400kb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "400kb" });
  // Kanji CSV restore (admin): the file carries stroke data, so it is bigger than a JSON call.
  app.useBodyParser("text", { type: "text/csv", limit: "40mb" });
  app.useBodyParser("raw", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    limit: "40mb",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);

  // Real client IP behind the Next.js server / a reverse proxy. Off by default
  // (X-Forwarded-For is spoofable): set TRUST_PROXY to `true`, a hop count, or
  // a subnet name such as `loopback` — only when the API is not directly
  // reachable by clients. Drives IP stats and IP blocking.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    app.set(
      "trust proxy",
      trustProxy === "true" ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

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
