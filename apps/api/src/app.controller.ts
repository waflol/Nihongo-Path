import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AppService } from "./app.service.js";

@ApiTags("meta")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: "API metadata" })
  @ApiResponse({ status: 200, description: "Service name, version, docs path" })
  meta() {
    return this.appService.getMeta();
  }
}
