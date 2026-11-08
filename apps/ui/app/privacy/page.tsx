import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "../site";

const privacyDescription = `Chính sách bảo vệ dữ liệu cá nhân của ${siteConfig.name} — tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 13/2023/NĐ-CP.`;

export const metadata: Metadata = {
  title: "Chính sách bảo vệ dữ liệu cá nhân",
  description: privacyDescription,
  openGraph: {
    title: `Chính sách bảo vệ dữ liệu cá nhân | ${siteConfig.name}`,
    description: privacyDescription,
  },
};

const LAST_UPDATED = "07/11/2026";

const toc = [
  { id: "muc-1", label: "1. Các loại dữ liệu cá nhân được thu thập" },
  { id: "muc-2", label: "2. Mục đích xử lý dữ liệu cá nhân" },
  { id: "muc-3", label: "3. Chia sẻ & chuyển dữ liệu xuyên biên giới" },
  { id: "muc-4", label: "4. Quyền của chủ thể dữ liệu (Luật 91/2025/QH15)" },
  { id: "muc-5", label: "5. Thời hạn lưu trữ & biện pháp bảo mật" },
  { id: "muc-6", label: "6. Thông tin liên hệ & khiếu nại" },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border-b border-[var(--border)] pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
          <span>Văn bản pháp lý</span>
          <span aria-hidden="true">·</span>
          <span>Cập nhật lần cuối: {LAST_UPDATED}</span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Chính sách Bảo vệ Dữ liệu Cá nhân
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted-foreground)]">
          Chính sách này mô tả cách thức <strong className="font-semibold text-[var(--foreground)]">{siteConfig.name}</strong>{" "}
          thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu cá nhân của bạn trên cơ sở tuân thủ{" "}
          <strong className="font-semibold text-[var(--foreground)]">
            Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15
          </strong>
          , Nghị định 13/2023/NĐ-CP của Chính phủ Việt Nam và các tiêu chuẩn bảo mật của Apple App Store / Google Play
          Store. Vui lòng đọc Chính sách này cùng với{" "}
          <Link
            href="/terms"
            className="font-medium text-[var(--primary)] underline underline-offset-4 hover:text-[var(--primary-hover)]"
          >
            Điều khoản Sử dụng Dịch vụ
          </Link>
          .
        </p>
      </header>

      {/* Highlights */}
      <section
        aria-label="Cam kết bảo mật cốt lõi"
        className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xs"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--primary)]">
          Cam kết bảo vệ quyền riêng tư của bạn
        </h2>
        <ul className="mt-4 grid gap-3 text-sm leading-6 text-[var(--foreground)] sm:grid-cols-3">
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">Không bán dữ liệu</strong>
            <span className="text-[var(--muted-foreground)]">
              Tuyệt đối không bán, cho thuê hoặc trao đổi dữ liệu cá nhân của người học cho bên thứ ba vì mục đích tiếp
              thị.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">Mã hóa chuẩn công nghiệp</strong>
            <span className="text-[var(--muted-foreground)]">
              Mật khẩu băm một chiều (<code>scrypt</code>), khóa dịch vụ mã hóa <code>AES-256-GCM</code>, kết nối truyền
              tải qua <code>HTTPS/TLS</code>.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">Quyền làm chủ &amp; xóa dữ liệu</strong>
            <span className="text-[var(--muted-foreground)]">
              Bạn có quyền truy xuất, chỉnh sửa, rút lại sự đồng ý hoặc yêu cầu xóa vĩnh viễn tài khoản trong vòng 72
              giờ.
            </span>
          </li>
        </ul>
      </section>

      {/* Table of contents */}
      <nav
        aria-label="Mục lục Chính sách bảo vệ dữ liệu cá nhân"
        className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Mục lục nhanh
        </p>
        <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-[var(--foreground)] transition-colors hover:text-[var(--primary)] hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Main content */}
      <div className="mt-10 space-y-10 text-sm leading-7 text-[var(--foreground)] sm:text-base sm:leading-8">
        <section id="muc-1" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            1. Các loại Dữ liệu Cá nhân Chúng tôi thu thập
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Dữ liệu cá nhân cơ bản:</strong>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Thông tin tài khoản:</strong> Địa chỉ email,
                  tên hiển thị, ảnh đại diện (nếu bạn đăng nhập qua Google/Apple) và mật khẩu đã băm một chiều bằng
                  thuật toán <code>scrypt</code> kèm salt ngẫu nhiên (Chúng tôi không bao giờ lưu mật khẩu dạng văn bản
                  thuần).
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Dữ liệu học tập:</strong> Lịch sử ôn tập thẻ
                  ghi nhớ (SRS), bộ thẻ cá nhân, tệp từ vựng tải lên, kết quả bài tập/đề thi, múi giờ (
                  <code>timezone</code>) và ngôn ngữ giao diện (<code>lang</code>).
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Dữ liệu kỹ thuật:</strong> Địa chỉ IP, loại
                  trình duyệt/thiết bị, nhật ký lỗi hệ thống và lượng token sử dụng AI nhằm kiểm soát hạn mức (Quota) và
                  chống lạm dụng.
                </li>
              </ul>
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Dữ liệu liên quan đến tính năng Giọng nói và Thanh toán:
              </strong>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Dữ liệu âm thanh (Microphone):</strong> Chúng
                  tôi chỉ truy cập Microphone khi bạn chủ động bấm nút thu âm tại tính năng Luyện phát âm / Shadowing /
                  Hội thoại AI và đã cấp quyền rõ ràng trên thiết bị. Bản ghi âm chỉ dùng để chấm điểm phát âm/nhận diện
                  lời nói và tự động xóa theo chu kỳ lưu trữ ngắn hạn (tối đa 30 ngày) hoặc xóa ngay khi bạn yêu cầu.
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Dữ liệu giao dịch:</strong> Khi tính năng
                  thuê bao trả phí được bật, Chúng tôi chỉ lưu mã giao dịch tham chiếu, tên gói, thời hạn và trạng thái
                  thanh toán; tuyệt đối không thu thập hay lưu trữ số thẻ ngân hàng, mã CVV hay mật khẩu tài khoản ngân
                  hàng của bạn.
                </li>
              </ul>
            </li>
          </ol>
        </section>

        <section id="muc-2" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            2. Mục đích Xử lý Dữ liệu Cá nhân
          </h2>
          <p className="text-[var(--muted-foreground-1)]">
            Chúng tôi chỉ xử lý dữ liệu cá nhân của bạn cho các mục đích hợp pháp và cụ thể sau đây:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              Xác thực danh tính, duy trì phiên đăng nhập an toàn (qua cookie <code>httpOnly</code>) và đồng bộ tiến độ
              học tập đa thiết bị (Web, iOS, Android).
            </li>
            <li>
              Tính toán lịch ôn tập ngắt quãng (Spaced Repetition System — SM-2) chính xác theo múi giờ của bạn.
            </li>
            <li>
              Cung cấp các tính năng dịch thuật, trích xuất chữ từ PDF scan (OCR), gợi ý ngữ pháp/cách viết và luyện
              phát âm thông qua tích hợp AI khi bạn yêu cầu.
            </li>
            <li>
              Quản lý hạn mức sử dụng (Quota), gói thuê bao (Entitlements), tiếp nhận báo lỗi học liệu (
              <code>CardReport</code>) và hỗ trợ kỹ thuật.
            </li>
            <li>
              Phát hiện, ngăn chặn các hành vi gian lận, tấn công mạng hoặc vi phạm Điều khoản Sử dụng.
            </li>
          </ul>
        </section>

        <section id="muc-3" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            3. Chia sẻ và Chuyển Dữ liệu Cá nhân Xuyên biên giới
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Cam kết không bán dữ liệu:</strong> Chúng tôi
              tuyệt đối không bán, trao đổi hoặc cho thuê dữ liệu cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích
              quảng cáo hay tiếp thị.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Các đối tác xử lý dữ liệu phụ (Sub-processors) và Chuyển dữ liệu ra nước ngoài:
              </strong>{" "}
              Để vận hành Nền tảng ổn định, một phần dữ liệu cần thiết được lưu trữ và xử lý thông qua các nhà cung cấp
              hạ tầng đám mây đạt chuẩn bảo mật quốc tế có máy chủ đặt ngoài lãnh thổ Việt Nam (như Singapore, Nhật Bản,
              Hoa Kỳ), bao gồm:
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Hạ tầng cơ sở dữ liệu đám mây:</strong>{" "}
                  MongoDB Atlas (lưu trữ dữ liệu tài khoản và tiến độ học tập đã mã hóa đường truyền).
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Dịch vụ xác thực (nếu bạn chọn):</strong>{" "}
                  Google Identity Services (Google Sign-In) và Sign in with Apple (trên iOS).
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Nhà cung cấp dịch vụ AI:</strong> Chỉ nhận
                  đoạn văn bản, trang tài liệu hoặc đoạn âm thanh mà bạn chủ động gửi đi để dịch/OCR/luyện nói; không
                  nhận mật khẩu hay thông tin định danh tài chính của bạn.
                </li>
              </ul>
            </li>
          </ol>
        </section>

        <section id="muc-4" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            4. Quyền của Chủ thể Dữ liệu và Cách thức Thực hiện (Theo Luật số 91/2025/QH15)
          </h2>
          <p className="text-[var(--muted-foreground-1)]">
            Bạn có đầy đủ các quyền của chủ thể dữ liệu theo pháp luật Việt Nam đối với dữ liệu cá nhân của mình:
          </p>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Quyền được biết và Quyền truy cập:</strong> Xem
              toàn bộ thông tin hồ sơ, bộ thẻ cá nhân, tiến độ học tập và lịch sử làm bài của mình ngay trong Ứng dụng.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Quyền chỉnh sửa:</strong> Tự cập nhật tên hiển
              thị, múi giờ, ngôn ngữ giao diện hoặc mật khẩu trong mục Hồ sơ cá nhân.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Quyền rút lại sự đồng ý:</strong> Tắt quyền truy
              cập Microphone trong cài đặt trình duyệt/thiết bị hoặc ngừng sử dụng các tính năng AI bất cứ lúc nào.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Quyền yêu cầu xóa dữ liệu và Xóa tài khoản vĩnh viễn:
              </strong>{" "}
              Bạn có quyền yêu cầu xóa tài khoản và toàn bộ dữ liệu cá nhân liên quan. Sau khi xác nhận yêu cầu xóa tài
              khoản, toàn bộ thông tin định danh cá nhân, bộ thẻ riêng tư, tệp tải lên và lịch sử học tập của bạn sẽ bị
              xóa vĩnh viễn khỏi hệ thống sản xuất trong vòng tối đa{" "}
              <strong className="font-medium text-[var(--foreground)]">72 giờ</strong> (trừ các chứng từ kế toán/giao
              dịch bắt buộc phải lưu trữ theo quy định của Luật Kế toán và pháp luật về thuế).
            </li>
          </ol>
        </section>

        <section id="muc-5" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            5. Thời hạn Lưu trữ và Biện pháp Bảo mật
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              Dữ liệu tài khoản và tiến độ học tập được lưu trữ trong suốt thời gian tài khoản của bạn hoạt động và bị
              xóa khi bạn thực hiện chức năng Xóa tài khoản.
            </li>
            <li>
              Các tệp nhật ký công việc nhập PDF tạm thời (<code>pdf_jobs</code>) và phiên làm việc hết hạn được tự động
              dọn dẹp định kỳ qua cơ chế TTL Index của cơ sở dữ liệu.
            </li>
            <li>
              Mật khẩu được băm bằng thuật toán <code>scrypt</code>; khóa API được mã hóa chuẩn{" "}
              <code>AES-256-GCM</code>; token phiên đăng nhập được bảo vệ trong cookie <code>httpOnly</code>; toàn bộ
              giao tiếp giữa ứng dụng và máy chủ đều đi qua kết nối mã hóa <code>HTTPS/TLS</code>.
            </li>
          </ul>
        </section>

        <section id="muc-6" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            6. Thông tin Liên hệ và Khiếu nại
          </h2>
          <p className="text-[var(--muted-foreground-1)]">
            Mọi thắc mắc, yêu cầu thực hiện quyền của chủ thể dữ liệu cá nhân (truy xuất, chỉnh sửa, xóa tài khoản) hoặc
            thông báo khiếu nại bản quyền (Notice &amp; Takedown), vui lòng liên hệ Bộ phận Quản trị &amp; Bảo vệ Dữ
            liệu Cá nhân của <strong className="font-medium text-[var(--foreground)]">{siteConfig.name}</strong> qua
            kênh hỗ trợ chính thức trên Nền tảng. Chúng tôi cam kết phản hồi và xử lý yêu cầu trong thời hạn tối đa 72
            giờ làm việc theo quy định pháp luật Việt Nam.
          </p>
        </section>
      </div>

      {/* Footer navigation */}
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm">
        <div>
          <p className="font-semibold text-[var(--foreground)]">Xem thêm văn bản liên quan</p>
          <p className="text-[var(--muted-foreground)]">
            Quy định chi tiết về quyền và nghĩa vụ khi sử dụng học liệu, công cụ AI và tính năng nhập dữ liệu.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/terms"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)]"
          >
            ← Xem Điều khoản Sử dụng
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            Tạo tài khoản
          </Link>
        </div>
      </footer>
    </div>
  );
}
