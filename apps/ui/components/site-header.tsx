"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/app/site";
import { AccountMenu } from "@/components/auth/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { href: "/", label: "Trang chủ" },
  { href: "/learn", label: "Khu học tập" },
];

/**
 * Shared top navigation.
 * - Desktop: inline links + account menu.
 * - Mobile: off-canvas menu driven by React state (Escape / backdrop / route
 *   change close it).
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-[var(--navbar)] border-b border-[var(--navbar-line)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]"
        >
          {/* Placeholder logo — replace with approved brand asset (spec §17.2). */}
          <img
            src="/logo.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
          />
          {siteConfig.name}
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Điều hướng chính" className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--navbar-nav-foreground)] transition-colors hover:bg-[var(--navbar-nav-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Real account state: "Đăng nhập" when signed out, user + menu
              (with logout / admin link) when signed in. */}
          <ThemeToggle />
          <AccountMenu />

          {/* Mobile: off-canvas menu trigger */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-controls="mobile-nav"
            aria-expanded={open}
            aria-label="Mở menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] md:hidden"
          >
            <span className="sr-only">Menu</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href="/learn"
            className="hidden md:inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-focus)]"
          >
            Bắt đầu học
          </Link>
        </div>
      </div>

      {/* Mobile off-canvas menu */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        id="mobile-nav"
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[80%] transform bg-[var(--layer)] border-l border-[var(--border)] p-4 shadow-xl transition-transform duration-300 ease-out md:hidden ${
          open ? "translate-x-0" : "invisible translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-nav-label"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <span id="mobile-nav-label" className="text-sm font-semibold text-[var(--foreground)]">
            Menu
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav aria-label="Điều hướng chính di động" className="mt-3 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              onClick={() => setOpen(false)}
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--layer-foreground)] hover:bg-[var(--layer-hover)]"
            >
              {link.label}
            </Link>
          ))}
          {/* Account area (login / user + logout) on mobile too */}
          <div className="mt-2 flex items-center">
            <AccountMenu className="inline-flex" />
          </div>
          <Link
              onClick={() => setOpen(false)}
            href="/learn"
            className="mt-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-center text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Bắt đầu học
          </Link>
        </nav>
      </div>
    </header>
  );
}
