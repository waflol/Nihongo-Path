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
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { IsPublic } from "../auth/decorators/is-public.decorator.js";
import {
  GrammarPointDto,
  GrammarPointUpdateDto,
  PublicContentQuery,
  TextbookDto,
  TextbookUpdateDto,
  UnitDto,
  UnitUpdateDto,
  VocabularyDto,
  VocabularyUpdateDto,
} from "./dto/content.dto.js";
import { ContentService } from "./content.service.js";

/**
 * Learning-content surface (P2-CONTENT-01..05).
 *
 * - **Public reads** (`/content/*`, `@IsPublic()`) are coerced to
 *   `status: PUBLISHED` — drafts never leak to the public listing
 *   (T-P2-09).
 * - **Admin CRUD** (`/admin/content/*`, `@ContentAdmin()`) is the only write
 *   surface; role is the administration axis, never the entitlement check.
 */
@ApiTags("content")
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ── Public reads ────────────────────────────────────────────────────

  @Get("content/textbooks")
  @IsPublic()
  @ApiOperation({ summary: "List published textbooks (paginated)" })
  @ApiResponse({ status: 200, description: "Page of textbooks" })
  listTextbooks(@Query() query: PublicContentQuery) {
    return this.content.listTextbooks({
      page: query.page,
      limit: query.limit,
      level: query.level,
      textbookId: query.textbookId,
      status: "PUBLISHED",
    });
  }

  @Get("content/textbooks/:id")
  @IsPublic()
  getTextbook(@Param("id") id: string) {
    return this.content.getTextbook(id);
  }

  @Get("content/units")
  @IsPublic()
  listUnits(@Query() query: PublicContentQuery) {
    return this.content.listUnits({
      page: query.page,
      limit: query.limit,
      level: query.level,
      textbookId: query.textbookId,
      status: "PUBLISHED",
    });
  }

  @Get("content/units/:id")
  @IsPublic()
  getUnit(@Param("id") id: string) {
    return this.content.getUnit(id);
  }

  @Get("content/vocabulary")
  @IsPublic()
  listVocabulary(@Query() query: PublicContentQuery) {
    return this.content.listVocabulary({
      page: query.page,
      limit: query.limit,
      level: query.level,
      textbookId: query.textbookId,
      status: "PUBLISHED",
    });
  }

  @Get("content/vocabulary/:id")
  @IsPublic()
  getVocabulary(@Param("id") id: string) {
    return this.content.getVocabulary(id);
  }

  @Get("content/grammar")
  @IsPublic()
  listGrammar(@Query() query: PublicContentQuery) {
    return this.content.listGrammar({
      page: query.page,
      limit: query.limit,
      level: query.level,
      textbookId: query.textbookId,
      status: "PUBLISHED",
    });
  }

  @Get("content/grammar/:id")
  @IsPublic()
  getGrammar(@Param("id") id: string) {
    return this.content.getGrammar(id);
  }

  // ── Admin reads (all statuses, for the CRUD console) ───────────────

  @ApiBearerAuth()
  @Get("admin/content/textbooks")
  @ContentAdmin()
  @ApiOperation({ summary: "List all textbooks incl. drafts (admin)" })
  adminListTextbooks(@Query() query: PublicContentQuery) {
    return this.content.listTextbooks(query);
  }

  @ApiBearerAuth()
  @Get("admin/content/units")
  @ContentAdmin()
  @ApiOperation({ summary: "List all units incl. drafts (admin)" })
  adminListUnits(@Query() query: PublicContentQuery) {
    return this.content.listUnits(query);
  }

  @ApiBearerAuth()
  @Get("admin/content/vocabulary")
  @ContentAdmin()
  @ApiOperation({ summary: "List all vocabulary incl. drafts (admin)" })
  adminListVocabulary(@Query() query: PublicContentQuery) {
    return this.content.listVocabulary(query);
  }

  @ApiBearerAuth()
  @Get("admin/content/grammar")
  @ContentAdmin()
  @ApiOperation({ summary: "List all grammar points incl. drafts (admin)" })
  adminListGrammar(@Query() query: PublicContentQuery) {
    return this.content.listGrammar(query);
  }

  // ── Admin CRUD (CONTENT_ADMIN) ──────────────────────────────────────

  @ApiBearerAuth()
  @Post("admin/content/textbooks")
  @ContentAdmin()
  @ApiOperation({ summary: "Create a textbook (admin)" })
  @HttpCode(HttpStatus.CREATED)
  createTextbook(@Body() body: TextbookDto) {
    return this.content.createTextbook(body);
  }

  @ApiBearerAuth()
  @Patch("admin/content/textbooks/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  updateTextbook(@Param("id") id: string, @Body() body: TextbookUpdateDto) {
    return this.content.updateTextbook(id, body);
  }

  @ApiBearerAuth()
  @Delete("admin/content/textbooks/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTextbook(@Param("id") id: string) {
    return this.content.deleteTextbook(id);
  }

  @ApiBearerAuth()
  @Post("admin/content/units")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  createUnit(@Body() body: UnitDto) {
    return this.content.createUnit(body);
  }

  @ApiBearerAuth()
  @Patch("admin/content/units/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  updateUnit(@Param("id") id: string, @Body() body: UnitUpdateDto) {
    return this.content.updateUnit(id, body);
  }

  @ApiBearerAuth()
  @Delete("admin/content/units/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUnit(@Param("id") id: string) {
    return this.content.deleteUnit(id);
  }

  @ApiBearerAuth()
  @Post("admin/content/vocabulary")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  createVocabulary(@Body() body: VocabularyDto) {
    return this.content.createVocabulary(body);
  }

  @ApiBearerAuth()
  @Patch("admin/content/vocabulary/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  updateVocabulary(
    @Param("id") id: string,
    @Body() body: VocabularyUpdateDto,
  ) {
    return this.content.updateVocabulary(id, body);
  }

  @ApiBearerAuth()
  @Delete("admin/content/vocabulary/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVocabulary(@Param("id") id: string) {
    return this.content.deleteVocabulary(id);
  }

  @ApiBearerAuth()
  @Post("admin/content/grammar")
  @ContentAdmin()
  @HttpCode(HttpStatus.CREATED)
  createGrammar(@Body() body: GrammarPointDto) {
    return this.content.createGrammar(body);
  }

  @ApiBearerAuth()
  @Patch("admin/content/grammar/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  updateGrammar(
    @Param("id") id: string,
    @Body() body: GrammarPointUpdateDto,
  ) {
    return this.content.updateGrammar(id, body);
  }

  @ApiBearerAuth()
  @Delete("admin/content/grammar/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGrammar(@Param("id") id: string) {
    return this.content.deleteGrammar(id);
  }
}
