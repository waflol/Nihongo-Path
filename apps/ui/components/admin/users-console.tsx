"use client";

import { useConfirm } from "@/components/learn/use-confirm";
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
const actBtn =
  "rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--background-2,var(--border))] disabled:cursor-not-allowed disabled:opacity-40";
const menuItem =
  "block w-full px-3.5 py-2 text-left text-sm transition-colors hover:bg-[var(--border)]/50 disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn =
  "rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-semibold text-[var(--primary-foreground,#fff)] transition-opacity hover:opacity-90 disabled:opacity-50";
const ROLE_BADGE: Record<string, string> = {
  USER: "bg-[var(--border)]/60 text-[var(--muted-foreground)]",
  ADMIN: "bg-sky-500/15 text-sky-500",
  SUPER_ADMIN: "bg-violet-500/15 text-violet-500",
};

const ALPHA = "abcdefghjkmnpqrstuvwxyz";
const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function randomString(chars: string, len: number): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
/** Suggested admin credentials; the admin can edit before confirming. */
function suggestCredentials() {
  return {
    email: `admin.${randomString(ALPHA, 6)}@nihongopath.local`,
    password: randomString(PW_CHARS, 14),
  };
}

function StatusIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {active ? (
        <>
          <circle cx="8" cy="8" r="6.2" />
          <path d="m5.2 8.2 2 2 3.6-4" />
        </>
      ) : (
        <>
          <rect x="3.2" y="7" width="9.6" height="6.8" rx="1.6" />
          <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
        </>
      )}
    </svg>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/15 text-sm font-semibold uppercase text-[var(--primary)]"
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

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
  const { confirm, dialog } = useConfirm();
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

  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [copied, setCopied] = useState(false);
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [menuId]);

  function openCreate() {
    const s = suggestCredentials();
    setNewEmail(s.email);
    setNewPass(s.password);
    setCopied(false);
    setShowCreate(true);
  }

  async function copyCreds() {
    try {
      await navigator.clipboard.writeText(`Email: ${newEmail}\nMật khẩu: ${newPass}`);
      setCopied(true);
    } catch {
      setError("Không sao chép được — hãy chép thủ công.");
    }
  }

  async function createAdmin() {
    setError(null);
    setNotice(null);
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), password: newPass }),
    }).catch(() => null);
    if (res?.ok) {
      setNotice(`Đã tạo admin: ${newEmail.trim()}`);
      setNewEmail("");
      setNewPass("");
      setShowCreate(false);
      await load();
    } else {
      const msg = (await res?.json().catch(() => null)) as { message?: string | string[] } | null;
      const m = Array.isArray(msg?.message) ? msg?.message.join(", ") : msg?.message;
      setError(m ?? "Tạo admin thất bại.");
    }
    setSaving(false);
  }

  async function resetPassword() {
    const u = pwTarget;
    if (!u) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/users/${u.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwValue }),
    }).catch(() => null);
    if (res?.ok) {
      setNotice(`Đã đổi mật khẩu: ${u.email ?? u.id}`);
      setPwTarget(null);
      setPwValue("");
      await load();
    } else {
      const msg = (await res?.json().catch(() => null)) as { message?: string | string[] } | null;
      const m = Array.isArray(msg?.message) ? msg?.message.join(", ") : msg?.message;
      setError(m ?? "Đổi mật khẩu thất bại.");
      setPwTarget(null);
    }
    setSaving(false);
  }

  async function act(u: UserRow, path: string, method: "PATCH" | "POST", body: unknown, done: string, danger = false) {
    const who = u.email ?? u.displayName ?? u.id;
    if (!(await confirm({ title: `${done}?`, message: `Áp dụng cho ${who}.`, confirmLabel: "Xác nhận", tone: danger ? "danger" : "primary" }))) return;
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
    <div className="mx-auto w-full max-w-[90rem] px-4 py-8 sm:px-6">
      {dialog}
      {showCreate && (
        <Modal title="Tạo tài khoản admin" onClose={() => setShowCreate(false)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void createAdmin(); }}>
            <p className="text-sm text-[var(--muted-foreground)]">
              Đã gợi ý sẵn tài khoản và mật khẩu. Bạn có thể sửa, rồi nhấn Xác nhận để tạo. Hãy lưu lại mật khẩu — sau khi tạo sẽ không xem lại được.
            </p>
            <label className="block text-xs font-medium text-[var(--muted-foreground)]">
              Email
              <input className={field + " mt-1 w-full font-mono"} type="email" required aria-label="Email admin mới" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setCopied(false); }} />
            </label>
            <label className="block text-xs font-medium text-[var(--muted-foreground)]">
              Mật khẩu
              <input className={field + " mt-1 w-full font-mono"} type="text" required minLength={8} autoComplete="off" aria-label="Mật khẩu admin mới" value={newPass} onChange={(e) => { setNewPass(e.target.value); setCopied(false); }} />
            </label>
            <div className="flex gap-2">
              <button type="button" className={actBtn} onClick={() => { const s = suggestCredentials(); setNewEmail(s.email); setNewPass(s.password); setCopied(false); }}>
                ↻ Gợi ý khác
              </button>
              <button type="button" className={actBtn} onClick={() => void copyCreds()}>
                {copied ? "✓ Đã sao chép" : "Sao chép"}
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={actBtn + " px-3.5 py-2 text-sm"} onClick={() => setShowCreate(false)}>Huỷ</button>
              <button type="submit" className={primaryBtn} disabled={saving || newPass.length < 8}>{saving ? "Đang tạo…" : "Xác nhận"}</button>
            </div>
          </form>
        </Modal>
      )}
      {pwTarget && (
        <Modal title="Đổi mật khẩu" onClose={() => setPwTarget(null)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void resetPassword(); }}>
            <p className="text-sm text-[var(--muted-foreground)]">
              Tài khoản <b className="text-[var(--foreground)]">{pwTarget.email}</b>. Mọi phiên đăng nhập sẽ bị thu hồi.
            </p>
            <div className="flex gap-2">
              <input className={field + " min-w-0 flex-1"} type={showPw ? "text" : "password"} required minLength={8} autoFocus placeholder="Mật khẩu mới (≥ 8 ký tự)" aria-label="Mật khẩu mới" autoComplete="new-password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} />
              <button type="button" className={actBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Ẩn" : "Hiện"}</button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={actBtn + " px-3.5 py-2 text-sm"} onClick={() => setPwTarget(null)}>Huỷ</button>
              <button type="submit" className={primaryBtn} disabled={saving || pwValue.length < 8}>{saving ? "Đang lưu…" : "Lưu mật khẩu"}</button>
            </div>
          </form>
        </Modal>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Quản lý người dùng</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Xem trạng thái hoạt động, khoá / mở khoá, buộc đăng xuất và phân quyền.
          </p>
        </div>
        {meRole === "SUPER_ADMIN" && (
          <button className={primaryBtn} onClick={openCreate}>+ Tạo tài khoản admin</button>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-3">
            <dd className="text-2xl font-bold tabular-nums">{c.value ?? "—"}</dd>
            <dt className="mt-0.5 text-xs text-[var(--muted-foreground)]">{c.label}</dt>
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

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-500">{notice}</p>}

      <div className="mt-4 rounded-2xl border-[var(--border)] bg-[var(--background)]">
        <table className="w-full table-auto text-left text-sm">
          <thead className="bg-[var(--background-1)] text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Người dùng</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Hoạt động gần nhất</th>
              <th className="px-4 py-3 font-medium">Tạo lúc</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.items.map((u) => {
              const self = u.id === meId;
              const privileged = u.role !== "USER" && meRole !== "SUPER_ADMIN";
              const locked = self || privileged || busyId === u.id;
              const name = u.displayName ?? u.email ?? u.id;
              return (
                <tr key={u.id} className="transition-colors hover:bg-[var(--background-1)]/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} />
                      <div className="min-w-0 max-w-52">
                        <div className="truncate font-medium">{name}{self && <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">(bạn)</span>}</div>
                        <div className="truncate text-xs text-[var(--muted-foreground)]">
                          {u.email ?? "—"}{u.providers.length > 0 && ` · ${u.providers.join(", ")}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={"inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + ROLE_BADGE[u.role]}>
                      {u.role === "SUPER_ADMIN" ? "Super admin" : u.role === "ADMIN" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={u.status === "ACTIVE" ? "Hoạt động" : "Bị khoá"}
                      role="img"
                      aria-label={u.status === "ACTIVE" ? "Hoạt động" : "Bị khoá"}
                      className={"inline-grid size-7 place-items-center rounded-full " + (u.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500")}
                    >
                      <StatusIcon active={u.status === "ACTIVE"} />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      aria-hidden="true"
                      className={"mr-2 inline-block size-2 rounded-full " + (u.online ? "bg-emerald-500" : "bg-[var(--border)]")}
                    />
                    {u.online ? "Đang online" : ago(u.lastActiveAt)}
                    
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--muted-foreground)]">
                    {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        aria-label={`Thao tác cho ${name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuId === u.id}
                        disabled={locked}
                        onClick={(e) => { e.stopPropagation(); setMenuId(menuId === u.id ? null : u.id); }}
                        className="grid size-8 place-items-center rounded-lg text-lg leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)]/60 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ⋯
                      </button>
                      {menuId === u.id && (
                        <div
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg"
                        >
                          <button role="menuitem" className={menuItem} disabled={!u.email} onClick={() => { setMenuId(null); setPwTarget(u); setPwValue(""); setShowPw(false); }}>
                            Đổi mật khẩu
                          </button>
                          <button role="menuitem" className={menuItem} disabled={u.activeSessions === 0} onClick={() => { setMenuId(null); void act(u, "revoke-sessions", "POST", null, "Buộc đăng xuất", true); }}>
                            Buộc đăng xuất{u.activeSessions > 0 ? ` (${u.activeSessions})` : ""}
                          </button>
                          {meRole === "SUPER_ADMIN" && u.role !== "SUPER_ADMIN" && (
                            <button role="menuitem" className={menuItem} onClick={() => { setMenuId(null); void act(u, "role", "PATCH", { role: u.role === "ADMIN" ? "USER" : "ADMIN" }, u.role === "ADMIN" ? "Thu hồi quyền admin" : "Cấp quyền admin", u.role === "ADMIN"); }}>
                              {u.role === "ADMIN" ? "Thu hồi quyền admin" : "Cấp quyền admin"}
                            </button>
                          )}
                          <div className="my-1 border-t border-[var(--border)]" />
                          {u.status === "ACTIVE" ? (
                            <button role="menuitem" className={menuItem + " text-red-500"} onClick={() => { setMenuId(null); void act(u, "status", "PATCH", { status: "SUSPENDED" }, "Khoá tài khoản", true); }}>
                              Khoá tài khoản
                            </button>
                          ) : (
                            <button role="menuitem" className={menuItem + " text-emerald-500"} onClick={() => { setMenuId(null); void act(u, "status", "PATCH", { status: "ACTIVE" }, "Mở khoá tài khoản"); }}>
                              Mở khoá tài khoản
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--muted-foreground)]">Không có người dùng phù hợp.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{data ? `${total} tài khoản` : ""}</span>
        <div className="flex items-center gap-2">
          <button className={actBtn + " px-3 py-1.5 text-sm"} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
          <span className="tabular-nums">{page} / {pages}</span>
          <button className={actBtn + " px-3 py-1.5 text-sm"} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">
        “Online” là ước lượng: tài khoản vừa làm mới phiên đăng nhập trong ~20 phút qua. Khoá tài khoản sẽ thu hồi mọi phiên;
        phiên truy cập đang mở có thể còn hiệu lực tối đa vài phút (thời hạn access token). Chỉ SUPER_ADMIN được thao tác trên tài khoản quản trị và cấp/thu hồi quyền admin.
      </p>
    </div>
  );
}
