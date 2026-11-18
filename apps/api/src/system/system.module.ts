import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SystemHistoryService } from "./system-history.service.js";
import { SystemSample, SystemSampleSchema } from "./system-sample.schema.js";
import { SystemController } from "./system.controller.js";
import { SystemService } from "./system.service.js";

/** Admin server monitor; routes and history need the database, so only with `MONGODB_URL`. */
export function buildSystemModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) return { module: SystemModule };
  return {
    module: SystemModule,
    imports: [MongooseModule.forFeature([{ name: SystemSample.name, schema: SystemSampleSchema }])],
    providers: [SystemService, SystemHistoryService],
    controllers: [SystemController],
  };
}

@Module({})
export class SystemModule {}
