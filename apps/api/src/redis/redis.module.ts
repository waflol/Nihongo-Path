import { Global, Module, type DynamicModule } from "@nestjs/common";
import { RedisController } from "./redis.controller.js";
import { RedisService } from "./redis.service.js";

/**
 * Optional Redis (`REDIS_URL`). The service is always available (a no-op
 * without a URL); the admin routes need the auth guards, so they only exist
 * with a database like the other admin modules.
 */
export function buildRedisModule(): DynamicModule {
  return {
    module: RedisModule,
    global: true,
    providers: [RedisService],
    exports: [RedisService],
    controllers: process.env.MONGODB_URL?.trim() ? [RedisController] : [],
  };
}

@Global()
@Module({})
export class RedisModule {}
