"use client";

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  url: string;
  page: string;
  title: string;
  credit: string;
}

const MAX_SIDE = 360;

/** Resize an uploaded image to ≤360px and re-encode as JPEG (small data URL). */
async function fileToSmallDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.fillStyle = "#fff"; // flatten transparency
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Mnemonic picture for a card: upload your own image (resized in the browser)
 * or pick one of the suggestions found for the word on Wikimedia Commons.
 * Suggestions load automatically while the picture is still empty.
 */
export function ImageField({
  term,
  image,
  credit,
  onChange,
}: {
  /** The card's front (Japanese term) — the default search text. */
  term: string;
  image: string;
  credit: string;
  onChange: (image: string, credit: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [queryTouched, setQueryTouched] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const searchText = queryTouched ? query : term.replace(/[（(][^）)]*[）)]/g, "").trim();

  async function search(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/flashcards/image-suggestions?q=${encodeURIComponent(text.trim())}`).catch(
      () => null,
    );
    setLoading(false);
    if (!res?.ok) {
      setItems([]);
      setMessage("Không tìm được ảnh gợi ý lúc này");
      return;
    }
    const list = (await res.json().catch(() => [])) as Suggestion[];
    setItems(list);
    if (list.length === 0) setMessage("Không có ảnh phù hợp — thử từ khoá khác (ví dụ tiếng Anh)");
  }

  // Auto-suggest (debounced) while the card has no picture yet.
  useEffect(() => {
    if (image || queryTouched) return;
    const text = searchText;
    if (!text) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (cancelled) return;
      await search(text);
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, image, queryTouched]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      onChange(await fileToSmallDataUrl(file), "");
    } catch {
      setMessage("Không đọc được ảnh này");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm text-[var(--muted-foreground)]">
        Ảnh liên tưởng (tuỳ chọn)
      </legend>

      {image ? (
        <div className="mt-1 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-1)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-24 w-24 rounded-md object-cover" />
          <div className="min-w-0 flex-1 text-xs text-[var(--muted-foreground)]">
            {credit ? <p className="break-words">Nguồn: {credit}</p> : <p>Ảnh tự tải lên</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onChange("", "")}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              >
                Bỏ ảnh
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-1 rounded-lg border border-dashed border-[var(--border)] p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
            >
              ＋ Tải ảnh lên
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                void search(searchText);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              Gợi ý ảnh
            </button>
            <input
              value={searchText}
              onChange={(e) => {
                setQuery(e.target.value);
                setQueryTouched(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setOpen(true);
                  void search(searchText);
                }
              }}
              aria-label="Từ khoá tìm ảnh"
              placeholder="Từ khoá tìm ảnh"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>

          {loading && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Đang tìm ảnh…</p>}
          {message && !loading && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{message}</p>}
          {items.length > 0 && (open || !queryTouched) && (
            <>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Gợi ý từ Wikimedia Commons — bấm để chọn:
              </p>
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {items.map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    title={s.title}
                    onClick={() => onChange(s.url, s.credit)}
                    className="overflow-hidden rounded-md border border-[var(--border)] hover:ring-2 hover:ring-[var(--primary-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={s.title} loading="lazy" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
