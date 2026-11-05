import {
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { BlockedIp, BlockedIpSchema } from "./blocked-ip.schema.js";
import { IpBlockService } from "./ip-block.service.js";
import { IpGuardMiddleware } from "./ip-guard.middleware.js";
import { AllowedIp, AllowedIpSchema } from "./allowed-ip.schema.js";
import { AuditLog, AuditLogSchema } from "./audit-log.schema.js";
import { AuditInterceptor } from "./audit.interceptor.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { AppLog, AppLogSchema } from "./app-log.schema.js";
import { buildAuthModule } from "../auth/auth.module.js";
import { LogsController } from "./logs.controller.js";
import { LogsService } from "./logs.service.js";
import { RequestLogMiddleware } from "./request-log.middleware.js";
import { RequestLog, RequestLogSchema } from "./request-log.schema.js";

/**
 * Admin request-log viewer. Like the other feature modules it degrades to an
 * empty module without `MONGODB_URL` (no routes, no middleware, no DI error).
 */
export function buildLogsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: LogsModule };
  }
  return {
    module: LogsModule,
    imports: [
      buildAuthModule(),
      MongooseModule.forFeature([
        { name: RequestLog.name, schema: RequestLogSchema },
        { name: AppLog.name, schema: AppLogSchema },
        { name: BlockedIp.name, schema: BlockedIpSchema },
        { name: AllowedIp.name, schema: AllowedIpSchema },
        { name: AuditLog.name, schema: AuditLogSchema },
      ]),
    ],
    controllers: [LogsController],
    providers: [
      LogsService,
      RequestLogMiddleware,
      IpBlockService,
      IpGuardMiddleware,
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
  };
}

@Module({})
export class LogsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    if (process.env.MONGODB_URL?.trim()) {
      consumer.apply(IpGuardMiddleware, RequestLogMiddleware).forRoutes("*path");
    }
  }
}
