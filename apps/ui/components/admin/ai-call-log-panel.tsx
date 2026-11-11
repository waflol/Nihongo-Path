"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import { useCallback, useEffect, useState } from "react";

interface LogRow {
  _id: string;
  purpose: "example" | "test" | "vocab" | "ocr" | "translate" | "grammar" | "pronounce" | "verify";
  serviceId: string;
  serviceLabel: string;
  provider: string;
  modelName: string;
  endpoint: string;
  words: string[];
  ok: boolean;
  status: number;
  ms: number;
  createdAt: string;
  request?: string;
  response?: string;
}

interface ServiceOpt {
  id: string;
  label: string;
}

const PAGE_SIZE = 25;
const field =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";
const btn =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60";

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

/**
 * "Lịch sử gọi AI" — every request sent to an AI service (to write/translate
 * example sentences, or an admin test) with the model's answer or error.
 * Keys are never part of the log. Entries expire after 30 days.
 */
export function AiCallLogPanel() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [serviceId, setServiceId] = useState("");
  const [ok, setOk] = useState("");
  const [purpose, setPurpose] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch("/api/flashcards/admin/ai/services", { cache: "no-store" }).catch(() => null);
      const list = (await res?.json().catch(() => null)) as ServiceOpt[] | null;
      if (!off && Array.isArray(list)) setServices(list.map((s) => ({ id: s.id, label: s.label })));
    })();
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (serviceId) params.set("serviceId", serviceId);
      if (ok) params.set("ok", ok);
      if (purpose) params.set("purpose", purpose);
      if (q) params.set("q", q);
      const res = await fetch(`/api/flashcards/admin/ai/logs?${params}`, { cache: "no-store" }).catch(() => null);
      if (off) return;
      setLoading(false);
      if (!res?.ok) {
        setError("Không tải được lịch sử gọi AI");
        return;
      }
      setError(null);
      const data = (await res.json().catch(() => null)) as { items: LogRow[]; total: number } | null;
      setRows(data?.items ?? []);
      setTotal(data?.total ?? 0);
    })();
    return () => {
      off = true;
    };
  }, [page, serviceId, ok, purpose, q, version]);

  async function toggle(id: string) {
    if (open === id) {
      setOpen(null);
      setDetail(null);
      return;
    }
    setOpen(id);
    setDetail(null);
    const res = await fetch(`/api/flashcards/admin/ai/logs/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setDetail((await res.json().catch(() => null)) as LogRow | null);
  }

  async function clearAll() {
    if (!(await confirm({ title: "Xoá lịch sử gọi AI?", message: "Toàn bộ lịch sử sẽ bị xoá. Không thể hoàn tác.", confirmLabel: "Xoá" }))) return;
    const res = await fetch("/api/flashcards/admin/ai/logs", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError("Không xoá được lịch sử");
      return;
    }
    setOpen(null);
    setPage(1);
    reload();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filter = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setPage(1);
  };

  return (
    <section className="px-4 pb-10 sm:px-6" aria-labelledby="ai-log-title">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ai-log-title" className="text-lg font-semibold text-[var(--foreground)]">
          Lịch sử gọi AI
        </h2>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={reload}>
            ↻ Làm mới
          </button>
          <button
            type="button"
            className={btn + " !border-[var(--destructive)] !text-[var(--destructive)]"}
            onClick={() => void clearAll()}
          >
            Xoá lịch sử
          </button>
        </div>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
        Mỗi lần hệ thống gửi yêu cầu tạo ví dụ cho từ vựng tới một dịch vụ AI: gửi tới ai, nội dung gửi đi và phản hồi nhận
        về. Khoá API không bao giờ được ghi. Lịch sử tự xoá sau 30 ngày.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={serviceId} onChange={filter(setServiceId)} className={field} aria-label="Dịch vụ">
          <option value="">Mọi dịch vụ</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={ok} onChange={filter(setOk)} className={field} aria-label="Kết quả">
          <option value="">Mọi kết quả</option>
          <option value="1">Thành công</option>
          <option value="0">Lỗi</option>
        </select>
        <select value={purpose} onChange={filter(setPurpose)} className={field} aria-label="Mục đích">
          <option value="">Mọi mục đích</option>
          <option value="example">Tạo ví dụ</option>
          <option value="verify">Kiểm tra từ vựng</option>
          <option value="ocr">Đọc từ vựng từ file PDF</option>
          <option value="translate">Dịch</option>
          <option value="grammar">Phân tích ngữ pháp</option>
          <option value="pronounce">Cách phát âm</option>
          <option value="test">Kiểm tra / benchmark</option>
        </select>
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Tìm từ hoặc nội dung phản hồi…"
          className={`${field} min-w-52 flex-1`}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-2 font-medium">Thời gian</th>
              <th className="px-3 py-2 font-medium">Gửi tới</th>
              <th className="px-3 py-2 font-medium">Từ / câu</th>
              <th className="px-3 py-2 font-medium">Kết quả</th>
              <th className="px-3 py-2 text-right font-medium">Thời gian (giây)</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--muted-foreground)]">
                  Đang tải…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--muted-foreground)]">
                  Chưa có lịch sử.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <RowGroup key={r._id} r={r} isOpen={open === r._id} detail={open === r._id ? detail : null} onToggle={() => void toggle(r._id)} />
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Phân trang">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </button>
          <span className="text-sm text-[var(--muted-foreground)]">
            Trang {page}/{pages} · {total} lượt
          </span>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Sau →
          </button>
        </nav>
      )}
    </section>
  );
}

function RowGroup({
  r,
  isOpen,
  detail,
  onToggle,
}: {
  r: LogRow;
  isOpen: boolean;
  detail: LogRow | null;
  onToggle: () => void;
}) {
  const shown = r.words.slice(0, 3).join("、");
  const more = r.words.length > 3 ? ` +${r.words.length - 3}` : "";
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--layer-hover)]"
        aria-expanded={isOpen}
      >
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted-foreground)]">{fmtTime(r.createdAt)}</td>
        <td className="px-3 py-2">
          <div className="font-medium text-[var(--foreground)]">{r.serviceLabel || r.provider}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {r.purpose === "vocab" ? "" : r.modelName}
            {r.purpose === "ocr" ? " · đọc từ vựng từ PDF" : ""}
            {r.purpose === "translate" ? " · dịch" : ""}
            {r.purpose === "grammar" ? " · phân tích ngữ pháp" : ""}
            {r.purpose === "pronounce" ? " · cách phát âm" : ""}
            {r.purpose === "verify" ? " · kiểm tra từ vựng" : ""}
            {r.purpose === "test" ? " · kiểm tra" : ""}
            {r.purpose === "vocab" ? "tạo ví dụ cho từ vựng" : ""}
          </div>
        </td>
        <td lang="ja" className="max-w-64 truncate px-3 py-2 text-[var(--foreground)]" title={r.words.join("、")}>
          {shown}
          {more && <span className="text-[var(--muted-foreground)]">{more}</span>}
        </td>
        <td className="px-3 py-2">
          <span
            className={
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium " +
              (r.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400")
            }
          >
            <span aria-hidden className={"size-1.5 rounded-full " + (r.ok ? "bg-emerald-500" : "bg-red-500")} />
            {r.ok ? "Thành công" : `Lỗi${r.status ? ` ${r.status}` : ""}`}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums text-[var(--foreground)]">
          {(r.ms / 1000).toFixed(1)}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[var(--border)] bg-[var(--background)]">
          <td colSpan={5} className="px-3 py-3">
            {!detail ? (
              <p className="text-sm text-[var(--muted-foreground)]">Đang tải chi tiết…</p>
            ) : (
              <div className="space-y-3">
                <p className="break-all text-xs text-[var(--muted-foreground)]">
                  {detail.purpose === "vocab" ? "Hoạt động tạo ví dụ" : detail.purpose === "ocr" ? `Đọc từ vựng từ trang PDF · ${detail.modelName}` : `POST ${detail.endpoint || "—"} · ${detail.provider}`}
                </p>
                <div>
                  <h3 className="text-xs font-semibold text-[var(--foreground)]">Yêu cầu gửi đi</h3>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--layer)] p-3 text-xs text-[var(--foreground)]">
                    {detail.request}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[var(--foreground)]">
                    {detail.ok ? "Phản hồi" : "Lỗi trả về"}
                  </h3>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--layer)] p-3 text-xs text-[var(--foreground)]">
                    {detail.response}
                  </pre>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
