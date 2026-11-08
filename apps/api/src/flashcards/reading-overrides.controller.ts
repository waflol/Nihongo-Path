import { Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { ReadingService } from "./reading.service.js";

/** Admin view of the readings the analyser learned from "Bỏ qua" (so a wrong one can be taken back). */
@ApiTags("flashcards")
@ApiBearerAuth()
@Controller("flashcards/admin/reading-overrides")
export class ReadingOverridesController {
  constructor(private readonly reading: ReadingService) {}

  @Get()
  @ContentAdmin()
  @ApiOperation({ summary: "Words whose reading was confirmed by a person (newest first)" })
  list() {
    return this.reading.listOverrides();
  }

  @Delete(":word")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ContentAdmin()
  @ApiOperation({ summary: "Forget a learned reading" })
  async forget(@Param("word") word: string) {
    if (!(await this.reading.forget(word))) throw new NotFoundException("Từ này chưa được học");
  }
}
