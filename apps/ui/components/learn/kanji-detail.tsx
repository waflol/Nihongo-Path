"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StrokeOrder } from "./stroke-order";
import { splitHanViet, type KanjiItem } from "./kanji-types";

/** Kunyomi "まな.ぶ" → stem + okurigana highlight. */
function Kun({ value }: { value: string }) {
  const [stem, tail] = value.split(".");
  return (
    <span>
      {stem}
      {tail && <span className="text-[var(--muted-foreground)]">{tail}</span>}
    </span>
  );
}

export function KanjiDetail({ char }: { char: string }) {
  const [k, setK] = useState<KanjiItem | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/kanji/${encodeURIComponent(char)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setK)
      .catch(() => setMissing(true));
  }, [char]);

  if (missing) return <p className="px-4 py-16 text-center text-sm">Không tìm thấy kanji.</p>;
  if (!k) return <p className="px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>;

  const row = (label: string, body: React.ReactNode) => (
    <div className="flex gap-3 border-b border-[var(--border)] py-2 text-sm">
      <div className="w-24 shrink-0 text-[var(--muted-foreground)]">{label}</div>
      <div className="text-[var(--foreground)]">{body}</div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/learn/kanji" className="text-sm text-[var(--muted-foreground)] hover:underline">
        ← Danh sách kanji
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          <div className="text-8xl leading-none text-[var(--foreground)]">{k.char}</div>
          {k.strokes && k.strokes.length > 0 && (
            <div className="mt-4">
              <StrokeOrder strokes={k.strokes} />
            </div>
          )}
        </div>
        <div>
          {row(
            "Hán Việt",
            splitHanViet(k.hanViet).length ? (
              <span className="flex flex-wrap gap-1.5">
                {splitHanViet(k.hanViet).map((hv) => (
                  <b
                    key={hv}
                    className="rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--accent)]"
                  >
                    {hv}
                  </b>
                ))}
              </span>
            ) : (
              "—"
            ),
          )}
          {row("Cấp", k.level || "—")}
          {row("Onyomi", k.onyomi.join("、") || "—")}
          {row("Kunyomi", k.kunyomi.length ? k.kunyomi.map((v, i) => <span key={v}>{i > 0 && "、"}<Kun value={v} /></span>) : "—")}
          {row("Nghĩa", (k.meanings.length ? k.meanings : k.meaningsEn).join(", ") || "—")}
          {row("Số nét", k.strokeCount)}
          {k.mnemonic && (
            <div className="mt-4 rounded-xl bg-[var(--layer-hover)] p-4 text-sm">💡 {k.mnemonic}</div>
          )}
        </div>
      </div>

      {k.words.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Từ vựng liên quan</h2>
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {k.words.map((w) => (
              <li key={w.term} className="flex flex-wrap gap-x-4 px-4 py-2 text-sm">
                <span className="text-lg">{w.term}</span>
                <span className="text-[var(--muted-foreground)]">{w.reading}</span>
                <span>{w.meaning || w.glossEn}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
