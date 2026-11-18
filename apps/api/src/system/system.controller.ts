import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { HISTORY_RANGES, SystemHistoryService, type HistoryRange } from "./system-history.service.js";
import { SystemService } from "./system.service.js";

/** Admin server monitor: RAM, disk, CPU of the host. */
@ApiTags("system")
@ApiBearerAuth()
@Controller("admin/system")
export class SystemController {
  constructor(
    private readonly system: SystemService,
    private readonly history: SystemHistoryService,
  ) {}

  @Get("stats")
  @ContentAdmin()
  @ApiOperation({ summary: "Host RAM, disk and CPU usage" })
  stats() {
    return this.system.stats();
  }

  @Get("history")
  @ContentAdmin()
  @ApiOperation({ summary: "Averaged CPU/RAM/disk history: range = 1h | 6h | day | week | month | year" })
  historyOf(@Query("range") range = "day") {
    if (!(HISTORY_RANGES as readonly string[]).includes(range)) throw new BadRequestException("range không hợp lệ");
    return this.history.history(range as HistoryRange);
  }
}
