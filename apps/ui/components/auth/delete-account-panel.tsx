"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emitSessionChanged } from "@/lib/session-events";

const PHRASE = "XOA TAI KHOAN";

/**
 * Danger zone: permanently delete the signed-in user's account and data.
 * Not rendered at all for SUPER_ADMIN (the page decides) — the API refuses
 * that role too. The API requires the password when the account has one.
 */
export function DeleteAccountPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirm === PHRASE && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, ...(password ? { password } : {}) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Không xóa được tài khoản. Vui lòng thử lại.");
        setBusy(false);
        return;
      }
      emitSessionChanged();
      router.replace("/?deleted=1");
      router.refresh();
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="danger-title"
      className="rounded-2xl border border-[#fecaca] bg-[color-mix(in_srgb,#ef4444_6%,var(--card))] p-6"
    >
      <h2 id="danger-title" className="text-lg font-semibold text-[#b91c1c]">
        Xóa tài khoản
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
        Xóa vĩnh viễn tài khoản cùng bộ thẻ cá nhân, tiến độ ôn tập, tệp nhập, đăng ký nhắc ôn và phản hồi của bạn.
        Thao tác <strong className="text-[var(--foreground)]">không thể hoàn tác</strong>. Nhật ký bảo mật được ẩn
        danh. Chi tiết tại{" "}
        <a href="/privacy#muc-4" className="font-medium text-[var(--primary)] underline underline-offset-4">
          Chính sách Bảo vệ Dữ liệu Cá nhân
        </a>
        .
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center rounded-lg border border-[#ef4444] px-4 py-2 text-sm font-semibold text-[#b91c1c] transition hover:bg-[#ef4444] hover:text-white"
        >
          Tôi muốn xóa tài khoản
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
          {(
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-[var(--foreground)]">
                Mật khẩu hiện tại <span className="font-normal text-[var(--muted-foreground)]">(bỏ trống nếu bạn chỉ đăng nhập bằng Google)</span>
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-[var(--foreground)]"
              />
            </label>
          )}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--foreground)]">
              Gõ <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5">{PHRASE}</code> để xác nhận
            </span>
            <input
              type="text"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-[var(--foreground)]"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!ready}
              className="inline-flex items-center rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Đang xóa…" : "Xóa vĩnh viễn"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setPassword("");
                setError(null);
              }}
              className="inline-flex items-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
