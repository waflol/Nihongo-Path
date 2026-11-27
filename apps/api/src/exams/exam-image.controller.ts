import { Controller, Get, Param, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ExamImageService } from "./exam-image.service.js";

/** Pictures of exam questions (NP-407): any signed-in learner may see them. */
@ApiTags("exams")
@ApiBearerAuth()
@Controller("exams")
export class ExamImageController {
  constructor(private readonly images: ExamImageService) {}

  @Get("images/:id")
  @ApiOperation({ summary: "A question's picture (PNG, named by its sha256)" })
  async image(@Param("id") id: string, @Res() res: Response) {
    const path = await this.images.pathOf(id);
    res.setHeader("Content-Type", "image/png");
    // The name is the content's hash: it never changes.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path);
  }
}
