import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { PROMPT_VERSIONS } from "./eval-evaluators.js";
import { JUDGE_PROMPT_VERSION } from "./eval-judge.js";
import { reportCsv } from "./eval-report.js";
import { EvalService, LIMITS, RANKING_TASK, type CreateRunInput } from "./eval.service.js";
import { EVAL_SPLITS, EVAL_TASKS, JLPT_LEVELS, type CaseFilter } from "./eval-types.js";

/** Reviewer / importer id recorded in the audit history: the user id from the token. */
const who = (u?: AuthUser) => (u?.sub ? `user:${u.sub}` : "admin");
const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

/**
 * Admin API of the Japanese AI evaluation benchmark. Results live in the
 * `eval_*` collections, apart from learner data.
 */
@ApiTags("ai-eval")
@ApiBearerAuth()
@Controller("flashcards/admin/ai/eval")
export class EvalController {
  constructor(private readonly evals: EvalService) {}

  @Get("meta")
  @ContentAdmin()
  @ApiOperation({ summary: "Tasks, levels, splits, prompt versions and limits of the benchmark" })
  meta() {
    return {
      tasks: EVAL_TASKS,
      levels: JLPT_LEVELS,
      splits: EVAL_SPLITS,
      promptVersions: PROMPT_VERSIONS,
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      rankingTask: RANKING_TASK,
      limits: LIMITS,
    };
  }

  @Get("datasets")
  @ContentAdmin()
  @ApiOperation({ summary: "Imported dataset versions" })
  datasets() {
    return this.evals.listDatasets();
  }

  @Post("datasets/import-bundled")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Import the dataset shipped with the app (no-op if that version is in)" })
  importBundled(@CurrentUser() u?: AuthUser) {
    return this.evals.importBundled(who(u));
  }

  @Post("datasets/upload")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Import a new dataset version — raw JSON or JSONL body (Content-Type application/x-eval-dataset)" })
  upload(
    @Req() req: { body?: unknown },
    @Query("format") format?: string,
    @Query("name") name?: string,
    @Query("version") version?: string,
    @CurrentUser() u?: AuthUser,
  ) {
    const body = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body ?? "");
    return this.evals.importDataset(body, format === "jsonl" ? "jsonl" : "json", { name, version }, "upload", who(u));
  }

  @Get("datasets/:key/stats")
  @ContentAdmin()
  @ApiOperation({ summary: "Case counts of a dataset by task × level × split" })
  stats(@Param("key") key: string) {
    return this.evals.datasetStats(key);
  }

  @Get("datasets/:key/cases")
  @ContentAdmin()
  @ApiOperation({ summary: "Browse a dataset's cases (≤ 200)" })
  cases(@Param("key") key: string, @Query("tasks") tasks?: string, @Query("levels") levels?: string, @Query("splits") splits?: string, @Query("ids") ids?: string) {
    return this.evals.cases(key, { tasks: list(tasks), levels: list(levels), splits: list(splits), caseIds: list(ids) } as CaseFilter);
  }

  @Post("runs/preview")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "How many cases / calls a run with this filter would make" })
  preview(@Body() body: Parameters<EvalService["preview"]>[0]) {
    return this.evals.preview(body ?? {});
  }

  @Get("runs")
  @ContentAdmin()
  @ApiOperation({ summary: "Benchmark runs, newest first" })
  runs(@Query("limit") limit?: string) {
    return this.evals.listRuns(Number(limit) || 50);
  }

  @Post("runs")
  @ContentAdmin()
  @ApiOperation({ summary: "Queue a run: candidates × dataset filter, 2 judges, prompt version, temperature, batch size, repeats" })
  create(@Body() body: CreateRunInput, @CurrentUser() u?: AuthUser) {
    return this.evals.createRun(body ?? {}, who(u));
  }

  @Get("runs/:id")
  @ContentAdmin()
  run(@Param("id") id: string) {
    return this.evals.getRun(id);
  }

  @Get("runs/:id/report")
  @ContentAdmin()
  @ApiOperation({ summary: "Report: overall / task / level / task×level scores per candidate, latency, tokens, cost, errors, consistency" })
  report(@Param("id") id: string) {
    return this.evals.report(id);
  }

  @Get("runs/:id/report.csv")
  @ContentAdmin()
  @Header("Content-Type", "text/csv; charset=utf-8")
  async reportCsv(@Param("id") id: string) {
    return reportCsv(await this.evals.report(id));
  }

  @Get("compare")
  @ContentAdmin()
  @ApiOperation({ summary: "Reports of two runs side by side (model / prompt version comparison)" })
  async compare(@Query("a") a: string, @Query("b") b: string) {
    const [ra, rb] = await Promise.all([this.evals.report(a), this.evals.report(b)]);
    return { a: ra, b: rb };
  }

  @Post("runs/:id/cancel")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  cancel(@Param("id") id: string) {
    return this.evals.cancelRun(id);
  }

  @Post("runs/:id/resume")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  resume(@Param("id") id: string) {
    return this.evals.resumeRun(id);
  }

  @Post("runs/:id/apply-ranking")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Use this run's per-task scores as the services' benchmark and re-sort their priority" })
  applyRanking(@Param("id") id: string) {
    return this.evals.applyRanking(id);
  }

  @Delete("runs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ContentAdmin()
  async remove(@Param("id") id: string): Promise<void> {
    await this.evals.deleteRun(id);
  }

  @Get("runs/:id/results")
  @ContentAdmin()
  results(
    @Param("id") id: string,
    @Query() q: { candidate?: string; task?: string; level?: string; status?: string; review?: string; maxScore?: string; page?: string },
  ) {
    return this.evals.listResults(id, q ?? {});
  }

  @Get("results/:id")
  @ContentAdmin()
  result(@Param("id") id: string) {
    return this.evals.resultDetail(id);
  }

  @Post("results/:id/review")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Human adjudication: confirm or override the score (kept as audit history)" })
  review(@Param("id") id: string, @Body() body: { action?: string; score?: number; notes?: string }, @CurrentUser() u?: AuthUser) {
    return this.evals.review(id, body ?? {}, who(u));
  }

  @Get("prices")
  @ContentAdmin()
  prices() {
    return this.evals.prices();
  }

  @Put("prices")
  @ContentAdmin()
  @ApiOperation({ summary: "USD per 1M tokens by provider:model (provider:* for all models of a provider)" })
  setPrices(@Body() body: { prices?: unknown }) {
    return this.evals.setPrices(body?.prices);
  }
}
