"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TASK_LABELS, type BenchTask } from "@/lib/ai-benchmark-score";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";
import { AiTaskTabs } from "@/components/admin/ai-task-tabs";
import { AiBenchmarkPanel, type Bench, type HistoryEntry } from "@/components/admin/ai-benchmark-panel";

interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  defaultRpm: number;
  keyUrl: string;
  pricingUrl?: string;
  /** `/models` is public: the list can load without a key. */
  publicModels?: boolean;
  /** Admin-supplied endpoint (local server / any API). */
  custom?: boolean;
  /** Needs the Cloudflare account id. */
  baseUrlTemplate?: string;
  note: string;
}

interface Service {
  id: string;
  provider: string;
  providerName: string;
  label: string;
  model: string;
  keyHint: string;
  baseUrl?: string | null;
  translationOnly?: boolean;
  benchTasks?: Partial<Record<BenchTask, Bench>>;
  benchHistory?: Partial<Record<BenchTask, HistoryEntry[]>>;
  rpm: number;
  enabled: boolean;
  priority: number;
  /** Own order per task (lower = tried first); falls back to `priority`. */
  taskPriority?: Partial<Record<BenchTask, number>>;
  status: string;
  lastError: string;
  lastOkAt: string | null;
  cooldownUntil: string | null;
  readOnly?: boolean;
}

const API = "/api/flashcards/admin/ai";

/** One-click endpoints for the custom provider. */
const QUICK_ENDPOINTS: { name: string; url: string; format: "openai" | "anthropic"; model: string }[] = [
  { name: "Ollama", url: "http://localhost:11434/v1", format: "openai", model: "" },
  { name: "LM Studio", url: "http://localhost:1234/v1", format: "openai", model: "" },
  { name: "vLLM", url: "http://localhost:8000/v1", format: "openai", model: "" },
];

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";
/** Every action button: same height, never wraps, text centred. */
const btnBase =
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-50";
const btn = `${btnBase} min-w-[5.5rem]`;
/** Square-ish icon button (▲ ▼). */
const btnIcon = `${btnBase} w-9 px-0`;

interface ModelInfo {
  id: string;
  tier: "free" | "paid" | "unknown";
  basis: "exact" | "estimate";
  price?: string;
  note?: string;
  translationOnly?: boolean;
  isDefault?: boolean;
}

const TIER: Record<ModelInfo["tier"], { label: string; cls: string }> = {
  free: { label: "Miễn phí", cls: "bg-[#f0fdf4] text-[#15803d] dark:bg-[#0f2418] dark:text-[#86efac]" },
  paid: { label: "Tính phí", cls: "bg-[#fff7ed] text-[#c2410c] dark:bg-[#33200f] dark:text-[#fdba74]" },
  unknown: { label: "Chưa rõ", cls: "bg-[var(--layer)] text-[var(--muted-foreground)]" },
};

/**
 * Live model list of the chosen provider (its own `/models` endpoint), tagged
 * free / paid. A tag marked "~" is an estimate from the provider's free-tier
 * policy; OpenRouter publishes real prices, so its tags are exact. Clicking a
 * row fills the model field.
 */
function ModelPicker({
  providerId,
  apiKey,
  serviceId,
  value,
  onPick,
  pricingUrl,
  publicModels,
  baseUrl,
  apiFormat,
}: {
  providerId: string;
  publicModels?: boolean;
  /** Custom provider: where to list models from, and its wire format. */
  baseUrl?: string;
  apiFormat?: string;
  apiKey?: string;
  serviceId?: string;
  value: string;
  onPick: (id: string) => void;
  pricingUrl?: string;
}) {
  const [items, setItems] = useState<ModelInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // A different provider means a different list.
  useEffect(() => {
    setItems(null);
    setErr(null);
    setOpen(false);
  }, [providerId, serviceId]);

  async function load() {
    setLoading(true);
    setErr(null);
    const res = await fetch(`${API}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: providerId, apiKey: apiKey || undefined, serviceId, baseUrl: baseUrl || undefined, apiFormat }),
    }).catch(() => null);
    setLoading(false);
    if (!res) {
      setErr("Không kết nối được API");
      return;
    }
    const d = (await res.json().catch(() => null)) as ModelInfo[] | { message?: string | string[] } | null;
    if (!res.ok || !Array.isArray(d)) {
      const m = !Array.isArray(d) ? d?.message : undefined;
      setErr((Array.isArray(m) ? m.join(", ") : m) ?? `Không tải được danh sách (${res.status})`);
      return;
    }
    setItems(d);
    setOpen(true);
    // Never overwrite what the admin typed: a model missing from the list may
    // still exist (new, hidden by the translation filter, or just not listed).
    // An empty field takes the provider's recommendation.
    const rec = d.find((m) => m.isDefault);
    if (!value.trim() && rec) onPick(rec.id);
  }

  const recommended = items?.find((m) => m.isDefault)?.id;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (items ?? []).filter(
    (m) => (!onlyFree || m.tier === "free") && terms.every((t) => m.id.toLowerCase().includes(t) || (m.note ?? "").toLowerCase().includes(t)),
  );
  const known = items?.some((m) => m.id === value);

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || (!publicModels && !serviceId && (apiKey ?? "").trim().length < 8) || (providerId === "custom" && !serviceId && !baseUrl?.trim())}
          className={btn}
          title={providerId === "custom" && !serviceId && !baseUrl?.trim() ? "Nhập Base URL trước" : !publicModels && !serviceId ? "Cần nhập khoá API trước" : undefined}
        >
          {loading ? "Đang tải…" : items ? "↻ Tải lại danh sách mô hình" : "Gợi ý mô hình đang khả dụng"}
        </button>
        {items && (
          <>
            <span className="text-xs text-[var(--muted-foreground)]">
              {items.length} mô hình · {items.filter((m) => m.tier === "free").length} miễn phí
            </span>
            <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
              Chỉ hiện miễn phí
            </label>
            <button type="button" className="text-xs text-[var(--primary)] hover:underline" onClick={() => setOpen((o) => !o)}>
              {open ? "Ẩn" : "Hiện"} danh sách
            </button>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-[#b91c1c]">{err}</p>}
      {items && value.trim() && !known && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          “{value}” không có trong danh sách gợi ý. Bạn vẫn có thể dùng nếu chắc tên model đúng — bấm “Kiểm tra” sau khi thêm để xác nhận.
          {recommended && (
            <>
              {" "}
              <button type="button" className="font-medium text-[var(--primary)] hover:underline" onClick={() => onPick(recommended)}>
                Dùng gợi ý “{recommended}” thay thế
              </button>
            </>
          )}
        </p>
      )}
      {items && open && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Tìm mô hình (vd: llama, gemma, translate)… ${shown.length}/${items.length}`}
          aria-label="Tìm mô hình"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
        />
      )}
      {items && open && (
        <ul className="mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1">
          {query.trim() && !(items ?? []).some((m) => m.id.toLowerCase() === query.trim().toLowerCase()) && (
            <li>
              <button
                type="button"
                onClick={() => onPick(query.trim())}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-left hover:bg-[var(--layer-hover)]"
              >
                <span className="text-xs text-[var(--foreground)]">
                  Dùng “<code className="break-all">{query.trim()}</code>” (nhập tay, không có trong danh sách)
                </span>
                <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">Tự nhập</span>
              </button>
            </li>
          )}
          {shown.length === 0 && !query.trim() && <li className="px-3 py-2 text-xs text-[var(--muted-foreground)]">Không có mô hình phù hợp.</li>}
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick(m.id)}
                title={m.note}
                className={
                  "flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left hover:bg-[var(--layer-hover)] " +
                  (m.id === value ? "bg-[var(--layer)]" : "")
                }
              >
                <code className="break-all text-xs text-[var(--foreground)]">{m.id}</code>
                <span className="flex items-center gap-2">
                  {m.translationOnly && (
                    <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">Chỉ dịch</span>
                  )}
                  {m.price && <span className="text-[11px] text-[var(--muted-foreground)]">{m.price}</span>}
                  <span
                    title={m.basis === "estimate" ? "Ước lượng theo chính sách gói miễn phí của nhà cung cấp — kiểm tra bảng giá" : "Giá do nhà cung cấp công bố"}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER[m.tier].cls}`}
                  >
                    {TIER[m.tier].label}
                    {m.basis === "estimate" ? "~" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {items && (
        <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          “~” = ước lượng (chỉ OpenRouter công bố giá chính xác); mô hình có trong danh sách vẫn có thể đã đóng với tài khoản mới — bấm “Kiểm tra” để chắc.{" "}
          {pricingUrl && (
            <a href={pricingUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--primary)] hover:underline">
              Bảng giá ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ s }: { s: Service }) {
  const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  let text = "Chưa kiểm tra";
  let cls = "bg-[var(--layer)] text-[var(--muted-foreground)]";
  if (!s.enabled) text = "Đã tắt";
  else if (s.status === "ok") {
    text = "Hoạt động";
    cls = "bg-[#f0fdf4] text-[#15803d] dark:bg-[#0f2418] dark:text-[#86efac]";
  } else if (s.status === "cooldown") {
    text = `Hết hạn mức — nghỉ${s.cooldownUntil ? ` đến ${time(s.cooldownUntil)}` : ""}`;
    cls = "bg-[#fef9c3] text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]";
  } else if (s.status === "invalid") {
    text = "Key / model bị từ chối";
    cls = "bg-[#fef2f2] text-[#b91c1c] dark:bg-[#2a1215] dark:text-[#fca5a5]";
  } else if (s.status === "error") {
    text = `Lỗi tạm thời${s.cooldownUntil ? ` — thử lại sau ${time(s.cooldownUntil)}` : ""}`;
    cls = "bg-[#fef9c3] text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]";
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

export function AiServicesConsole() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [task, setTask] = useState<BenchTask>("translate");
  const [edit, setEdit] = useState({ label: "", model: "", rpm: "", apiKey: "", baseUrl: "" });

  // Add form
  const [pid, setPid] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("");
  const [rpm, setRpm] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiFormat, setApiFormat] = useState<"openai" | "anthropic">("openai");
  const [accountId, setAccountId] = useState("");
  const provider = providers.find((p) => p.id === pid);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetch(`${API}/providers`, { cache: "no-store" }).catch(() => null),
      fetch(`${API}/services`, { cache: "no-store" }).catch(() => null),
    ]);
    if (!p || !s) {
      setError("Không kết nối được API");
    } else if (p.status === 403 || s.status === 403) {
      setError("Tài khoản hiện tại không có quyền quản trị");
    } else if (p.ok && s.ok) {
      const plist = (await p.json()) as Provider[];
      setProviders(plist);
      setServices((await s.json()) as Service[]);
      setPid((cur) => cur || plist[0]?.id || "");
      setError(null);
    } else {
      setError("Không tải được danh sách dịch vụ AI");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Defaults follow the chosen provider.
  useEffect(() => {
    if (provider) {
      setModel(provider.defaultModel);
      setRpm(String(provider.defaultRpm));
    }
  }, [provider]);

  async function call(path: string, method: string, body?: unknown): Promise<Response | null> {
    return fetch(`${API}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
  }

  async function message(res: Response | null, fallback: string): Promise<string> {
    if (!res) return "Không kết nối được API";
    const d = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const m = Array.isArray(d?.message) ? d?.message.join(", ") : d?.message;
    return m ? `${fallback}: ${m}` : `${fallback} (${res.status})`;
  }

  async function test(id: string) {
    setBusy(id);
    const res = await call(`/services/${id}/test`, "POST");
    setBusy(null);
    if (res?.ok) {
      const r = (await res.json()) as { ok: boolean; message: string; ms: number };
      setTestMsg((m) => ({ ...m, [id]: { ok: r.ok, text: `${r.message} (${r.ms} ms)` } }));
    } else {
      setTestMsg((m) => ({ ...m, [id]: { ok: false, text: "Không kiểm tra được" } }));
    }
    await load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    const res = await call("/services", "POST", {
      provider: pid,
      apiKey,
      label: label.trim() || undefined,
      model: model.trim() || undefined,
      rpm: Number(rpm) || undefined,
      baseUrl: provider?.custom ? baseUrl.trim() : undefined,
      apiFormat: provider?.custom ? apiFormat : undefined,
      accountId: provider?.baseUrlTemplate ? accountId.trim() : undefined,
    });
    setBusy(null);
    if (!res?.ok) {
      setError(await message(res, "Không thêm được dịch vụ"));
      return;
    }
    const created = (await res.json()) as Service;
    setApiKey("");
    setLabel("");
    await load();
    void test(created.id); // check the new key straight away
  }

  async function move(index: number, dir: -1 | 1) {
    const own = shown.filter((s) => !s.readOnly);
    const j = index + dir;
    if (j < 0 || j >= own.length) return;
    const next = [...own];
    [next[index], next[j]] = [next[j], next[index]];
    // Optimistic: give the moved services the new positions of THIS task only.
    const pos = new Map(next.map((s, k) => [s.id, k]));
    setServices((all) => all.map((s) => (pos.has(s.id) ? { ...s, taskPriority: { ...s.taskPriority, [task]: pos.get(s.id)! } } : s)));
    const res = await call("/services/reorder", "POST", { ids: next.map((s) => s.id), task });
    if (!res?.ok) setError(await message(res, "Không đổi được thứ tự"));
    await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await call(`/services/${id}`, "PATCH", body);
    setBusy(null);
    if (!res?.ok) {
      setError(await message(res, "Không lưu được"));
      return false;
    }
    await load();
    return true;
  }

  async function saveEdit(id: string) {
    const ok = await patch(id, {
      label: edit.label,
      model: edit.model,
      rpm: Number(edit.rpm) || undefined,
      apiKey: edit.apiKey || undefined,
      baseUrl: services.find((x) => x.id === id)?.provider === "custom" ? edit.baseUrl || undefined : undefined,
    });
    if (ok) {
      setEditing(null);
      void test(id);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(deleting.id);
    const res = await call(`/services/${deleting.id}`, "DELETE");
    setBusy(null);
    setDeleting(null);
    if (!res?.ok) setError(await message(res, "Không xoá được"));
    await load();
  }

  // Each task has its own order. A translate-only model can only do "Dịch", so it is left out of the other two.
  const rank = (s: Service) => s.taskPriority?.[task] ?? s.priority;
  const shown = services
    .filter((s) => task === "translate" || !s.translationOnly)
    .map((s, k) => ({ s, k }))
    .sort((a, b) => Number(a.s.readOnly ?? false) - Number(b.s.readOnly ?? false) || rank(a.s) - rank(b.s) || a.k - b.k)
    .map((x) => x.s);
  const hiddenCount = services.length - shown.length;
  const ownIndex = (s: Service) => shown.filter((x) => !x.readOnly).findIndex((x) => x.id === s.id);
  const ownCount = shown.filter((s) => !s.readOnly).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Dịch vụ AI</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
        Dùng để dịch, viết câu ví dụ và phân tích ngữ pháp. Mỗi việc có <strong>thứ tự ưu tiên riêng</strong>: hệ thống thử từng dịch vụ
        theo thứ tự của việc đó, từ trên xuống; nếu một dịch vụ hết hạn mức, bị lỗi hoặc từ chối thì tự chuyển sang dịch vụ kế tiếp (dịch vụ lỗi
        được nghỉ một lúc rồi mới thử lại). Khoá API được mã hoá khi lưu và không bao giờ hiển thị lại.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Xoá dịch vụ AI?"
        message={`“${deleting?.label ?? ""}” sẽ bị xoá cùng khoá API đã lưu. Các dịch vụ còn lại vẫn được dùng.`}
        confirmLabel="Xoá"
        busyLabel="Đang xoá…"
        busy={busy === deleting?.id}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />

      {/* Priority list — one order per task */}
      <AiTaskTabs className="mt-6" label="Thứ tự ưu tiên theo việc" value={task} onChange={setTask} />
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Thứ tự ưu tiên của “{TASK_LABELS[task]}” — dùng mũi tên để đổi, hoặc chấm điểm rồi bấm “Sắp xếp” ở phần Chấm điểm bên dưới.
        {hiddenCount > 0 && ` ${hiddenCount} dịch vụ chỉ dịch được nên không nằm trong danh sách này.`}
      </p>
      <div className="mt-3 space-y-3">
        {!loaded && <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
        {loaded && services.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Chưa có dịch vụ nào. Thêm một dịch vụ ở bên dưới — khi chưa có, ví dụ chỉ lấy từ Tatoeba.
          </p>
        )}
        {shown.map((s) => {
          const i = ownIndex(s);
          const t = testMsg[s.id];
          return (
            <div key={s.id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-label={`Ưu tiên ${s.readOnly ? "cuối" : i + 1}`}
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--layer)] text-sm font-semibold text-[var(--foreground)]"
                  >
                    {s.readOnly ? "·" : i + 1}
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      {s.label}
                      <StatusBadge s={s} />
                      {s.translationOnly && (
                        <span
                          title="Chỉ dịch câu Nhật→Việt; không viết câu ví dụ, không kiểm tra nghĩa của từ — các việc đó chuyển sang dịch vụ kế tiếp"
                          className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]"
                        >
                          chỉ dịch
                        </span>
                      )}
                      {s.readOnly && (
                        <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                          từ .env · luôn thử sau cùng
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {s.providerName} · <code>{s.model}</code> · {s.keyHint ? `khoá ····${s.keyHint}` : "không dùng khoá"} · {s.rpm} yêu cầu/phút{s.provider === "custom" && s.baseUrl ? ` · ${s.baseUrl}` : ""}
                      {(["translate", "write", "grammar"] as const)
                        .filter((t) => s.benchTasks?.[t]?.ok)
                        .map((t) => ` · ${{ translate: "dịch", write: "đặt câu", grammar: "ngữ pháp" }[t]} ${s.benchTasks![t]!.accuracy.toFixed(0)}`)
                        .join("")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!s.readOnly && (
                    <>
                      <button type="button" className={btnIcon} disabled={i <= 0} onClick={() => void move(i, -1)} aria-label="Tăng ưu tiên" title="Tăng ưu tiên">
                        ▲
                      </button>
                      <button type="button" className={btnIcon} disabled={i >= ownCount - 1} onClick={() => void move(i, 1)} aria-label="Giảm ưu tiên" title="Giảm ưu tiên">
                        ▼
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={s.enabled}
                        className={btn}
                        disabled={busy === s.id}
                        onClick={() => void patch(s.id, { enabled: !s.enabled })}
                      >
                        {s.enabled ? "Đang bật" : "Đang tắt"}
                      </button>
                    </>
                  )}
                  <button type="button" className={btn} disabled={busy === s.id} onClick={() => void test(s.id)}>
                    {busy === s.id ? "Đang thử…" : "Kiểm tra"}
                  </button>
                  {!s.readOnly && (
                    <>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          setEditing(editing === s.id ? null : s.id);
                          setEdit({ label: s.label, model: s.model, rpm: String(s.rpm), apiKey: "", baseUrl: s.baseUrl ?? "" });
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(s)}
                        className="inline-flex h-8 min-w-[5.5rem] items-center justify-center whitespace-nowrap rounded-lg border border-[var(--destructive)] px-3 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] dark:hover:bg-[#2a1215]"
                      >
                        Xoá
                      </button>
                    </>
                  )}
                </div>
              </div>
              {t && (
                <p className={"mt-2 text-xs " + (t.ok ? "text-[#15803d] dark:text-[#86efac]" : "text-[#b91c1c]")}>{t.text}</p>
              )}
              {!t && s.lastError && s.status !== "ok" && (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">Lần lỗi gần nhất: {s.lastError}</p>
              )}
              {editing === s.id && (
                <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-4">
                  <label className="text-xs text-[var(--muted-foreground)]">
                    Tên hiển thị
                    <input className={`mt-1 ${inputClass}`} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                  </label>
                  <label className="text-xs text-[var(--muted-foreground)]">
                    Model
                    <input className={`mt-1 ${inputClass}`} value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} />
                  </label>
                  <label className="text-xs text-[var(--muted-foreground)]">
                    Yêu cầu/phút
                    <input className={`mt-1 ${inputClass}`} inputMode="numeric" value={edit.rpm} onChange={(e) => setEdit({ ...edit, rpm: e.target.value })} />
                  </label>
                  {s.provider === "custom" && (
                    <label className="text-xs text-[var(--muted-foreground)] sm:col-span-4">
                      Base URL
                      <input className={`mt-1 ${inputClass}`} value={edit.baseUrl} onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })} />
                    </label>
                  )}
                  <label className="text-xs text-[var(--muted-foreground)]">
                    Khoá API mới (để trống = giữ nguyên)
                    <input className={`mt-1 ${inputClass}`} type="password" autoComplete="off" value={edit.apiKey} onChange={(e) => setEdit({ ...edit, apiKey: e.target.value })} />
                  </label>
                  <div className="sm:col-span-4">
                    <ModelPicker
                      providerId={s.provider}
                      apiKey={edit.apiKey}
                      serviceId={s.id}
                      value={edit.model}
                      onPick={(id) => setEdit({ ...edit, model: id })}
                      pricingUrl={providers.find((p) => p.id === s.provider)?.pricingUrl}
                      publicModels={providers.find((p) => p.id === s.provider)?.publicModels}
                      baseUrl={edit.baseUrl}
                    />
                  </div>
                  <div className="sm:col-span-4 flex gap-2">
                    <button type="button" className={btn} disabled={busy === s.id} onClick={() => void saveEdit(s.id)}>
                      Lưu
                    </button>
                    <button type="button" className={btn} onClick={() => setEditing(null)}>
                      Huỷ
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AiBenchmarkPanel
        services={services.map((s) => ({ id: s.id, label: s.label, providerName: s.providerName, model: s.model, enabled: s.enabled, benchTasks: s.benchTasks, benchHistory: s.benchHistory }))}
        onChanged={load}
      />

      {/* Add from the preset list */}
      <form onSubmit={add} className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Thêm dịch vụ AI</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">Dịch vụ (chọn từ danh sách)</span>
            <select className={`mt-1 ${inputClass}`} value={pid} onChange={(e) => setPid(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">
              Khoá API{provider?.custom && " (để trống nếu máy cục bộ không cần)"}
            </span>
            <input
              required={!provider?.custom}
              type="password"
              autoComplete="off"
              className={`mt-1 ${inputClass}`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider?.custom ? "Tuỳ chọn" : "Dán khoá API"}
            />
          </label>
          {provider?.baseUrlTemplate && (
            <label className="text-sm sm:col-span-2">
              <span className="text-[var(--muted-foreground)]">Account ID (32 ký tự, ở dash.cloudflare.com)</span>
              <input
                required
                className={`mt-1 ${inputClass}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="vd: 023e105f4ecef8ad9ca31a8372d0c353"
                spellCheck={false}
              />
            </label>
          )}
          {provider?.custom && (
            <div className="space-y-2 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
                <label className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Base URL</span>
                  <input
                    required
                    className={`mt-1 ${inputClass}`}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    spellCheck={false}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Định dạng API</span>
                  <select className={`mt-1 ${inputClass}`} value={apiFormat} onChange={(e) => setApiFormat(e.target.value as "openai" | "anthropic")}>
                    <option value="openai">OpenAI-compatible</option>
                    <option value="anthropic">Anthropic (Messages)</option>
                  </select>
                </label>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                Điền nhanh:
                {QUICK_ENDPOINTS.map((q) => (
                  <button
                    key={q.name}
                    type="button"
                    className={btn}
                    onClick={() => {
                      setBaseUrl(q.url);
                      setApiFormat(q.format);
                    }}
                  >
                    {q.name}
                  </button>
                ))}
                <span>
                  (máy nội bộ dùng http; địa chỉ công khai bắt buộc https — dán URL gốc, không gồm <code>/chat/completions</code>)
                </span>
              </p>
            </div>
          )}
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">Model</span>
            <input className={`mt-1 ${inputClass}`} value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-[var(--muted-foreground)]">Tên hiển thị (tuỳ chọn)</span>
              <input className={`mt-1 ${inputClass}`} value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="text-[var(--muted-foreground)]">Yêu cầu/phút</span>
              <input className={`mt-1 ${inputClass}`} inputMode="numeric" value={rpm} onChange={(e) => setRpm(e.target.value)} />
            </label>
          </div>
        </div>
        {provider && (
          <div className="mt-3">
            <ModelPicker
              providerId={provider.id}
              apiKey={apiKey}
              value={model}
              onPick={setModel}
              pricingUrl={provider.pricingUrl}
              publicModels={provider.publicModels}
              baseUrl={baseUrl}
              apiFormat={apiFormat}
            />
          </div>
        )}
        {provider && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            {provider.note}{" "}
            {provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--primary)] hover:underline">
              Lấy khoá API ↗
            </a>}{" "}
            · Tên model có thể đổi theo thời gian — bấm “Kiểm tra” sau khi thêm. Dịch vụ mới được xếp ở cuối danh sách ưu tiên.
          </p>
        )}
        <button
          type="submit"
          disabled={
            busy === "add" ||
            (provider?.custom ? !baseUrl.trim() : apiKey.trim().length < 8) ||
            (Boolean(provider?.baseUrlTemplate) && accountId.trim().length !== 32)
          }
          className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "add" ? "Đang thêm…" : "Thêm dịch vụ"}
        </button>
      </form>
    </div>
  );
}
