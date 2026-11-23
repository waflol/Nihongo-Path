import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { FeedbackService } from "./feedback.service.js";
import { FEEDBACK_SOURCES, FEEDBACK_STATUSES } from "./schemas/user-feedback.schema.js";

export class CreateFeedbackDto {
  @IsOptional()
  @IsIn(FEEDBACK_SOURCES as unknown as string[])
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @IsString()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  suggestion?: string;
}

export class MyFeedbackQuery {
  @IsOptional()
  @IsIn(FEEDBACK_STATUSES as unknown as string[])
  status?: string;
}

/**
 * Learner feedback surface (P5-FEEDBACK-01): file general feedback and read
 * back my own threads with their processing state. The admin inbox lives in
 * `AdminFeedbackController` (`/admin/feedback`).
 */
@ApiTags("feedback")
@ApiBearerAuth()
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "File general feedback (learner)" })
  create(@CurrentUser() caller: AuthUser, @Body() body: CreateFeedbackDto) {
    return this.service.create(caller, body);
  }

  @Get("me")
  @ApiOperation({ summary: "My own feedback threads with their status + history" })
  me(@CurrentUser() caller: AuthUser, @Query() query: MyFeedbackQuery) {
    return this.service.myList(caller, query.status);
  }
}
