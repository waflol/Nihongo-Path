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
  IsUUID,
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

  /** Restrict a queue to one card kind, e.g. GRAMMAR or KANJI. */
  @IsOptional()
  @IsIn(["VOCABULARY", "GRAMMAR", "KANJI", "CUSTOM"])
  kind?: "VOCABULARY" | "GRAMMAR" | "KANJI" | "CUSTOM";

  /** Restrict a queue / count / stats to one learning pillar. */
  @IsOptional()
  @IsIn(["vocab", "grammar", "kanji"])
  pillar?: "vocab" | "grammar" | "kanji";

  /** Kanji by family instead of by level: a component, or "all" (use with `queue/families`). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  family?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  themeId?: string;

  @IsOptional()
  @IsString()
  contextId?: string;

  @IsOptional()
  @IsString()
  textbookId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;
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

  /** Client-generated UUID — a re-sent review with the same id applies once. */
  @IsOptional()
  @IsUUID()
  reviewId?: string;

  /** Epoch ms the learner graded the card (validated server-side). */
  @IsOptional()
  @IsInt()
  reviewedAt?: number;
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

class PillarLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  vocab?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  grammar?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  kanji?: number;
}

class SettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  newCardsPerDay?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PillarLimitsDto)
  newCardsPerDayByPillar?: PillarLimitsDto;
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
    return this.srs.exercisePriority(caller, query.tz, query.pillar);
  }

  @Get("due-count")
  @ApiOperation({ summary: "How many learned words are due today (same count as the review hub)" })
  dueCount(@CurrentUser() caller: AuthUser, @Query() query: QueueQuery) {
    return this.srs.dueCount(caller, query.tz, query.pillar);
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
    return this.srs.getQueue(caller, deckId, query.tz, query.limit ?? 20, query.mode, query.kind, {
      level: query.level,
      themeId: query.themeId,
      contextId: query.contextId,
      textbookId: query.textbookId,
      unitId: query.unitId,
    }, query.pillar, query.family);
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
    @Query("pillar") pillar?: "vocab" | "grammar" | "kanji",
  ) {
    const off = Math.max(-520, Math.min(0, Math.trunc(Number(offset) || 0)));
    const r = range === "week" || range === "month" || range === "year" ? range : "all";
    const p = pillar === "vocab" || pillar === "grammar" || pillar === "kanji" ? pillar : undefined;
    return this.srs.masteryStats(caller, deckId || undefined, r, off, p);
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
