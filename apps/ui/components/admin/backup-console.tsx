"use client";

import { useEffect, useState } from "react";

interface Group {
  key: string;
  label: string;
  superOnly: boolean;
  collections: number;
  documents: number;
}

/** Pick data groups and download a gzip'd JSON backup. */
export function BackupConsole() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(["content", "flashcards"]));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/backup", { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? ((await res.json()) as Group[]) : [];
      if (!cancelled) setGroups(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function download() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: [...selected] }),
    }).catch(() => null);
    if (!res?.ok) {
      setMessage({
        ok: false,
        text: res?.status === 403 ? "Chỉ SUPER_ADMIN được sao lưu người dùng và nhật ký." : "Không tạo được bản sao lưu.",
      });
      setBusy(false);
      return;
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "nihongo-backup.json.gz";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: `Đã tải ${name} (${(blob.size / 1024).toFixed(0)} KB).` });
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Sao lưu dữ liệu</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Chọn nhóm dữ liệu rồi tải về một file <code>.json.gz</code> (Extended JSON, nén gzip). Mỗi lần tải được ghi vào “Thao tác admin”.
      </p>

      <ul className="mt-6 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
        {groups?.map((g) => (
          <li key={g.key}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(g.key)}
                onChange={() => toggle(g.key)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--foreground)]">{g.label}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {g.documents.toLocaleString("vi-VN")} bản ghi · {g.collections} collection
                  {g.superOnly && " · chỉ SUPER_ADMIN"}
                </span>
              </span>
            </label>
          </li>
        ))}
        {groups && groups.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">Không tải được danh sách (cần MongoDB).</li>
        )}
      </ul>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => void download()}
          disabled={busy || selected.size === 0}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground,#fff)] disabled:opacity-50"
        >
          {busy ? "Đang tạo bản sao lưu…" : "Tải bản sao lưu"}
        </button>
        {message && (
          <p role="status" className={"text-sm " + (message.ok ? "text-emerald-500" : "text-red-500")}>
            {message.text}
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--muted-foreground)]">
        Không gồm mật khẩu và phiên đăng nhập. File chứa dữ liệu cá nhân (nếu chọn Người dùng) — hãy lưu ở nơi an toàn.
        Hiện chưa có chức năng khôi phục tự động; file giải nén bằng <code>gunzip</code> và nạp lại được bằng công cụ hỗ trợ EJSON.
      </p>
    </div>
  );
}
