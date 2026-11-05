"use client";

import { useCallback, useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  providers: string[];
  createdAt: string;
  lastActiveAt: string | null;
  online: boolean;
  activeSessions: number;
}
interface UserPage {
  page: number;
  limit: number;
  total: number;
  items: UserRow[];
}
interface Summary {
  total: number;
  active: number;
  suspended: number;
  admins: number;
  newLast7d: number;
  online: number;
}

const LIMIT = 20;
const field =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)]";
const linkBtn = "text-xs font-semibold hover:underline disabled:opacity-40";

function ago(iso: string | null): string {
  if (!iso) return "chưa từng";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "vừa xong";
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  return `${Math.round(s / 86400)} ngày trước`;
}

/** Admin user management: status/online overview, filters, suspend / role / force-logout. */
export function UsersConsole({ meId, meRole }: { meId: string; meRole: string }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserPage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (q.trim()) params.set("q", q.trim());
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    const [res, sum] = await Promise.all([
      fetch(`/api/admin/users?${params}`, { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/users/summary", { cache: "no-store" }).catch(() => null),
    ]);
    if (res?.ok) {
      setData((await res.json()) as UserPage);
      setError(null);
    } else {
      setError("Không tải được danh sách người dùng.");
    }
    if (sum?.ok) setSummary((await sum.json()) as Summary);
  }, [page, q, role, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function act(u: UserRow, path: string, method: "PATCH" | "POST", body: unknown, done: string) {
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/users/${u.id}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (res?.ok) {
      setNotice(`${done}: ${u.email ?? u.displayName ?? u.id}`);
      await load();
    } else {
      const msg = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(typeof msg?.message === "string" ? msg.message : "Thao tác thất bại.");
    }
    setBusyId(null);
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const cards = [
    { label: "Tổng tài khoản", value: summary?.total },
    { label: "Đang online (≈)", value: summary?.online },
    { label: "Hoạt động", value: summary?.active },
    { label: "Bị khoá", value: summary?.suspended },
    { label: "Quản trị viên", value: summary?.admins },
    { label: "Mới 7 ngày", value: summary?.newLast7d },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Quản lý người dùng</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Xem trạng thái hoạt động, khoá / mở khoá, buộc đăng xuất và phân quyền.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{c.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{c.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          className={field + " min-w-48 flex-1"}
          placeholder="Tìm theo email hoặc tên…"
          aria-label="Tìm người dùng"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select className={field} aria-label="Vai trò" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">Mọi vai trò</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
        </select>
        <select className={field} aria-label="Trạng thái" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="SUSPENDED">Bị khoá</option>
        </select>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-500">{notice}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--background-1)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Người dùng</th>
              <th className="px-3 py-2">Vai trò</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Hoạt động gần nhất</th>
              <th className="px-3 py-2">Phiên</th>
              <th className="px-3 py-2">Tạo lúc</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.items.map((u) => {
              const self = u.id === meId;
              const privileged = u.role !== "USER" && meRole !== "SUPER_ADMIN";
              const locked = self || privileged || busyId === u.id;
              return (
                <tr key={u.id}>
                  <td className="max-w-56 px-3 py-2">
                    <div className="truncate font-medium">{u.displayName ?? u.email ?? u.id}{self && " (bạn)"}</div>
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {u.email ?? "—"}{u.providers.length > 0 && ` · ${u.providers.join(", ")}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{u.role}</td>
                  <td className="px-3 py-2">
                    <span className={"text-xs font-semibold " + (u.status === "ACTIVE" ? "text-emerald-500" : "text-red-500")}>
                      {u.status === "ACTIVE" ? "Hoạt động" : "Bị khoá"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      aria-hidden="true"
                      className={"mr-2 inline-block size-2 rounded-full " + (u.online ? "bg-emerald-500" : "bg-[var(--border)]")}
                    />
                    {u.online ? "Đang online" : ago(u.lastActiveAt)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{u.activeSessions}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted-foreground)]">
                    {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      {u.status === "ACTIVE" ? (
                        <button
                          className={linkBtn + " text-red-500"}
                          disabled={locked}
                          onClick={() => { if (confirm(`Khoá ${u.email ?? u.displayName}? Họ sẽ bị đăng xuất.`)) void act(u, "status", "PATCH", { status: "SUSPENDED" }, "Đã khoá"); }}
                        >
                          Khoá
                        </button>
                      ) : (
                        <button className={linkBtn + " text-emerald-500"} disabled={locked} onClick={() => void act(u, "status", "PATCH", { status: "ACTIVE" }, "Đã mở khoá")}>
                          Mở khoá
                        </button>
                      )}
                      <button
                        className={linkBtn + " text-[var(--primary)]"}
                        disabled={locked || u.activeSessions === 0}
                        onClick={() => void act(u, "revoke-sessions", "POST", null, "Đã buộc đăng xuất")}
                      >
                        Đăng xuất
                      </button>
                      {meRole === "SUPER_ADMIN" && u.role !== "SUPER_ADMIN" && (
                        <button
                          className={linkBtn + " text-[var(--primary)]"}
                          disabled={locked}
                          onClick={() => void act(u, "role", "PATCH", { role: u.role === "ADMIN" ? "USER" : "ADMIN" }, u.role === "ADMIN" ? "Đã thu hồi admin" : "Đã cấp admin")}
                        >
                          {u.role === "ADMIN" ? "Thu hồi admin" : "Cấp admin"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">Không có người dùng phù hợp.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{data ? `${total} tài khoản` : ""}</span>
        <div className="flex items-center gap-2">
          <button className={field} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
          <span className="tabular-nums">{page} / {pages}</span>
          <button className={field} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">
        “Online” là ước lượng: tài khoản vừa làm mới phiên đăng nhập trong ~20 phút qua. Khoá tài khoản sẽ thu hồi mọi phiên;
        phiên truy cập đang mở có thể còn hiệu lực tối đa vài phút (thời hạn access token). Chỉ SUPER_ADMIN được thao tác trên tài khoản quản trị và cấp/thu hồi quyền admin.
      </p>
    </div>
  );
}
