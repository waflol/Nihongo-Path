import Link from "next/link";
import { siteConfig } from "@/app/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--footer)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-300">
            {/* Year is static (Next 16 cacheComponents disallows new Date() during
                prerendering). Update at year rollover or move to a client component. */}
            © 2026 {siteConfig.name} — {siteConfig.tagline}
          </p>
          <nav aria-label="Liên kết pháp lý" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-300">
            <Link href="/terms" className="transition-colors hover:text-white hover:underline">
              Điều khoản sử dụng
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white hover:underline">
              Chính sách bảo vệ dữ liệu cá nhân
            </Link>
          </nav>
        </div>
        <p className="mt-3 text-xs leading-5 text-gray-400">
          Công cụ hỗ trợ tự học tiếng Nhật độc lập. Dữ liệu từ điển &amp; chữ Hán sử dụng{" "}
          <span className="text-gray-300">KANJIDIC2 / JMdict</span> (EDRDG — CC BY-SA 4.0) và{" "}
          <span className="text-gray-300">KanjiVG</span> (Ulrich Apel — CC BY-SA 3.0). JLPT là nhãn hiệu đã đăng ký của
          Japan Foundation &amp; JEES; {siteConfig.name} không liên kết hay được chứng nhận bởi các tổ chức này.
        </p>
      </div>
    </footer>
  );
}
