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
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { BadRequestException } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import {
  EXERCISE_KINDS,
  type ExerciseKind,
} from "../flashcards/schemas/exercise-question.schema.js";
import { EXAM_STATUSES, type ExamStatus } from "./schemas/exam.schema.js";
import { ExamsService } from "./exams.service.js";
import { StimuliService } from "./stimuli.service.js";
import { JLPT_STRUCTURE } from "./jlpt-structure.js";
import { MONDAI_TYPES, SECTION_KEYS, type MondaiType, type SectionKey } from "./mondai.js";
import { STIMULUS_KINDS, type StimulusKind } from "./schemas/stimulus.schema.js";
import { QUESTION_RIGHTS, type QuestionRights } from "../flashcards/schemas/exercise-question.schema.js";

// ── Learner DTOs ──────────────────────────────────────────────────────

class ExamsQuery {
  @IsOptional() @IsString() @MaxLength(8) level?: string;
  @IsOptional() @IsString() @MaxLength(100) examType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1990) @Max(2100) year?: number;
}

/** One answer inside a submit: question id → served option index (0–3) or null. */
class SubmitAnswersDto {
  @IsOptional()
  @IsObject()
  answers?: Record<string, number | null>;
}

class DraftDto {
  @IsOptional()
  @IsObject()
  answers?: Record<string, number | null>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  flagged?: string[];
}

// ── Admin DTOs ────────────────────────────────────────────────────────

class AdminQuestionDto {
  @IsIn(EXERCISE_KINDS as unknown as string[])
  kind: ExerciseKind;

  @IsString() @MinLength(1) @MaxLength(400) prompt: string;

  @IsOptional() @IsString() @MaxLength(400) sub?: string;

  /** Option count is per-type: 4 for the printed forms, 3 or 4 for listening. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(400, { each: true })
  options: string[];

  @IsString() @MinLength(1) @MaxLength(400) answer: string;

  @IsOptional() @IsString() @MaxLength(400) explain?: string;

  @IsOptional() @IsString() @MaxLength(8) level?: string;

  // ── JLPT exam-bank fields (NP-406) ───────────────────────────────
  @IsOptional() @IsIn(MONDAI_TYPES as unknown as string[]) mondai?: MondaiType;
  @IsOptional() @IsIn(SECTION_KEYS as unknown as string[]) section?: SectionKey;
  @IsOptional() @IsString() stimulus?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) groupOrder?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) points?: number;
  @IsOptional() @IsIn(QUESTION_RIGHTS as unknown as string[]) rights?: QuestionRights;
}

class ShuffleDto {
  @IsOptional() @IsBoolean() questions?: boolean;
  @IsOptional() @IsBoolean() options?: boolean;
}

class AdminExamDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;

  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @IsOptional() @IsString() @MaxLength(100) examType?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1990) @Max(2100) year?: number;

  @IsOptional() @IsString() @MaxLength(8) level?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(240) timeLimitMin?: number;

  /** `true` → explicitly remove the exam's time limit (untimed). */
  @IsOptional() @IsBoolean() clearTimeLimit?: boolean;

  @IsOptional() @ValidateNested() @Type(() => ShuffleDto) shuffle?: ShuffleDto;

  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true })
  questionIds?: string[];

  @IsOptional() @IsIn(EXAM_STATUSES as unknown as string[]) status?: (typeof EXAM_STATUSES)[number];
}

/**
 * One shared reading passage (NP-406). Admin auth + review only — the sit
 * payload serves the passage body to learners, answer-free.
 */
// Declared before `StimulusDto`: its `sourceRef` property metadata reads the
// class at module load, so a later declaration hits the TDZ and crashes boot.
class SourceRefDto {
  @IsString() @MinLength(1) @MaxLength(300) file: string;
  @IsOptional() @IsString() @MaxLength(40) sitting?: string;
  @IsOptional() @IsString() @MaxLength(40) no?: string;
}

class StimulusDto {
  @IsOptional() @IsString() @MaxLength(8) level?: string;

  @IsIn(MONDAI_TYPES as unknown as string[]) mondai: MondaiType;

  @IsIn(SECTION_KEYS as unknown as string[]) section: SectionKey;

  @IsIn(STIMULUS_KINDS as unknown as string[]) kind: StimulusKind;

  @IsOptional() @IsString() @MaxLength(200) title?: string;

  @IsString() @MinLength(1) body: string;

  @IsOptional() @IsString() bodyB?: string;

  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsString() @MaxLength(1000) imageUrl?: string;

  @Type(() => Number) @IsInt() @Min(0) questionCount: number;

  @IsOptional() @IsIn(QUESTION_RIGHTS as unknown as string[]) rights?: QuestionRights;

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceRefDto)
  sourceRef?: SourceRefDto;
}

class StimuliQuery {
  @IsOptional() @IsString() @MaxLength(8) level?: string;
  @IsOptional() @IsIn(MONDAI_TYPES as unknown as string[]) mondai?: MondaiType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

class AdminQuestionQuery {
  @IsOptional() @IsIn(EXERCISE_KINDS as unknown as string[]) kind?: ExerciseKind;
  @IsOptional() @IsString() @MaxLength(8) level?: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  /** `true` = standalone (admin-authored) questions only. */
  @IsOptional() @IsIn(["true", "false"]) standalone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/**
 * Exams (P4-EXAM-04…09, P4-UI-01/02). Behind the global `AuthGuard`:
 * learner routes are scoped to the caller's own attempts (T-P4-07),
 * admin routes to `@ContentAdmin` (403 for learners — T-P2-04).
 *
 * The sit payload never carries a question's `answer` or `explain`
 * (P4-SEC-01, T-P4-03) — grading happens on the server at submit /
 * time-out.
 */
@ApiTags("exams")
@ApiBearerAuth()
@Controller("exams")
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly stimuli: StimuliService,
  ) {}

  // ── Learner ──────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Published exams I can take (?level, ?examType, ?year)" })
  listExams(@Query() query: ExamsQuery) {
    return this.exams.listExams(query);
  }

  @Get("structure")
  @ApiOperation({ summary: "The JLPT paper per level N5…N1: timed parts, 大問 in order, usual question counts" })
  structure() {
    return JLPT_STRUCTURE;
  }

  @Post(":id/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start (or resume) an exam → sit payload (answers stay server-side)" })
  start(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.exams.start(caller, id);
  }

  @Get("attempts")
  @ApiOperation({ summary: "My exam sittings (newest first)" })
  listAttempts(@CurrentUser() caller: AuthUser) {
    return this.exams.listAttempts(caller);
  }

  @Get("attempts/:id")
  @ApiOperation({
    summary: "My sitting: sit payload while in progress (refresh-safe), result payload when finished",
  })
  getAttempt(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.exams.getAttempt(caller, id);
  }

  @Patch("attempts/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Save my draft (answers / flags) — auto-grades as timed-out if the deadline passed",
  })
  saveDraft(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: DraftDto,
  ) {
    return this.exams.saveDraft(caller, id, body);
  }

  @Post("attempts/:id/submit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Submit my sitting — graded on the server (deadline + answer checks)",
  })
  @ApiResponse({ status: 200, description: "Result payload: score, percent, per-question review with explanations" })
  submit(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SubmitAnswersDto,
  ) {
    return this.exams.submit(caller, id, body.answers);
  }

  @Get("stats")
  @ApiOperation({ summary: "My exam progress: totals, by level / family / exam, 30-day series (P4-EXAM-08)" })
  stats(@CurrentUser() caller: AuthUser) {
    return this.exams.stats(caller);
  }

  // ── Admin (P4-EXAM-09) ───────────────────────────────────────────

  @Post("admin/exam-questions")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Author a standalone bank question (admin, idempotent by dedupeKey)" })
  adminAuthorQuestion(@CurrentUser() caller: AuthUser, @Body() body: AdminQuestionDto) {
    return this.exams.adminAuthorQuestion(caller, body);
  }
  @Get("admin/exam-questions")
  @ContentAdmin()
  @ApiOperation({ summary: "List the question bank (?kind, ?level, ?q, ?standalone, ?limit)" })
  adminListQuestions(@Query() query: AdminQuestionQuery) {
    return this.exams.adminListQuestions({
      kind: query.kind,
      level: query.level,
      q: query.q,
      standalone: query.standalone === "true" ? true : query.standalone === "false" ? false : undefined,
      limit: query.limit,
    });
  }

  @Get("admin/exams")
  @ContentAdmin()
  @ApiOperation({ summary: "All exams, any status (admin)" })
  adminListExams() {
    return this.exams.adminListExams();
  }

  @Post("admin/exams")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a draft exam (admin)" })
  adminCreateExam(@CurrentUser() caller: AuthUser, @Body() body: AdminExamDto) {
    return this.exams.adminCreateExam(caller, body);
  }

  @Patch("admin/exams/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update an exam: settings, question list, status (admin)" })
  adminUpdateExam(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: AdminExamDto,
  ) {
    return this.exams.adminUpdateExam(caller, id, {
      title: body.title,
      description: body.description,
      examType: body.examType,
      year: body.year,
      level: body.level,
      timeLimitMin: body.timeLimitMin,
      clearTimeLimit: body.clearTimeLimit,
      shuffle: body.shuffle,
      questionIds: body.questionIds,
      status: body.status,
    });
  }

  @Delete("admin/exams/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an exam (its attempts keep their snapshots) (admin)" })
  adminDeleteExam(@Param("id") id: string) {
    return this.exams.adminDeleteExam(id);
  }

  // ── Stimuli (NP-406) — the shared reading passages ───────────────

  @Get("admin/stimuli")
  @ContentAdmin()
  @ApiOperation({ summary: "Shared reading passages (?level, ?mondai, ?limit) (admin)" })
  adminListStimuli(@Query() query: StimuliQuery) {
    return this.stimuli.list({
      level: query.level,
      mondai: query.mondai,
      limit: query.limit,
    });
  }

  @Get("admin/stimuli/:id")
  @ContentAdmin()
  @ApiOperation({ summary: "One passage, full body (admin review) (admin)" })
  adminGetStimulus(@Param("id") id: string) {
    return this.stimuli.get(id);
  }

  @Post("admin/stimuli")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a shared reading passage (admin)" })
  adminCreateStimulus(@CurrentUser() caller: AuthUser, @Body() body: StimulusDto) {
    return this.stimuli.create(caller, body);
  }

  @Patch("admin/stimuli/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Edit a passage (admin)" })
  adminUpdateStimulus(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: Partial<StimulusDto>,
  ) {
    return this.stimuli.update(caller, id, body);
  }

  @Delete("admin/stimuli/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a passage (?hard=true also clears its questions' refs) (admin)" })
  adminDeleteStimulus(@Param("id") id: string, @Query("hard") hard?: string) {
    return this.stimuli.remove(id, hard === "true");
  }
}
