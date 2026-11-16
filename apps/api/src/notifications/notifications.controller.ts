import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { IsPublic } from "../auth/decorators/is-public.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { NotificationsService } from "./notifications.service.js";

class PushKeysDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  auth!: string;
}

/** `PushSubscription.toJSON()` from the browser. */
class BrowserSubscriptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

class SubscribeDto {
  @ValidateNested()
  @Type(() => BrowserSubscriptionDto)
  subscription!: BrowserSubscriptionDto;

  /** Local hour for the daily reminder. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour!: number;

  /** IANA zone of the device. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}

class EndpointDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  endpoint!: string;
}

/**
 * Web Push review reminders (docs/plans/plan-pwa.md, P2). Behind the global
 * AuthGuard except the VAPID public key. Every read/write is limited to the
 * caller's own subscriptions.
 */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications/push")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @IsPublic()
  @Get("public-key")
  @ApiOperation({ summary: "VAPID public key for PushManager.subscribe()" })
  publicKey(): { publicKey: string } {
    return { publicKey: this.notifications.publicKey };
  }

  @Get("subscription")
  @ApiOperation({ summary: "This browser's reminder subscription (null when off)" })
  async get(
    @CurrentUser() me: AuthUser,
    @Query() q: EndpointDto,
  ): Promise<{ subscription: { hour: number; timezone: string } | null }> {
    return { subscription: await this.notifications.find(me, q.endpoint) };
  }

  @Put("subscription")
  @ApiOperation({ summary: "Turn the daily reminder on (or change its hour) for this browser" })
  async put(@CurrentUser() me: AuthUser, @Body() dto: SubscribeDto) {
    const subscription = await this.notifications.subscribe(me, {
      endpoint: dto.subscription.endpoint,
      p256dh: dto.subscription.keys.p256dh,
      auth: dto.subscription.keys.auth,
      hour: dto.hour,
      timezone: dto.timezone,
      userAgent: dto.userAgent,
    });
    return { subscription };
  }

  @Delete("subscription")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Turn the reminder off for this browser" })
  async remove(@CurrentUser() me: AuthUser, @Query() q: EndpointDto): Promise<void> {
    await this.notifications.unsubscribe(me, q.endpoint);
  }

  @Post("test")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Send a test notification to this browser now" })
  async test(@CurrentUser() me: AuthUser, @Body() dto: EndpointDto): Promise<void> {
    await this.notifications.sendTest(me, dto.endpoint);
  }
}
