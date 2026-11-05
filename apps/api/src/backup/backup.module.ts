import { Module, type DynamicModule } from "@nestjs/common";
import { buildAuthModule } from "../auth/auth.module.js";
import { BackupController } from "./backup.controller.js";
import { BackupService } from "./backup.service.js";

/** Admin data backup. Empty module without `MONGODB_URL` (no routes). */
export function buildBackupModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: BackupModule };
  }
  return {
    module: BackupModule,
    imports: [buildAuthModule()],
    controllers: [BackupController],
    providers: [BackupService],
  };
}

@Module({})
export class BackupModule {}
