import { Module } from "@nestjs/common";
import { ReadingService } from "./reading.service.js";

/** Shares ONE kuromoji tokenizer (≈17 MB dictionary) between modules. */
@Module({ providers: [ReadingService], exports: [ReadingService] })
export class ReadingModule {}
