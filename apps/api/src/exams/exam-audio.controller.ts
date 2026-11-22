import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Res, UnprocessableEntityException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import * as multer from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import { ExamAudioService, MAX_AUDIO_BYTES } from "./exam-audio.service.js";

/** Listening clips (NP-410): admin upload + attach, and streaming for the sitting. */
@ApiTags("exams")
@ApiBearerAuth()
@Controller("exams")
export class ExamAudioController {
  constructor(private readonly audio: ExamAudioService) {}

  @Post("admin/audio")
  @ContentAdmin()
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a listening clip (mp3/m4a/ogg, ≤ 40 MB)" })
  @UseInterceptors(FileInterceptor("file", { storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES } }))
  upload(
    @CurrentUser() caller: AuthUser,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | null,
    @Body() body: { level?: string; label?: string },
  ) {
    if (!file?.buffer?.length) throw new UnprocessableEntityException("Thiếu file âm thanh");
    return this.audio.upload(caller, file, body);
  }

  @Get("admin/audio")
  @ContentAdmin()
  @ApiOperation({ summary: "Uploaded listening clips (newest first)" })
  list() {
    return this.audio.list();
  }

  @Put("admin/audio/attach/:target/:id")
  @ContentAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Point a question / passage at a clip (assetId null clears it)" })
  attach(
    @Param("target") target: string,
    @Param("id") id: string,
    @Body() body: { assetId: string | null; startSec?: number; endSec?: number },
  ) {
    if (target !== "question" && target !== "stimulus") throw new UnprocessableEntityException("target phải là question|stimulus");
    return this.audio.attach(target, id, body);
  }

  /** Streams the clip with Range support (seeking). Any signed-in learner may play it. */
  @Get("audio/:id")
  @ApiOperation({ summary: "Stream a listening clip" })
  async stream(@Param("id") id: string, @Res() res: Response) {
    const f = await this.audio.fileOf(id);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(f.path);
  }
}
