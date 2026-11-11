import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  ServiceUnavailableException,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { KanjiDocument } from "../content/schemas/kanji.schema.js";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import type { Response } from "express";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { AiExampleService } from "../ai/ai-example.service.js";
import { ExerciseQuestionsService } from "./exercise-questions.service.js";
import { CardReportsService } from "./card-reports.service.js";
import { REPORT_KINDS, REPORT_STATUSES, type ReportKind, type ReportStatus } from "./schemas/card-report.schema.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { FlashcardsService } from "./flashcards.service.js";
import { ReadingService } from "./reading.service.js";
import { ImageSuggestService } from "./image-suggest.service.js";
import {
  CreateCardDto,
  CreateDeckDto,
  ImageSuggestQueryDto,
  ReadingQueryDto,
  UpdateCardDto,
  UpdateDeckDto,
} from "./dto/flashcards.dto.js";

/** Query params for the card list (stable pagination is out of scope for a
 *  deck's cards — a capped `limit` suffices for the study engine). */
class ListCardsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}

/** Query for the paged card manager list. */
class PageCardsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() missing?: string;
  @IsOptional() @IsString() card?: string;
  @IsOptional() @IsString() review?: string;
}

/** Which kind of warning a whole-deck re-check judges (all three when omitted). */
class RecheckQuery {
  @IsOptional() @IsIn(["hanViet", "reading", "back"]) field?: "hanViet" | "reading" | "back";
}

class CardFilterDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() missing?: boolean;
}

class SynonymQuizDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  cardIds: string[];
}

class SaveQuestionDto {
  @IsString() cardId: string;
  @IsString() kind: string;
  @IsString() @MaxLength(400) prompt: string;
  @IsOptional() @IsString() @MaxLength(400) sub?: string;
  @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) options: string[];
  @IsString() @MaxLength(400) answer: string;
  @IsOptional() @IsString() @MaxLength(400) explain?: string;
  @IsOptional() @IsString() source?: string;
}

class SaveQuestionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaveQuestionDto)
  items: SaveQuestionDto[];
}

class GradeSentenceDto {
  @IsString() cardId: string;
  @IsString() @MinLength(1) @MaxLength(300) sentence: string;
}

class CardReportDto {
  @IsIn(REPORT_KINDS as unknown as string[]) kind: ReportKind;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsString() @MaxLength(1000) suggestion?: string;
}

class ReportStatusDto {
  @IsIn(REPORT_STATUSES as unknown as string[]) status: ReportStatus;
}

class BulkTagsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) ids?: string[];
  @IsOptional() @ValidateNested() @Type(() => CardFilterDto) filter?: CardFilterDto;
  @IsOptional() @IsArray() @IsString({ each: true }) add?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) remove?: string[];
}

/**
 * Personal-deck + save-a-word surface (P3-CARD-03/04).
 *
 * All routes sit behind the global `AuthGuard` (no `@IsPublic()`), so the
 * caller is always authenticated. Ownership is enforced in the service:
 * personal decks are private to their owner (T-P3-07), shared decks are
 * read-only for learners and admin-managed (T-P3-08).
 */
@ApiTags("flashcards")
@ApiBearerAuth()
@Controller("flashcards")
export class FlashcardsController {
  constructor(
    private readonly flashcards: FlashcardsService,
    private readonly reading: ReadingService,
    private readonly images: ImageSuggestService,
    private readonly ai: AiExampleService,
    private readonly questionBank: ExerciseQuestionsService,
    private readonly reports: CardReportsService,
    @InjectModel("Kanji") private readonly kanjiModel: Model<KanjiDocument>,
  ) {}

  /** The kanji already created for N5–N1, cached for 10 minutes. */
  private kanjiCache: { at: number; chars: string } | null = null;
  private async levelKanji(): Promise<string> {
    if (this.kanjiCache && Date.now() - this.kanjiCache.at < 10 * 60_000) return this.kanjiCache.chars;
    const rows = await this.kanjiModel
      .find({ level: { $in: ["N5", "N4", "N3", "N2", "N1"] } }, { char: 1, rank: 1 })
      .sort({ rank: 1 })
      .lean()
      .exec();
    const chars = rows.map((r) => r.char).join("");
    this.kanjiCache = { at: Date.now(), chars };
    return chars;
  }

  // ── Card error reports (shared decks) ──────────────────────────────

  @Post("cards/:id/report")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Report an error / suggest a fix on a shared-deck card" })
  reportCard(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: CardReportDto,
  ) {
    return this.reports.create(caller, id, body);
  }

  @Get("admin/card-reports")
  @ContentAdmin()
  @ApiOperation({ summary: "List learner error reports (admin)" })
  adminListReports(@Query("status") status?: string) {
    return this.reports.adminList(status);
  }

  @Patch("admin/card-reports/:id")
  @ContentAdmin()
  @ApiOperation({ summary: "Mark a report resolved / rejected / open (admin)" })
  adminSetReportStatus(@Param("id") id: string, @Body() body: ReportStatusDto) {
    return this.reports.adminSetStatus(id, body.status);
  }

  @Get("image-suggestions")
  @ApiOperation({
    summary: "Suggest mnemonic pictures for a word (Wikimedia Commons)",
  })
  suggestImages(@Query() query: ImageSuggestQueryDto) {
    return this.images.suggest(query.q);
  }

  // ── Reading helper ──────────────────────────────────────────────────

  @Post("reading")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Hiragana reading + part-of-speech guess for a term (empty reading when there is no kanji)",
  })
  analyzeReading(@Body() body: ReadingQueryDto) {
    return this.reading.analyze(body.text);
  }

  // ── Decks ───────────────────────────────────────────────────────────

  @Get("example-jobs")
  @ApiOperation({ summary: "Decks of mine whose example sentences are being generated (progress popup)" })
  exampleJobs(@CurrentUser() caller: AuthUser) {
    return this.flashcards.exampleJobs(caller);
  }

  @Get("decks")
  @ApiOperation({ summary: "List my personal decks + published shared decks" })
  listDecks(@CurrentUser() caller: AuthUser) {
    return this.flashcards.listDecks(caller);
  }

  @Get("decks/:id")
  @ApiOperation({ summary: "Read a deck I may access" })
  getDeck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.getDeck(caller, id);
  }

  @Post("decks")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a personal deck (admin: `shared: true`)" })
  createDeck(@CurrentUser() caller: AuthUser, @Body() body: CreateDeckDto) {
    return this.flashcards.createDeck(caller, body);
  }

  @Patch("decks/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update my own deck" })
  updateDeck(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateDeckDto,
  ) {
    return this.flashcards.updateDeck(caller, id, body);
  }

  @Delete("decks/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete my deck (cascades its cards + my progress)",
  })
  deleteDeck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.deleteDeck(caller, id);
  }

  // ── Cards ───────────────────────────────────────────────────────────

  @Get("decks/:id/cards")
  @ApiOperation({ summary: "List cards in a deck I may access" })
  listCards(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Query() query: ListCardsQuery,
  ) {
    return this.flashcards.listCards(caller, id, query.limit ?? 100);
  }

  @Post("decks/:id/synonym-quiz")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Synonym drill data (AI): a synonym + 3 wrong words for up to 10 cards of a deck",
  })
  async synonymQuiz(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SynonymQuizDto,
  ) {
    const wanted = new Set(body.cardIds);
    const cards = (await this.flashcards.listCards(caller, id, 5000)).filter((c) =>
      wanted.has(String(c._id)),
    );
    const map = await this.ai.synonymQuiz(
      cards.map((c) => ({ term: c.front, reading: c.reading ?? "", meaning: c.back })),
    );
    const items = cards.flatMap((c) => {
      const q = map?.get(c.front);
      return q ? [{ cardId: String(c._id), synonym: q.synonym, wrong: q.wrong }] : [];
    });
    return { items };
  }

  @Post("decks/:id/kanji-lookalikes")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Look-alike kanji drill data (AI): similar kanji for each kanji of each card",
  })
  async kanjiLookalikes(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SynonymQuizDto,
  ) {
    const wanted = new Set(body.cardIds);
    const cards = (await this.flashcards.listCards(caller, id, 5000)).filter((c) =>
      wanted.has(String(c._id)),
    );
    const map = await this.ai.kanjiLookalikes(
      cards.map((c) => ({ term: c.front, reading: c.reading ?? "", meaning: c.back })),
    );
    const items = cards.flatMap((c) => {
      const chars = map?.get(c.front);
      return chars ? [{ cardId: String(c._id), chars }] : [];
    });
    return { items };
  }

  @Post("decks/:id/kanji-distractors")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Trắc nghiệm hiragana → kanji: 3 wrong spellings per card, composed by the AI only from the kanji already created for N5–N1 (need not be real words)",
  })
  async kanjiDistractors(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SynonymQuizDto,
  ) {
    const wanted = new Set(body.cardIds);
    const cards = (await this.flashcards.listCards(caller, id, 5000)).filter((c) =>
      wanted.has(String(c._id)),
    );
    const map = await this.ai.kanjiDistractors(
      cards.map((c) => ({ term: c.front, reading: c.reading ?? "", meaning: c.back })),
      await this.levelKanji(),
    );
    const items = cards.flatMap((c) => {
      const wrong = map?.get(c.front);
      return wrong?.length ? [{ cardId: String(c._id), wrong }] : [];
    });
    return { items };
  }

  @Post("decks/:id/exercise-questions")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Keep generated exercise questions in the question bank (JLPT / Nattest practice later)",
  })
  saveExerciseQuestions(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SaveQuestionsDto,
  ) {
    return this.questionBank.saveMany(caller, id, body.items);
  }

  @Post("decks/:id/grade-sentence")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "AI grades a sentence I wrote with a studied word: score, mistakes, corrected sentence, usage examples",
  })
  async gradeSentence(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: GradeSentenceDto,
  ) {
    const card = (await this.flashcards.listCards(caller, id, 5000)).find(
      (c) => String(c._id) === body.cardId,
    );
    if (!card) throw new NotFoundException("Card not found in this deck");
    const grade = await this.ai.gradeSentence({
      term: card.front,
      reading: card.reading ?? "",
      meaning: card.back,
      sentence: body.sentence.trim(),
    });
    if (!grade) throw new ServiceUnavailableException("AI chưa chấm được câu này — thử lại sau");
    return grade;
  }

  @Get("decks/:id/cards/page")
  @ApiOperation({ summary: "Paged + filtered cards of a deck, with its tag list" })
  pageCards(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Query() query: PageCardsQuery,
  ) {
    return this.flashcards.pageCards(caller, id, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 30,
      q: query.q,
      tag: query.tag,
      missing: query.missing === "1" || query.missing === "true",
      card: query.card,
      review: query.review === "hanViet" || query.review === "reading" || query.review === "back" ? query.review : query.review === "1" || query.review === "true" ? "all" : undefined,
    });
  }

  @Get("decks/:id/ai-unused")
  @ContentAdmin()
  @ApiOperation({
    summary:
      "Words with a saved AI example that is not on their (still empty) card — for the admin to review",
  })
  aiUnused(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.aiUnusedExamples(caller, id);
  }

  @Post("decks/:id/recheck")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Re-check Hán Việt, reading or meaning (`field`, all when omitted) over the whole deck → “Cần xem xét” warnings" })
  recheck(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Query() query: RecheckQuery) {
    return this.flashcards.startRecheck(caller, id, (items) => this.ai.verifyCards(items), query.field ?? "all");
  }

  @Get("decks/:id/han-viet-log")
  @ApiOperation({ summary: "What the latest Hán Việt check of the deck changed (STT, word, old → new)" })
  hanVietLog(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.hanVietLog(caller, id);
  }

  @Delete("recheck-jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cancel a running whole-deck re-check" })
  cancelRecheck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    this.flashcards.cancelRecheck(caller, id);
  }

  @Post("recheck-jobs/:id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Pause a running whole-deck re-check" })
  pauseRecheck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    this.flashcards.pauseRecheck(caller, id, true);
  }

  @Post("recheck-jobs/:id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Resume a paused whole-deck re-check" })
  resumeRecheck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    this.flashcards.pauseRecheck(caller, id, false);
  }

  @Get("recheck-jobs")
  @ApiOperation({ summary: "The caller's whole-deck re-check runs (progress)" })
  rechecks(@CurrentUser() caller: AuthUser) {
    return this.flashcards.listRechecks(caller);
  }

  @Post("decks/:id/cards/tags")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add / remove tags on many cards (ids or a filter)" })
  bulkTags(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: BulkTagsDto,
  ) {
    return this.flashcards.bulkTags(caller, id, body);
  }

  @Post("cards")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add a card to my own deck (idempotent by content)",
  })
  @ApiResponse({ status: 409, description: "An identical card exists" })
  createCard(@CurrentUser() caller: AuthUser, @Body() body: CreateCardDto) {
    return this.flashcards.createCard(caller, body);
  }

  @Patch("cards/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a card's front/back/tags" })
  @ApiResponse({ status: 409, description: "An identical card exists" })
  updateCard(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateCardDto,
  ) {
    return this.flashcards.updateCard(caller, id, body);
  }

  @Delete("cards/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a card from my deck (+ its progress)" })
  deleteCard(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.deleteCard(caller, id);
  }

  // ── Save-a-word while learning (P3-CARD-04 / T-P3-09) ──────────────

  @Post("save-vocabulary/:id")
  @ApiOperation({
    summary:
      "Save a vocabulary entry into my deck (idempotent — returns the card)",
  })
  saveVocabulary(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
  ) {
    return this.flashcards.saveVocabulary(caller, id);
  }

  @Post("save-grammar/:id")
  @ApiOperation({
    summary: "Save a grammar point into my deck (idempotent)",
  })
  saveGrammar(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.saveGrammar(caller, id);
  }

  // ── Admin: manage shared decks (P3-UI-04) ──────────────────────────
  //
  // Shared decks are admin-authored content (T-P3-08): learners read them,
  // admins create/edit/publish them and add their cards.

  @Get("admin/decks")
  @ContentAdmin()
  @ApiOperation({
    summary: "List ALL shared decks (any status) with card counts (admin)",
  })
  adminListSharedDecks() {
    return this.flashcards.adminListSharedDecks();
  }

  @Post("admin/decks")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a shared deck (admin)" })
  adminCreateDeck(@CurrentUser() caller: AuthUser, @Body() body: CreateDeckDto) {
    return this.flashcards.createDeck(caller, { ...body, shared: true });
  }

  @Patch("admin/decks/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a shared deck (admin)" })
  adminUpdateDeck(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateDeckDto,
  ) {
    return this.flashcards.updateDeck(caller, id, body);
  }

  @Delete("admin/decks/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a shared deck + its cards + progress (admin)",
  })
  adminDeleteDeck(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.flashcards.deleteDeck(caller, id);
  }

  @Get("decks/:id/export")
  @ApiOperation({
    summary: "Export a deck I may access as CSV (same columns as the import wizard)",
  })
  async exportDeck(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.adminExportDeck(caller, id, res);
  }

  @Get("admin/decks/:id/export")
  @ContentAdmin()
  @ApiOperation({
    summary: "Export a deck as CSV (same columns as the import wizard) (admin)",
  })
  async adminExportDeck(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } = await this.flashcards.exportDeckCsv(caller, id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return csv;
  }

  @Get("admin/decks/:id/cards")
  @ContentAdmin()
  @ApiOperation({ summary: "List cards of a shared deck (admin)" })
  adminListCards(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Query() query: ListCardsQuery,
  ) {
    return this.flashcards.listCards(caller, id, query.limit ?? 100);
  }
}
