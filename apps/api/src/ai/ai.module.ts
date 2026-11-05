import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { AiExampleService } from "./ai-example.service.js";
import { AiServicesController } from "./ai-services.controller.js";
import { AiServiceConfig, AiServiceSchema } from "./ai-service.schema.js";
import { AiServicesService } from "./ai-services.service.js";

/**
 * AI services for example sentences (admin-managed, priority + failover).
 * One shared instance: the flashcards and import modules both import it, so
 * cooldowns and pacing are common. No `MONGODB_URL` → empty module (examples
 * then come from Tatoeba only).
 */
export function buildAiModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: AiModule };
  }
  return {
    module: AiModule,
    imports: [
      buildDatabaseModule(),
      MongooseModule.forFeature([{ name: "AiService", schema: AiServiceSchema }]),
    ],
    controllers: [AiServicesController],
    providers: [AiServicesService, AiExampleService],
    exports: [AiServicesService, AiExampleService],
  };
}

@Module({})
export class AiModule {}
void AiServiceConfig;
