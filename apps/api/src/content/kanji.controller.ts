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
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { IsPublic } from "../auth/decorators/is-public.decorator.js";
import { KanjiDto, KanjiQuery, KanjiUpdateDto } from "./dto/kanji.dto.js";
import { KanjiService } from "./kanji.service.js";

/** Kanji surface (plan-kanji §5). Public reads are forced to PUBLISHED. */
@ApiTags("kanji")
@Controller()
export class KanjiController {
  constructor(private readonly kanji: KanjiService) {}

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
