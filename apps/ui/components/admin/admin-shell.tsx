"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

const iconProps = {
  "aria-hidden": true,
  className: "size-5 shrink-0",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Tổng quan",
    desc: "Lối tắt tới các mục quản trị",
    icon: (
      <svg {...iconProps}>
        <path d="M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
  },
  {
    href: "/admin/decks",
    label: "Bộ thẻ chung",
    desc: "Tạo, sửa, xoá bộ thẻ dùng chung",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="6" width="14" height="14" rx="2" />
        <path d="M7 6V4h14v14h-2" />
      </svg>
    ),
  },
  {
    href: "/admin/import",
    label: "Nhập thẻ từ file",
    desc: "CSV / XLSX → xem trước → xác nhận",
    icon: (
      <svg {...iconProps}>
        <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
    ),
  },
  {
    href: "/admin/content",
    label: "Nội dung học",
    desc: "Giáo trình, từ vựng, ngữ pháp",
    icon: (
      <svg {...iconProps}>
        <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h6M8 11h6" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    desc: "Tài khoản, trạng thái, phân quyền",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
      </svg>
    ),
  },
  {
    href: "/admin/backup",
    label: "Sao lưu dữ liệu",
    desc: "Tải bản sao lưu (.json.gz)",
    icon: (
      <svg {...iconProps}>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
  {
    href: "/admin/logs",
    label: "Nhật ký hệ thống",
    desc: "Theo dõi request tới backend",
    icon: (
      <svg {...iconProps}>
        <path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/**
 * Admin chrome: a sticky sidebar on desktop, a horizontally scrollable pill
 * bar on small screens, and the page content beside/below it.
 */
export function AdminShell({
  children,
  userLabel,
  role,
}: {
  children: ReactNode;
  userLabel: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-0 px-0 md:flex-row md:px-4 lg:px-6">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-16 flex h-[calc(100vh-4rem)] flex-col py-6 pr-4">
          <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
              Khu quản trị
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]" title={userLabel}>
              {userLabel}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {role === "SUPER_ADMIN" ? "Super admin" : "Admin"}
            </p>
          </div>

          <nav aria-label="Điều hướng quản trị" className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
                    (active
                      ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]")
                  }
                >
                  <span className={active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]"}>
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5">{item.label}</span>
                    <span className="block text-xs leading-4 text-[var(--muted-foreground)]">
                      {item.desc}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-[var(--border)] pt-4">
            <Link
              href="/learn"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]"
            >
              <span aria-hidden="true">←</span> Về khu học tập
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <nav
        aria-label="Điều hướng quản trị"
        className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--navbar)] px-4 py-2 md:hidden"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium " +
                (active
                  ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)]")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 md:border-l md:border-[var(--border)]">{children}</div>
    </div>
  );
}
