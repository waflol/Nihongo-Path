import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Param,
  Query,
  Get,
  StreamableFile,
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
 * - `file`            the CSV/XLSX (≤ 10 MB) or PDF (≤ 50 MB), enforced at the boundary → 413,
 *                     T-P3-11 — an oversized body can never hang the server).
 * - `deckId`          target deck id (form field).
 * - `mapping`         a JSON-encoded `ColumnMapping` (form field).
 * - `duplicatePolicy` `skip` (default) | `overwrite` (confirm only).
 *
 * `POST .../preview` returns the per-row preview without writing anything;
 * `POST .../confirm` writes it idempotently (P3-IMPORT-04, T-P3-03).
 */
/** CSV / XLSX stay at 10 MB; a PDF vocabulary book may be up to 50 MB. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

interface MultipartImportBody {
  deckId: string;
  /**
   * JSON-encoded `ColumnMapping`. Optional on `preview` (column discovery
   * before the user has chosen a mapping); required on `confirm`.
   */
  mapping?: string;
  duplicatePolicy?: "skip" | "overwrite";
  /** A finished PDF job whose file is reused instead of re-uploading. */
  jobId?: string;
  /** `"true"` when the wizard created the target deck for this import. */
  newDeck?: string;
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
    // The largest allowed (PDF); asUploaded() enforces 10 MB for the other formats.
    limits: { fileSize: MAX_PDF_BYTES },
  });
}

@ApiTags("import")
@ApiBearerAuth()
@Controller("flashcards/import")
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post("examples/:deckId/:action")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Pause / resume / stop the background example generation of a deck",
  })
  async controlExamples(
    @CurrentUser() caller: AuthUser,
    @Param("deckId") deckId: string,
    @Param("action") action: string,
  ) {
    if (action !== "pause" && action !== "resume" && action !== "stop" && action !== "retry") {
      throw new UnprocessableEntityException("action must be pause|resume|stop|retry");
    }
    return this.imports.controlExamples(caller, deckId, action);
  }

  @Post("jobs")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Start reading a PDF in the background (OCR for scans); returns the job" })
  @UseInterceptors(withUploadLimits())
  async startJob(
    @CurrentUser() caller: AuthUser,
    @UploadedFile("file") file: UploadFile | null,
    @Body() body: MultipartImportBody,
  ) {
    if (!file) {
      throw new UnprocessableEntityException("A `file` part is required");
    }
    const up = this.asUploaded(file);
    if (up.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new UnprocessableEntityException("Chỉ PDF mới đọc nền");
    }
    return this.imports.startPdfJob(caller, up, body.deckId);
  }

  @Get("jobs")
  @ApiOperation({ summary: "The caller's recent PDF reading jobs (progress)" })
  async listJobs(@CurrentUser() caller: AuthUser) {
    return this.imports.listPdfJobs(caller);
  }

  @Get("decks/:deckId/review")
  @ApiOperation({ summary: "The page-by-page check saved with a deck (null when the deck was not imported from a scanned PDF)" })
  async deckReview(@CurrentUser() caller: AuthUser, @Param("deckId") deckId: string) {
    return (await this.imports.deckReview(caller, deckId)) ?? {};
  }

  @Get("jobs/:id")
  @ApiOperation({ summary: "One PDF reading job" })
  async getJob(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.imports.getPdfJob(caller, id);
  }

  @Delete("jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cancel a PDF reading job (stops it and deletes it)" })
  async cancelJob(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    await this.imports.cancelPdfJob(caller, id);
  }

  @Get("jobs/:id/pages/:n/image")
  @ApiOperation({ summary: "A page of the job's PDF as a PNG (for checking the OCR)" })
  async jobPageImage(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Param("n") n: string,
  ) {
    const png = await this.imports.pdfJobPageImage(caller, id, Number(n));
    return new StreamableFile(png, { type: "image/png" });
  }

  @Get("jobs/:id/pages/:n")
  @ApiOperation({ summary: "What was read from one page of the job's PDF" })
  async jobPageRows(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Param("n") n: string) {
    return this.imports.pdfJobPageRows(caller, id, Number(n));
  }

  @Post("jobs/:id/pages/:n/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read one page of the job's PDF again" })
  retryJobPage(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Param("n") n: string) {
    return this.imports.retryPdfJobPages(caller, id, [Number(n)]);
  }

  @Post("jobs/:id/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read several pages of the job's PDF again, in the background (?pages=1,4,7)" })
  retryJobPages(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Query("pages") pages = "") {
    return this.imports.retryPdfJobPages(caller, id, pages.split(",").map(Number));
  }

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
    if (!file && !body.jobId) {
      throw new UnprocessableEntityException("A `file` part is required");
    }
    const mapping = this.parseMapping(body.mapping);
    return this.imports.preview(
      caller,
      file ? this.asUploaded(file) : await this.imports.pdfJobFile(caller, body.jobId!),
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
    if (!file && !body.jobId) {
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
    // Duplicates are always skipped (existing cards are never overwritten).
    const policy: "skip" | "overwrite" = "skip";
    const result = await this.imports.confirm(
      caller,
      file ? this.asUploaded(file) : await this.imports.pdfJobFile(caller, body.jobId!),
      body.deckId,
      mapping,
      policy,
      body.newDeck === "true",
    );
    await this.imports.saveImportErrors(body.deckId, result.errors);
    return result;
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
    const isPdf =
      file.buffer.subarray(0, 5).toString("latin1") === "%PDF-" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf && file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB (only PDF may be up to ${MAX_PDF_BYTES / 1024 / 1024} MB)`,
      );
    }
    return {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.buffer.length,
    };
  }
}
