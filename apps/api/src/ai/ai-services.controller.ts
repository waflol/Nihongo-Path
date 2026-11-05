import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  NotFoundException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { AiCallLogService } from "./ai-call-log.service.js";
import { AiExampleService, type AiTask } from "./ai-example.service.js";
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
    private readonly callLog: AiCallLogService,
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
  @ApiOperation({ summary: "Re-order services by benchmark score (accuracy vs speed weight, minimum accuracy); with `task`, only that task's own order" })
  autoSort(@Body() body: { speedWeight?: number; minAccuracy?: number; task?: string }) {
    const w = Number(body?.speedWeight);
    const m = Number(body?.minAccuracy);
    const task = body?.task === "translate" || body?.task === "write" || body?.task === "grammar" ? body.task : undefined;
    return this.services.autoSort({
      task,
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

  @Post("services/:id/try")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Sandbox: write (or translate) one example sentence on one service — nothing is saved" })
  async try(
    @Param("id") id: string,
    @Body() body: { mode?: string; term?: string; reading?: string; meaning?: string; pos?: string; ja?: string },
  ) {
    const term = String(body?.term ?? "").trim().slice(0, 60);
    const meaning = String(body?.meaning ?? "").trim().slice(0, 200);
    if (!term) throw new BadRequestException("Nhập từ cần tạo câu");
    const task: AiTask =
      body?.mode === "translate"
        ? { kind: "translate", ja: String(body?.ja ?? "").trim().slice(0, 120), term, meaning }
        : {
            kind: "write",
            term,
            reading: String(body?.reading ?? "").trim().slice(0, 60),
            meaning,
            pos: String(body?.pos ?? "").trim().slice(0, 40),
          };
    if (task.kind === "translate" && !task.ja) throw new BadRequestException("Nhập câu tiếng Nhật cần dịch");
    return this.examples.trial(await this.services.runtimeOf(id), task);
  }

  @Post("services/:id/play")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Playground: translate or analyse the grammar of one text on one service — nothing is saved" })
  async play(@Param("id") id: string, @Body() body: { mode?: string; text?: string }) {
    const text = String(body?.text ?? "").trim().slice(0, 500);
    if (!text) throw new BadRequestException("Nhập nội dung cần xử lý");
    const mode = body?.mode === "grammar" ? "grammar" : "translate";
    return this.examples.play(await this.services.runtimeOf(id), mode, text);
  }

  // ── Live activity ───────────────────────────────────────────────────

  @Get("activity")
  @ContentAdmin()
  @ApiOperation({ summary: "Which AI keys are running / idle / cooling down / failing, with the last 24 h counts" })
  async activity() {
    const [services, stats] = await Promise.all([
      this.services.list(),
      this.callLog.stats(new Date(Date.now() - 24 * 3600_000)),
    ]);
    const byId = new Map(stats.map((r) => [r._id, r]));
    const running = new Set(this.examples.runningIds());
    const now = Date.now();
    return {
      queued: this.examples.queued(),
      reused: this.examples.reused,
      services: services.map((s) => {
        const st = byId.get(s.id);
        const cooling = s.cooldownUntil ? new Date(s.cooldownUntil).getTime() > now : false;
        const state = !s.enabled
          ? "disabled"
          : running.has(s.id)
            ? "running"
            : s.status === "invalid" || s.status === "error"
              ? "error"
              : cooling
                ? "cooldown"
                : "ready";
        return {
          id: s.id,
          label: s.label,
          providerName: s.providerName,
          model: s.model,
          keyHint: s.keyHint,
          priority: s.priority,
          state,
          lastError: s.lastError,
          cooldownUntil: s.cooldownUntil,
          lastOkAt: s.lastOkAt,
          ok: st?.ok ?? 0,
          failed: st?.failed ?? 0,
          cards: st?.cards ?? 0,
          lastCallAt: st?.lastAt ?? null,
          lastCallError: st?.lastError ?? null,
        };
      }),
    };
  }

  // ── Call history ────────────────────────────────────────────────────

  @Get("logs")
  @ContentAdmin()
  @ApiOperation({ summary: "History of requests sent to AI services and their answers" })
  logs(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("serviceId") serviceId?: string,
    @Query("ok") ok?: string,
    @Query("purpose") purpose?: string,
    @Query("q") q?: string,
  ) {
    return this.callLog.list({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
      serviceId: serviceId || undefined,
      ok: ok === "1" ? true : ok === "0" ? false : undefined,
      purpose: purpose === "example" || purpose === "test" || purpose === "vocab" ? purpose : undefined,
      q,
    });
  }

  @Get("logs/:id")
  @ContentAdmin()
  @ApiOperation({ summary: "One logged call with its full request and response" })
  async logOne(@Param("id") id: string) {
    const row = await this.callLog.get(id);
    if (!row) throw new NotFoundException("Log entry not found");
    return row;
  }

  @Delete("logs")
  @ContentAdmin()
  @ApiOperation({ summary: "Clear the AI call history" })
  clearLogs() {
    return this.callLog.clear();
  }
}
