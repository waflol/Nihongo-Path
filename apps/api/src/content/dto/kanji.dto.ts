import { ApiPropertyOptional } from "@nestjs/swagger";
import { PartialType } from "@nestjs/mapped-types";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { formatHanViet } from "../han-viet-norm.js";

export class KanjiQuery {
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

  /** One or many levels: `?level=N5&level=N4` or `?level=N5,N4` (or `NONE` for empty level). */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value).split(","))
      .map((v: string) => v.trim())
      .filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  level?: string[];

  /** Hán Việt search; prefix match on any reading of the accent-stripped form. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  hanViet?: string;

  /** `?contains=1` → substring match instead of prefix (full scan). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["1"])
  contains?: string;

  /** Match the kanji itself, a related word's term, Hán Việt or meaning. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  /** Admin only; the public route forces PUBLISHED. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED"])
  status?: string;

  /** Admin filter: kanji missing Hán Việt, Vietnamese meaning, or mnemonic. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["hanViet", "meaning", "mnemonic"])
  missing?: string;
}

export class RelatedWordDto {
  @IsString() @MaxLength(40) term: string;
  @IsOptional() @IsString() @MaxLength(60) reading?: string;
  @IsOptional() @IsString() @MaxLength(200) meaning?: string;
  @IsOptional() @IsString() @MaxLength(300) glossEn?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) chars?: string[];
  @IsOptional() @IsString() @MaxLength(20) level?: string;
}

export class KanjiDto {
  @IsString() @MaxLength(4) char: string;
  @IsOptional() @IsString() @MaxLength(20) level?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rank?: number;
  /** Accepts a string ("trường/trưởng", "trường, trưởng") or string[] (["trường", "trưởng"]). */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : formatHanViet(value)))
  @IsString()
  @MaxLength(120)
  hanViet?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) onyomi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) kunyomi?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) strokeCount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) meanings?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) meaningsEn?: string[];
  @IsOptional() @IsString() @MaxLength(2000) mnemonic?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedWordDto)
  words?: RelatedWordDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) radicals?: string[];
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED"]) status?: string;
}

/** `char` may be renamed (unique-checked in the service); strokes are import-only. */
export class KanjiUpdateDto extends PartialType(KanjiDto) {}

export class KanjiBulkDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(4, { each: true })
  chars?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  filterLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED"])
  status?: "DRAFT" | "PUBLISHED";
}

export class MaziiSyncStartDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3000)
  @IsString({ each: true })
  @MaxLength(4, { each: true })
  chars?: string[];

  /** Sync every kanji in the database (ignores `chars`). */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
