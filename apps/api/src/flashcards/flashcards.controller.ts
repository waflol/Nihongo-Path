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
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { FlashcardsService } from "./flashcards.service.js";
import { CreateCardDto, CreateDeckDto, UpdateDeckDto } from "./dto/flashcards.dto.js";

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
  constructor(private readonly flashcards: FlashcardsService) {}

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
}
