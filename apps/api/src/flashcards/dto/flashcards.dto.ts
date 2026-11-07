import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PARTS_OF_SPEECH, type PartOfSpeech } from "./../reading.service.js";
import { DECK_STATUSES, type DeckStatus } from "../schemas/deck.schema.js";

export class ReadingQueryDto {
  @ApiProperty({ description: "Japanese term to read" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}

export class ImageSuggestQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}

export class CardExampleDto {
  @ApiProperty({ description: "Example sentence (Japanese)" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sentence: string;

  @ApiPropertyOptional({ description: "Translation of the example" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  translation?: string;
}

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
  @MaxLength(60)
  category?: string;

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
  @MaxLength(60)
  category?: string;

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

  @ApiPropertyOptional({
    description: "Mnemonic image: data:image/(jpeg|png|webp) URL or a Wikimedia https URL",
  })
  @IsOptional()
  @IsString()
  @MaxLength(250000)
  @Matches(/^(|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|https:\/\/(upload|thumb)\.wikimedia\.org\/\S+)$/, {
    message: "image must be a small uploaded image or a Wikimedia image URL",
  })
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageCredit?: string;

  @ApiPropertyOptional({ description: "Hiragana reading (empty for kana-only words)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reading?: string;

  @ApiPropertyOptional({ enum: PARTS_OF_SPEECH })
  @IsOptional()
  @IsIn([...PARTS_OF_SPEECH, ""])
  partOfSpeech?: PartOfSpeech | "";

  @ApiPropertyOptional({ type: [CardExampleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CardExampleDto)
  examples?: CardExampleDto[];

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

/** Partial card update (PATCH). At least one face field expected. */
export class UpdateCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  front?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  back?: string;

  @ApiPropertyOptional({
    description: "Mnemonic image: data:image/(jpeg|png|webp) URL or a Wikimedia https URL",
  })
  @IsOptional()
  @IsString()
  @MaxLength(250000)
  @Matches(/^(|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|https:\/\/(upload|thumb)\.wikimedia\.org\/\S+)$/, {
    message: "image must be a small uploaded image or a Wikimedia image URL",
  })
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageCredit?: string;

  @ApiPropertyOptional({ description: "Hiragana reading (empty for kana-only words)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reading?: string;

  @ApiPropertyOptional({ description: "true = clear the import review warnings of this card" })
  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;

  @ApiPropertyOptional({ enum: PARTS_OF_SPEECH })
  @IsOptional()
  @IsIn([...PARTS_OF_SPEECH, ""])
  partOfSpeech?: PartOfSpeech | "";

  @ApiPropertyOptional({ type: [CardExampleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CardExampleDto)
  examples?: CardExampleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
