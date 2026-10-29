"use client";

import Link from "next/link";
import { siteConfig } from "@/app/site";

const navLinks = [
  { href: "/", label: "Trang chủ" },
  { href: "/learn", label: "Khu học tập" },
];

/**
 * Shared top navigation.
 * - Desktop: inline links + a Preline dropdown for actions.
 * - Mobile: off-canvas menu via the Preline overlay plugin
 *   (data-hs-overlay trigger + .hs-overlay panel).
 *
 * Client component: required because Preline interactive plugins
 * (overlay/dropdown) only run in the browser.
 */
export function SiteHeader() {
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
          {/* Desktop: Preline dropdown for account actions (placeholder). */}
          <div className="hs-dropdown relative hidden md:inline-flex">
            <button
              type="button"
              className="hs-dropdown-toggle rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              aria-expanded="false"
              aria-haspopup="true"
            >
              Tài khoản
            </button>
            <div
              className="hs-dropdown-menu hs-dropdown-open:opacity-100 hs-dropdown-open:mt-2 mt-1.5 hidden w-40 rounded-xl border border-[var(--border)] bg-[var(--layer)] p-1 opacity-0 shadow-lg transition duration-150"
              role="menu"
            >
              <Link
                href="/login"
                className="block rounded-lg px-3 py-2 text-sm text-[var(--layer-foreground)] hover:bg-[var(--layer-hover)]"
                role="menuitem"
              >
                Đăng nhập
              </Link>
            </div>
          </div>

          {/* Mobile: trigger for Preline overlay off-canvas menu */}
          <button
            type="button"
            data-hs-overlay="#mobile-nav"
            aria-controls="mobile-nav"
            aria-expanded="false"
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
            href="/login"
            className="hidden md:inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-focus)]"
          >
            Bắt đầu học
          </Link>
        </div>
      </div>

      {/* Mobile off-canvas menu (Preline overlay plugin) */}
      <div
        id="mobile-nav"
        className="hs-overlay fixed inset-y-0 right-0 z-50 hidden w-72 max-w-[80%] transform translate-x-full transition-transform duration-300 ease-out hs-overlay-open:translate-x-0 bg-[var(--layer)] border-l border-[var(--border)] p-4 shadow-xl md:hidden"
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
            data-hs-overlay="#mobile-nav"
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
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--layer-foreground)] hover:bg-[var(--layer-hover)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="mt-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-center text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Bắt đầu học
          </Link>
        </nav>
      </div>
    </header>
  );
}
