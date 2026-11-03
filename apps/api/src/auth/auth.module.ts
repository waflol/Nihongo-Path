import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import {
  AuthAccount,
  AuthAccountSchema,
} from "../users/schemas/auth-account.schema.js";
import { User, UserSchema } from "../users/schemas/user.schema.js";
import { AuthSession, AuthSessionSchema } from "./schemas/auth-session.schema.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";
import { RateLimiterService } from "../common/rate-limiter.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";

/**
 * `AuthModule` is built through `buildAuthModule()` so the DB-dependent pieces
 * (sign-in endpoints, identity model registration, global guards) follow the
 * same graceful-degrade contract as the bootstrap health module:
 *
 * - `MONGODB_URL` present → full module: sign-in endpoints + the identity
 *   models (re-exported for downstream `@InjectModel` use) + the two global
 *   guards (`AuthGuard` → `RolesGuard`, fixed order, architecture §4.3).
 * - `MONGODB_URL` absent → an empty module; the API still boots, with no
 *   sign-in routes and no global default-deny (nothing to protect yet).
 *
 * The full dynamic module is cached so every call returns the SAME object.
 * Nest dedups the `AuthModule` class in the graph, so the `APP_GUARD`
 * providers are instantiated exactly once even though `UsersModule` and
 * `ContentModule` each import this module.
 */
let cached: DynamicModule | undefined;

export function buildAuthModule(): DynamicModule {
  const url = process.env.MONGODB_URL?.trim();

  if (!url) {
    return { module: AuthModule };
  }

  if (!cached) {
    const db = buildDatabaseModule();
    const models = MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AuthAccount.name, schema: AuthAccountSchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
    ]);

    cached = {
      module: AuthModule,
      imports: [db, models],
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenService,
        RateLimiterService,
        // Fixed order (architecture §4.3): authenticate, then authorize.
        { provide: "APP_GUARD", useClass: AuthGuard },
        { provide: "APP_GUARD", useClass: RolesGuard },
      ],
      // Identity models re-exported for downstream `@InjectModel(User.name)`;
      // `TokenService`/`AuthService` exported for service-level reuse.
      exports: [models, TokenService, AuthService],
    };
  }

  return cached;
}

/** Empty placeholder used when no `MONGODB_URL` is configured. */
@Module({})
export class AuthModule {}
