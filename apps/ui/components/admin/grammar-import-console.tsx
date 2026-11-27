"use client";

import { useEffect, useState } from "react";
import { GrammarEditor } from "@/components/admin/grammar-editor";
import { GrammarDetail, JaText, type GrammarDetailData } from "@/components/learn/grammar-detail";
import { GrammarExplorer } from "@/components/learn/grammar-explorer";
import { useConfirm } from "@/components/learn/use-confirm";
import { parseBrowseState, selectGrammar, type BrowseState, type GrammarIndexItem } from "@/lib/grammar-catalog";

type Status = "" | "DRAFT" | "PUBLISHED";
type Preview = { total: number; duplicateKeys: number; levels: Record<string, number> };

const button = "rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50";

async function fetchIndex(): Promise<GrammarIndexItem[] | null> {
  const r = await fetch("/api/admin/content/grammar/browse", { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as GrammarIndexItem[]) : null;
}

export function GrammarImportConsole() {
  const [items, setItems] = useState<GrammarIndexItem[] | null>(null);
  const [state, setState] = useState<BrowseState>(() => parseBrowseState(new URLSearchParams()));
  const [status, setStatus] = useState<Status>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GrammarDetailData | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    let alive = true;
    void fetchIndex().then((data) => {
      if (!alive) return;
      if (data) setItems(data);
      else setMessage("Không tải được danh sách ngữ pháp.");
    });
    return () => {
      alive = false;
    };
  }, []);

  const shown = (items ?? []).filter((i) => !status || i.status === status);
  const listed = selectGrammar(shown, state);

  /** A new filter drops the selection, so nothing hidden gets published. */
  function change(next: BrowseState) {
    setState(next);
    setSelected(new Set());
    setOpenId(null);
    setEditId(null);
  }

  function toggle(ids: string[], on: boolean) {
    setSelected((old) => {
      const next = new Set(old);
      for (const id of ids) if (on) next.add(id);
        else next.delete(id);
      return next;
    });
  }

  async function open(id: string) {
    setEditId(null);
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setDetail(null);
    const r = await fetch(`/api/admin/content/grammar/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setDetail((await r.json()) as GrammarDetailData);
    else setMessage("Không tải được chi tiết.");
  }

  async function setPublication(next: "PUBLISHED" | "DRAFT") {
    const targets = (items ?? []).filter((i) => selected.has(i._id) && i.status !== next);
    if (!targets.length) return setMessage("Các mẫu đã chọn đều ở trạng thái này.");
    const ok = await confirm({
      title: next === "PUBLISHED" ? "Publish ngữ pháp" : "Đưa về bản nháp",
      message: `${targets.length} mẫu sẽ ${next === "PUBLISHED" ? "hiển thị cho người học" : "bị ẩn khỏi người học"}.`,
      confirmLabel: next === "PUBLISHED" ? "Publish" : "Đưa về draft",
      tone: next === "PUBLISHED" ? "primary" : "danger",
    });
    if (!ok) return;
    setBusy(true);
    let done = 0;
    for (const { _id } of targets) {
      const r = await fetch(`/api/admin/content/grammar/${_id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }).catch(() => null);
      if (!r?.ok) break;
      done++;
      setMessage(`Đang cập nhật ${done}/${targets.length}…`);
    }
    const data = await fetchIndex();
    if (data) setItems(data);
    setSelected(new Set());
    setMessage(`Đã cập nhật ${done}/${targets.length} mẫu.${done < targets.length ? " Dừng ở lỗi đầu tiên." : ""}`);
    setBusy(false);
  }

  async function previewSource() {
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/admin/content/grammar/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, version: "manual" }) }).catch(() => null);
    const data = await r?.json().catch(() => null);
    setPreview(r?.ok ? (data as Preview) : null);
    setMessage(r?.ok ? "Preview thành công." : `Preview lỗi (${r?.status ?? "mạng"}).`);
    setBusy(false);
  }

  const published = (items ?? []).filter((i) => i.status === "PUBLISHED").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {dialog}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--primary)]">ADMIN · GRAMMAR</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--foreground)]">Duyệt ngữ pháp</h1>
          {items && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{items.length} mẫu · {published} đã publish · {items.length - published} bản nháp</p>}
        </div>
        <a href="/admin/content" className="text-sm text-[var(--primary)]">← Nội dung</a>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-[var(--foreground)]">
        Trạng thái
        <select value={status} onChange={(e) => { setStatus(e.target.value as Status); setSelected(new Set()); }} className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm">
          <option value="">Tất cả</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="PUBLISHED">Đã publish</option>
        </select>
      </label>

      {message && <p role="status" className="mt-4 rounded-xl bg-[var(--background-1)] p-3 text-sm">{message}</p>}
      {!items && !message && <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}

      {items && (
        <div className="mt-4">
          <GrammarExplorer
            items={shown}
            state={state}
            onChange={change}
            actions={
              <div className="sticky top-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={!listed.length || busy} onClick={() => toggle(listed.map((i) => i._id), true)} className={`${button} border border-[var(--border)]`}>Chọn tất cả {listed.length}</button>
                <button type="button" disabled={!selected.size || busy} onClick={() => setSelected(new Set())} className={`${button} border border-[var(--border)]`}>Bỏ chọn</button>
                <button type="button" disabled={!selected.size || busy} onClick={() => void setPublication("PUBLISHED")} className={`${button} bg-[var(--primary)] text-[var(--primary-foreground)]`}>Publish {selected.size || ""}</button>
                <button type="button" disabled={!selected.size || busy} onClick={() => void setPublication("DRAFT")} className={`${button} border border-[var(--border)]`}>Đưa về draft</button>
              </div>
            }
            sectionAction={(list) => {
              const all = list.every((i) => selected.has(i._id));
              return <button type="button" onClick={() => toggle(list.map((i) => i._id), !all)} className="text-xs font-semibold text-[var(--primary)]">{all ? "Bỏ chọn nhóm" : "Chọn nhóm"}</button>;
            }}
            renderRow={(item) => (
              <div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" aria-label={`Chọn ${item.sourceKey ?? item.label}`} checked={selected.has(item._id)} onChange={(e) => toggle([item._id], e.target.checked)} className="mt-2.5" />
                  <button type="button" aria-expanded={openId === item._id} onClick={() => void open(item._id)} className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="font-semibold leading-loose text-[var(--foreground)] sm:w-1/2">{openId === item._id ? "▾ " : "▸ "}<JaText text={item.label} /></span>
                    <span className="text-sm text-[var(--muted-foreground)] sm:flex-1">{item.meaning}</span>
                  </button>
                  <span className="mt-1.5 shrink-0 text-right text-[11px] text-[var(--muted-foreground)]">
                    <span className={`block rounded-full px-2 py-0.5 font-semibold ${item.status === "PUBLISHED" ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]" : "border border-[var(--border)]"}`}>{item.status === "PUBLISHED" ? "Publish" : "Nháp"}</span>
                    <span className="mt-1 block font-mono">{item.sourceKey}</span>
                  </span>
                </div>
                {openId === item._id && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] p-4">
                    {editId === item._id ? (
                      <GrammarEditor
                        id={item._id}
                        onClose={() => setEditId(null)}
                        onSaved={() => {
                          setEditId(null);
                          setOpenId(null);
                          setMessage(`Đã lưu ${item.sourceKey ?? item.label}.`);
                          void fetchIndex().then((data) => data && setItems(data));
                        }}
                      />
                    ) : detail?._id === item._id ? (
                      <>
                        <button type="button" onClick={() => setEditId(item._id)} className={`${button} mb-4 bg-[var(--primary)] text-[var(--primary-foreground)]`}>Chỉnh sửa</button>
                        <GrammarDetail item={detail} />
                      </>
                    ) : (
                      <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>
                    )}
                  </div>
                )}
              </div>
            )}
          />
        </div>
      )}

      <details className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
        <summary className="cursor-pointer font-semibold">Preview source</summary>
        <textarea value={source} onChange={(e) => setSource(e.target.value)} placeholder="Dán nội dung SB.register({...}) để preview" className="mt-3 min-h-32 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs" />
        <button type="button" disabled={busy || !source.trim()} onClick={() => void previewSource()} className="mt-3 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">Preview</button>
        {preview && <pre className="mt-4 overflow-auto rounded-xl bg-[var(--background)] p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre>}
      </details>
    </main>
  );
}
