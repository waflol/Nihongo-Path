import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { AiExampleService } from "./ai-example.service.js";
import { AiServicesService } from "./ai-services.service.js";

/**
 * Admin management of the AI services used for example sentences: add from
 * the preset list, reorder (priority), enable/disable, test, delete. API
 * keys are write-only — they are never returned.
 */
@ApiTags("ai")
@ApiBearerAuth()
@Controller("flashcards/admin/ai")
export class AiServicesController {
  constructor(
    private readonly services: AiServicesService,
    private readonly examples: AiExampleService,
  ) {}

  @Get("providers")
  @ContentAdmin()
  @ApiOperation({ summary: "Preset AI providers an admin can add" })
  providers() {
    return this.services.providers();
  }

  @Post("models")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({
    summary: "Models a provider offers now (live list, tagged free/paid) — by typed key or stored service",
  })
  models(@Body() body: { provider?: string; apiKey?: string; serviceId?: string; baseUrl?: string; apiFormat?: string }) {
    return this.services.listModels(body ?? {});
  }

  @Get("services")
  @ContentAdmin()
  @ApiOperation({ summary: "AI services in priority order (keys never returned)" })
  list() {
    return this.services.list();
  }

  @Post("services")
  @ContentAdmin()
  @ApiOperation({ summary: "Add an AI service (preset, Cloudflare account, or custom endpoint)" })
  create(
    @Body()
    body: {
      provider?: string;
      apiKey?: string;
      label?: string;
      model?: string;
      rpm?: number;
      baseUrl?: string;
      apiFormat?: string;
      accountId?: string;
    },
  ) {
    return this.services.create(body ?? {});
  }

  @Post("services/auto-sort")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Re-order services by benchmark score (accuracy vs speed weight, minimum accuracy)" })
  autoSort(@Body() body: { speedWeight?: number; minAccuracy?: number }) {
    const w = Number(body?.speedWeight);
    const m = Number(body?.minAccuracy);
    return this.services.autoSort({
      speedWeight: Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : undefined,
      minAccuracy: Number.isFinite(m) ? Math.min(100, Math.max(0, m)) : undefined,
    });
  }

  // Static path first so it is not read as `services/:id`.
  @Post("services/reorder")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Set the priority order (first id is tried first)" })
  reorder(@Body() body: { ids?: string[] }) {
    return this.services.reorder(body?.ids ?? []);
  }

  @Patch("services/:id")
  @ContentAdmin()
  @ApiOperation({ summary: "Edit label / model / rpm / enabled / replace the key" })
  update(
    @Param("id") id: string,
    @Body() body: { label?: string; model?: string; rpm?: number; enabled?: boolean; apiKey?: string; baseUrl?: string; apiFormat?: string },
  ) {
    return this.services.update(id, body ?? {});
  }

  @Delete("services/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ContentAdmin()
  @ApiOperation({ summary: "Remove an AI service" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.services.remove(id);
  }

  @Post("services/:id/benchmark")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Score a service on the fixed translation test set (1–5 runs: accuracy + speed)" })
  async benchmark(@Param("id") id: string, @Body() body: { runs?: number }) {
    return this.examples.benchmark(await this.services.runtimeOf(id), Number(body?.runs) || undefined);
  }

  @Post("services/:id/test")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Send one tiny request to check the key and model" })
  async test(@Param("id") id: string) {
    return this.examples.probe(await this.services.runtimeOf(id));
  }
}
