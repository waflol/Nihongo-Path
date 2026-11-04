import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { DECK_STATUSES, type DeckStatus } from "../schemas/deck.schema.js";

/**
 * Request DTOs for the flashcard surface. Every field carries a
 * class-validator decorator so the global `ValidationPipe`
 * (`whitelist` + `forbidNonWhitelisted`) accepts them verbatim.
 */

export class CreateDeckDto {
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
  @IsString()
  @MaxLength(20)
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  @ApiPropertyOptional({ enum: DECK_STATUSES })
  @IsOptional()
  @IsIn([...DECK_STATUSES])
  status?: DeckStatus;

  /** Admin-only: seed a shared deck. Omitted → personal deck. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}

export class UpdateDeckDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

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

  @ApiPropertyOptional({ enum: DECK_STATUSES })
  @IsOptional()
  @IsIn([...DECK_STATUSES])
  status?: DeckStatus;
}

export class CreateCardDto {
  @ApiProperty({ description: "Owning personal deck id" })
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  deckId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  front: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  back: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** `manual` (default) or `saved` — `import` is only set by the import path. */
  @ApiPropertyOptional({ enum: ["manual", "saved"] })
  @IsOptional()
  @IsIn(["manual", "saved"])
  origin?: "manual" | "saved";
}
