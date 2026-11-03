import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsPublic } from "./auth/decorators/is-public.decorator.js";
import { AppService } from "./app.service.js";

/**
 * API metadata. Public even when the global `AuthGuard` is active — it is a
 * service-describe endpoint, not a product route.
 */
@ApiTags("meta")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @IsPublic()
  @ApiOperation({ summary: "API metadata" })
  @ApiResponse({ status: 200, description: "Service name, version, docs path" })
  meta() {
    return this.appService.getMeta();
  }
}
