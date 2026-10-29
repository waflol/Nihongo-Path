import { siteConfig } from "@/app/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--footer)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-300">
          {/* Year is static (Next 16 cacheComponents disallows new Date() during
              prerendering). Update at year rollover or move to a client component. */}
          © 2026 {siteConfig.name} — {siteConfig.tagline}
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Nền tảng học tiếng Nhật. Nội dung học thuộc quản trị nội dung và chưa
          được phát hành.
        </p>
      </div>
    </footer>
  );
}
