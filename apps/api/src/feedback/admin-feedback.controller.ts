import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { FeedbackService } from "./feedback.service.js";
import { FEEDBACK_SOURCES, FEEDBACK_STATUSES } from "./schemas/user-feedback.schema.js";

export class AdminListFeedbackQuery {
  @IsOptional()
  @IsIn(FEEDBACK_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsIn(FEEDBACK_SOURCES as unknown as string[])
  source?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class SetFeedbackStatusDto {
  @IsIn(FEEDBACK_STATUSES as unknown as string[])
  status: string;

  /** Admin's note on the decision (kept in the processing history). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Admin feedback inbox (P5-FEEDBACK-02): every admin endpoint sits under
 * `/admin/*` with `@ContentAdmin()`, matching the repo convention so the
 * P5-SEC-01 least-privilege sweep (`grep -L "@Roles"` over all admin
 * controllers) sees it like any other admin surface.
 */
@ApiTags("admin-feedback")
@ApiBearerAuth()
@Controller("admin/feedback")
export class AdminFeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Get()
  @ContentAdmin()
  @ApiOperation({ summary: "Feedback inbox (filter by status / source)" })
  list(@Query() query: AdminListFeedbackQuery) {
    return this.service.adminList(query);
  }

  @Get(":id")
  @ContentAdmin()
  @ApiOperation({ summary: "One feedback with reporter + full processing history" })
  detail(@Param("id") id: string) {
    return this.service.adminDetail(id);
  }

  @Patch(":id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change status (recorded in the processing history)" })
  setStatus(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: SetFeedbackStatusDto) {
    return this.service.adminSetStatus(caller, id, body.status, body.note);
  }
}
