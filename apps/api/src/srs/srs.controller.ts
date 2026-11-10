import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { SrsService } from "./srs.service.js";
import { REVIEW_GRADES } from "./srs.algorithm.js";

class QueueQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  /** IANA time zone; omitted → the caller's profile timezone. */
  tz?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** `learn`: a deck's new words (in deck order); `review` (default): only the words due. */
  @IsOptional()
  @IsIn(["learn", "review"])
  mode?: "learn" | "review";
}

export class ReviewDto {
  @IsString()
  @MinLength(1)
  cardId: string;

  @IsIn([...REVIEW_GRADES])
  grade: (typeof REVIEW_GRADES)[number];

  /** IANA time zone; omitted → the caller's profile timezone. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  tz?: string;
}

/** One card + grade inside a batch. */
export class BatchReviewItemDto {
  @IsString()
  @MinLength(1)
  cardId: string;

  @IsIn([...REVIEW_GRADES])
  grade: (typeof REVIEW_GRADES)[number];
}

/**
 * A batch of reviews (P3-UI-01). The study screen grades many cards in a
 * sitting; sending them in one request removes the per-card round-trip that
 * made the screen feel laggy.
 */
export class BatchReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BatchReviewItemDto)
  reviews: BatchReviewItemDto[];

  /** IANA time zone; omitted → the caller's profile timezone. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  tz?: string;
}

class DeckProgressQuery {
  /** Comma-separated deck ids the caller already lists (their own page). */
  @IsString()
  @MinLength(1)
  deckIds: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tz?: string;
}

class SettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  newCardsPerDay!: number;
}

/**
 * Study queue + review surface (P3-SRS-04/05). Behind the global
 * `AuthGuard`; every call is scoped to the caller's own progress. The
 * `tz` parameter (when sent by the UI) overrides the profile timezone for
 * this sitting — a user reviewing while travelling keeps the right due day.
 */
@ApiTags("srs")
@ApiBearerAuth()
@Controller("srs")
export class SrsController {
  constructor(private readonly srs: SrsService) {}

  @Get("exercise-priority")
  @ApiOperation({ summary: "Per deck: words learned today, then words due — what the exercises drill first" })
  exercisePriority(@CurrentUser() caller: AuthUser, @Query() query: QueueQuery) {
    return this.srs.exercisePriority(caller, query.tz);
  }

  @Get("queue/:deckId")
  @ApiOperation({
    summary: "My review queue for a deck (new / due / hard / mastered)",
  })
  getQueue(
    @CurrentUser() caller: AuthUser,
    @Param("deckId") deckId: string,
    @Query() query: QueueQuery,
  ) {
    return this.srs.getQueue(caller, deckId, query.tz, query.limit ?? 20, query.mode);
  }

  @Post("reviews")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Grade one card → advance its SRS schedule" })
  @ApiResponse({
    status: 200,
    description: "New SRS state + next due instant (timezone-anchored)",
  })
  review(@CurrentUser() caller: AuthUser, @Body() body: ReviewDto) {
    return this.srs.review(caller, body);
  }

  @Post("reviews/batch")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Grade many cards in one request (same rules as a single review)",
  })
  @ApiResponse({
    status: 200,
    description: "New SRS state + next due instant per reviewed card",
  })
  reviewBatch(@CurrentUser() caller: AuthUser, @Body() body: BatchReviewDto) {
    return this.srs.reviewBatch(caller, body);
  }

  @Post("decks/:deckId/reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Reset my progress on a deck — every card becomes new again (cards kept)",
  })
  resetDeck(@CurrentUser() caller: AuthUser, @Param("deckId") deckId: string) {
    return this.srs.resetDeck(caller, deckId);
  }

  @Get("settings")
  @ApiOperation({ summary: "My study settings (new cards per day)" })
  getSettings(@CurrentUser() caller: AuthUser) {
    return this.srs.getSettings(caller);
  }

  @Patch("settings")
  @ApiOperation({ summary: "Set how many new cards to learn per day" })
  updateSettings(@CurrentUser() caller: AuthUser, @Body() body: SettingsDto) {
    return this.srs.updateSettings(caller, body);
  }

  @Get("stats")
  @ApiOperation({ summary: "Mastery-level distribution of my learned cards" })
  stats(
    @CurrentUser() caller: AuthUser,
    @Query("deckId") deckId?: string,
    @Query("range") range?: string,
    @Query("offset") offset?: string,
  ) {
    const off = Math.max(-520, Math.min(0, Math.trunc(Number(offset) || 0)));
    const r = range === "week" || range === "month" || range === "year" ? range : "all";
    return this.srs.masteryStats(caller, deckId || undefined, r, off);
  }

  @Get("decks-progress")
  @ApiOperation({
    summary:
      "Per-deck { new, due } counts for the caller's deck list (P3-UI-03)",
  })
  decksProgress(
    @CurrentUser() caller: AuthUser,
    @Query() query: DeckProgressQuery,
  ) {
    const ids = query.deckIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return this.srs.deckProgress(caller, ids, query.tz);
  }
}
