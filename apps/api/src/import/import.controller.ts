import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import * as multer from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { ImportService, type ColumnMapping } from "./import.service.js";

/**
 * Bulk import surface (P3-IMPORT-02/03/04). Multipart uploads:
 *
 * - `file`            the CSV/XLSX (≤ 10 MB, enforced at the boundary → 413,
 *                     T-P3-11 — an oversized body can never hang the server).
 * - `deckId`          target deck id (form field).
 * - `mapping`         a JSON-encoded `ColumnMapping` (form field).
 * - `duplicatePolicy` `skip` (default) | `overwrite` (confirm only).
 *
 * `POST .../preview` returns the per-row preview without writing anything;
 * `POST .../confirm` writes it idempotently (P3-IMPORT-04, T-P3-03).
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface MultipartImportBody {
  deckId: string;
  /**
   * JSON-encoded `ColumnMapping`. Optional on `preview` (column discovery
   * before the user has chosen a mapping); required on `confirm`.
   */
  mapping?: string;
  duplicatePolicy?: "skip" | "overwrite";
}

/**
 * What `@UploadedFile()` injects under `FileInterceptor` with memory
 * storage: a **File object** — the metadata plus the whole upload in
 * `buffer` (multer 2.x). `originalname`/`mimetype` are present; the bytes
 * live in `.buffer`, not on the object itself.
 */
interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  /** The uploaded bytes (memory storage). */
  buffer: Buffer;
  /** Field name the file was sent in. */
  fieldname?: string;
}

/**
 * The single `file` field + a 10 MB `fileSize` limit on the options. The
 * limit lives on `MulterOptions`, not the field. `FileInterceptor` (single
 * file) pairs with `@UploadedFile()` — the metadata-carrying Buffer arrives
 * as the argument; a `file` form field missing from the request is `null`,
 * which the handler treats as a 422 (an import with no file).
 */
function withUploadLimits() {
  return FileInterceptor("file", {
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });
}

@ApiTags("import")
@ApiBearerAuth()
@Controller("flashcards/import")
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post("preview")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Parse + map an import file → per-row preview (no DB write)",
  })
  @ApiResponse({ status: 415, description: "Unsupported file format" })
  @UseInterceptors(withUploadLimits())
  async preview(
    @CurrentUser() caller: AuthUser,
    @UploadedFile("file") file: UploadFile | null,
    @Body() body: MultipartImportBody,
  ) {
    if (!file) {
      throw new UnprocessableEntityException("A `file` part is required");
    }
    const mapping = this.parseMapping(body.mapping);
    return this.imports.preview(
      caller,
      this.asUploaded(file),
      body.deckId,
      mapping,
    );
  }
  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Confirm an import (idempotent — a re-send is a no-op / upsert)",
  })
  @UseInterceptors(withUploadLimits())
  async confirm(
    @CurrentUser() caller: AuthUser,
    @UploadedFile("file") file: UploadFile | null,
    @Body() body: MultipartImportBody,
  ) {
    if (!file) {
      throw new UnprocessableEntityException("A `file` part is required");
    }
    const mapping = this.parseMapping(body.mapping);
    // Confirm must name the front/back columns — preview is the only place a
    // mapping is optional (column discovery).
    if (!mapping || !mapping.front || !mapping.back) {
      throw new UnprocessableEntityException(
        "mapping must name at least the `front` and `back` columns",
      );
    }
    const policy: "skip" | "overwrite" = body.duplicatePolicy ?? "skip";
    return this.imports.confirm(
      caller,
      this.asUploaded(file),
      body.deckId,
      mapping,
      policy,
    );
  }

  private parseMapping(raw: string | undefined): ColumnMapping | undefined {
    if (!raw || !raw.trim()) return undefined; // mapping step not chosen yet
    let mapping: ColumnMapping;
    try {
      mapping = JSON.parse(raw) as ColumnMapping;
    } catch {
      mapping = raw as unknown as ColumnMapping; // accept a plain object too
    }
    if (typeof mapping !== "object") return undefined;
    return mapping;
  }

  /** Map multer's File object to the service's `UploadedImportFile` shape. */
  private asUploaded(file: UploadFile) {
    return {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.buffer.length,
    };
  }
}
