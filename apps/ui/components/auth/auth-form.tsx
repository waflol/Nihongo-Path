"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isSafeFrom } from "@/lib/safe-path";
import { emitSessionChanged } from "@/lib/session-events";

interface AuthFormProps {
  mode: "login" | "register";
  /**
   * Admin-area login (`/admin/login`): after a successful sign-in the user
   * lands in `/admin` instead of `/learn` (unless `?from=` says otherwise).
   */
  admin?: boolean;
}

interface Result {
  ok?: boolean;
  error?: string;
  user?: { displayName: string | null; email: string | null };
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/**
 * Login / register form (P2-UI-01/02). Calls the server route handlers
 * (`/api/auth/login` / `/api/auth/register`), which own the httpOnly cookie
 * (P2-UI-05). Shows a loading state and a clear error on failure.
 */
export function AuthForm({ mode, admin }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, string> = { email, password };
    if (mode === "register") body.displayName = displayName;

    const res = await fetch(
      mode === "login" ? "/api/auth/login" : "/api/auth/register",
      { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    ).catch(() => null);

    setLoading(false);

    if (!res || !res.ok) {
      let message = "Có lỗi xảy ra. Thử lại sau.";
      try {
        const data = (await res?.json()) as Result | undefined;
        if (data?.error) message = data.error;
      } catch {
        // keep default
      }
      setError(message);
      return;
    }

    emitSessionChanged();
    const from = new URLSearchParams(window.location.search).get("from");
    // Admin-area login lands in the admin dashboard; the regular login lands
    // in the learning area (both still honour `?from=` when it is a real
    // same-site path).
    const home = admin ? "/admin" : "/learn";
    router.push(isSafeFrom(from) ? from : home);
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={onSubmit}>
      {mode === "register" && (
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            Tên hiển thị
          </label>
          <input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
            placeholder="Nguyễn Văn A"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@email.com"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          Mật khẩu
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={showPassword}
            title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {showPassword ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </div>
        {mode === "register" && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Tối thiểu 8 ký tự.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "Đang xử lý…"
          : mode === "login"
            ? "Đăng nhập"
            : "Tạo tài khoản"}
      </button>
    </form>
  );
}
