import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Readiness — "can the app serve traffic?". 200 when healthy or when no
   * database is configured at all; 503 when a configured database is
   * unreachable.
   */
  @Get()
  @ApiOperation({ summary: "Readiness probe (includes MongoDB ping)" })
  @ApiResponse({ status: 200, description: "Ready (or DB not configured)" })
  @ApiResponse({ status: 503, description: "Configured database unreachable" })
  @ApiOperation({ summary: "Liveness probe" })
  async liveness() {
    const report = await this.healthService.ready();

    if (report.status === "error") {
      throw new ServiceUnavailableException({
        ...report,
        message: "Service not ready",
      });
    }

    return report;
  }

  /**
   * Readiness — "can the app serve traffic?". 200 when healthy or when no
   * database is configured at all; 503 when a configured database is
   * unreachable.
   */
  // @Get("ready")
  // @ApiOperation({ summary: "Readiness probe (includes MongoDB ping)" })
  // @ApiResponse({ status: 200, description: "Ready (or DB not configured)" })
  // @ApiResponse({ status: 503, description: "Configured database unreachable" })
  // async readiness() {
  //   const report = await this.healthService.ready();

  //   if (report.status === "error") {
  //     throw new ServiceUnavailableException({
  //       ...report,
  //       message: "Service not ready",
  //     });
  //   }

  //   return report;
  // }
}
