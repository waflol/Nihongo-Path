"use client";

import { useEffect, useMemo, useState } from "react";
import { matchesHanViet } from "@/lib/han-viet";

type KanjiItem = {
  _id: string;
  char: string;
  level?: string;
  hanViet?: string;
  onyomi?: string[];
  kunyomi?: string[];
  meanings?: string[];
};

type PracticeMode = "meaning" | "reading" | "char" | "type";
type SourceMode = "srs" | "free";
const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function KanjiPractice() {
  const [items, setItems] = useState<KanjiItem[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [mode, setMode] = useState<PracticeMode>("meaning");
  const [sourceMode, setSourceMode] = useState<SourceMode>("srs");
  const [level, setLevel] = useState<string>("N5");
  const [srsCount, setSrsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPicked(null);
    setTyped("");
    setIndex(0);

    async function load() {
      try {
        if (sourceMode === "srs") {
          const prioRes = await fetch("/api/srs/exercise-priority?pillar=kanji", { cache: "no-store" });
          if (prioRes.ok) {
            const prio = (await prioRes.json()) as Record<string, { today: string[]; due: string[] }>;
            const ids = Object.values(prio).flatMap((b) => [...b.today, ...b.due]);
            if (!cancelled) setSrsCount(ids.length);
          }
        }
        const res = await fetch(`/api/kanji?limit=100&level=${encodeURIComponent(level)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { items?: KanjiItem[] } | KanjiItem[];
        const list = Array.isArray(data) ? data : (data.items ?? []);
        if (!cancelled) {
          setItems(list);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sourceMode, level]);

  const current = items[index];
  const readingOf = (k?: KanjiItem) => {
    if (!k) return "";
    const parts = [...(k.onyomi?.slice(0, 2) ?? []), ...(k.kunyomi?.slice(0, 2) ?? [])];
    return parts.join(" · ") || k.hanViet?.toLocaleUpperCase("vi") || k.char;
  };
  const meaningOf = (k?: KanjiItem) => {
    if (!k) return "";
    const m = k.meanings?.slice(0, 2).join(", ") ?? "";
    return [k.hanViet?.toLocaleUpperCase("vi"), m].filter(Boolean).join(" — ") || k.char;
  };

  const prompt =
    mode === "char"
      ? meaningOf(current)
      : current?.char ?? "";

  const correct =
    mode === "reading"
      ? readingOf(current)
      : mode === "char"
        ? current?.char ?? ""
        : mode === "type"
          ? (current?.hanViet || current?.meanings?.[0] || "").toLocaleUpperCase("vi")
          : meaningOf(current);

  const options = useMemo(() => {
    if (!current || mode === "type") return [];
    const distractors = items
      .filter((x) => x._id !== current._id)
      .slice(0, 3)
      .map((x) => (mode === "reading" ? readingOf(x) : mode === "char" ? x.char : meaningOf(x)));
    return shuffle([correct, ...distractors], index + 11);
  }, [current, items, index, mode, correct]);

  const isRight = (option: string) =>
    mode === "type" ? matchesHanViet(option, correct) : option === correct;

  function answer(option: string) {
    if (picked) return;
    setPicked(option);
    const ok = isRight(option);
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
  }

  function next() {
    setIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
    setPicked(null);
    setTyped("");
  }

  const modeNames: Record<PracticeMode, string> = {
    meaning: "Chọn Hán Việt & nghĩa",
    reading: "Chọn âm On / Kun",
    char: "Chọn chữ Kanji",
    type: "Gõ Hán Việt",
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--primary)]">漢 · LUYỆN TẬP KANJI</p>
          <h1 className="mt-1 text-3xl font-bold text-[var(--foreground)]">{modeNames[mode]}</h1>
        </div>
        <span className="text-sm text-[var(--muted-foreground)]">
          Đúng {score.right} · Sai {score.wrong}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSourceMode("srs")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sourceMode === "srs" ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}
        >
          Ưu tiên SRS {srsCount > 0 ? `(${srsCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setSourceMode("free")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sourceMode === "free" ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}
        >
          Luyện tự do N5–N1
        </button>
        <div className="ml-auto flex items-center gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${level === lv ? "bg-[var(--foreground)] text-[var(--background)]" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(modeNames) as PracticeMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setPicked(null);
              setTyped("");
            }}
            className={`rounded-full px-3 py-2 text-xs font-semibold ${mode === key ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}
          >
            {modeNames[key]}
          </button>
        ))}
      </div>

      {loading && <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {error && <p className="mt-8 rounded-xl border border-red-200 p-4 text-sm text-red-600">Không tải được câu hỏi Kanji.</p>}
      {!loading && !error && current && (
        <article className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--background-1)] p-6 sm:p-10">
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>{current.level || level}</span>
            <span>
              {index + 1} / {items.length}
            </span>
          </div>
          <h2 className="mt-8 text-center text-5xl font-bold text-[var(--foreground)]">{prompt}</h2>

          {mode === "type" ? (
            <form
              className="mt-8 flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) answer(typed);
              }}
            >
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Nhập âm Hán Việt..."
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm uppercase placeholder:normal-case"
                disabled={!!picked}
              />
              <button
                type="submit"
                disabled={!!picked || !typed.trim()}
                className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Kiểm tra
              </button>
            </form>
          ) : (
            <div className="mt-8 grid gap-3">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => answer(option)}
                  className={`rounded-xl border p-4 text-left text-sm transition ${
                    picked === option
                      ? option === correct
                        ? "border-green-500 bg-green-50 text-green-800"
                        : "border-red-500 bg-red-50 text-red-800"
                      : picked && option === correct
                        ? "border-green-500 bg-green-50 text-green-800"
                        : "border-[var(--border)] hover:border-[var(--primary)]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {picked && (
            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {isRight(picked) ? "✓ Chính xác" : `Đáp án: ${correct}`}
              </p>
              <button type="button" onClick={next} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white">
                Câu tiếp theo →
              </button>
            </div>
          )}
        </article>
      )}
    </main>
  );
}
