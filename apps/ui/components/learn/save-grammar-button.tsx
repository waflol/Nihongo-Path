"use client";

import { useState } from "react";

export function SaveGrammarButton({ grammarId }: { grammarId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  async function save() {
    setState("saving");
    try {
      const response = await fetch(`/api/flashcards/save-grammar/${encodeURIComponent(grammarId)}`, { method: "POST" });
      if (!response.ok) throw new Error("save");
      setState("saved");
    } catch { setState("error"); }
  }
  return <div className="mt-8 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void save()} disabled={state === "saving" || state === "saved"} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{state === "saving" ? "Đang lưu…" : state === "saved" ? "✓ Đã lưu vào bộ thẻ" : state === "error" ? "Thử lại" : "Lưu vào bộ thẻ"}</button>{state === "saved" && <a href="/learn/grammar/study" className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]">Học ngay</a>}</div>;
}
