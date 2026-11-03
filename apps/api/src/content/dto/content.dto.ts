import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/**
 * Request/response DTOs for the content surface. Every field carries a
 * class-validator decorator so the global `ValidationPipe`
 * (`whitelist` + `forbidNonWhitelisted`) does not strip or reject it.
 */

// ── shared query (public reads) ───────────────────────────────────────

export class PublicContentQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Level tag filter, e.g. `N5`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  /** Scope a vocabulary / grammar list to one textbook. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textbookId?: string;
}

// ── Textbooks ─────────────────────────────────────────────────────────

export class TextbookDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED"] })
  @IsOptional()
  @IsString()
  status?: string;
}

// ── Units ─────────────────────────────────────────────────────────────

export class UnitDto {
  @ApiProperty()
  @IsString()
  textbookId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED"] })
  @IsOptional()
  @IsString()
  status?: string;
}

// ── Vocabulary ────────────────────────────────────────────────────────

export class VocabularyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  term: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reading?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaning: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pos?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  example?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exampleTranslation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  textbooks?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  units?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED"] })
  @IsOptional()
  @IsString()
  status?: string;
}

// ── Grammar points ────────────────────────────────────────────────────

export class GrammarExampleDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sentence: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  translation: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ── Partial update DTOs (PATCH) ───────────────────────────────────────
//
// PATCH is a *partial* update: the caller sends only the fields they want
// to change. `PartialType` relaxes every rule on the create DTO (incl. the
// required `title` / `term` / `label` / `textbookId`), so a minimal body
// like `{ status: "PUBLISHED" }` validates. The service already applies
// updates with `findByIdAndUpdate` — it only writes the keys present.

export class TextbookUpdateDto extends PartialType(TextbookDto) {}
export class UnitUpdateDto extends PartialType(UnitDto) {}
export class VocabularyUpdateDto extends PartialType(VocabularyDto) {}

export class GrammarPointDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaning: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  structure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  usage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrammarExampleDto)
  examples?: GrammarExampleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  textbooks?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED"] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class GrammarPointUpdateDto extends PartialType(GrammarPointDto) {}
