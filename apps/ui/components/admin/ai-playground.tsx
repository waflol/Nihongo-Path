"use client";

import { useEffect, useState } from "react";
import { MIN_ACCURACY } from "@/lib/ai-benchmark-score";

interface PlayService {
  id: string;
  label: string;
  model: string;
  enabled: boolean;
  status?: string;
  cooldownUntil?: string | null;
  /** Translate-only model: cannot write sentences or analyse grammar. */
  translationOnly?: boolean;
  /** Last benchmark; grammar analysis only offers services that passed it. */
  /** Latest benchmark of each task, scored on its own. */
  benchTasks?: Partial<Record<string, { ok: boolean; accuracy: number }>>;
  /** Own order per task, set by sorting the benchmark by that task. */
  taskPriority?: Record<string, number>;
  priority?: number;
}

type Mode = "write" | "translate" | "grammar" | "pronounce";

interface Reply {
  ok: boolean;
  ms: number;
  prompt?: string;
  raw?: string;
  error?: string;
  /** write */
  result?: { ja?: string; vi: string; matches?: boolean };
  /** translate / grammar */
  data?: {
    vi?: string;
    translation?: string;
    note?: string;
    tokens?: { text?: string; reading?: string; pos?: string; meaning?: string }[];
    grammar?: { pattern?: string; level?: string; explanation?: string }[];
    /** pronounce */
    reading?: string;
    romaji?: string;
    viet?: string;
    words?: { text?: string; reading?: string; romaji?: string; accent?: string }[];
    tips?: string[];
  };
}

interface Run extends Reply {
  key: number;
  mode: Mode;
  input: string;
  serviceLabel: string;
}

const API = "/api/flashcards/admin/ai";
const field =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--foreground)]";
const btn =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-50";

const MODES: { id: Mode; label: string; hint: string; placeholder: string; sample: string }[] = [
  {
    id: "write",
    label: "Tạo câu ví dụ",
    hint: "Nhập một từ (kanji hoặc hiragana) để AI viết câu ví dụ kèm bản dịch.",
    placeholder: "例: 食べる / たべる",
    sample: "食べる",
  },
  {
    id: "translate",
    label: "Dịch",
    hint: "Nhập câu tiếng Nhật để dịch sang tiếng Việt (hoặc tiếng Việt sang tiếng Nhật).",
    placeholder: "例: 毎日、朝ごはんを食べる。",
    sample: "毎日、朝ごはんを食べる。",
  },
  {
    id: "grammar",
    label: "Phân tích ngữ pháp",
    hint: "Nhập một câu tiếng Nhật để tách từ, xem từ loại và các mẫu ngữ pháp được dùng.",
    placeholder: "例: 雨が降っているにもかかわらず、出かけた。",
    sample: "雨が降っているにもかかわらず、出かけた。",
  },
  {
    id: "pronounce",
    label: "Cách phát âm",
    hint: "Nhập từ hoặc câu tiếng Nhật để xem hiragana, romaji, cách đọc theo tiếng Việt, trọng âm và lưu ý khi phát âm.",
    placeholder: "例: 東京へ行きます。",
    sample: "東京へ行きます。",
  },
];

/** Admin sandbox: example sentences, translation and grammar analysis on a chosen AI service. Nothing is saved. */
export function AiPlayground() {
  const [services, setServices] = useState<PlayService[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [mode, setMode] = useState<Mode>("write");
  const [texts, setTexts] = useState<Record<Mode, string>>({
    write: MODES[0].sample,
    translate: MODES[1].sample,
    grammar: MODES[2].sample,
    pronounce: MODES[3].sample,
  });
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API}/services`, { cache: "no-store" }).catch(() => null);
      if (!res) setLoadError("Không kết nối được API");
      else if (res.status === 403) setLoadError("Tài khoản hiện tại không có quyền quản trị");
      else if (!res.ok) setLoadError("Không tải được danh sách dịch vụ AI");
      else setServices((await res.json()) as PlayService[]);
    })();
  }, []);

  const cur = MODES.find((m) => m.id === mode)!;
  const text = texts[mode];
  // Only services that are on, healthy (no bad key / error / cooldown) and able to do this task.
  const usable = services.filter(
    (s) =>
      s.enabled &&
      s.status !== "invalid" &&
      s.status !== "error" &&
      !(s.cooldownUntil && new Date(s.cooldownUntil).getTime() > Date.now()) &&
      (mode === "translate" || !s.translationOnly) &&
      // Grammar analysis is the hardest task: only services that scored well on the grammar benchmark.
      (mode !== "grammar" || (s.benchTasks?.grammar?.ok ? s.benchTasks.grammar.accuracy : 0) >= MIN_ACCURACY),
  ).sort((a, b) => (a.taskPriority?.[mode] ?? a.priority ?? 0) - (b.taskPriority?.[mode] ?? b.priority ?? 0));
  const chosen = usable.find((s) => s.id === serviceId)?.id ?? usable[0]?.id ?? "";
  const canRun = !busy && chosen !== "" && text.trim() !== "";
  const enabledIds = usable.map((s) => s.id);

  async function submit(ids: string[]) {
    setBusy(true);
    const input = text.trim();
    const m = mode;
    const out = await Promise.all(
      ids.map(async (id, i): Promise<Run> => {
        const svc = services.find((s) => s.id === id);
        const base = { key: seq + i, mode: m, input, serviceLabel: svc ? `${svc.label} · ${svc.model}` : id };
        const url =
          m === "write"
            ? `${API}/services/${encodeURIComponent(id)}/try`
            : `${API}/services/${encodeURIComponent(id)}/play`;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(m === "write" ? { mode: "write", term: input } : { mode: m, text: input }),
          });
          const data = (await res.json().catch(() => ({}))) as Reply & { message?: string | string[] };
          if (!res.ok) {
            const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
            return { ...base, ok: false, ms: 0, error: msg ?? `HTTP ${res.status}` };
          }
          return { ...data, ...base };
        } catch (e) {
          return { ...base, ok: false, ms: 0, error: (e as Error).message };
        }
      }),
    );
    setSeq((n) => n + ids.length);
    setRuns((r) => [...out, ...r].slice(0, 20));
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Sân chơi AI</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Thử tạo câu ví dụ, dịch, phân tích ngữ pháp và gợi ý cách phát âm trên từng dịch vụ AI. Kết quả chỉ để xem — không lưu vào thẻ hay bộ nhớ đệm.
      </p>
      {loadError && <p className="mt-3 text-sm text-[var(--destructive,#dc2626)]">{loadError}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`${btn} ${mode === m.id ? "bg-[var(--layer-hover)]" : ""}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-xs text-[var(--muted-foreground)]">
          Dịch vụ AI (chỉ hiện dịch vụ đang bật, sẵn sàng và phù hợp với chức năng này)
          <select className={`mt-1 h-9 ${field}`} value={chosen} onChange={(e) => setServiceId(e.target.value)}>
            {usable.length === 0 && (
              <option value="">
                {mode === "grammar"
                  ? `Chưa có dịch vụ nào đạt ≥ ${MIN_ACCURACY} điểm “Ngữ pháp” — chạy ở trang Đánh giá AI`
                  : "Không có dịch vụ phù hợp và sẵn sàng"}
              </option>
            )}
            {usable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.model}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted-foreground)]">
          {cur.hint}
          {mode === "write" ? (
            <input
              className={`mt-1 h-9 ${field}`}
              value={text}
              placeholder={cur.placeholder}
              onChange={(e) => setTexts({ ...texts, write: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && canRun && void submit([chosen])}
            />
          ) : (
            <textarea
              className={`mt-1 min-h-24 py-2 ${field}`}
              value={text}
              placeholder={cur.placeholder}
              onChange={(e) => setTexts({ ...texts, [mode]: e.target.value })}
            />
          )}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!canRun} onClick={() => void submit([chosen])}>
          {busy ? "Đang chạy…" : "Chạy thử"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!canRun || enabledIds.length < 2}
          onClick={() => void submit(enabledIds)}
          title="Chạy cùng nội dung trên mọi dịch vụ sẵn sàng để so sánh"
        >
          So sánh tất cả dịch vụ sẵn sàng
        </button>
        {runs.length > 0 && (
          <button type="button" className={btn} onClick={() => setRuns([])}>
            Xoá kết quả
          </button>
        )}
      </div>

      {runs.length > 0 && (
        <ul className="mt-5 space-y-3">
          {runs.map((r) => (
            <RunCard key={r.key} run={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunCard({ run: r }: { run: Run }) {
  const d = r.data;
  const label = MODES.find((m) => m.id === r.mode)!.label;
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
        <span>
          {label} · {r.serviceLabel}
        </span>
        <span>
          {r.ok ? "✓" : "✗"} {(r.ms / 1000).toFixed(1)}s
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">“{r.input}”</p>

      {!r.ok && <p className="mt-2 text-[var(--destructive,#dc2626)]">{r.error}</p>}

      {r.ok && r.mode === "write" && r.result && (
        <div className="mt-2 space-y-1">
          {r.result.ja && <p className="text-base text-[var(--foreground)]">{r.result.ja}</p>}
          <p className="text-[var(--foreground)]">{r.result.vi}</p>
          {r.result.matches !== undefined && (
            <p className="text-xs text-[var(--muted-foreground)]">Nghĩa khớp thẻ: {r.result.matches ? "có" : "không"}</p>
          )}
        </div>
      )}

      {r.ok && r.mode === "translate" && d && (
        <div className="mt-2 space-y-1">
          <p className="text-base text-[var(--foreground)]">{d.translation ?? d.vi}</p>
          {d.note && <p className="text-xs text-[var(--muted-foreground)]">{d.note}</p>}
        </div>
      )}

      {r.ok && r.mode === "pronounce" && d && (
        <div className="mt-3 space-y-3">
          {d.reading && (
            <div className="rounded-lg bg-[var(--background)] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Hiragana</p>
              <p lang="ja" className="text-lg text-[var(--foreground)]">{d.reading}</p>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {d.romaji && (
              <div className="rounded-lg bg-[var(--background)] px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Romaji</p>
                <p className="text-[var(--foreground)]">{d.romaji}</p>
              </div>
            )}
            {d.viet && (
              <div className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--primary)]">Đọc theo tiếng Việt (gần đúng)</p>
                <p className="font-medium text-[var(--foreground)]">{d.viet}</p>
              </div>
            )}
          </div>
          {d.words && d.words.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.words.map((w, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-center">
                  <div lang="ja" className="text-[10px] text-[var(--muted-foreground)]">{w.reading || " "}</div>
                  <div lang="ja" className="text-base text-[var(--foreground)]">{w.text}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{w.romaji}</div>
                  {w.accent && (
                    <div className="mt-0.5 rounded bg-[#f59e0b]/15 px-1 text-[10px] font-medium text-[#b45309] dark:text-[#fbbf24]">
                      {w.accent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {d.tips && d.tips.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2 text-xs text-[var(--foreground)]">
              {d.tips.map((t, i) => (
                <li key={i}>💡 {t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {r.ok && r.mode === "grammar" && d && (
        <div className="mt-2 space-y-3">
          {d.translation && <p className="text-[var(--foreground)]">{d.translation}</p>}
          {d.tokens && d.tokens.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.tokens.map((t, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-center">
                  <div className="text-[10px] text-[var(--muted-foreground)]">{t.reading || " "}</div>
                  <div className="text-base text-[var(--foreground)]">{t.text}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{t.pos}</div>
                  <div className="text-xs text-[var(--foreground)]">{t.meaning}</div>
                </div>
              ))}
            </div>
          )}
          {d.grammar && d.grammar.length > 0 && (
            <ul className="space-y-2">
              {d.grammar.map((g, i) => (
                <li key={i}>
                  <span className="font-medium text-[var(--foreground)]">{g.pattern}</span>
                  {g.level && <span className="ml-2 text-xs text-[var(--muted-foreground)]">{g.level}</span>}
                  <p className="text-xs text-[var(--muted-foreground)]">{g.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(r.prompt || r.raw) && (
        <details className="mt-2 text-xs text-[var(--muted-foreground)]">
          <summary className="cursor-pointer">Prompt &amp; phản hồi gốc</summary>
          {r.prompt && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{r.prompt}</pre>}
          {r.raw && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{r.raw}</pre>}
        </details>
      )}
    </li>
  );
}
