import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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

const MAX_PDF_BYTES = 30 * 1024 * 1024;

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
    @Body() body: { level?: string; rights?: string },
  ) {
    if (!file?.buffer?.length) throw new UnprocessableEntityException("Thiếu file PDF");
    if (!file.buffer.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
      throw new UnprocessableEntityException("File không phải PDF");
    }
    const level = (body.level ?? "").toUpperCase();
    if (!["N5", "N4", "N3", "N2", "N1"].includes(level)) throw new BadRequestException("level phải là N5…N1");
    const rights = (body.rights ?? "reference") as QuestionRights;
    if (!(QUESTION_RIGHTS as readonly string[]).includes(rights)) throw new BadRequestException("rights không hợp lệ");
    return this.imports.startJob(caller, file.buffer, { fileName: file.originalname, level, rights });
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

  @Post("drafts/:id/discard")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  discard(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.imports.discard(caller, id);
  }

  @Get(":jobId/log")
  @ContentAdmin()
  @ApiOperation({ summary: "Event log of an import job" })
  log(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.jobLog(caller, jobId);
  }

  @Post(":jobId/cancel")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a running import job (work done so far is kept)" })
  cancel(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.cancel(caller, jobId);
  }

  @Get(":jobId")
  @ContentAdmin()
  @ApiOperation({ summary: "Progress of an import job" })
  progress(@CurrentUser() caller: AuthUser, @Param("jobId") jobId: string) {
    return this.imports.jobProgress(caller, jobId);
  }
}
