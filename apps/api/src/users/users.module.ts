import { Module, type DynamicModule } from "@nestjs/common";
import { buildAuthModule } from "../auth/auth.module.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

/**
 * Identity — own-profile read/update surface (P2-USER-01, spec §4.1).
 *
 * `UsersService` injects `@InjectModel(User.name)`, which only exists when
 * `buildAuthModule()` has registered the identity models. That happens only
 * with a `MONGODB_URL`, so this module is built conditionally to keep the
 * graceful-degrade contract: no DB → no users endpoints, and no DI error.
 */
export function buildUsersModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: UsersModule };
  }

  return {
    module: UsersModule,
    imports: [buildAuthModule()],
    controllers: [UsersController, AdminUsersController],
    providers: [UsersService, AdminUsersService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class UsersModule {}
