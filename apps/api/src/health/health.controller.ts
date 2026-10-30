import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness — "is the process up and answering?". Always 200 when the
   * server can respond; it does NOT probe the database.
   */
  @Get()
  @ApiOperation({ summary: "Liveness probe (no database ping)" })
  @ApiResponse({ status: 200, description: "Process is up" })
  liveness() {
    return this.healthService.health();
  }

  /**
   * Readiness — "can the app serve traffic?". 200 when healthy or when no
   * database is configured at all; 503 when a configured database is
   * unreachable.
   */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (includes MongoDB ping)" })
  @ApiResponse({ status: 200, description: "Ready (or DB not configured)" })
  @ApiResponse({ status: 503, description: "Configured database unreachable" })
  async readiness() {
    const report = await this.healthService.ready();

    if (report.status === "error") {
      throw new ServiceUnavailableException({
        ...report,
        message: "Service not ready",
      });
    }

    return report;
  }
}
