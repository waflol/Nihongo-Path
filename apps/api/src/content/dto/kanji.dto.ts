import { ApiPropertyOptional } from "@nestjs/swagger";
import { PartialType } from "@nestjs/mapped-types";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

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

  /** One or many levels: `?level=N5&level=N4` or `?level=N5,N4`. */
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

  /** Hán Việt search; prefix match on the accent-stripped form. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  hanViet?: string;

  /** `?contains=1` → substring match instead of prefix (full scan). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["1"])
  contains?: string;

  /** Match the kanji itself or a related word's term. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;

  /** Admin only; the public route forces PUBLISHED. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED"])
  status?: string;
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
  @IsOptional() @IsString() @MaxLength(60) hanViet?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) onyomi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) kunyomi?: string[];
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

/** `char` is the key and cannot change; strokes are import-only. */
export class KanjiUpdateDto extends PartialType(KanjiDto) {}
