"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioSrc } from "@/components/learn/exam-types";
import { deskButton, errorOf, questionsOf, type Draft, type DraftAudio } from "./exam-import-draft-model";

interface Asset {
  _id: string;
  fileName: string;
  label?: string;
}

/** `83.5` → `1:23.5`. */
function clock(sec?: number): string {
  if (sec === undefined) return "";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${Number.isInteger(s) ? s : s.toFixed(1)}`;
}

/** `1:23.5` / `83.5` → seconds; `undefined` for an empty field, `NaN` for nonsense. */
function seconds(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const m = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/.exec(t);
  if (!m) return Number.NaN;
  return Number(m[1] ?? 0) * 60 + Number(m[2].replace(",", "."));
}

const field =
  "w-20 rounded-md border border-[var(--sheet-rule)] bg-[var(--sheet)] px-2 py-1 text-sm tabular-nums text-[var(--sheet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]";

/**
 * The recordings of one 聴解 block (NP-407): the block's file — one track for this 問題, or the
 * whole listening part shared by every listening block of the paper — and, per question, its own
 * file or its stretch of the block's file. Saved at once; nothing here is in the editor.
 */
export function DraftAudioPanel({ draft, onChanged }: { draft: Draft; onChanged: () => Promise<void> }) {
  const questions = questionsOf(draft);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wholePart, setWholePart] = useState(false);
  /** The stretch being typed per question (start, end), before it is saved. */
  const [ranges, setRanges] = useState<Record<number, [string, string]>>({});
  const player = useRef<HTMLAudioElement>(null);
  const block = draft.audio ?? null;

  const loadAssets = useCallback(async () => {
    const res = await fetch("/api/exam-audio", { cache: "no-store" }).catch(() => null);
    const list = res?.ok ? ((await res.json().catch(() => [])) as Asset[]) : [];
    setAssets(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void loadAssets(), 0);
    return () => clearTimeout(t);
  }, [loadAssets]);

  const nameOf = (id: string) => {
    const a = assets.find((x) => x._id === id);
    return a ? a.label || a.fileName : "file đã tải";
  };

  async function upload(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("file", file);
    if (draft.level) fd.set("level", draft.level);
    fd.set("label", `${file.name} — 聴解 ${draft.sitting}`);
    const res = await fetch("/api/exam-audio", { method: "POST", body: fd }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: `${file.name}: ${res ? await errorOf(res) : "mất kết nối"}` });
      return null;
    }
    const a = (await res.json()) as Asset;
    void loadAssets();
    return a._id;
  }

  async function save(body: { audio?: DraftAudio | null; questions?: (DraftAudio | null)[]; wholePart?: boolean }, done: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/exam-import?audio=${draft._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: res ? await errorOf(res) : "Không kết nối được máy chủ" });
      return false;
    }
    const r = (await res.json().catch(() => null)) as { applied?: number } | null;
    setMsg({ ok: true, text: r?.applied ? `${done} Đã dùng cho ${r.applied} khối nghe khác của đề.` : done });
    await onChanged();
    return true;
  }

  /** Every question's clip as it is now, with question `i` set to `clip`. */
  const withClip = (i: number, clip: DraftAudio | null) => questions.map((q, k) => (k === i ? clip : (q.audio ?? null)));

  async function setBlock(assetId: string | null) {
    await save(
      assetId ? { audio: { assetId }, wholePart } : { audio: null },
      assetId ? "Đã gắn file cho khối." : "Đã bỏ file của khối.",
    );
  }

  async function setStretch(i: number) {
    if (!block) return;
    const [a, b] = ranges[i] ?? ["", ""];
    const startSec = seconds(a);
    const endSec = seconds(b);
    if (Number.isNaN(startSec) || Number.isNaN(endSec)) {
      setMsg({ ok: false, text: "Thời điểm ghi dạng phút:giây (1:23) hoặc số giây (83)." });
      return;
    }
    const clip: DraftAudio = { assetId: block.assetId };
    if (startSec !== undefined) clip.startSec = startSec;
    if (endSec !== undefined) clip.endSec = endSec;
    if (await save({ questions: withClip(i, clip) }, `Đã lưu đoạn của ${questions[i].prompt}.`)) {
      setRanges((r) => {
        const next = { ...r };
        delete next[i];
        return next;
      });
    }
  }

  const now = () => (player.current ? Math.round(player.current.currentTime * 10) / 10 : 0);
  const setRange = (i: number, which: 0 | 1, v: string) =>
    setRanges((r) => {
      const cur = r[i] ?? [clock(questions[i].audio?.startSec), clock(questions[i].audio?.endSec)];
      const next: [string, string] = [...cur];
      next[which] = v;
      return { ...r, [i]: next };
    });

  return (
    <section aria-label="File nghe" className="rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-4 py-3 text-sm text-[var(--sheet-ink)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">File nghe</h3>
        <p className="text-xs text-[var(--muted-foreground)]">mp3 / m4a / ogg, tối đa 40 MB</p>
      </div>

      <div className="mt-2 space-y-2">
        {block ? (
          <>
            <audio ref={player} controls preload="metadata" src={audioSrc(block)} className="h-9 w-full" />
            <p className="text-xs text-[var(--muted-foreground)]">
              File của khối: <span className="font-medium text-[var(--sheet-ink)]">{nameOf(block.assetId)}</span>. Người học nghe file này phía trên các câu
              của khối; câu nào có đoạn riêng thì nghe đoạn đó.
            </p>
          </>
        ) : (
          <p className="text-[var(--muted-foreground)]">
            Chưa có file. Tải một file cho cả khối (hoặc cả phần nghe của đề), hoặc tải file riêng cho từng câu bên dưới.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${deskButton} cursor-pointer ${busy ? "pointer-events-none opacity-45" : ""}`}>
            {block ? "Đổi file khối" : "Tải file cho khối"}
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg"
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                const id = await upload(f);
                setBusy(false);
                if (id) await setBlock(id);
              }}
            />
          </label>
          {assets.length > 0 && (
            <select
              aria-label="Chọn file đã tải"
              className="max-w-56 rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-2 py-1.5 text-sm"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && void setBlock(e.target.value)}
            >
              <option value="">Chọn file đã tải…</option>
              {assets.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.label || a.fileName}
                </option>
              ))}
            </select>
          )}
          {block && (
            <button type="button" className={deskButton} disabled={busy} onClick={() => void setBlock(null)}>
              Bỏ file khối
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <input type="checkbox" checked={wholePart} onChange={(e) => setWholePart(e.target.checked)} />
            File là cả phần nghe: dùng luôn cho các khối nghe khác của đề chưa có file
          </label>
        </div>
      </div>

      {questions.length > 0 && (
        <details className="mt-3 border-t border-[var(--sheet-rule)] pt-2" open={questions.some((q) => q.audio)}>
          <summary className="cursor-pointer select-none font-medium">Âm thanh từng câu</summary>
          <ul className="mt-2 space-y-2">
            {questions.map((q, i) => {
              const own = q.audio && q.audio.assetId !== block?.assetId;
              const stretch = q.audio && !own;
              const [a, b] = ranges[i] ?? [clock(q.audio?.startSec), clock(q.audio?.endSec)];
              return (
                <li key={q.no} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="exam-ja w-24 shrink-0 font-medium">{q.prompt}</span>
                  <span className="min-w-0 flex-1 basis-40 text-xs text-[var(--muted-foreground)]">
                    {own
                      ? `File riêng: ${nameOf(q.audio!.assetId)}`
                      : stretch
                        ? `Đoạn ${clock(q.audio!.startSec) || "0:00"}–${clock(q.audio!.endSec) || "hết"} của file khối`
                        : block
                          ? "Nghe chung file của khối"
                          : "Chưa có âm thanh"}
                  </span>
                  {q.audio && <audio controls preload="none" src={audioSrc(q.audio)} className="h-8 w-full sm:w-56" />}
                  {block && (
                    <span className="flex items-center gap-1.5">
                      <input aria-label={`${q.prompt}: bắt đầu`} placeholder="từ" className={field} value={a} onChange={(e) => setRange(i, 0, e.target.value)} />
                      <button type="button" className="text-xs text-[var(--primary)] underline" title="Lấy thời điểm đang phát" onClick={() => setRange(i, 0, clock(now()))}>
                        ⏱
                      </button>
                      <input aria-label={`${q.prompt}: kết thúc`} placeholder="đến" className={field} value={b} onChange={(e) => setRange(i, 1, e.target.value)} />
                      <button type="button" className="text-xs text-[var(--primary)] underline" title="Lấy thời điểm đang phát" onClick={() => setRange(i, 1, clock(now()))}>
                        ⏱
                      </button>
                      <button type="button" className={deskButton} disabled={busy || !ranges[i]} onClick={() => void setStretch(i)}>
                        Lưu đoạn
                      </button>
                    </span>
                  )}
                  <label className={`${deskButton} cursor-pointer ${busy ? "pointer-events-none opacity-45" : ""}`}>
                    File riêng
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg"
                      className="sr-only"
                      disabled={busy}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        setBusy(true);
                        const id = await upload(f);
                        setBusy(false);
                        if (id) await save({ questions: withClip(i, { assetId: id }) }, `Đã gắn file riêng cho ${q.prompt}.`);
                      }}
                    />
                  </label>
                  {q.audio && (
                    <button type="button" className={deskButton} disabled={busy} onClick={() => void save({ questions: withClip(i, null) }, `Đã bỏ âm thanh riêng của ${q.prompt}.`)}>
                      Bỏ
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {block && (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Cắt đoạn trên file của khối: phát file ở trên, bấm ⏱ để lấy thời điểm đang phát (hoặc gõ phút:giây), rồi “Lưu đoạn”.
            </p>
          )}
        </details>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
