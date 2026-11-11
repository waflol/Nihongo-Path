import {
  BadRequestException,
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
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { IsPublic } from "../auth/decorators/is-public.decorator.js";
import { KanjiBulkDto, KanjiDto, KanjiQuery, KanjiUpdateDto, MaziiSyncStartDto } from "./dto/kanji.dto.js";
import { MaziiSyncService } from "./mazii-sync.service.js";
import { KanjiService } from "./kanji.service.js";

/** Kanji surface (plan-kanji §5). Public reads are forced to PUBLISHED. */
@ApiTags("kanji")
@Controller()
export class KanjiController {
  constructor(
    private readonly kanji: KanjiService,
    private readonly mazii: MaziiSyncService,
  ) {}

  @Get("kanji")
  @IsPublic()
  @ApiOperation({ summary: "List published kanji; filter by level / Hán Việt" })
  list(@Query() query: KanjiQuery) {
    return this.kanji.list({ ...query, status: "PUBLISHED" });
  }

  // Declared before `kanji/:char` so "levels" is not read as a character.
  @Get("kanji/levels")
  @IsPublic()
  levels() {
    return this.kanji.levels();
  }

  // Before `kanji/:char`. On/kun readings of the given characters, to split a word's furigana per kanji.
  @Get("kanji/readings")
  @IsPublic()
  readings(@Query("chars") chars = "") {
    return this.kanji.readings(chars);
  }

  @Get("kanji/:char")
  @IsPublic()
  get(@Param("char") char: string) {
    return this.kanji.get(char, true);
  }

  @Get("admin/kanji")
  @ContentAdmin()
  adminList(@Query() query: KanjiQuery) {
    return this.kanji.list(query);
  }

  // Declared before `admin/kanji/:char` so "levels" is not read as a character.
  @Get("admin/kanji/levels")
  @ContentAdmin()
  adminLevels() {
    return this.kanji.adminLevels();
  }

  // Background Mazii sync (progress is polled; survives page changes). Before `admin/kanji/:char`.
  @Get("admin/kanji/mazii-sync")
  @ContentAdmin()
  maziiSyncStatus() {
    return this.mazii.current();
  }

  @Post("admin/kanji/mazii-sync")
  @ContentAdmin()
  @ApiOperation({ summary: "Start a background Mazii update of Hán Việt / on / kun for the given kanji" })
  async maziiSyncStart(@Body() body: MaziiSyncStartDto) {
    let chars = body.all ? await this.kanji.allChars() : (body.chars ?? []);
    if (body.skipSynced) {
      const total = chars.length;
      chars = await this.kanji.notSynced(chars);
      if (chars.length === 0 && total > 0) throw new BadRequestException("Tất cả chữ Kanji đã được đồng bộ từ Mazii rồi");
      return this.mazii.start(chars, total - chars.length);
    }
    return this.mazii.start(chars);
  }

  @Post("admin/kanji/mazii-sync/pause")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  maziiSyncPause() {
    return this.mazii.pause();
  }

  @Post("admin/kanji/mazii-sync/resume")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  maziiSyncResume() {
    return this.mazii.resume();
  }

  @Post("admin/kanji/mazii-sync/cancel")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  maziiSyncCancel() {
    return this.mazii.cancel();
  }

  @Delete("admin/kanji/mazii-sync")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  maziiSyncDismiss() {
    this.mazii.dismiss();
  }

  // Before `admin/kanji/:char` so "export" is not read as a character.
  @Get("admin/kanji/export")
  @ContentAdmin()
  @ApiOperation({ summary: "Backup: every kanji as an Excel workbook (restore with POST admin/kanji/import)" })
  async exportXlsx(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="kanji-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return new StreamableFile(await this.kanji.exportXlsx());
  }

  @Post("admin/kanji/import")
  @ContentAdmin()
  @ApiOperation({ summary: "Restore: upsert kanji from the exported .xlsx (or a CSV) in the request body" })
  importFile(@Body() body: unknown) {
    if (Buffer.isBuffer(body) && body.length > 0) return this.kanji.importFile(new Uint8Array(body));
    if (typeof body === "string" && body.trim() !== "") return this.kanji.importFile(body);
    throw new BadRequestException("Gửi file .xlsx (hoặc CSV) trong nội dung yêu cầu");
  }

  @Post("admin/kanji/bulk")
  @ContentAdmin()
  bulkUpdate(@Body() body: KanjiBulkDto) {
    return this.kanji.bulkUpdate(body);
  }

  @Get("admin/kanji/:char")
  @ContentAdmin()
  adminGet(@Param("char") char: string) {
    return this.kanji.get(char, false);
  }

  @Post("admin/kanji")
  @ContentAdmin()
  create(@Body() body: KanjiDto) {
    return this.kanji.create(body);
  }

  @Post("admin/kanji/:char/generate")
  @ContentAdmin()
  generate(@Param("char") char: string) {
    return this.kanji.generateAi(char);
  }

  @Post("admin/kanji/:char/mazii-check")
  @ContentAdmin()
  @ApiOperation({ summary: "Check Hán Việt / onyomi / kunyomi against mazii.net (returns suggestion, does not save)" })
  maziiCheck(@Param("char") char: string) {
    return this.kanji.checkMazii(char);
  }

  @Post("admin/kanji/:char/mazii-sync")
  @ContentAdmin()
  @ApiOperation({ summary: "Check mazii.net and save Hán Việt / onyomi / kunyomi for this kanji" })
  maziiSync(@Param("char") char: string) {
    return this.kanji.syncFromMazii(char);
  }

  @Patch("admin/kanji/:char")
  @ContentAdmin()
  update(@Param("char") char: string, @Body() body: KanjiUpdateDto) {
    return this.kanji.update(char, body);
  }

  @Delete("admin/kanji/:char")
  @ContentAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("char") char: string) {
    await this.kanji.remove(char);
  }
}
