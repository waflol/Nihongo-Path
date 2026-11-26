"use client";

import { fetchShared } from "@/lib/inflight-fetch";
import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * `dropdown` (default): avatar button + floating menu, for the desktop header.
   * `inline`: the same content as a plain block list, for the mobile
   * off-canvas drawer — a floating menu there opened off-screen and covered
   * the page, because the drawer is narrow and its trigger sits at the edge.
   */
  variant?: "dropdown" | "inline";
  /** Called after any link/logout is used (the drawer closes itself with it). */
  onNavigate?: () => void;
}

/** Admin shortcuts shown to ADMIN / SUPER_ADMIN, in order. */
const ADMIN_LINKS = [
  { href: "/admin", label: "Khu quản trị", icon: "M4 4h16v16H4zM4 10h16M10 4v16" },
  { href: "/admin/content", label: "Quản trị nội dung", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { href: "/admin/decks", label: "Bộ thẻ chia sẻ", icon: "M4 5h16v14H4zM4 9h16M8 5v14" },
  { href: "/admin/import", label: "Nhập hàng loạt", icon: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" },
] as const;

const ACCOUNT_ICON = "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
/** Speech bubble: own card reports / feedback with status. */
const FEEDBACK_ICON = "M4 4h16v12H7l-3 4zM8 8h8M8 11h5";
const LOGOUT_ICON = "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9";

function MenuIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * Header account area (P2-UI-06). Reads the session once on mount and shows
 * either the "Đăng nhập" link or the signed-in user with a logout action.
 *
 * The dropdown is plain React state (click toggles; outside click / Escape
 * close it).
 */
export function AccountMenu({
  className = "hidden md:inline-flex",
  variant = "dropdown",
  onNavigate,
}: AccountMenuProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  const loadSession = useCallback(() => {
    fetchShared("/api/auth/session")
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

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    onNavigate?.();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    router.push("/");
    router.refresh();
  }

  const inline = variant === "inline";

  if (status === "loading") {
    if (inline) return null;
    return (
      <span className={`items-center px-3 py-1.5 text-sm text-[var(--muted-foreground)] ${className}`}>
        Đang tải…
      </span>
    );
  }

  if (!user) {
    if (inline) {
      return (
        <Link
          href="/login"
          onClick={onNavigate}
          className={`flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-semibold text-[var(--layer-foreground)] hover:bg-[var(--layer-hover)] ${className}`}
        >
          Đăng nhập
        </Link>
      );
    }
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

  const badge = isAdmin && (
    <span className="rounded-full bg-[var(--primary-100)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary-700)]">
      {user.role === "SUPER_ADMIN" ? "Super" : "Admin"}
    </span>
  );

  if (inline) {
    const rowClass =
      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[var(--layer-foreground)] hover:bg-[var(--layer-hover)] active:bg-[var(--layer-hover)]";
    return (
      <div className={`flex w-full flex-col ${className}`}>
        <div className="flex items-center gap-3 rounded-xl bg-[var(--layer-hover)] px-3 py-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--layer-foreground)]">
              <span className="truncate">{label}</span>
              {badge}
            </p>
            {user.email && user.email !== label && (
              <p className="truncate text-xs text-[var(--muted-foreground)]">{user.email}</p>
            )}
          </div>
        </div>
        <ul className="mt-1 flex flex-col">
          {isAdmin &&
            ADMIN_LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={onNavigate} className={rowClass}>
                  <MenuIcon d={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          <li>
            <Link href="/account" onClick={onNavigate} className={rowClass}>
              <MenuIcon d={ACCOUNT_ICON} />
              Tài khoản
            </Link>
          </li>
          <li>
            <Link href="/account/feedback" onClick={onNavigate} className={rowClass}>
              <MenuIcon d={FEEDBACK_ICON} />
              Báo lỗi &amp; góp ý
            </Link>
          </li>
          <li>
            <button type="button" onClick={logout} className={`${rowClass} font-medium`}>
              <MenuIcon d={LOGOUT_ICON} />
              Đăng xuất
            </button>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Trigger: avatar + chevron that flips when the menu is open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group inline-flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--layer-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-focus)]"
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
          className={`${open ? "rotate-180" : ""} inline-flex text-[var(--muted-foreground)] transition-transform duration-150 group-hover:text-[var(--foreground)]`}
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

      {/* Dropdown menu. Absolute so opening it never reflows the navbar. */}
      <div
        role="menu"
        className={`absolute right-0 z-50 mt-2 w-60 rounded-lg border border-[var(--dropdown-line)] bg-[var(--dropdown)] shadow-lg transition-opacity duration-150 ${
          open ? "opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--dropdown-divider)] px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)] ring-1 ring-inset ring-black/5"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--dropdown-item-foreground)]">
              {label}
              {badge}
            </p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">
              {user.email || user.id}
            </p>
          </div>
        </div>

        <ul className="py-1">
          {isAdmin &&
            ADMIN_LINKS.map((item) => (
              <li
                key={item.href}
                className="relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-[var(--dropdown-item-foreground)] hover:bg-[var(--dropdown-item-hover)] focus:bg-[var(--dropdown-item-focus)] active:bg-[var(--dropdown-item-active)]"
              >
                <Link
                  onClick={() => setOpen(false)}
                  href={item.href}
                  className="flex w-full items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dropdown-item-focus)]"
                >
                  <MenuIcon d={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          <li className="relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-[var(--dropdown-item-foreground)] hover:bg-[var(--dropdown-item-hover)] focus:bg-[var(--dropdown-item-focus)] active:bg-[var(--dropdown-item-active)]">
            <Link
              onClick={() => setOpen(false)}
              href="/account"
              className="flex w-full items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dropdown-item-focus)]"
            >
              <MenuIcon d={ACCOUNT_ICON} />
              Tài khoản
            </Link>
          </li>
          <li className="relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-[var(--dropdown-item-foreground)] hover:bg-[var(--dropdown-item-hover)] focus:bg-[var(--dropdown-item-focus)] active:bg-[var(--dropdown-item-active)]">
            <Link
              onClick={() => setOpen(false)}
              href="/account/feedback"
              className="flex w-full items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dropdown-item-focus)]"
            >
              <MenuIcon d={FEEDBACK_ICON} />
              Báo lỗi &amp; góp ý
            </Link>
          </li>
          <li className="relative flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm font-medium text-[var(--dropdown-item-foreground)] hover:bg-[var(--dropdown-item-hover)] focus:bg-[var(--dropdown-item-focus)] active:bg-[var(--dropdown-item-active)]">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dropdown-item-focus)]"
            >
              <MenuIcon d={LOGOUT_ICON} />
              Đăng xuất
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
