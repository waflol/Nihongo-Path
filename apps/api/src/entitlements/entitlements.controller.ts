import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { attachAuditNote, type AuditRequest } from "../logs/audit-note.js";
import { EntitlementsService, type FeatureConfigInput } from "./entitlements.service.js";
import { QuotaService } from "./quota.service.js";
import { OVER_LIMIT_POLICIES, PLANS, QUOTA_PERIODS } from "./schemas/feature-config.schema.js";

class LimitDto {
  @IsIn(PLANS as unknown as string[]) plan: string;

  /** `null` = unlimited. A missing value is still rejected. */
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  limit: number | null;
}

export class FeatureConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => LimitDto)
  limits?: LimitDto[];

  @IsOptional()
  @IsIn(QUOTA_PERIODS as unknown as string[])
  period?: string;

  @IsOptional()
  @IsString()
  tz?: string;

  @IsOptional()
  @IsIn(OVER_LIMIT_POLICIES as unknown as string[])
  overLimit?: string;
}

class SetPlanDto {
  @IsIn(PLANS as unknown as string[]) plan: string;
}

/**
 * Learner-side entitlements read: the remaining period quota for a feature
 * (P5-QUOTA). Unauthenticated calls are rejected by the global `AuthGuard`;
 * the endpoint always scopes to the caller's own id (no foreign lookups).
 */
@ApiTags("entitlements")
@ApiBearerAuth()
@Controller("entitlements")
export class EntitlementsController {
  constructor(
    private readonly quota: QuotaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get("me/remaining/:featureKey")
  @ApiOperation({ summary: "My remaining quota for a feature this period" })
  myRemaining(@CurrentUser() caller: AuthUser, @Param("featureKey") featureKey: string) {
    return this.quota.remaining(caller.sub, featureKey);
  }
}

/**
 * Admin entitlements surface (P5-ADMIN-04): feature config + per-user plans.
 * Every admin route sits under `/admin/*` with `@ContentAdmin()`, matching
 * the repo convention (P5-SEC-01 least-privilege sweep sees it), and each
 * mutation snapshots before/after into the P5-ADMIN-03 audit trail.
 */
@ApiTags("admin-entitlements")
@ApiBearerAuth()
@Controller("admin/entitlements")
export class AdminEntitlementsController {
  constructor(private readonly service: EntitlementsService) {}

  @Get("features")
  @ContentAdmin()
  @ApiOperation({ summary: "List feature configs" })
  listFeatures() {
    return this.service.listFeatures();
  }

  @Post("features/:featureKey")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Create-or-update a feature config (live effect — no deploy)" })
  async upsertFeature(
    @CurrentUser() caller: AuthUser,
    @Param("featureKey") featureKey: string,
    @Body() body: FeatureConfigDto,
    @Req() req: AuditRequest,
  ) {
    const [before, after] = await Promise.all([
      this.service.readFeature(featureKey),
      this.service.upsertFeature(caller, featureKey, body as FeatureConfigInput),
    ]);
    attachAuditNote(req, {
      before: before ?? undefined,
      after: after ?? undefined,
      summary: `entitlement: ${featureKey}`,
    });
    return after;
  }

  @Delete("features/:featureKey")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a feature config (the feature becomes unlimited; usage history stays)" })
  async deleteFeature(@Param("featureKey") featureKey: string, @Req() req: AuditRequest) {
    const before = await this.service.deleteFeature(featureKey);
    attachAuditNote(req, { before, summary: `entitlement deleted: ${featureKey}` });
    return { featureKey, deleted: true };
  }

  @Patch("users/:id/plan")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set a user's plan (the operator today; the billing webhook in P9)" })
  async setPlan(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SetPlanDto,
    @Req() req: AuditRequest,
  ) {
    const res = await this.service.setPlan(caller, id, body.plan as never);
    attachAuditNote(req, {
      before: { plan: res.before },
      after: { plan: res.plan },
      summary: `plan: ${res.before ?? "?"} → ${res.plan}`,
    });
    return res;
  }

  @Get("features/:featureKey/usage/:userId")
  @ContentAdmin()
  @ApiOperation({ summary: "A user's per-period usage for one feature" })
  usageFor(@Param("featureKey") featureKey: string, @Param("userId") userId: string) {
    return this.service.usageFor(userId, featureKey);
  }
}
