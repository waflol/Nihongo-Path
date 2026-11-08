import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "../site";

const termsDescription = `Điều khoản sử dụng dịch vụ của ${siteConfig.name} — quy định về tài khoản, bản quyền học liệu, công cụ AI, nội dung tải lên và giới hạn trách nhiệm theo pháp luật Việt Nam.`;

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: termsDescription,
  openGraph: {
    title: `Điều khoản sử dụng | ${siteConfig.name}`,
    description: termsDescription,
  },
};

const LAST_UPDATED = "07/11/2026";

const toc = [
  { id: "dieu-1", label: "Điều 1. Bản chất dịch vụ & Miễn trừ về giáo dục, nhãn hiệu" },
  { id: "dieu-2", label: "Điều 2. Tài khoản người dùng & Độ tuổi sử dụng" },
  { id: "dieu-3", label: "Điều 3. Quyền sở hữu trí tuệ & Nguồn dữ liệu mở" },
  { id: "dieu-4", label: "Điều 4. Quy định về nội dung do người dùng tải lên" },
  { id: "dieu-5", label: "Điều 5. Tính năng Trí tuệ nhân tạo (AI) & Ghi âm giọng nói" },
  { id: "dieu-6", label: "Điều 6. Gói thuê bao, Hạn mức (Quota) & Hoàn tiền" },
  { id: "dieu-7", label: "Điều 7. Giới hạn trách nhiệm & Tạm ngừng dịch vụ" },
  { id: "dieu-8", label: "Điều 8. Luật áp dụng & Giải quyết tranh chấp" },
];

export default function TermsPage() {
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
          Điều khoản Sử dụng Dịch vụ
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted-foreground)]">
          Chào mừng bạn đến với <strong className="font-semibold text-[var(--foreground)]">{siteConfig.name}</strong>{" "}
          (bao gồm website và ứng dụng di động trên iOS/Android, sau đây gọi chung là{" "}
          <strong className="font-semibold text-[var(--foreground)]">&ldquo;Nền tảng&rdquo;</strong> hoặc{" "}
          <strong className="font-semibold text-[var(--foreground)]">&ldquo;Ứng dụng&rdquo;</strong>). Bằng việc
          đánh dấu vào ô đồng ý khi đăng ký tài khoản, truy cập hoặc sử dụng bất kỳ tính năng nào của{" "}
          {siteConfig.name}, bạn xác nhận đã đọc, hiểu rõ và đồng ý chịu sự ràng buộc của toàn bộ Điều khoản
          Sử dụng này cùng{" "}
          <Link
            href="/privacy"
            className="font-medium text-[var(--primary)] underline underline-offset-4 hover:text-[var(--primary-hover)]"
          >
            Chính sách Bảo vệ Dữ liệu Cá nhân
          </Link>
          .
        </p>
      </header>

      {/* Quick summary banner */}
      <section
        aria-label="Tóm tắt các nguyên tắc cốt lõi"
        className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xs"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--primary)]">
          Tóm tắt 4 nguyên tắc quan trọng dành cho người học
        </h2>
        <ul className="mt-4 grid gap-3 text-sm leading-6 text-[var(--foreground)] sm:grid-cols-2">
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">1. Công cụ tự học độc lập</strong>
            <span className="text-[var(--muted-foreground)]">
              {siteConfig.name} là phần mềm hỗ trợ tự học tiếng Nhật, không phải trung tâm ngoại ngữ, không cấp
              văn bằng/chứng chỉ và không trực thuộc đơn vị tổ chức kỳ thi JLPT.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">2. Tài liệu tải lên chỉ dùng cá nhân</strong>
            <span className="text-[var(--muted-foreground)]">
              Bộ thẻ tự tạo, tệp CSV/Excel/PDF, âm thanh/video bạn tải lên được lưu ở chế độ Riêng tư và bạn tự
              chịu trách nhiệm về bản quyền tài liệu của mình.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">3. Kết quả AI mang tính tham khảo</strong>
            <span className="text-[var(--muted-foreground)]">
              Bản dịch, trích xuất chữ OCR, gợi ý ngữ pháp và chấm phát âm do AI sinh tự động có thể có sai sót,
              chỉ dùng để tham khảo học tập.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">4. Tuân thủ pháp luật Việt Nam</strong>
            <span className="text-[var(--muted-foreground)]">
              Nghiêm cấm nhập hoặc tải lên nội dung vi phạm Luật An ninh mạng 2018, Luật Sở hữu trí tuệ và Luật
              Bảo vệ dữ liệu cá nhân số 91/2025/QH15.
            </span>
          </li>
        </ul>
      </section>

      {/* Table of contents */}
      <nav
        aria-label="Mục lục Điều khoản sử dụng"
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

      {/* Main legal content */}
      <div className="mt-10 space-y-10 text-sm leading-7 text-[var(--foreground)] sm:text-base sm:leading-8">
        <section id="dieu-1" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 1. Bản chất Dịch vụ và Tuyên bố Miễn trừ về Giáo dục &amp; Nhãn hiệu
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Công cụ hỗ trợ tự học:</strong>{" "}
              {siteConfig.name} là nền tảng phần mềm cung cấp các công cụ kỹ thuật số và học liệu tham khảo hỗ trợ
              người dùng tự học và ôn luyện tiếng Nhật (bao gồm từ vựng, chữ Hán – Kanji, ngữ pháp, thẻ ghi nhớ
              Flashcard theo thuật toán lặp lại ngắt quãng SRS, bài tập luyện tập, đề thi thử mô phỏng và các công
              cụ hỗ trợ bởi trí tuệ nhân tạo).
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Không phải cơ sở giáo dục / Không cấp văn bằng:
              </strong>{" "}
              {siteConfig.name} không phải là trường học, trung tâm ngoại ngữ hay tổ chức khảo thí thuộc hệ thống
              giáo dục quốc dân theo Luật Giáo dục 2019 và Nghị định 125/2024/NĐ-CP. Mọi điểm số, đánh giá năng
              lực, kết quả làm bài thi thử trên Ứng dụng chỉ mang tính chất tham khảo cá nhân, không có giá trị
              thay thế cho bất kỳ văn bằng, chứng chỉ ngoại ngữ chính thức nào.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Miễn trừ liên kết Nhãn hiệu JLPT:
              </strong>{" "}
              Thuật ngữ &ldquo;JLPT&rdquo; (<em>Japanese-Language Proficiency Test</em> — Kỳ thi Năng lực Tiếng
              Nhật) được nhắc đến trên Nền tảng chỉ nhằm mục đích mô tả cấp độ tham chiếu năng lực ngôn ngữ (N5,
              N4, N3, N2, N1).{" "}
              <strong className="font-medium text-[var(--foreground)]">
                JLPT là nhãn hiệu đã đăng ký của Japan Foundation và Japan Educational Exchanges and Services
                (JEES).
              </strong>{" "}
              {siteConfig.name} là sản phẩm độc lập, hoàn toàn không trực thuộc, không liên kết, không được tài trợ
              hay chứng nhận bởi Japan Foundation, JEES hoặc bất kỳ nhà xuất bản giáo trình thương mại nào.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Không cam kết kết quả thi cử:</strong> Chúng
              tôi nỗ lực cung cấp học liệu và thuật toán ôn tập tối ưu nhưng không cam kết hay bảo đảm rằng việc sử
              dụng Ứng dụng sẽ giúp Người dùng thi đỗ bất kỳ kỳ thi thực tế nào.
            </li>
          </ol>
        </section>

        <section id="dieu-2" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 2. Tài khoản Người dùng và Độ tuổi Sử dụng
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Điều kiện độ tuổi:</strong>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  Người dùng từ <strong className="font-medium text-[var(--foreground)]">đủ 16 tuổi trở lên</strong>{" "}
                    được phép tự đăng ký tài khoản theo quy định pháp luật Việt Nam.
                </li>
                <li>
                  Người dùng <strong className="font-medium text-[var(--foreground)]">dưới 16 tuổi</strong> chỉ
                  được tạo tài khoản và sử dụng Ứng dụng khi có sự đồng ý, giám sát và chịu trách nhiệm của cha, mẹ
                  hoặc người giám hộ hợp pháp theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị
                  định 147/2024/NĐ-CP.
                </li>
              </ul>
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Bảo mật tài khoản:</strong> Bạn có trách
              nhiệm tự bảo mật mật khẩu, mã xác thực và quyền truy cập thiết bị của mình. Bạn không được cho thuê,
              bán, nhượng lại hoặc chia sẻ tài khoản trả phí cho nhiều người cùng sử dụng trái phép. Mọi thao tác
              phát sinh từ tài khoản của bạn được mặc định là do chính bạn thực hiện.
            </li>
          </ol>
        </section>

        <section id="dieu-3" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 3. Quyền Sở hữu Trí tuệ và Ghi công Nguồn Dữ liệu Mở
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">Tài sản của {siteConfig.name}:</strong> Toàn
              bộ mã nguồn, giao diện, thiết kế, biểu trưng, thuật toán SRS, hệ thống câu hỏi/bài tập tự biên soạn
              và cấu trúc cơ sở dữ liệu trên Nền tảng thuộc quyền sở hữu hợp pháp của Chúng tôi. Nghiêm cấm mọi
              hành vi sao chép, dịch ngược (reverse engineering), cào dữ liệu tự động (scraping/crawling) hoặc khai
              thác thương mại trái phép dưới bất kỳ hình thức nào.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Ghi công Dữ liệu Từ điển Nguồn mở (Open-Data Attribution):
              </strong>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  Dữ liệu chữ Hán và từ điển tiếng Nhật trên Nền tảng có sử dụng nguồn dữ liệu mở từ dự án{" "}
                  <strong className="font-medium text-[var(--foreground)]">KANJIDIC2</strong> và{" "}
                  <strong className="font-medium text-[var(--foreground)]">JMdict/EDICT</strong>, thuộc bản quyền
                  của{" "}
                  <strong className="font-medium text-[var(--foreground)]">
                    Electronic Dictionary Research and Development Group (EDRDG)
                  </strong>{" "}
                  và được sử dụng theo giấy phép{" "}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] underline hover:text-[var(--primary-hover)]"
                  >
                    Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
                  </a>
                  .
                </li>
                <li>
                  Dữ liệu sơ đồ thứ tự nét viết chữ Hán (SVG stroke paths) được lấy từ dự án{" "}
                  <strong className="font-medium text-[var(--foreground)]">KanjiVG</strong>, thuộc bản quyền của{" "}
                  <strong className="font-medium text-[var(--foreground)]">Ulrich Apel</strong> và được sử dụng
                  theo giấy phép{" "}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/3.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] underline hover:text-[var(--primary-hover)]"
                  >
                    Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
                  </a>
                  .
                </li>
              </ul>
            </li>
          </ol>
        </section>

        <section id="dieu-4" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 4. Quy định về Nội dung do Người dùng Tải lên (Import CSV/Excel/PDF, Flashcard, Audio/Video)
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Phạm vi sử dụng cá nhân (Riêng tư):
              </strong>{" "}
              {siteConfig.name} cung cấp công cụ kỹ thuật cho phép Người dùng tự tạo bộ thẻ ghi nhớ hoặc nhập dữ
              liệu từ tệp tin của mình (CSV, Excel, PDF, âm thanh, video) để phục vụ nhu cầu tự học cá nhân. Các
              nội dung do bạn tải lên được lưu trữ ở chế độ{" "}
              <strong className="font-medium text-[var(--foreground)]">Riêng tư (chỉ mình bạn truy cập được)</strong>{" "}
              và không tự động phát hành công khai cho người dùng khác.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Cam kết về Bản quyền và Tính hợp pháp của Tài liệu tải lên:
              </strong>{" "}
              Khi tạo thẻ hoặc tải lên bất kỳ tệp tin nào (đặc biệt là tệp PDF, âm thanh, video), bạn cam kết và
              chịu hoàn toàn trách nhiệm trước pháp luật rằng:
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  Bạn là chủ sở hữu hợp pháp hoặc có quyền sử dụng hợp pháp đối với tài liệu đó cho mục đích học
                  tập cá nhân theo quy định của Luật Sở hữu trí tuệ Việt Nam (sửa đổi, bổ sung năm 2022).
                </li>
                <li>
                  Bạn không sử dụng Nền tảng để lưu trữ, phát tán, chia sẻ trái phép các bản sao lậu của sách giáo
                  trình, đề thi hoặc tài liệu có bản quyền của bên thứ ba.
                </li>
              </ul>
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Các nội dung bị nghiêm cấm tuyệt đối (Theo Điều 8 Luật An ninh mạng 2018 &amp; Nghị định
                147/2024/NĐ-CP):
              </strong>{" "}
              Nghiêm cấm Người dùng tải lên, nhập vào bộ thẻ, nhập vào công cụ dịch/AI hoặc ghi âm các nội dung:
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  Tuyên truyền chống phá Nhà nước Cộng hòa xã hội chủ nghĩa Việt Nam; xuyên tạc lịch sử, phủ nhận
                  thành tựu cách mạng, phá hoại khối đại đoàn kết toàn dân tộc; kích động chiến tranh, khủng bố,
                  gây hận thù, phân biệt chủng tộc, tôn giáo.
                </li>
                <li>
                  Sử dụng bản đồ, hình ảnh hoặc thông tin sai lệch xâm phạm chủ quyền biên giới, biển đảo của Việt
                  Nam (bao gồm quần đảo Hoàng Sa và Trường Sa).
                </li>
                <li>
                  Nội dung đồi trụy, khiêu dâm, bạo lực, tệ nạn xã hội, mê tín dị đoan, cổ súy tự sát hoặc vi phạm
                  thuần phong mỹ tục Việt Nam.
                </li>
                <li>
                  Bí mật nhà nước, bí mật kinh doanh hoặc dữ liệu cá nhân, hình ảnh, giọng nói của người khác khi
                  chưa được sự đồng ý hợp pháp của họ.
                </li>
                <li>
                  Tệp tin chứa mã độc, virus, script tấn công (XSS, Injection) hoặc tệp tin nhằm gây quá tải hệ
                  thống.
                </li>
              </ul>
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Quyền kiểm duyệt và Gỡ bỏ (Notice &amp; Takedown):
              </strong>{" "}
              Chúng tôi có quyền tạm khóa hoặc xóa bỏ bất kỳ nội dung nào bị phát hiện hoặc bị khiếu nại vi phạm
              bản quyền hay vi phạm pháp luật Việt Nam trong vòng 24 đến 72 giờ mà không cần báo trước, đồng thời
              khóa vĩnh viễn tài khoản vi phạm nghiêm trọng.
            </li>
          </ol>
        </section>

        <section id="dieu-5" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 5. Điều khoản về các Tính năng Trí tuệ Nhân tạo (AI) và Ghi âm Giọng nói
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Bản chất tham khảo của kết quả AI:
              </strong>{" "}
              Các tính năng dịch thuật, trích xuất chữ từ ảnh/PDF (OCR), gợi ý cách viết/ngữ pháp, phân tích câu,
              chấm điểm phát âm (Shadowing) và hội thoại giả lập (AI Kaiwa) được vận hành bởi các mô hình ngôn ngữ
              lớn (LLM) và công nghệ nhận diện giọng nói tự động. Kết quả do AI tạo ra có thể xuất hiện sai sót
              (&ldquo;ảo giác AI&rdquo; – hallucination) về ngữ nghĩa, sắc thái văn hóa hoặc độ chính xác ngôn ngữ.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Miễn trừ trách nhiệm đối với kết quả AI:
              </strong>{" "}
              Người dùng chỉ sử dụng phản hồi của AI làm tài liệu tham khảo học tập, tuyệt đối không sử dụng làm
              căn cứ dịch thuật công chứng, y tế, pháp lý hay thương mại. Điểm số chấm phát âm AI chỉ phản ánh mức
              độ tương đồng tương đối về âm học, không phải kết luận đánh giá năng lực tuyệt đối.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Xử lý giọng nói và văn bản qua đối tác AI:
              </strong>{" "}
              Khi bạn chủ động sử dụng tính năng AI hoặc bấm nút thu âm luyện nói, văn bản hoặc đoạn âm thanh tương
              ứng sẽ được truyền mã hóa tới dịch vụ xử lý AI để trả về kết quả học tập theo đúng{" "}
              <Link
                href="/privacy"
                className="font-medium text-[var(--primary)] underline hover:text-[var(--primary-hover)]"
              >
                Chính sách Bảo vệ Dữ liệu Cá nhân
              </Link>
              .
            </li>
          </ol>
        </section>

        <section id="dieu-6" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 6. Gói Thuê bao Trả phí (Pro / VIP), Hạn mức (Quota) và Chính sách Hoàn tiền
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              <strong className="font-medium text-[var(--foreground)]">
                Các gói dịch vụ và Hạn mức:
              </strong>{" "}
              {siteConfig.name} cung cấp gói Miễn phí (Free) và các gói nâng cấp trả phí (Pro, VIP — khi được mở
              bán chính thức) với hạn mức sử dụng tính năng (số bộ thẻ, lượt gọi AI/OCR, phút hội thoại...) được
              công bố công khai. Hạn mức sử dụng theo ngày/tháng tự động đặt lại (reset) theo chu kỳ và không cộng
              dồn sang kỳ tiếp theo.
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Phương thức thanh toán:</strong>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="font-medium text-[var(--foreground)]">
                    Trên ứng dụng iOS (Apple App Store) và Android (Google Play Store):
                  </strong>{" "}
                  Việc mua gói thuê bao được thực hiện thông qua hệ thống Thanh toán trong ứng dụng (In-App
                  Purchase) của Apple hoặc Google. Việc gia hạn tự động, hủy gia hạn và yêu cầu hoàn tiền đối với
                  các giao dịch qua App Store / Google Play tuân theo chính sách trực tiếp của Apple và Google.
                </li>
                <li>
                  <strong className="font-medium text-[var(--foreground)]">Trên Website:</strong> Việc thanh toán
                  được thực hiện qua các cổng thanh toán điện tử hợp pháp được tích hợp trên Website.
                </li>
              </ul>
            </li>
            <li>
              <strong className="font-medium text-[var(--foreground)]">Hủy gia hạn và Hoàn tiền:</strong> Bạn có
              thể hủy gia hạn gói thuê bao bất kỳ lúc nào trong mục Quản lý gói thuê bao (hoặc trong phần
              Subscriptions của Apple ID / Google Play) trước ngày gia hạn kỳ tiếp theo ít nhất 24 giờ. Sau khi hủy
              gia hạn, bạn vẫn được tiếp tục sử dụng quyền lợi của gói đã mua cho đến hết chu kỳ đã thanh toán. Các
              khoản phí đã thanh toán cho chu kỳ đang chạy không được hoàn lại, trừ trường hợp lỗi kỹ thuật nghiêm
              trọng từ hệ thống của Chúng tôi khiến bạn không thể sử dụng dịch vụ trong hơn 72 giờ liên tục mà
              không khắc phục được, hoặc theo quy định bắt buộc của Luật Bảo vệ quyền lợi người tiêu dùng Việt Nam.
            </li>
          </ol>
        </section>

        <section id="dieu-7" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 7. Giới hạn Trách nhiệm và Tạm ngừng Dịch vụ
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              Dịch vụ được cung cấp trên cơ sở &ldquo;Nguyên trạng&rdquo; (As-is) và &ldquo;Theo khả năng hiện
              có&rdquo; (As-available). Chúng tôi không chịu trách nhiệm bồi thường đối với các thiệt hại gián tiếp
              phát sinh từ sự cố đường truyền Internet của người dùng, sự cố gián đoạn từ nhà cung cấp hạ tầng đám
              mây/AI bên thứ ba, hoặc sự kiện bất khả kháng theo quy định của Bộ luật Dân sự Việt Nam.
            </li>
            <li>
              Trong mọi trường hợp, tổng mức trách nhiệm bồi thường tối đa của Chúng tôi (nếu có) đối với một Người
              dùng cho mọi khiếu nại phát sinh sẽ không vượt quá tổng số tiền phí dịch vụ thực tế mà Người dùng đó
              đã thanh toán cho {siteConfig.name} trong vòng 03 (ba) tháng gần nhất trước thời điểm phát sinh sự
              kiện.
            </li>
          </ol>
        </section>

        <section id="dieu-8" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Điều 8. Luật Áp dụng và Giải quyết Tranh chấp
          </h2>
          <ol className="list-decimal space-y-2.5 pl-5 text-[var(--muted-foreground-1)]">
            <li>
              Điều khoản Sử dụng này được điều chỉnh và giải thích theo{" "}
              <strong className="font-medium text-[var(--foreground)]">
                pháp luật nước Cộng hòa xã hội chủ nghĩa Việt Nam
              </strong>
              .
            </li>
            <li>
              Mọi tranh chấp phát sinh trước hết sẽ được giải quyết thông qua thương lượng thiện chí trong vòng 30
              ngày kể từ khi một bên thông báo bằng văn bản. Trường hợp không đạt được thỏa thuận, tranh chấp sẽ
              được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền tại Việt Nam.
            </li>
          </ol>
        </section>
      </div>

      {/* Footer navigation */}
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm">
        <div>
          <p className="font-semibold text-[var(--foreground)]">Xem thêm văn bản liên quan</p>
          <p className="text-[var(--muted-foreground)]">
            Tìm hiểu cách chúng tôi thu thập, mã hóa và bảo vệ dữ liệu cá nhân của bạn.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)]"
          >
            Chính sách Bảo vệ Dữ liệu Cá nhân →
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
