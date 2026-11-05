"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import { useCallback, useEffect, useState } from "react";

interface Status {
  configured: boolean;
  connected: boolean;
  target: string;
  version?: string;
  usedMemory?: string;
  keys?: number;
  uptimeSeconds?: number;
  error?: string;
}
interface KeyInfo {
  key: string;
  type: string;
  ttl: number;
  size: number;
  state: "running" | "waiting" | "done" | "other";
  label?: string;
}
interface Summary {
  running: number;
  waiting: number;
  done: number;
}
interface KeyDetail extends KeyInfo {
  value: string;
  truncated: boolean;
}
interface Task {
  id: string;
  serviceId: string;
  service: string;
  model: string;
  kind: string;
  words: string[];
  items: number;
  startedAt: string;
}

const API = "/api/admin/redis";

const STATE: Record<KeyInfo["state"], { text: string; cls: string }> = {
  running: { text: "Đang chạy", cls: "bg-[#eff6ff] text-[#1d4ed8] dark:bg-[#12233f] dark:text-[#93c5fd]" },
  waiting: { text: "Đang đợi", cls: "bg-[#fef9c3] text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]" },
  done: { text: "Đã xử lý xong", cls: "bg-[#f0fdf4] text-[#15803d] dark:bg-[#10281a] dark:text-[#86efac]" },
  other: { text: "Khác", cls: "bg-[var(--layer)] text-[var(--muted-foreground)]" },
};

const FILTERS: { id: keyof Summary | "all"; text: string; match: string; hint: string }[] = [
  { id: "all", text: "Tất cả", match: "np:*", hint: "Mọi key của ứng dụng" },
  { id: "running", text: "Đang chạy", match: "np:ai:task:*", hint: "Lượt gọi AI đang được gửi đi" },
  { id: "waiting", text: "Đang đợi", match: "np:ai:queue", hint: "Thẻ xếp hàng chờ tới lượt" },
  { id: "done", text: "Đã xử lý xong", match: "np:ai:res:*", hint: "Kết quả AI đã lưu, lần sau không hỏi lại" },
];
const field =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";
const btn =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60";
const danger =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--destructive)] px-3 text-xs font-semibold text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60 dark:hover:bg-[#2a1215]";

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; message?: string }> {
  const res = await fetch(`${API}${path}`, { cache: "no-store", ...init }).catch(() => null);
  if (!res) return { ok: false, data: null, message: "Không kết nối được API" };
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  return { ok: res.ok, data, message: res.ok ? undefined : (data?.message ?? `Lỗi ${res.status}`) };
}

function fmtTtl(s: number) {
  if (s < 0) return "∞";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}p`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}g`;
  return `${(s / 86400).toFixed(1)}n`;
}

function fmtUp(s?: number) {
  if (!s) return "—";
  return s < 3600 ? `${Math.floor(s / 60)} phút` : s < 86400 ? `${(s / 3600).toFixed(1)} giờ` : `${(s / 86400).toFixed(1)} ngày`;
}

/** Admin Redis manager: connection status, running tasks, key browser, clearing. */
export function RedisConsole() {
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [cursor, setCursor] = useState("0");
  const [more, setMore] = useState(false);
  const [match, setMatch] = useState("np:*");
  const [matchInput, setMatchInput] = useState("np:*");
  const [word, setWord] = useState("");
  const [autoAll, setAutoAll] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<KeyDetail | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const r = await api<Status>("/status");
    if (r.data && r.ok) setStatus(r.data);
    else setMessage({ kind: "err", text: r.message ?? "Không tải được trạng thái" });
    return r.data;
  }, []);

  const loadTasks = useCallback(async () => {
    const r = await api<Task[]>("/tasks");
    if (r.ok && Array.isArray(r.data)) setTasks(r.data);
    else setTasks([]);
  }, []);

  const loadSummary = useCallback(async () => {
    const r = await api<Summary>("/summary");
    if (r.ok && r.data) setSummary(r.data);
  }, []);

  const scan = useCallback(
    async (from: string, reset: boolean) => {
      setScanning(true);
      setLoadingMore(!reset);
      const r = await api<{ cursor: string; keys: KeyInfo[] }>(
        `/keys?match=${encodeURIComponent(match)}&cursor=${from}&count=200`,
      );
      setScanning(false);
      setLoadingMore(false);
      if (!r.ok || !r.data) {
        setMessage({ kind: "err", text: r.message ?? "Không quét được key" });
        return;
      }
      const d = r.data;
      setKeys((prev) => (reset ? d.keys : [...prev, ...d.keys]));
      setCursor(d.cursor);
      setMore(d.cursor !== "0");
    },
    [match],
  );

  const refreshAll = useCallback(async () => {
    const s = await loadStatus();
    if (s?.connected) {
      await Promise.all([loadTasks(), loadSummary(), scan("0", true)]);
    }
  }, [loadStatus, loadTasks, loadSummary, scan]);

  useEffect(() => {
    const t = window.setTimeout(() => void refreshAll(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // A word search keeps scanning until the whole keyspace is covered (SCAN+MATCH
  // returns only a few hits per step, so one page would often look empty).
  useEffect(() => {
    if (autoAll && more && !scanning) void scan(cursor, false);
  }, [autoAll, more, scanning, cursor, scan]);

  // Running tasks refresh every 3 s while the tab is visible.
  useEffect(() => {
    if (!status?.connected) return;
    const t = window.setInterval(() => {
      if (!document.hidden) {
        void loadTasks();
        void loadSummary();
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [status?.connected, loadTasks, loadSummary]);

  async function open(key: string) {
    // Keep the old value on screen (no layout jump); a spinner shows while loading.
    setOpening(key);
    const r = await api<KeyDetail>(`/key?key=${encodeURIComponent(key)}`);
    setOpening((cur) => (cur === key ? null : cur));
    if (r.ok && r.data) setDetail(r.data);
    else setMessage({ kind: "err", text: r.message ?? "Không đọc được key" });
  }

  async function removeKey(key: string) {
    if (!(await confirm({ title: "Xoá key?", message: `Key "${key}" sẽ bị xoá. Không thể hoàn tác.`, confirmLabel: "Xoá" }))) return;
    const r = await api(`/key?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!r.ok) return setMessage({ kind: "err", text: r.message ?? "Xoá thất bại" });
    setMessage({ kind: "ok", text: `Đã xoá ${key}` });
    if (detail?.key === key) setDetail(null);
    await refreshAll();
  }

  async function removePattern() {
    const m = match.trim();
    if (!m || m === "*") return;
    if (!(await confirm({ title: "Xoá nhiều key?", message: `Mọi key khớp "${m}" sẽ bị xoá. Không thể hoàn tác.`, confirmLabel: "Xoá tất cả" }))) return;
    setBusy(true);
    const r = await api<{ deleted: number }>("/delete-pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: m }),
    });
    setBusy(false);
    if (!r.ok) return setMessage({ kind: "err", text: r.message ?? "Xoá thất bại" });
    setMessage({ kind: "ok", text: `Đã xoá ${r.data?.deleted ?? 0} key khớp ${m}` });
    setDetail(null);
    await refreshAll();
  }

  async function flush() {
    if (!(await confirm({ title: "Làm trống Redis?", message: "Toàn bộ dữ liệu trong Redis sẽ bị xoá.", confirmLabel: "Làm trống" }))) { setConfirmText(""); return; }
    setBusy(true);
    const r = await api("/flush", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "FLUSHDB" }),
    });
    setBusy(false);
    setConfirmText("");
    if (!r.ok) return setMessage({ kind: "err", text: r.message ?? "Không làm trống được Redis" });
    setMessage({ kind: "ok", text: "Đã làm trống Redis" });
    setDetail(null);
    await refreshAll();
  }

  const connected = status?.connected === true;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Quản lý Redis</h1>
        <button type="button" className={btn} onClick={() => void refreshAll()}>
          ↻ Làm mới
        </button>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
        Redis giữ kết quả AI đã tạo (để không hỏi lại) và các tác vụ AI đang chạy. Dữ liệu ở đây chỉ là bộ nhớ đệm: xoá
        đi thì hệ thống tự dựng lại từ cơ sở dữ liệu, không mất thẻ hay ví dụ đã lưu.
      </p>

      {message && (
        <p
          role={message.kind === "err" ? "alert" : "status"}
          className={
            "mt-4 rounded-lg px-4 py-3 text-sm " +
            (message.kind === "err" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#f0fdf4] text-[#15803d]")
          }
        >
          {message.text}
        </p>
      )}

      {/* Status */}
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
        {!status ? (
          <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>
        ) : !status.configured ? (
          <p className="text-sm text-[var(--foreground)]">
            Chưa cấu hình Redis. Đặt <code className="rounded bg-[var(--layer)] px-1">REDIS_URL</code> trong{" "}
            <code className="rounded bg-[var(--layer)] px-1">apps/api/.env</code> (vd.{" "}
            <code className="rounded bg-[var(--layer)] px-1">redis://localhost:6379</code>) rồi khởi động lại API. Khi chưa
            có Redis, hệ thống vẫn chạy bình thường bằng bộ nhớ trong và cơ sở dữ liệu.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                (connected ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fef2f2] text-[#b91c1c]")
              }
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-current" />
              {connected ? "Đã kết nối" : "Mất kết nối"}
            </span>
            <span className="text-[var(--muted-foreground)]">{status.target}</span>
            {connected && (
              <>
                <span>Phiên bản <b>{status.version ?? "—"}</b></span>
                <span>Bộ nhớ <b>{status.usedMemory ?? "—"}</b></span>
                <span>Số key <b className="tabular-nums">{status.keys ?? 0}</b></span>
                <span>Chạy được <b>{fmtUp(status.uptimeSeconds)}</b></span>
              </>
            )}
            {!connected && status.error && <span className="text-[#b91c1c]">{status.error}</span>}
          </div>
        )}
      </section>

      {connected && (
        <>
          {/* Running tasks */}
          <section className="mt-6" aria-labelledby="redis-tasks">
            <h2 id="redis-tasks" className="text-lg font-semibold text-[var(--foreground)]">
              Tác vụ đang chạy <span className="text-sm font-normal text-[var(--muted-foreground)]">({tasks.length})</span>
            </h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-[var(--muted-foreground)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 font-medium">Dịch vụ</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium">Từ</th>
                    <th className="px-3 py-2 text-right font-medium">Số thẻ</th>
                    <th className="px-3 py-2 font-medium">Bắt đầu</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-5 text-center text-[var(--muted-foreground)]">
                        Không có tác vụ nào đang chạy.
                      </td>
                    </tr>
                  )}
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-medium text-[var(--foreground)]">
                          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-[#2563eb]" />
                          {t.service}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">{t.model}</div>
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">{t.kind === "translate" ? "Dịch" : "Tạo ví dụ"}</td>
                      <td lang="ja" className="max-w-56 truncate px-3 py-2" title={t.words.join("、")}>
                        {t.words.slice(0, 4).join("、")}
                        {t.words.length > 4 ? ` +${t.words.length - 4}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.items}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted-foreground)]">
                        {new Date(t.startedAt).toLocaleTimeString("vi-VN", { hour12: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Keys */}
          <section className="mt-8" aria-labelledby="redis-keys">
            <h2 id="redis-keys" className="text-lg font-semibold text-[var(--foreground)]">
              Key
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Lọc theo trạng thái">
              {FILTERS.map((f) => {
                const active = match === f.match;
                const count = f.id === "all" ? status?.keys : summary?.[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    title={f.hint}
                    aria-pressed={active}
                    onClick={() => {
                      setMatchInput(f.match);
                      setMatch(f.match);
                    }}
                    className={
                      "rounded-xl border p-3 text-left transition-colors " +
                      (active
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                        : "border-[var(--border)] bg-[var(--background-1)] hover:bg-[var(--layer-hover)]")
                    }
                  >
                    <span className="block text-xs text-[var(--muted-foreground)]">{f.text}</span>
                    <span className="block text-xl font-semibold tabular-nums text-[var(--foreground)]">{count ?? "—"}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted-foreground)]">{f.hint}</span>
                  </button>
                );
              })}
            </div>
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const w = word.trim().replace(/[\s:*?[\]\\]+/g, "_");
                if (!w) {
                  setAutoAll(false);
                  setMatchInput("np:*");
                  setMatch("np:*");
                  return;
                }
                const m = `np:ai:res:*${w}*`;
                setAutoAll(true);
                setMatchInput(m);
                setMatch(m);
              }}
            >
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Tìm theo từ vựng, vd. 犬"
                aria-label="Tìm theo từ vựng"
                className={`${field} min-w-56 flex-1`}
              />
              <button type="submit" className={btn}>
                Tìm từ
              </button>
            </form>
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                // Plain text (e.g. a kanji like 犬) has no glob characters: search
                // it anywhere in the key, since keys embed the word (`np:ai:res:犬:…`).
                const q = matchInput.trim();
                const m = !q ? "*" : /[*?[\]]/.test(q) ? q : `*${q}*`;
                setAutoAll(false);
                setMatchInput(m);
                setMatch(m);
              }}
            >
              <input
                value={matchInput}
                onChange={(e) => setMatchInput(e.target.value)}
                placeholder="Mẫu hoặc kanji, vd. 犬 hay np:ai:res:*"
                aria-label="Mẫu key"
                className={`${field} min-w-56 flex-1 font-mono`}
              />
              <button type="submit" className={btn}>
                Tìm
              </button>
              <button type="button" className={danger} disabled={busy || match.trim() === "*" || match.trim() === ""} onClick={() => void removePattern()}>
                Xoá các key khớp
              </button>
            </form>

            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="relative min-h-[30rem] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
                {scanning && !loadingMore ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span role="status" aria-label="Đang tải" className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--foreground)]" />
                  </div>
                ) : (
                <ul className="max-h-[28rem] min-h-[28rem] divide-y divide-[var(--border)] overflow-y-auto">
                  {keys.length === 0 && (
                    <li className="px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">Không có key nào khớp.</li>
                  )}
                  {keys.map((k) => (
                    <li
                      key={k.key}
                      className={"flex items-center gap-2 px-3 py-2 text-sm " + ((opening ?? detail?.key) === k.key ? "bg-[var(--layer-hover)]" : "")}
                    >
                      <button type="button" onClick={() => void open(k.key)} className="min-w-0 flex-1 text-left" title={k.key}>
                        <span className="flex items-center gap-2">
                          <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + STATE[k.state].cls}>
                            {STATE[k.state].text}
                          </span>
                          <span lang="ja" className="truncate text-sm font-medium text-[var(--foreground)]">
                            {k.label ?? k.key}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                          {k.label ? `${k.key} · ` : ""}
                          {k.type} · {k.size} · TTL {fmtTtl(k.ttl)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeKey(k.key)}
                        aria-label={`Xoá ${k.key}`}
                        title="Xoá key"
                        className="shrink-0 rounded-lg border border-[var(--destructive)] px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[#fef2f2] dark:hover:bg-[#2a1215]"
                      >
                        Xoá
                      </button>
                    </li>
                  ))}
                </ul>
                )}
                <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  <span className="inline-flex h-5 items-center gap-2">
                    {scanning && !loadingMore ? "" : `${keys.length} key`}
                  </span>
                  {more && (
                    <button type="button" className={btn} disabled={scanning} onClick={() => void scan(cursor, false)}>
                      Tải thêm
                    </button>
                  )}
                </div>
              </div>

              <div className="relative min-h-[16rem] rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3">
                {opening ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span role="status" aria-label="Đang tải" className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--foreground)]" />
                  </div>
                ) : !detail ? (
                  <p className="p-4 text-center text-sm text-[var(--muted-foreground)]">Chọn một key để xem giá trị.</p>
                ) : (
                  <>
                    <p className="break-all font-mono text-xs text-[var(--foreground)]">{detail.key}</p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {detail.type} · {detail.size} · TTL {fmtTtl(detail.ttl)}
                    </p>
                    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--layer)] p-3 text-xs text-[var(--foreground)]">
                      {detail.value}
                    </pre>
                    {detail.truncated && <p className="mt-1 text-xs text-[var(--muted-foreground)]">Đã cắt bớt phần giá trị quá dài.</p>}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Flush */}
          <section className="mt-8 rounded-2xl border border-[var(--destructive)] p-4" aria-labelledby="redis-flush">
            <h2 id="redis-flush" className="text-base font-semibold text-[var(--destructive)]">
              Làm trống Redis
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Xoá <b>toàn bộ</b> key trong database Redis đang dùng ({status?.keys ?? 0} key). Kết quả AI lưu thêm ở cơ sở dữ
              liệu nên không mất; các tác vụ đang chạy vẫn hoàn tất. Gõ <code className="rounded bg-[var(--layer)] px-1">FLUSHDB</code> để xác nhận.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="FLUSHDB"
                aria-label="Gõ FLUSHDB để xác nhận"
                className={`${field} w-40 font-mono`}
              />
              <button type="button" className={danger} disabled={busy || confirmText !== "FLUSHDB"} onClick={() => void flush()}>
                {busy ? "Đang xoá…" : "Xoá toàn bộ"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
