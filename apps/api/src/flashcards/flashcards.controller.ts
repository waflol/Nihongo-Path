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
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import type { Response } from "express";
import { IsInt, IsOptional, Max, Min } from "class-validator";
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
  @Max(500)
  limit?: number;
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
  ) {}

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
