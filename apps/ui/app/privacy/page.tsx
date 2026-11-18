import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";
import { siteConfig } from "../site";
import { legalConfig } from "../legal";
import { LegalContact } from "@/components/legal/legal-contact";

const privacyDescription = `Chính sách bảo vệ dữ liệu cá nhân của ${siteConfig.name} — tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 13/2023/NĐ-CP.`;

export const metadata: Metadata = {
  title: "Chính sách bảo vệ dữ liệu cá nhân",
  description: privacyDescription,
  openGraph: {
    title: `Chính sách bảo vệ dữ liệu cá nhân | ${siteConfig.name}`,
    description: privacyDescription,
  },
};

const LAST_UPDATED = legalConfig.updated;

const toc = [
  { id: "muc-1", label: "1. Các loại dữ liệu cá nhân được thu thập" },
  { id: "muc-2", label: "2. Mục đích và căn cứ pháp lý của việc xử lý" },
  { id: "muc-3", label: "3. Chia sẻ & chuyển dữ liệu xuyên biên giới" },
  { id: "muc-4", label: "4. Quyền của chủ thể dữ liệu (Luật 91/2025/QH15)" },
  { id: "muc-5", label: "5. Thời hạn lưu trữ, bảo mật & xử lý sự cố" },
  { id: "muc-6", label: "6. Dữ liệu của người dùng dưới 16 tuổi" },
  { id: "muc-7", label: "7. Thay đổi Chính sách này" },
  { id: "muc-8", label: "8. Thông tin liên hệ & khiếu nại" },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      kicker="Văn bản pháp lý"
      title="Chính sách Bảo vệ Dữ liệu Cá nhân"
      updated={LAST_UPDATED}
      tocLabel="Mục lục Chính sách bảo vệ dữ liệu cá nhân"
      toc={toc}
      highlightsTitle="Cam kết bảo vệ quyền riêng tư của bạn"
      related={{
        title: "Xem thêm văn bản liên quan",
        text: "Quy định chi tiết về quyền và nghĩa vụ khi sử dụng học liệu, công cụ AI và tính năng nhập dữ liệu.",
        href: "/terms",
        cta: "← Xem Điều khoản Sử dụng",
      }}
      intro={
        <>
          Chính sách này mô tả cách thức <strong className="font-semibold text-[var(--foreground)]">{siteConfig.name}</strong>{" "}
          thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu cá nhân của bạn trên cơ sở tuân thủ{" "}
          <strong className="font-semibold text-[var(--foreground)]">
            Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15
          </strong>
          , Nghị định 13/2023/NĐ-CP của Chính phủ Việt Nam và các tiêu chuẩn bảo mật của các cửa hàng ứng dụng
          (Apple App Store / Google Play) khi ứng dụng di động được phát hành. Vui lòng đọc Chính sách này cùng với{" "}
          <Link
            href="/terms"
            className="font-medium text-[var(--primary)] underline underline-offset-4 hover:text-[var(--primary-hover)]"
          >
            Điều khoản Sử dụng Dịch vụ
          </Link>
          .
        </>
      }
      highlights={
        <ul className="cols-3 mt-4 grid gap-3 text-sm leading-6 text-[var(--foreground)] sm:grid-cols-3">
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
              Bạn có quyền xem, chỉnh sửa, xuất bộ thẻ (CSV), rút lại sự đồng ý hoặc yêu cầu xóa vĩnh viễn tài khoản
              trong vòng 72 giờ.
            </span>
          </li>
        </ul>
      }
    >
        <section id="muc-1">
          <h2>1. Các loại Dữ liệu Cá nhân Chúng tôi thu thập</h2>
          <ol>
            <li>
              <strong>Dữ liệu tài khoản:</strong>
              <ul>
                <li>
                  Địa chỉ email, tên hiển thị, ảnh đại diện (nếu bạn đăng nhập bằng Google) và mật khẩu đã băm một
                  chiều bằng thuật toán <code>scrypt</code> kèm salt ngẫu nhiên (Chúng tôi không bao giờ lưu mật khẩu
                  dạng văn bản thuần).
                </li>
                <li>
                  Cài đặt cá nhân: múi giờ (<code>timezone</code>), ngôn ngữ giao diện (<code>lang</code>), số thẻ
                  mới mỗi ngày, vai trò và trạng thái tài khoản.
                </li>
                <li>
                  Phiên đăng nhập: mã làm mới (refresh token) ngẫu nhiên, thời điểm hết hạn/thu hồi.
                </li>
              </ul>
            </li>
            <li>
              <strong>Dữ liệu học tập và nội dung bạn tạo:</strong> Bộ thẻ và thẻ cá nhân (kể cả ghi chú, ví dụ, ảnh
              bạn gắn), lịch sử và trạng thái ôn tập theo thuật toán FSRS, phiên học, kết quả bài tập, báo lỗi thẻ
              và phản hồi bạn gửi, từ điển cách đọc bạn đã chỉnh. Khi nhập từ tệp, <strong>tệp CSV/Excel/PDF gốc</strong>{" "}
              và kết quả đọc từng trang được lưu tạm trên máy chủ trong suốt công việc nhập.
            </li>
            <li>
              <strong>Dữ liệu kỹ thuật và nhật ký:</strong> Địa chỉ IP, loại trình duyệt/thiết bị (User-Agent), đường
              dẫn và mã trạng thái của yêu cầu, nhật ký lỗi, và nhật ký thao tác quản trị. Trình duyệt của bạn gọi
              dịch vụ <code>api.ipify.org</code> để biết địa chỉ IPv4 công cộng và lưu vào cookie{" "}
              <code>client_ipv4</code> (1 giờ); giá trị này chỉ dùng để hiển thị trong nhật ký, không dùng để chặn
              hay giới hạn bạn.
            </li>
            <li>
              <strong>Nhật ký gọi AI:</strong> Mỗi lần dùng tính năng AI, hệ thống ghi tên dịch vụ/mô hình, từ vựng
              hoặc đoạn văn bản đã gửi và phản hồi (đã cắt ngắn), trạng thái và thời gian xử lý, để kiểm soát chất
              lượng, hạn mức và gỡ lỗi. Kết quả dịch/ví dụ có thể được lưu đệm (cache).
            </li>
            <li>
              <strong>Đăng ký nhắc ôn tập (Web Push):</strong> Nếu bạn bật nhắc ôn hằng ngày, Chúng tôi lưu địa chỉ
              đăng ký thông báo do trình duyệt cấp (endpoint và khóa mã hóa), giờ nhắc, múi giờ và User-Agent của thiết
              bị đó.
            </li>
            <li>
              <strong>Dữ liệu lưu ngay trên thiết bị của bạn:</strong> Cookie phiên <code>httpOnly</code>; trong bộ
              nhớ trình duyệt: giao diện sáng/tối, màu nhấn, tùy chọn hiển thị Hán Việt, bản nháp nhập tệp (IndexedDB).
              Chúng tôi hiện <strong>không</strong> dùng cookie quảng cáo hay công cụ theo dõi hành vi của bên thứ
              ba.
            </li>
            <li>
              <strong>Dữ liệu của tính năng chưa mở:</strong> Hiện Chúng tôi <strong>chưa</strong> thu âm giọng nói
              và chưa xử lý thanh toán. Khi các tính năng này được mở, Chúng tôi sẽ cập nhật Chính sách này trước khi
              thu thập: Microphone chỉ được truy cập khi bạn chủ động bấm thu âm và đã cấp quyền; dữ liệu thanh toán
              chỉ gồm mã giao dịch, tên gói, thời hạn và trạng thái — tuyệt đối không lưu số thẻ, CVV hay mật khẩu
              ngân hàng.
            </li>
          </ol>
        </section>

        <section id="muc-2">
          <h2>2. Mục đích và Căn cứ pháp lý của việc Xử lý Dữ liệu Cá nhân</h2>
          <p>Chúng tôi chỉ xử lý dữ liệu cá nhân của bạn cho các mục đích hợp pháp và cụ thể sau đây:</p>
          <ul>
            <li>
              Xác thực danh tính, duy trì phiên đăng nhập an toàn (qua cookie <code>httpOnly</code>) và đồng bộ tiến độ
              học tập đa thiết bị.
            </li>
            <li>
              Tính lịch ôn tập ngắt quãng (thuật toán FSRS-4.5) theo múi giờ của bạn và gửi nhắc ôn tập nếu bạn bật.
            </li>
            <li>
              Cung cấp các tính năng AI khi bạn yêu cầu: gợi ý ví dụ/bản dịch, kiểm tra cách đọc và Hán Việt, đọc chữ
              từ PDF scan (OCR).
            </li>
            <li>
              Quản lý hạn mức sử dụng, tiếp nhận báo lỗi học liệu và phản hồi, hỗ trợ kỹ thuật.
            </li>
            <li>
              Bảo mật hệ thống: phát hiện và ngăn chặn tấn công, lạm dụng (giới hạn tần suất, chặn IP), giám sát tình
              trạng máy chủ, lưu nhật ký kiểm toán các thao tác quản trị.
            </li>
            <li>
              Đánh giá và cải thiện chất lượng AI trên các bộ dữ liệu thử nghiệm riêng của Chúng tôi (không dùng dữ
              liệu học tập cá nhân của bạn để huấn luyện mô hình).
            </li>
          </ul>
          <p>
            <strong>Căn cứ pháp lý:</strong> Chúng tôi xử lý dữ liệu của bạn trên cơ sở (i){" "}
            <strong>sự đồng ý</strong> của bạn khi đăng ký tài khoản và khi bật từng tính năng tùy chọn (nhắc ôn tập,
            tính năng AI, quyền Microphone khi được mở); (ii) <strong>thực hiện hợp đồng</strong> cung cấp dịch vụ theo{" "}
            <Link href="/terms">Điều khoản Sử dụng</Link> mà bạn đã chấp nhận; (iii){" "}
            <strong>thực hiện nghĩa vụ luật định</strong> về lưu trữ nhật ký và phối hợp với cơ quan có thẩm quyền; và
            (iv) <strong>bảo đảm an ninh, an toàn hệ thống</strong> nhằm ngăn chặn tấn công và lạm dụng dịch vụ. Chúng
            tôi không xử lý dữ liệu của bạn cho mục đích nằm ngoài các mục đích đã nêu; nếu phát sinh mục đích mới,
            Chúng tôi sẽ thông báo và xin sự đồng ý riêng của bạn trước khi thực hiện.
          </p>
          <p>
            <strong>Việc rút lại sự đồng ý</strong> không ảnh hưởng tới tính hợp pháp của việc xử lý đã thực hiện trước
            thời điểm rút, nhưng có thể khiến một số tính năng không còn hoạt động.
          </p>
        </section>

        <section id="muc-3">
          <h2>3. Chia sẻ và Chuyển Dữ liệu Cá nhân Xuyên biên giới</h2>
          <ol>
            <li>
              <strong>Cam kết không bán dữ liệu:</strong> Chúng tôi tuyệt đối không bán, trao đổi hoặc cho thuê dữ
              liệu cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích quảng cáo hay tiếp thị.
            </li>
            <li>
              <strong>Bên xử lý dữ liệu và dịch vụ bên thứ ba:</strong> Để vận hành Nền tảng, một phần dữ liệu được
              lưu trữ hoặc xử lý bởi các bên sau, một số có máy chủ ngoài lãnh thổ Việt Nam:
              <ul>
                <li>
                  <strong>Cơ sở dữ liệu đám mây:</strong> dữ liệu tài khoản, học tập và nhật ký được lưu trên{" "}
                  <strong>MongoDB Atlas</strong> — dịch vụ cơ sở dữ liệu được quản lý của MongoDB, Inc. (Hoa Kỳ).
                  Cụm máy chủ đặt <strong>ngoài lãnh thổ Việt Nam</strong>; dữ liệu được mã hóa khi lưu trữ và khi
                  truyền qua mạng.
                </li>
                <li>
                  <strong>Đăng nhập bằng Google (nếu bạn chọn):</strong> Google Identity Services.
                </li>
                <li>
                  <strong>Nhà cung cấp AI:</strong> Google Gemini, Groq, OpenRouter, NVIDIA, máy chủ mô hình do Chúng
                  tôi vận hành hoặc dịch vụ tương đương do quản trị viên cấu hình. Họ chỉ nhận văn bản, từ vựng hoặc
                  trang tài liệu mà bạn chủ động gửi để xử lý; không nhận mật khẩu hay thông tin tài chính của bạn.
                </li>
                <li>
                  <strong>Thông báo đẩy:</strong> dịch vụ push của trình duyệt (Google, Mozilla, Apple...) chuyển
                  thông báo nhắc ôn đến thiết bị bạn đã đăng ký.
                </li>
                <li>
                  <strong>Dịch vụ tra cứu:</strong> <code>api.ipify.org</code> (xác định IPv4 công cộng như mục 1) và{" "}
                  <code>tatoeba.org</code> (tra câu ví dụ khi chỉ mục cục bộ không có; chỉ gửi từ khóa tra cứu, không
                  gửi thông tin định danh).
                </li>
              </ul>
            </li>
            <li>
              <strong>Chuyển dữ liệu ra nước ngoài:</strong> Việc gửi nội dung tới các nhà cung cấp trên có thể đưa dữ
              liệu ra ngoài Việt Nam. Chúng tôi chỉ chuyển phần dữ liệu cần thiết cho tính năng bạn yêu cầu và thực
              hiện theo quy định về chuyển dữ liệu cá nhân xuyên biên giới của pháp luật Việt Nam.
            </li>
            <li>
              <strong>Yêu cầu của cơ quan có thẩm quyền:</strong> Chúng tôi chỉ cung cấp dữ liệu khi có yêu cầu hợp
              pháp bằng văn bản của cơ quan nhà nước có thẩm quyền.
            </li>
          </ol>
        </section>

        <section id="muc-4">
          <h2>4. Quyền của Chủ thể Dữ liệu và Cách thức Thực hiện (Theo Luật số 91/2025/QH15)</h2>
          <p>Bạn có đầy đủ các quyền của chủ thể dữ liệu theo pháp luật Việt Nam đối với dữ liệu cá nhân của mình:</p>
          <ol>
            <li>
              <strong>Quyền được biết và Quyền truy cập:</strong> Xem hồ sơ, bộ thẻ cá nhân, tiến độ học tập và lịch
              sử làm bài của mình ngay trong Ứng dụng.
            </li>
            <li>
              <strong>Quyền chỉnh sửa và sao chép:</strong> Tự cập nhật tên hiển thị, múi giờ, ngôn ngữ, số thẻ mới
              mỗi ngày và mật khẩu trong mục Hồ sơ; chỉnh sửa hoặc <strong>xuất bộ thẻ ra tệp CSV</strong>.
            </li>
            <li>
              <strong>Quyền rút lại sự đồng ý:</strong> Tắt nhắc ôn/thông báo đẩy, thu hồi quyền Microphone (khi có),
              đăng xuất, hoặc ngừng sử dụng các tính năng AI bất cứ lúc nào.
            </li>
            <li>
              <strong>Quyền yêu cầu xóa dữ liệu và Xóa tài khoản vĩnh viễn:</strong> Bạn tự xóa tài khoản tại trang{" "}
              <Link href="/account">Tài khoản</Link> (menu tài khoản → &ldquo;Tài khoản&rdquo; → &ldquo;Xóa tài
              khoản&rdquo;): nhập mật khẩu (nếu có) và cụm xác nhận. Việc xóa được thực hiện ngay: tài khoản, bộ thẻ cá
              nhân và thẻ trong đó, tiến độ ôn tập, phiên học, báo lỗi thẻ, tệp nhập PDF/CSV, đăng ký nhắc ôn và phiên
              đăng nhập bị xóa vĩnh viễn khỏi hệ thống sản xuất; nhật ký bảo mật được ẩn danh (bỏ liên kết với tài
              khoản). Tài khoản có vai trò quản trị cấp cao nhất (SUPER_ADMIN) do người vận hành xử lý riêng nên không
              có nút tự xóa. Nếu không tự thao tác được, bạn gửi yêu cầu qua đầu mối tại Mục 8 và Chúng tôi xử lý trong
              tối đa <strong>72 giờ</strong> (trừ chứng từ kế toán/giao dịch bắt buộc lưu theo Luật Kế toán và pháp luật
              về thuế, nếu có). Bản sao lưu (nếu có) bị ghi đè theo chu kỳ sao lưu.
            </li>
            <li>
              <strong>Quyền phản đối và hạn chế xử lý:</strong> Bạn có thể phản đối hoặc yêu cầu hạn chế việc xử lý
              dữ liệu cá nhân của mình, trừ phần xử lý bắt buộc để thực hiện hợp đồng hoặc theo quy định pháp luật.
            </li>
            <li>
              <strong>Quyền khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường:</strong> Bạn gửi yêu cầu tới đầu mối
              tại Mục 8. Chúng tôi xác nhận tiếp nhận trong <strong>72 giờ</strong> và trả lời trong thời hạn pháp luật
              quy định. Nếu không đồng ý với cách xử lý, bạn có quyền khiếu nại, tố cáo tới cơ quan nhà nước có thẩm
              quyền về bảo vệ dữ liệu cá nhân (Bộ Công an — Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ
              cao), khởi kiện và yêu cầu bồi thường thiệt hại theo quy định của pháp luật.
            </li>
          </ol>
        </section>

        <section id="muc-5">
          <h2>5. Thời hạn Lưu trữ, Biện pháp Bảo mật và Xử lý Sự cố</h2>
          <ul>
            <li>
              Dữ liệu tài khoản và tiến độ học tập được lưu trong suốt thời gian tài khoản hoạt động và bị xóa khi bạn
              yêu cầu xóa tài khoản.
            </li>
            <li>
              Phiên đăng nhập hết hạn được cơ sở dữ liệu tự xóa. Nhật ký truy cập, nhật ký ứng dụng và nhật ký gọi AI
              được giữ <strong>30 ngày</strong>; nhật ký thao tác quản trị giữ <strong>365 ngày</strong>; số liệu giám
              sát tài nguyên máy chủ (CPU/RAM/ổ đĩa, không chứa dữ liệu cá nhân) giữ có thời hạn rồi tự xóa.
            </li>
            <li>
              Tệp nhập PDF/CSV và kết quả đọc trang được giữ cho đến khi bạn hủy/xóa công việc nhập hoặc xóa tài
              khoản. Kết quả AI lưu đệm không gắn với danh tính của bạn.
            </li>
            <li>
              Đăng ký thông báo đẩy được giữ đến khi bạn tắt nhắc, thông báo bị trình duyệt từ chối, hoặc bạn xóa tài
              khoản.
            </li>
            <li>
              Mật khẩu được băm bằng <code>scrypt</code>; khóa dịch vụ AI được mã hóa <code>AES-256-GCM</code>; token
              đăng nhập nằm trong cookie <code>httpOnly</code>; thông tin nhạy cảm trong yêu cầu được lọc trước khi ghi
              nhật ký; giao tiếp giữa ứng dụng và máy chủ đi qua <code>HTTPS/TLS</code>; có giới hạn tần suất truy cập
              và chặn IP độc hại; quyền quản trị được phân vai và mọi thao tác ghi đều có nhật ký kiểm toán.
            </li>
            <li>
              <strong>Xử lý sự cố:</strong> Khi phát hiện vi phạm quy định bảo vệ dữ liệu cá nhân hoặc sự cố lộ lọt
              dữ liệu, Chúng tôi lập tức áp dụng biện pháp khắc phục và thông báo cho cơ quan nhà nước có thẩm quyền
              trong vòng <strong>72 giờ</strong> kể từ khi phát hiện, đồng thời thông báo cho người dùng bị ảnh hưởng
              về nội dung sự cố, hậu quả có thể xảy ra và biện pháp bạn nên thực hiện.
            </li>
            <li>
              <strong>Giới hạn của cam kết:</strong> Không có biện pháp kỹ thuật nào bảo đảm an toàn tuyệt đối. Chúng
              tôi áp dụng các biện pháp phù hợp với quy mô hiện tại của Nền tảng và sẽ nâng cấp khi quy mô thay đổi.
            </li>
          </ul>
        </section>

        <section id="muc-6">
          <h2>6. Dữ liệu cá nhân của Người dùng dưới 16 tuổi</h2>
          <ul>
            <li>
              Nền tảng hướng tới người học từ đủ 16 tuổi trở lên. Khi đăng ký, bạn phải xác nhận đủ 16 tuổi hoặc đã
              được cha, mẹ hoặc người giám hộ hợp pháp đồng ý.
            </li>
            <li>
              Việc xử lý dữ liệu cá nhân của người dưới 16 tuổi chỉ được thực hiện khi có sự đồng ý của cha, mẹ hoặc
              người giám hộ hợp pháp theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15. Chúng tôi hiện xác nhận điều
              kiện này qua cam kết của người đăng ký; khi mở tính năng dành riêng cho người học nhỏ tuổi, Chúng tôi sẽ
              bổ sung cơ chế xác minh người giám hộ và thông báo trước.
            </li>
            <li>
              Cha, mẹ hoặc người giám hộ hợp pháp có quyền yêu cầu xem, chỉnh sửa, rút lại sự đồng ý hoặc xóa toàn bộ
              dữ liệu của người dưới 16 tuổi qua đầu mối tại Mục 8. Khi phát hiện tài khoản của người dưới 16 tuổi được
              tạo mà không có sự đồng ý hợp lệ, Chúng tôi sẽ ngừng xử lý và xóa dữ liệu liên quan.
            </li>
          </ul>
        </section>
        <section id="muc-7">
          <h2>7. Thay đổi Chính sách này</h2>
          <ul>
            <li>
              Chính sách này có hiệu lực từ ngày {LAST_UPDATED}. Chúng tôi có thể cập nhật khi bổ sung tính năng, thay
              đổi nhà cung cấp dịch vụ hoặc khi pháp luật thay đổi.
            </li>
            <li>
              Với thay đổi mở rộng phạm vi thu thập, thêm mục đích xử lý mới hoặc thêm bên nhận dữ liệu, Chúng tôi
              thông báo trong Ứng dụng (và qua email nếu bạn đã cung cấp) ít nhất{" "}
              <strong>{legalConfig.noticeDays} ngày</strong> trước ngày áp dụng và xin lại sự đồng ý của bạn khi pháp
              luật yêu cầu.
            </li>
            <li>Các bản đã công bố trước đó được lưu giữ và cung cấp khi bạn yêu cầu.</li>
          </ul>
        </section>
        <section id="muc-8">
          <h2>8. Thông tin Liên hệ và Khiếu nại</h2>
          <p>
            Mọi thắc mắc, yêu cầu thực hiện quyền của chủ thể dữ liệu cá nhân (xem, chỉnh sửa, rút lại sự đồng ý, xóa
            tài khoản) hoặc thông báo khiếu nại bản quyền (Notice &amp; Takedown) xin gửi tới Bộ phận Bảo vệ Dữ liệu Cá
            nhân của {siteConfig.name}:
          </p>
          <LegalContact />
          <p>
            Chúng tôi xác nhận đã tiếp nhận trong vòng <strong>72 giờ</strong> làm việc và xử lý trong thời hạn pháp
            luật quy định cho từng loại yêu cầu. Nếu không đồng ý với kết quả xử lý, bạn có quyền khiếu nại tới{" "}
            <strong>Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao (A05) — Bộ Công an</strong> hoặc
            khởi kiện theo quy định của pháp luật Việt Nam.
          </p>
        </section>
    </LegalShell>
  );
}
