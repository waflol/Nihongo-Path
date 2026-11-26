"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Grammar = { _id: string; label: string; meaning: string; level?: string; structure?: string; pattern?: string; forms?: string[]; examples?: { sentence: string; translation: string }[] };
type Page = { items: Grammar[]; total: number };

function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

type PracticeMode = "meaning" | "structure" | "sentence" | "fill";

export function GrammarPractice() {
  const [items, setItems] = useState<Grammar[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [mode, setMode] = useState<PracticeMode>("meaning");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/grammar?limit=100&level=N5")
      .then((r) => r.ok ? r.json() as Promise<Page> : Promise.reject())
      .then((page) => { setItems(page.items); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const current = items[index];
  const prompt = mode === "sentence" ? (current?.examples?.[0]?.sentence ?? current?.label ?? "") : mode === "structure" ? (current?.meaning ?? "") : current?.label ?? "";
  const correct = mode === "structure" ? (current?.forms?.[0] ?? current?.structure ?? "") : mode === "sentence" ? (current?.label ?? "") : current?.meaning ?? "";
  const options = useMemo(() => {
    if (!current) return [];
    const values = items.filter((x) => x._id !== current._id).slice(0, 3).map((x) => mode === "structure" ? (x.forms?.[0] ?? x.structure ?? x.label) : mode === "sentence" ? x.label : x.meaning);
    return shuffle([correct, ...values], index + 7);
  }, [current, items, index, mode, correct]);
  function answer(option: string) {
    if (picked) return;
    setPicked(option);
    setScore((s) => ({ right: s.right + (option === correct ? 1 : 0), wrong: s.wrong + (option === correct ? 0 : 1) }));
  }
  function next() { setIndex((i) => (i + 1) % items.length); setPicked(null); }

  const modeNames: Record<PracticeMode, string> = { meaning: "Chọn nghĩa", structure: "Chọn cấu trúc", sentence: "Chọn mẫu phù hợp", fill: "Điền mẫu" };
  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"><Link href="/learn/grammar" className="text-sm text-[var(--primary)]">← Ngữ pháp</Link><div className="mt-5 flex items-center justify-between"><div><p className="text-sm font-medium text-[var(--primary)]">文法 · LUYỆN TẬP</p><h1 className="mt-1 text-3xl font-bold text-[var(--foreground)]">{modeNames[mode]}</h1></div><span className="text-sm text-[var(--muted-foreground)]">Đúng {score.right} · Sai {score.wrong}</span></div><div className="mt-5 flex flex-wrap gap-2">{(Object.keys(modeNames) as PracticeMode[]).map((key) => <button key={key} type="button" onClick={() => { setMode(key); setPicked(null); }} className={`rounded-full px-3 py-2 text-xs font-semibold ${mode === key ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}>{modeNames[key]}</button>)}</div>{loading && <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}{error && <p className="mt-8 rounded-xl border border-red-200 p-4 text-sm text-red-600">Không tải được câu hỏi.</p>}{!loading && !error && current && <article className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--background-1)] p-6 sm:p-10"><div className="flex justify-between text-xs text-[var(--muted-foreground)]"><span>{current.level}</span><span>{index + 1} / {items.length}</span></div><h2 className="mt-10 text-center text-3xl font-bold text-[var(--foreground)]">{prompt}</h2>{mode === "fill" ? <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">Chọn mẫu phù hợp để hoàn thành câu.</p> : null}<div className="mt-10 grid gap-3">{options.map((option) => <button key={option} type="button" onClick={() => answer(option)} className={`rounded-xl border p-4 text-left text-sm transition ${picked === option ? option === correct ? "border-green-500 bg-green-50 text-green-800" : "border-red-500 bg-red-50 text-red-800" : picked && option === correct ? "border-green-500 bg-green-50 text-green-800" : "border-[var(--border)] hover:border-[var(--primary)]"}`}>{option}</button>)}</div>{picked && <div className="mt-6 flex items-center justify-between gap-3"><p className="text-sm font-medium">{picked === correct ? "✓ Chính xác" : `Đáp án: ${correct}`}</p><button type="button" onClick={next} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white">Câu tiếp theo →</button></div>}</article>}</main>;
}
