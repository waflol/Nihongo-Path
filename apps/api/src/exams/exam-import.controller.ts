import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import * as multer from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { QUESTION_RIGHTS, type QuestionRights } from "../flashcards/schemas/exercise-question.schema.js";
import { ExamImportService } from "./exam-import.service.js";
import { EXAM_KINDS, type ExamKind } from "./schemas/exam.schema.js";

const MAX_PDF_BYTES = 100 * 1024 * 1024;

interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Admin surface of the exam-PDF import (NP-407): upload → poll → review drafts → publish. */
@ApiTags("exams")
@ApiBearerAuth()
@Controller("exams/admin/import")
export class ExamImportController {
  constructor(private readonly imports: ExamImportService) {}

  @Post()
  @ContentAdmin()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a JLPT exam PDF; returns a job id to poll" })
  @UseInterceptors(
    FileInterceptor("file", { storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES } }),
  )
  async start(
    @CurrentUser() caller: AuthUser,
    @UploadedFile() file: UploadFile | null,
    @Body() body: { level?: string; rights?: string; kind?: string; setName?: string },
  ) {
    if (!file?.buffer?.length) throw new UnprocessableEntityException("Thiếu file PDF");
    if (!file.buffer.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
      throw new UnprocessableEntityException("File không phải PDF");
    }
    const level = (body.level ?? "").toUpperCase();
    if (!["N5", "N4", "N3", "N2", "N1"].includes(level)) throw new BadRequestException("level phải là N5…N1");
    const rights = (body.rights ?? "reference") as QuestionRights;
    if (!(QUESTION_RIGHTS as readonly string[]).includes(rights)) throw new BadRequestException("rights không hợp lệ");
    const kind = (body.kind || undefined) as ExamKind | undefined;
    if (kind && !(EXAM_KINDS as readonly string[]).includes(kind)) throw new BadRequestException("kind phải là full, section hoặc practice");
    const setName = String(body.setName ?? "").trim();
    if (setName.length > 150) throw new BadRequestException("Tên bộ đề tối đa 150 ký tự");
    return this.imports.startJob(caller, file.buffer, { fileName: file.originalname, level, rights, kind, setName });
  }

  @Get()
  @ContentAdmin()
  @ApiOperation({ summary: "My recent import jobs (progress only)" })
  list(@CurrentUser() caller: AuthUser) {
    return this.imports.listJobs(caller);
  }

  @Get("drafts")
  @ContentAdmin()
  @ApiOperation({ summary: "Drafts of an import job (optionally by status)" })
  drafts(@CurrentUser() caller: AuthUser, @Query("jobId") jobId: string, @Query("status") status?: string) {
    return this.imports.listDrafts(caller, jobId, status);
  }

  @Post("drafts/:id/publish")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Publish a draft (answers may be supplied from the printed key)" })
  publish(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: { answers?: number[] }) {
    return this.imports.publish(caller, id, body);
  }

  @Post("drafts/:id/update")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hand-edit a draft's passages and questions (answers stay aligned by position)" })
  update(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.imports.updateDraft(caller, id, body);
  }

  @Post("drafts/:id/suggest")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "AI-suggested answers for a draft's questions, for the reviewer to check (not stored)" })
  suggest(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.imports.suggestAnswers(caller, id);
  }

  @Post("drafts/:id/audio")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Listening recordings of a draft: the block's file, each question's clip, or the whole part's file" })
  audio(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.imports.setDraftAudio(caller, id, body);
  }

  @Post("drafts/:id/picture")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "A listening question's picture: cut a region of a page ({question, page, rect}) or clear it" })
  picture(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.imports.setPicture(caller, id, body);
  }

  @Post("drafts/:id/pictures")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cut a listening draft's pictures from its PDF (a PDF with a text layer)" })
  pictures(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.imports.autoPictures(caller, id);
  }

  @Post("drafts/:id/discard")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  discard(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.imports.discard(caller, id);
  }

  @Get(":jobId/pages/:n")
  @ContentAdmin()
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "private, max-age=3600")
  @ApiOperation({ summary: "The source page (PNG) of an imported PDF, for side-by-side review" })
  async page(@Param("jobId") jobId: string, @Param("n") n: string): Promise<StreamableFile> {
    return new StreamableFile(await this.imports.pageImage(jobId, Number(n)));
  }

  @Get(":jobId/answer-file")
  @ContentAdmin()
  @ApiOperation({ summary: "Answer-file template (CSV in JSON): one row per question of the job's drafts" })
  answerFileTemplate(@Param("jobId") jobId: string) {
    return this.imports.answerFileTemplate(jobId);
  }

  @Post(":jobId/answer-file")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read an answer file onto the job's open drafts; `save: true` stores the answers" })
  answerFile(
    @CurrentUser() caller: AuthUser,
    @Param("jobId") jobId: string,
    @Body() body: { text?: unknown; save?: unknown; overwrite?: unknown },
  ) {
    return this.imports.importAnswerFile(caller, jobId, body ?? {});
  }

  @Get(":jobId/log")
  @ContentAdmin()
  @ApiOperation({ summary: "Event log of an import job" })
  log(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.jobLog(caller, jobId);
  }

  @Post(":jobId/publish-exam")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Publish every ready block of one sitting and build its exam" })
  publishExam(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string, @Body() body: { sitting?: unknown; answers?: unknown }) {
    return this.imports.publishExam(caller, jobId, body?.sitting, body?.answers);
  }

  @Patch(":jobId")
  @ContentAdmin()
  @ApiOperation({ summary: "Rename the import's collection (setName) or sittings, while nothing is published" })
  rename(@Param("jobId") jobId: string, @Body() body: { setName?: unknown; sittings?: unknown }) {
    return this.imports.renameJob(jobId, body ?? {});
  }

  @Post(":jobId/cancel")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a running import job (work done so far is kept)" })
  cancel(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.cancel(caller, jobId);
  }

  @Post(":jobId/marks")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add furigana + underlines from the kept PDF to this job's open drafts (scanned pages are re-read by AI in the background)" })
  marks(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.backfillMarks(caller, jobId);
  }

  @Post(":jobId/delete")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an import job with its drafts, pages and kept PDF (published questions stay)" })
  remove(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.deleteJob(caller, jobId);
  }

  @Get(":jobId")
  @ContentAdmin()
  @ApiOperation({ summary: "Progress of an import job" })
  progress(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.jobProgress(caller, jobId);
  }
}
