"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onSessionChanged } from "@/lib/session-events";

interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  lang: string;
}

interface AccountMenuProps {
  /**
   * Wrapper classes. Defaults to desktop-only placement in the header; the
   * mobile off-canvas menu passes its own class so the account area (and the
   * logout action) is reachable on small screens.
   */
  className?: string;
}

/**
 * Header account area (P2-UI-06). Reads the session once on mount and shows
 * either the "Đăng nhập" link or the signed-in user with a logout action.
 *
 * Wired through the Preline dropdown markup already in `site-header.tsx` —
 * this component replaces that hardcoded region so it reflects real state.
 */
export function AccountMenu({ className = "hidden md:inline-flex" }: AccountMenuProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  const loadSession = useCallback(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("ready");
      });
  }, []);

  useEffect(() => {
    loadSession();
    // Re-read the session when a login/logout happens elsewhere in the app
    // (e.g. the auth form on the same page) so the header updates at once.
    return onSessionChanged(loadSession);
  }, [loadSession]);

  // Preline binds `.hs-dropdown` triggers only when its plugin autoInit runs
  // (DOMContentLoaded + every App Router pathname change). The signed-in
  // dropdown markup appears LATER, when the async session fetch resolves —
  // after the last autoInit, so the trigger would never get bound and the
  // menu wouldn't open. Re-run the dropdown autoInit exactly when the
  // dropdown variant first renders; it is idempotent (already-initialized
  // elements are filtered out), so re-runs on later renders are safe.
  const hasDropdown = status === "ready" && user !== null;
  useEffect(() => {
    if (!hasDropdown) return;
    let cancelled = false;
    void import("preline").then((mod) => {
      if (!cancelled) mod.HSStaticMethods.autoInit("dropdown");
    });
    return () => {
      cancelled = true;
    };
  }, [hasDropdown]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    router.push("/");
    router.refresh();
  }

  if (status === "loading") {
    return (
      <span className={`items-center px-3 py-1.5 text-sm text-[var(--muted-foreground)] ${className}`}>
        Đang tải…
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className={`items-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--layer-hover)] ${className}`}
      >
        Đăng nhập
      </Link>
    );
  }

  const label = user.displayName || user.email || "Tài khoản";
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const initial = label.trim().charAt(0).toUpperCase() || "T";

  return (
    <div className={`hs-dropdown relative ${className}`}>
      {/* Standard Preline toolbar/user dropdown trigger: avatar + chevron
          that flips when the menu opens (hs-dropdown-open variant). */}
      <button
        type="button"
        data-hs-dropdown=""
        aria-expanded="false"
        aria-haspopup="true"
        className="hs-dropdown-toggle group inline-flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--layer-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-focus)]"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)] ring-1 ring-inset ring-black/5"
        >
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{label}</span>
        <span
          aria-hidden="true"
          className="hs-dropdown-open:rotate-180 inline-flex text-[var(--muted-foreground)] transition-transform duration-150 group-hover:text-[var(--foreground)]"
        >
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>

      {/* Standard Preline dropdown menu: token-based surfaces
          (bg-dropdown / border-dropdown-line / dropdown-item-hover …) so it
          follows the Preline theme incl. dark mode. Absolute so opening the
          menu never reflows the fixed-height navbar. */}
      <div
        data-hs-dropdown-menu=""
        className="hs-dropdown-menu hidden absolute right-0 z-50 mt-2 w-60 rounded-lg border border-dropdown-line bg-dropdown opacity-0 shadow-lg transition-opacity duration-150 hs-dropdown-open:opacity-100"
      >
        <div className="flex items-center gap-2.5 border-b border-dropdown-divider px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)] ring-1 ring-inset ring-black/5"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-dropdown-item-foreground">
              {label}
              {isAdmin && (
                <span className="rounded-full bg-[var(--primary-100)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary-700)]">
                  {user.role === "SUPER_ADMIN" ? "Super" : "Admin"}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">
              {user.email || user.id}
            </p>
          </div>
        </div>

        <ul className="py-1">
          {isAdmin && (
            <li className="hs-dropdown-item relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-dropdown-item-foreground hover:bg-dropdown-item-hover focus:bg-dropdown-item-focus active:bg-dropdown-item-active">
              <Link
                href="/admin/content"
                className="flex w-full items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dropdown-item-focus"
              >
                <svg aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                </svg>
                Quản trị nội dung
              </Link>
            </li>
          )}
          <li className="hs-dropdown-item hs-dropdown-close relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm font-medium text-dropdown-item-foreground hover:bg-dropdown-item-hover focus:bg-dropdown-item-focus active:bg-dropdown-item-active">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dropdown-item-focus"
            >
              <svg aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Đăng xuất
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
