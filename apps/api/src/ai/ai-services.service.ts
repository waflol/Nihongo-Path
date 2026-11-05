import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { openSecret, sealSecret } from "../common/secret-box.js";
import { AI_PROVIDERS, providerById, type AiProvider } from "./ai-providers.js";
import {
  BENCH_TASKS,
  HISTORY_LIMIT,
  historyEntry,
  legacyTaskResult,
  rankServices,
  type BenchHistory,
  type BenchResult,
  type BenchTask,
  type RankOptions,
  type Ranked,
} from "./ai-benchmark.js";
import { fetchNvidiaCatalog, nvidiaModels } from "./ai-nvidia.js";
import { validateBaseUrl } from "./ai-url.js";
import { normaliseModels, type AiModelInfo } from "./ai-models.js";
import type { AiServiceDocument } from "./ai-service.schema.js";

/** A service ready to call: key decrypted, provider resolved. */
export interface RuntimeAiService {
  id: string;
  label: string;
  provider: AiProvider;
  model: string;
  key: string;
  rpm: number;
  /** Priority: the general one and, where the admin sorted by task, that task's own. */
  order?: { default: number } & Partial<Record<BenchTask, number>>;
}

/** What the admin page sees — never the key. */
export interface AiServiceView {
  id: string;
  provider: string;
  providerName: string;
  label: string;
  model: string;
  keyHint: string;
  /** Endpoint for custom / Cloudflare services. */
  baseUrl: string | null;
  /** Translate-only model: used for translating sentences, never for writing them. */
  translationOnly: boolean;
  /** Latest benchmark of each task, each with its own score / rank data. */
  benchTasks: Partial<Record<BenchTask, BenchResult & { score?: number; speed?: number; eligible?: boolean; pareto?: boolean }>>;
  /** Past runs per task. */
  benchHistory: BenchHistory;
  rpm: number;
  enabled: boolean;
  priority: number;
  /** Own order per task, where the admin sorted by that task. */
  taskPriority: Partial<Record<BenchTask, number>>;
  status: string;
  lastError: string;
  lastOkAt: string | null;
  cooldownUntil: string | null;
  /** From the server's .env (read-only, always tried last). */
  readOnly?: boolean;
}

export type FailureKind = "auth" | "rate" | "transient";

const CACHE_MS = 15_000;
const COOLDOWN_MS: Record<FailureKind, number> = {
  rate: 5 * 60_000,
  transient: 60_000,
  auth: 60 * 60_000,
};
const STATUS_OF: Record<FailureKind, string> = { rate: "cooldown", transient: "error", auth: "invalid" };

/**
 * Admin-managed list of AI services (priority order). Keys are encrypted at
 * rest. `GEMINI_API_KEY` in `.env`, when set, acts as a read-only last
 * resort after the admin's own services.
 */
@Injectable()
export class AiServicesService {
  private readonly logger = new Logger(AiServicesService.name);
  private cache: { at: number; list: RuntimeAiService[] } | null = null;
  /** In-memory cooldowns (id → until); mirrored to the database for the admin page. */
  private readonly cooldown = new Map<string, number>();
  /** Last failure per service id (for the read-only .env service, which has no document). */
  private readonly failures = new Map<string, { kind: FailureKind; message: string }>();

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional()
    @InjectModel("AiService")
    private readonly model?: Model<AiServiceDocument>,
  ) {}

  private get secret(): string {
    return (
      this.config?.get<string>("AI_KEY_SECRET") ??
      process.env.AI_KEY_SECRET ??
      this.config?.get<string>("JWT_ACCESS_SECRET") ??
      process.env.JWT_ACCESS_SECRET ??
      ""
    ).trim();
  }

  private env(name: string): string {
    return (this.config?.get<string>(name) ?? process.env[name] ?? "").trim();
  }

  private envService(): RuntimeAiService | null {
    const key = this.env("GEMINI_API_KEY");
    if (!key) return null;
    const provider = providerById("gemini")!;
    return {
      id: "env",
      label: "Gemini (từ .env)",
      provider,
      model: this.env("GEMINI_MODEL") || provider.defaultModel,
      key,
      rpm: Number(this.env("GEMINI_RPM")) || provider.defaultRpm,
    };
  }

  /**
   * The provider of a stored service: the preset, with the stored endpoint
   * (Cloudflare account URL) or — for `custom` — a provider built from the
   * admin's base URL and API format.
   */
  private providerOf(d: AiServiceDocument): AiProvider | undefined {
    const preset = providerById(d.provider);
    if (!preset) return undefined;
    if (preset.custom) {
      if (!d.baseUrl) return undefined;
      return { ...preset, name: d.label, kind: d.apiFormat === "anthropic" ? "anthropic" : "openai", baseUrl: d.baseUrl, defaultModel: d.modelName };
    }
    return d.baseUrl ? { ...preset, baseUrl: d.baseUrl } : preset;
  }

  /** Decrypted key; "" for a keyless custom server; null when it cannot be decrypted. */
  private keyOf(d: AiServiceDocument): string | null {
    if (!d.keyBox) return d.provider === "custom" ? "" : null;
    return openSecret(d.keyBox, this.secret);
  }

  // ── Runtime (used by the example generator) ───────────────────────────

  /** Enabled services in priority order, keys decrypted (cached briefly). */
  async active(): Promise<RuntimeAiService[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.list;
    const list: RuntimeAiService[] = [];
    if (this.model) {
      const docs = await this.model.find({ enabled: true }).sort({ priority: 1, _id: 1 }).exec();
      for (const d of docs) {
        const provider = this.providerOf(d);
        const key = this.keyOf(d);
        if (!provider || key === null) continue; // unknown preset, or the secret changed
        list.push({
          id: String(d._id),
          label: d.label,
          provider,
          model: d.modelName,
          key,
          rpm: d.rpm,
          order: { default: d.priority, ...(d.taskPriority ?? {}) },
        });
      }
    }
    const env = this.envService();
    if (env) list.push(env);
    this.cache = { at: Date.now(), list };
    return list;
  }

  /**
   * `active()` minus the ones cooling down right now. With a `task`, ordered
   * by that task's own priority (services the admin never sorted for it keep
   * their general priority); the read-only .env service always stays last.
   */
  async available(task?: BenchTask): Promise<RuntimeAiService[]> {
    const now = Date.now();
    const list = (await this.active()).filter((s) => (this.cooldown.get(s.id) ?? 0) <= now);
    if (!task) return list;
    const rank = (s: RuntimeAiService) => (s.order ? (s.order[task] ?? s.order.default) : Number.MAX_SAFE_INTEGER);
    return list.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  }

  async reportOk(id: string): Promise<void> {
    this.cooldown.delete(id);
    this.failures.delete(id);
    this.okAt.set(id, new Date().toISOString());
    if (id === "env" || !this.model) return;
    await this.model
      .updateOne(
        { _id: id },
        { $set: { status: "ok", lastError: "", lastOkAt: new Date() }, $unset: { cooldownUntil: 1 } },
      )
      .exec()
      .catch(() => undefined);
  }

  async reportFailure(id: string, kind: FailureKind, message: string, retryAfterMs?: number): Promise<void> {
    const wait = Math.max(5_000, retryAfterMs ?? COOLDOWN_MS[kind]);
    const until = Date.now() + wait;
    this.cooldown.set(id, until);
    this.failures.set(id, { kind, message });
    this.logger.warn(`AI service ${id} → ${kind}: ${message} (skipped for ${Math.round(wait / 1000)}s)`);
    if (id === "env" || !this.model) return;
    await this.model
      .updateOne(
        { _id: id },
        { $set: { status: STATUS_OF[kind], lastError: message.slice(0, 300), cooldownUntil: new Date(until) } },
      )
      .exec()
      .catch(() => undefined);
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────

  providers(): readonly AiProvider[] {
    return AI_PROVIDERS;
  }

  /** Each task's latest result; a task never scored on its own falls back to the old combined benchmark. */
  private benchTasksOf(d: Pick<AiServiceDocument, "bench" | "benchByTask">): AiServiceView["benchTasks"] {
    const out: AiServiceView["benchTasks"] = {};
    for (const t of BENCH_TASKS) {
      const r = d.benchByTask?.[t] ?? legacyTaskResult(d.bench, t);
      if (r) out[t] = r;
    }
    return out;
  }

  private view(d: AiServiceDocument): AiServiceView {
    return {
      id: String(d._id),
      provider: d.provider,
      providerName: providerById(d.provider)?.name ?? d.provider,
      label: d.label,
      model: d.modelName,
      keyHint: d.keyHint,
      baseUrl: d.baseUrl ?? null,
      translationOnly: Boolean(providerById(d.provider)?.translators?.some((t) => t.toLowerCase() === d.modelName.toLowerCase())),
      benchTasks: this.benchTasksOf(d),
      benchHistory: d.benchHistory ?? {},
      rpm: d.rpm,
      enabled: d.enabled,
      priority: d.priority,
      taskPriority: d.taskPriority ?? {},
      status: d.status,
      lastError: d.lastError,
      lastOkAt: d.lastOkAt ? d.lastOkAt.toISOString() : null,
      cooldownUntil: d.cooldownUntil && d.cooldownUntil.getTime() > Date.now() ? d.cooldownUntil.toISOString() : null,
    };
  }

  private requireModel(): Model<AiServiceDocument> {
    if (!this.model) throw new ConflictException("Database is not configured");
    return this.model;
  }

  async list(): Promise<AiServiceView[]> {
    const docs = await this.requireModel().find().sort({ priority: 1, _id: 1 }).exec();
    const out = docs.map((d) => this.view(d));
    const env = this.envService();
    if (env) {
      out.push({
        id: "env",
        provider: "gemini",
        providerName: env.provider.name,
        label: env.label,
        model: env.model,
        keyHint: env.key.slice(-4),
        baseUrl: null,
        translationOnly: false,
        benchTasks: { ...this.benchEnv },
        benchHistory: this.historyEnv,
        rpm: env.rpm,
        enabled: true,
        priority: Number.MAX_SAFE_INTEGER,
        taskPriority: {},
        ...this.envState(),
        readOnly: true,
      });
    }
    return out;
  }

  /** Status of the .env service, kept in memory only. */
  private envState(): Pick<AiServiceView, "status" | "lastError" | "lastOkAt" | "cooldownUntil"> {
    const until = this.cooldown.get("env") ?? 0;
    const f = this.failures.get("env");
    if (f && until > Date.now()) {
      return { status: STATUS_OF[f.kind], lastError: f.message, lastOkAt: null, cooldownUntil: new Date(until).toISOString() };
    }
    return { status: this.okAt.has("env") ? "ok" : "unknown", lastError: "", lastOkAt: this.okAt.get("env") ?? null, cooldownUntil: null };
  }

  private readonly okAt = new Map<string, string>();
  /** Benchmarks / history of the read-only .env service (no document to keep them on). */
  private benchEnv: Partial<Record<BenchTask, BenchResult>> = {};
  private historyEnv: BenchHistory = {};

  /**
   * Stores one task's benchmark and adds a line to that task's history. A run
   * in which every call failed does not wipe a good earlier result: that one
   * is kept and only annotated with the failed attempt (the failure is still
   * written to the history).
   */
  async saveBench(id: string, task: BenchTask, result: BenchResult): Promise<void> {
    const stamped: BenchResult = { ...result, task };
    const keep = (prev: BenchResult | undefined): BenchResult =>
      !stamped.ok && prev?.ok
        ? { ...prev, lastAttempt: { at: stamped.at, error: stamped.error, ms: stamped.ms } }
        : stamped;
    const entry = historyEntry(stamped);
    if (id === "env") {
      this.benchEnv[task] = keep(this.benchEnv[task]);
      this.historyEnv[task] = [...(this.historyEnv[task] ?? []), entry].slice(-HISTORY_LIMIT);
      return;
    }
    const model = this.requireModel();
    const doc = await model.findById(id).select("benchByTask").lean().exec();
    await model
      .updateOne(
        { _id: id },
        {
          $set: { [`benchByTask.${task}`]: keep(doc?.benchByTask?.[task]) },
          $push: { [`benchHistory.${task}`]: { $each: [entry], $slice: -HISTORY_LIMIT } },
        },
      )
      .exec();
  }

  /**
   * Re-orders the admin's services for ONE task by that task's stored benchmark
   * (`rankServices`): eligible ones by combined score, then those below the accuracy bar, then the
   * unmeasured / failed ones, which keep their relative order. Returns the new
   * list with each service's score attached.
   */
  async autoSort(opts: RankOptions & { task: BenchTask }): Promise<AiServiceView[]> {
    const model = this.requireModel();
    const docs = await model.find().sort({ priority: 1, _id: 1 }).exec();
    const task = opts.task;
    const ranked = rankServices(
      docs.map((d) => ({ id: String(d._id), bench: this.benchTasksOf(d)[task] })),
      opts,
    );
    const pos = new Map(ranked.map((r, i) => [r.id, i]));
    // Stable: unmeasured services keep their relative order, after the ranked ones.
    const order = [...docs].sort((a, b) => (pos.get(String(a._id)) ?? 1e9) - (pos.get(String(b._id)) ?? 1e9));
    // Only this task's own order changes; the general priority stays.
    const field = `taskPriority.${task}`;
    await Promise.all(order.map((d, i) => model.updateOne({ _id: d._id }, { $set: { [field]: i } }).exec()));
    this.cache = null;
    return this.listScored(new Map(ranked.map((r) => [r.id, r])), task);
  }

  /** `list()` with the score / speed score of `task` filled in where known. */
  async listScored(scores: Map<string, Ranked>, task: BenchTask): Promise<AiServiceView[]> {
    return (await this.list()).map((s) => {
      const c = scores.get(s.id);
      const b = s.benchTasks[task];
      return c && b
        ? { ...s, benchTasks: { ...s.benchTasks, [task]: { ...b, score: c.final, speed: c.speed, eligible: c.eligible, pareto: c.pareto } } }
        : s;
    });
  }

  async create(input: {
    provider?: string;
    apiKey?: string;
    label?: string;
    model?: string;
    rpm?: number;
    baseUrl?: string;
    apiFormat?: string;
    accountId?: string;
  }): Promise<AiServiceView> {
    const model = this.requireModel();
    const provider = providerById(input.provider ?? "");
    if (!provider) throw new UnprocessableEntityException("Unknown provider");
    const apiKey = (input.apiKey ?? "").trim();
    // A custom (local) server may need no key; everything else does.
    if (apiKey.length > 400 || (apiKey.length < 8 && !(provider.custom && apiKey === ""))) {
      throw new UnprocessableEntityException("API key looks invalid");
    }
    if (apiKey && !this.secret) {
      throw new ConflictException("Set AI_KEY_SECRET (or JWT_ACCESS_SECRET) so keys can be stored encrypted");
    }
    const baseUrl = this.baseUrlFor(provider, input);
    const modelName = (input.model ?? "").trim() || provider.defaultModel;
    if (!modelName) throw new UnprocessableEntityException("Nhập tên mô hình");
    this.assertChatModel(provider, modelName);
    const last = await model.findOne().sort({ priority: -1 }).exec();
    const doc = await model.create({
      provider: provider.id,
      label: (input.label ?? "").trim() || provider.name,
      modelName,
      keyBox: apiKey ? sealSecret(apiKey, this.secret) : "",
      keyHint: apiKey.slice(-4),
      baseUrl,
      apiFormat: provider.custom ? (input.apiFormat === "anthropic" ? "anthropic" : "openai") : undefined,
      rpm: this.rpmOf(input.rpm, provider.defaultRpm),
      priority: (last?.priority ?? -1) + 1,
    });
    this.cache = null;
    return this.view(doc);
  }

  /** Refuses ids of models that cannot hold a chat (e.g. Cloudflare's m2m100 translator). */
  private assertChatModel(provider: AiProvider, modelName: string): void {
    if (provider.notJaVi?.test(modelName)) {
      throw new UnprocessableEntityException(
        `“${modelName}” chỉ dịch từ tiếng Anh sang các ngôn ngữ Ấn Độ, không hỗ trợ tiếng Nhật → Việt. Dùng ${provider.translators?.[0] ?? provider.defaultModel}`,
      );
    }
    if (provider.nonChat?.test(modelName)) {
      throw new UnprocessableEntityException(
        `“${modelName}” không phải model chat (là model dịch/embedding/giọng nói/ảnh riêng). Chọn model chat/instruct, ví dụ ${provider.defaultModel}`,
      );
    }
  }

  /** Endpoint to store: validated URL (custom), account URL (Cloudflare), else none. */
  private baseUrlFor(provider: AiProvider, input: { baseUrl?: string; accountId?: string }): string | undefined {
    if (provider.custom) return validateBaseUrl(input.baseUrl);
    if (provider.baseUrlTemplate) {
      const id = (input.accountId ?? "").trim();
      if (!/^[0-9a-f]{32}$/i.test(id)) {
        throw new UnprocessableEntityException("Account ID gồm 32 ký tự hex (xem ở dash.cloudflare.com)");
      }
      return provider.baseUrlTemplate.replace("{accountId}", id.toLowerCase());
    }
    return undefined;
  }

  private rpmOf(v: unknown, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 600 ? Math.round(n) : fallback;
  }

  async update(
    id: string,
    input: { label?: string; model?: string; rpm?: number; enabled?: boolean; apiKey?: string; baseUrl?: string; apiFormat?: string },
  ): Promise<AiServiceView> {
    const model = this.requireModel();
    const doc = await this.find(id);
    if (input.label !== undefined && input.label.trim()) doc.label = input.label.trim();
    if (input.model !== undefined && input.model.trim()) {
      const preset = providerById(doc.provider);
      if (preset) this.assertChatModel(preset, input.model.trim());
      doc.modelName = input.model.trim();
    }
    if (input.rpm !== undefined) doc.rpm = this.rpmOf(input.rpm, doc.rpm);
    if (input.enabled !== undefined) doc.enabled = Boolean(input.enabled);
    if (doc.provider === "custom") {
      if (input.baseUrl !== undefined && input.baseUrl.trim()) doc.baseUrl = validateBaseUrl(input.baseUrl);
      if (input.apiFormat !== undefined) doc.apiFormat = input.apiFormat === "anthropic" ? "anthropic" : "openai";
    }
    if (input.apiKey !== undefined && input.apiKey.trim()) {
      const k = input.apiKey.trim();
      if (k.length < 8 || k.length > 400) throw new UnprocessableEntityException("API key looks invalid");
      if (!this.secret) throw new ConflictException("Set AI_KEY_SECRET (or JWT_ACCESS_SECRET)");
      doc.keyBox = sealSecret(k, this.secret);
      doc.keyHint = k.slice(-4);
    }
    // Any edit gives the service a clean slate.
    doc.status = "unknown";
    doc.lastError = "";
    doc.cooldownUntil = undefined;
    this.cooldown.delete(id);
    await doc.save();
    void model;
    this.cache = null;
    return this.view(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.find(id);
    await doc.deleteOne();
    this.cooldown.delete(id);
    this.cache = null;
  }

  /** Set the priority order of ONE task: `ids[0]` is tried first for that task. */
  async reorder(ids: string[], task: BenchTask): Promise<AiServiceView[]> {
    const model = this.requireModel();
    if (!Array.isArray(ids) || ids.some((i) => !Types.ObjectId.isValid(i))) {
      throw new UnprocessableEntityException("ids must be service ids");
    }
    await Promise.all(ids.map((id, i) => model.updateOne({ _id: id }, { $set: { [`taskPriority.${task}`]: i } }).exec()));
    this.cache = null;
    return this.list();
  }

  async find(id: string): Promise<AiServiceDocument> {
    const model = this.requireModel();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("AI service not found");
    const doc = await model.findById(id).exec();
    if (!doc) throw new NotFoundException("AI service not found");
    return doc;
  }

  /**
   * The models a provider offers right now, tagged free / paid. The list comes
   * from the provider's own `/models` endpoint using the typed key, or the key
   * of a stored service; the OpenRouter and NVIDIA lists are public (OpenRouter's also carries prices).
   * "Offered" is not a promise: a listed model can still be closed to new
   * accounts, so the admin page keeps its Test button.
   */
  async listModels(input: {
    provider?: string;
    apiKey?: string;
    serviceId?: string;
    baseUrl?: string;
    apiFormat?: string;
  }): Promise<AiModelInfo[]> {
    let provider = providerById(input.provider ?? "");
    let key = (input.apiKey ?? "").trim();
    if (input.serviceId) {
      const rt = await this.runtimeOf(input.serviceId);
      provider = rt.provider;
      if (!key) key = rt.key;
    } else if (provider?.custom) {
      provider = {
        ...provider,
        kind: input.apiFormat === "anthropic" ? "anthropic" : "openai",
        baseUrl: validateBaseUrl(input.baseUrl),
      };
    }
    if (!provider) throw new UnprocessableEntityException("Unknown provider");
    if (provider.staticModels) return normaliseModels(provider, {});
    // NVIDIA: exactly the Free + Partner endpoints of build.nvidia.com/models.
    if (provider.id === "nvidia") return this.listNvidia(provider, key);
    if (!key && !provider.publicModels) {
      throw new UnprocessableEntityException("Nhập khoá API để tải danh sách mô hình");
    }
    const isGemini = provider.kind === "gemini";
    const url = isGemini ? `${provider.baseUrl}/models?pageSize=200` : `${provider.baseUrl}/models`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (key) {
      if (isGemini) headers["x-goog-api-key"] = key;
      else if (provider.kind === "anthropic") headers["x-api-key"] = key;
      else headers.Authorization = `Bearer ${key}`;
    }
    if (provider.kind === "anthropic") headers["anthropic-version"] = "2023-06-01";
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new ConflictException(`Không kết nối được ${provider.name}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let detail = raw;
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } | string };
        detail = typeof j.error === "string" ? j.error : (j.error?.message ?? raw);
      } catch {
        /* not JSON */
      }
      if (key) detail = detail.replaceAll(key, "<key>");
      throw new UnprocessableEntityException(
        `${provider.name} từ chối (HTTP ${res.status})${detail ? `: ${detail.replace(/\s+/g, " ").trim().slice(0, 160)}` : ""}`,
      );
    }
    return normaliseModels(provider, await res.json().catch(() => ({})));
  }

  /**
   * NVIDIA's own `/models` lists every model it can serve; the models page
   * (Free + Partner endpoints) is the useful subset, so take that list from the
   * public catalog and match it to the ids the chat API accepts.
   */
  private async listNvidia(provider: AiProvider, key: string): Promise<AiModelInfo[]> {
    const [catalog, apiRes] = await Promise.all([
      fetchNvidiaCatalog(),
      fetch(`${provider.baseUrl}/models`, {
        headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null),
    ]);
    const body = apiRes?.ok ? ((await apiRes.json().catch(() => null)) as { data?: { id?: string }[] } | null) : null;
    const apiIds = (body?.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    return nvidiaModels(catalog, apiIds, provider.defaultModel);
  }

  /** A decrypted runtime copy of one stored service, for the "Test" button. */
  async runtimeOf(id: string): Promise<RuntimeAiService> {
    if (id === "env") {
      const env = this.envService();
      if (!env) throw new NotFoundException("AI service not found");
      return env;
    }
    const d = await this.find(id);
    const provider = this.providerOf(d);
    const key = this.keyOf(d);
    if (!provider) throw new UnprocessableEntityException("Unknown provider");
    if (key === null) throw new ConflictException("Cannot decrypt the key — re-enter it (the secret changed)");
    return { id: String(d._id), label: d.label, provider, model: d.modelName, key, rpm: d.rpm };
  }
}
