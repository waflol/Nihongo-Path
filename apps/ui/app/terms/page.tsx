import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";
import { siteConfig } from "../site";
import { legalConfig } from "../legal";
import { LegalContact } from "@/components/legal/legal-contact";

const termsDescription = `Điều khoản sử dụng dịch vụ của ${siteConfig.name} — quy định về tài khoản, bản quyền học liệu, công cụ AI, nội dung tải lên và giới hạn trách nhiệm theo pháp luật Việt Nam.`;

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: termsDescription,
  openGraph: {
    title: `Điều khoản sử dụng | ${siteConfig.name}`,
    description: termsDescription,
  },
};

const LAST_UPDATED = legalConfig.updated;

const toc = [
  { id: "dieu-1", label: "Điều 1. Bản chất dịch vụ & Miễn trừ về giáo dục, nhãn hiệu" },
  { id: "dieu-2", label: "Điều 2. Tài khoản, độ tuổi & Chấm dứt sử dụng" },
  { id: "dieu-3", label: "Điều 3. Quyền sở hữu trí tuệ & Nguồn dữ liệu mở" },
  { id: "dieu-4", label: "Điều 4. Nội dung người dùng & Quy trình gỡ bỏ" },
  { id: "dieu-5", label: "Điều 5. Tính năng Trí tuệ nhân tạo (AI)" },
  { id: "dieu-6", label: "Điều 6. Gói dịch vụ, Hạn mức (Quota) & Hoàn tiền" },
  { id: "dieu-7", label: "Điều 7. Giới hạn trách nhiệm & Quyền của người tiêu dùng" },
  { id: "dieu-8", label: "Điều 8. Sửa đổi Điều khoản & Hiệu lực từng phần" },
  { id: "dieu-9", label: "Điều 9. Đơn vị vận hành & Thông tin liên hệ" },
  { id: "dieu-10", label: "Điều 10. Luật áp dụng & Giải quyết tranh chấp" },
];

export default function TermsPage() {
  return (
    <LegalShell
      kicker="Văn bản pháp lý"
      title="Điều khoản Sử dụng Dịch vụ"
      updated={LAST_UPDATED}
      tocLabel="Mục lục Điều khoản sử dụng"
      toc={toc}
      highlightsTitle="Tóm tắt 4 nguyên tắc quan trọng dành cho người học"
      related={{
        title: "Xem thêm văn bản liên quan",
        text: "Tìm hiểu cách chúng tôi thu thập, mã hóa và bảo vệ dữ liệu cá nhân của bạn.",
        href: "/privacy",
        cta: "Chính sách Bảo vệ Dữ liệu Cá nhân →",
      }}
      intro={
        <>
          Chào mừng bạn đến với <strong className="font-semibold text-[var(--foreground)]">{siteConfig.name}</strong>{" "}
          (website và ứng dụng di động khi được phát hành, sau đây gọi chung là{" "}
          <strong className="font-semibold text-[var(--foreground)]">&ldquo;Nền tảng&rdquo;</strong> hoặc{" "}
          <strong className="font-semibold text-[var(--foreground)]">&ldquo;Ứng dụng&rdquo;</strong>). Bằng việc
          đánh dấu vào ô đồng ý khi đăng ký tài khoản, truy cập hoặc sử dụng bất kỳ tính năng nào của{" "}
          {siteConfig.name} — do đơn vị nêu tại Điều 9 vận hành — bạn xác nhận đã đọc, hiểu rõ và đồng ý chịu sự ràng buộc của toàn bộ Điều khoản
          Sử dụng này cùng{" "}
          <Link
            href="/privacy"
            className="font-medium text-[var(--primary)] underline underline-offset-4 hover:text-[var(--primary-hover)]"
          >
            Chính sách Bảo vệ Dữ liệu Cá nhân
          </Link>
          .
        </>
      }
      highlights={
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
              Bộ thẻ tự tạo, tệp CSV/Excel/PDF bạn tải lên được lưu ở chế độ Riêng tư và bạn tự
              chịu trách nhiệm về bản quyền tài liệu của mình.
            </span>
          </li>
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <strong className="block font-semibold">3. Kết quả AI mang tính tham khảo</strong>
            <span className="text-[var(--muted-foreground)]">
              Câu ví dụ, bản dịch, kiểm tra cách đọc/Hán Việt và đọc chữ OCR do AI sinh tự động có thể có sai sót,
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
      }
    >
        <section id="dieu-1">
          <h2>Điều 1. Bản chất Dịch vụ và Tuyên bố Miễn trừ về Giáo dục &amp; Nhãn hiệu</h2>
          <ol>
            <li>
              <strong>Công cụ hỗ trợ tự học:</strong> {siteConfig.name} là nền tảng phần mềm cung cấp công cụ kỹ
              thuật số và học liệu tham khảo hỗ trợ người dùng tự học và ôn luyện tiếng Nhật, hiện gồm: từ vựng,
              ngữ pháp, bảng 2136 chữ Hán Jōyō (Kanji), thẻ ghi nhớ Flashcard ôn theo thuật toán lặp lại ngắt quãng
              FSRS, bài tập và câu luyện thi dạng 問題, nhập bộ thẻ từ tệp CSV/Excel/PDF, nhắc ôn tập hằng ngày
              (thông báo đẩy trên trình duyệt/ứng dụng cài đặt PWA) và một số công cụ hỗ trợ bởi trí tuệ nhân tạo.
              Các tính năng đang phát triển (đề thi thử có chấm điểm và bấm giờ, luyện phát âm/Shadowing, hội thoại
              AI Kaiwa, gói trả phí) chỉ áp dụng khi được mở chính thức trên Nền tảng.
            </li>
            <li>
              <strong>Không phải cơ sở giáo dục / Không cấp văn bằng:</strong> {siteConfig.name} không phải là
              trường học, trung tâm ngoại ngữ hay tổ chức khảo thí thuộc hệ thống giáo dục quốc dân theo Luật Giáo
              dục 2019 và Nghị định 125/2024/NĐ-CP. Mọi điểm số, đánh giá năng lực, kết quả làm bài trên Ứng dụng chỉ
              mang tính chất tham khảo cá nhân, không có giá trị thay thế cho bất kỳ văn bằng, chứng chỉ ngoại ngữ
              chính thức nào.
            </li>
            <li>
              <strong>Miễn trừ liên kết Nhãn hiệu JLPT:</strong> Thuật ngữ &ldquo;JLPT&rdquo; (
              <em>Japanese-Language Proficiency Test</em> — Kỳ thi Năng lực Tiếng Nhật) được nhắc đến trên Nền tảng
              chỉ nhằm mô tả cấp độ tham chiếu năng lực ngôn ngữ (N5, N4, N3, N2, N1).{" "}
              <strong>
                JLPT là nhãn hiệu đã đăng ký của Japan Foundation và Japan Educational Exchanges and Services
                (JEES).
              </strong>{" "}
              {siteConfig.name} là sản phẩm độc lập, hoàn toàn không trực thuộc, không liên kết, không được tài trợ
              hay chứng nhận bởi Japan Foundation, JEES hoặc bất kỳ nhà xuất bản giáo trình thương mại nào. Các câu
              luyện thi trên Nền tảng là câu hỏi luyện tập tham khảo, không phải đề thi JLPT thật.
            </li>
            <li>
              <strong>Không cam kết kết quả thi cử:</strong> Chúng tôi nỗ lực cung cấp học liệu và thuật toán ôn tập
              tối ưu nhưng không cam kết hay bảo đảm rằng việc sử dụng Ứng dụng sẽ giúp Người dùng thi đỗ bất kỳ kỳ
              thi thực tế nào.
            </li>
          </ol>
        </section>

        <section id="dieu-2">
          <h2>Điều 2. Tài khoản Người dùng và Độ tuổi Sử dụng</h2>
          <ol>
            <li>
              <strong>Đăng ký và đăng nhập:</strong> Bạn có thể tạo tài khoản bằng email và mật khẩu hoặc đăng nhập
              bằng tài khoản Google. Thông tin bạn cung cấp phải chính xác và được cập nhật khi thay đổi.
            </li>
            <li>
              <strong>Điều kiện độ tuổi:</strong>
              <ul>
                <li>
                  Người dùng <strong>đủ 16 tuổi trở lên</strong> được phép tự đăng ký tài khoản theo quy định pháp
                  luật Việt Nam.
                </li>
                <li>
                  Người dùng <strong>dưới 16 tuổi</strong> chỉ được tạo tài khoản và sử dụng Ứng dụng khi có sự đồng
                  ý, giám sát và chịu trách nhiệm của cha, mẹ hoặc người giám hộ hợp pháp theo quy định của Luật Bảo
                  vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 147/2024/NĐ-CP.
                </li>
              </ul>
            </li>
            <li>
              <strong>Bảo mật tài khoản:</strong> Bạn có trách nhiệm tự bảo mật mật khẩu và quyền truy cập thiết bị
              của mình. Bạn không được cho thuê, bán, nhượng lại hoặc chia sẻ tài khoản trả phí cho nhiều người cùng
              sử dụng trái phép. Mọi thao tác phát sinh từ tài khoản của bạn được mặc định là do chính bạn thực hiện.
            </li>
            <li>
              <strong>Bạn chấm dứt sử dụng:</strong> Bạn có quyền ngừng sử dụng dịch vụ và yêu cầu xóa tài khoản bất
              kỳ lúc nào, không cần nêu lý do và không mất phí, theo thủ tục tại{" "}
              <Link href="/privacy#muc-4">Mục 4 Chính sách Bảo vệ Dữ liệu Cá nhân</Link>.
            </li>
            <li>
              <strong>Chúng tôi tạm khóa hoặc chấm dứt tài khoản:</strong> Chúng tôi có quyền tạm khóa hoặc chấm dứt
              tài khoản vi phạm Điều khoản này, đồng thời chặn địa chỉ IP có dấu hiệu tấn công hoặc lạm dụng hệ thống
              (xem Điều 7). Trừ trường hợp phải xử lý ngay để ngăn chặn thiệt hại, hành vi vi phạm pháp luật hoặc
              theo yêu cầu của cơ quan nhà nước có thẩm quyền, Chúng tôi sẽ nêu lý do và tiếp nhận khiếu nại của bạn
              qua đầu mối tại Điều 9.
            </li>
          </ol>
        </section>

        <section id="dieu-3">
          <h2>Điều 3. Quyền Sở hữu Trí tuệ và Ghi công Nguồn Dữ liệu Mở</h2>
          <ol>
            <li>
              <strong>Tài sản của {siteConfig.name}:</strong> Toàn bộ mã nguồn, giao diện, thiết kế, biểu tượng, thuật
              toán, hệ thống câu hỏi/bài tập tự biên soạn và cấu trúc cơ sở dữ liệu trên Nền tảng thuộc quyền sở hữu
              hợp pháp của Chúng tôi. Nghiêm cấm mọi hành vi sao chép, dịch ngược (reverse engineering), cào dữ liệu
              tự động (scraping/crawling) hoặc khai thác thương mại trái phép dưới bất kỳ hình thức nào.
            </li>
            <li>
              <strong>Ghi công dữ liệu mở và nguồn tham khảo:</strong> {siteConfig.name} sử dụng các nguồn dữ liệu
              sau, mọi quyền thuộc về chủ sở hữu tương ứng:
              <ul>
                <li>
                  Dữ liệu chữ Hán (KANJIDIC2), thành phần chữ Hán (KRADFILE) và từ điển tiếng Nhật (JMdict/EDICT) của{" "}
                  <strong>Electronic Dictionary Research and Development Group (EDRDG)</strong>, theo giấy phép{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
                    CC BY-SA 4.0
                  </a>
                  .
                </li>
                <li>
                  Sơ đồ thứ tự nét viết chữ Hán (SVG) từ dự án <strong>KanjiVG</strong> của{" "}
                  <strong>Ulrich Apel</strong>, theo giấy phép{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
                    CC BY-SA 3.0
                  </a>
                  .
                </li>
                <li>
                  Các câu ví dụ Nhật–Việt lấy từ dự án cộng đồng <strong>Tatoeba</strong> (tatoeba.org), theo giấy
                  phép{" "}
                  <a href="https://creativecommons.org/licenses/by/2.0/fr/" target="_blank" rel="noopener noreferrer">
                    CC BY 2.0 FR
                  </a>
                  .
                </li>
                <li>
                  Âm Hán Việt, âm On/Kun được đối chiếu với nguồn tham khảo công khai <strong>mazii.net</strong> chỉ
                  nhằm mục đích kiểm tra học liệu; quyền sở hữu nội dung thuộc chủ sở hữu của nguồn này.
                </li>
              </ul>
              Phần dữ liệu phái sinh từ các nguồn CC BY-SA được chia sẻ theo cùng giấy phép đó.
            </li>
          </ol>
        </section>

        <section id="dieu-4">
          <h2>Điều 4. Nội dung do Người dùng Tạo, Tải lên và Quy trình Thông báo &amp; Gỡ bỏ</h2>
          <ol>
            <li>
              <strong>Phạm vi sử dụng cá nhân (Riêng tư):</strong> {siteConfig.name} cho phép bạn tự tạo bộ thẻ ghi
              nhớ hoặc nhập dữ liệu từ tệp của mình (CSV, Excel, PDF) để tự học. Nội dung do bạn tạo hoặc tải lên được
              lưu ở chế độ <strong>Riêng tư (chỉ mình bạn truy cập được)</strong> và không tự động phát hành công
              khai. Chỉ khi bạn chủ động dùng chức năng chia sẻ bộ thẻ thì người nhận mới xem được bộ thẻ đó và bạn
              chịu trách nhiệm về nội dung chia sẻ. Tính năng tải lên âm thanh/video (nếu được mở sau này) sẽ tuân
              theo cùng quy định.
            </li>
            <li>
              <strong>Cam kết về Bản quyền và Tính hợp pháp của Tài liệu:</strong> Khi tạo thẻ hoặc tải lên bất kỳ
              tệp nào (đặc biệt là PDF scan sách giáo trình), bạn cam kết và chịu hoàn toàn trách nhiệm trước pháp
              luật rằng:
              <ul>
                <li>
                  Bạn là chủ sở hữu hợp pháp hoặc có quyền sử dụng hợp pháp đối với tài liệu đó cho mục đích học tập
                  cá nhân theo quy định của Luật Sở hữu trí tuệ Việt Nam (sửa đổi, bổ sung năm 2022).
                </li>
                <li>
                  Bạn không sử dụng Nền tảng để lưu trữ, phát tán, chia sẻ trái phép các bản sao lậu của sách giáo
                  trình, đề thi hoặc tài liệu có bản quyền của bên thứ ba.
                </li>
              </ul>
            </li>
            <li>
              <strong>Các nội dung bị nghiêm cấm tuyệt đối (Theo Điều 8 Luật An ninh mạng 2018 &amp; Nghị định
              147/2024/NĐ-CP):</strong> Nghiêm cấm Người dùng tạo, tải lên, nhập vào bộ thẻ, nhập vào công cụ AI
              hoặc gửi trong phần phản hồi các nội dung:
              <ul>
                <li>
                  Tuyên truyền chống phá Nhà nước Cộng hòa xã hội chủ nghĩa Việt Nam; xuyên tạc lịch sử, phủ nhận
                  thành tựu cách mạng, phá hoại khối đại đoàn kết toàn dân tộc; kích động chiến tranh, khủng bố, gây
                  hận thù, phân biệt chủng tộc, tôn giáo.
                </li>
                <li>
                  Sử dụng bản đồ, hình ảnh hoặc thông tin sai lệch xâm phạm chủ quyền biên giới, biển đảo của Việt Nam
                  (bao gồm quần đảo Hoàng Sa và Trường Sa).
                </li>
                <li>
                  Nội dung đồi trụy, khiêu dâm, bạo lực, tệ nạn xã hội, mê tín dị đoan, cổ súy tự sát hoặc vi phạm
                  thuần phong mỹ tục Việt Nam.
                </li>
                <li>
                  Bí mật nhà nước, bí mật kinh doanh hoặc dữ liệu cá nhân của người khác khi chưa được sự đồng ý hợp
                  pháp của họ.
                </li>
                <li>
                  Tệp chứa mã độc, virus, script tấn công (XSS, Injection) hoặc tệp nhằm gây quá tải hệ thống.
                </li>
              </ul>
            </li>
            <li>
              <strong>Báo lỗi học liệu và phản hồi:</strong> Bạn có thể gửi báo lỗi thẻ hoặc phản hồi cho quản trị
              viên. Bạn đồng ý để Chúng tôi dùng nội dung phản hồi đó để sửa lỗi và cải thiện học liệu mà không phát
              sinh nghĩa vụ trả phí.
            </li>
            <li>
              <strong>Không giám sát trước, nhưng xử lý khi được thông báo:</strong> Chúng tôi không có nghĩa vụ và
              không thực hiện việc đọc trước toàn bộ nội dung riêng tư của người dùng. Khi nhận được thông báo hợp lệ
              hoặc tự phát hiện nội dung vi phạm bản quyền hay vi phạm pháp luật Việt Nam, Chúng tôi sẽ tạm ẩn hoặc gỡ
              bỏ nội dung đó trong vòng <strong>24 đến 72 giờ</strong> làm việc, và khóa tài khoản vi phạm nghiêm trọng
              hoặc tái phạm.
            </li>
            <li>
              <strong>Cách gửi thông báo vi phạm (Notice &amp; Takedown):</strong> Chủ sở hữu quyền hoặc người bị xâm
              phạm gửi thông báo tới đầu mối tại <a href="#dieu-9">Điều 9</a>, nêu rõ: (i) tên, địa chỉ, thông tin liên
              hệ của người thông báo; (ii) mô tả tác phẩm/quyền bị xâm phạm và căn cứ chứng minh quyền; (iii) đường dẫn
              hoặc dấu hiệu nhận biết nội dung bị khiếu nại; (iv) cam đoan thông tin cung cấp là trung thực và chịu
              trách nhiệm trước pháp luật về thông báo của mình.
            </li>
            <li>
              <strong>Quyền phản đối của người bị gỡ nội dung:</strong> Người dùng có nội dung bị gỡ được thông báo lý
              do và có quyền gửi văn bản phản đối kèm chứng cứ về quyền sử dụng hợp pháp. Nếu phản đối có căn cứ,
              Chúng tôi khôi phục nội dung; nếu hai bên không thống nhất, vụ việc được giải quyết theo Điều 10.
            </li>
          </ol>
        </section>

        <section id="dieu-5">
          <h2>Điều 5. Điều khoản về các Tính năng Trí tuệ Nhân tạo (AI)</h2>
          <ol>
            <li>
              <strong>Các tính năng AI hiện có:</strong> Gợi ý câu ví dụ và bản dịch, kiểm tra cách đọc / âm Hán Việt
              / nghĩa của từ vựng (kể cả kiểm tra cả bộ thẻ), và đọc chữ từ PDF scan (OCR) khi nhập bộ thẻ. Các tính
              năng luyện phát âm/Shadowing, nhận diện giọng nói và hội thoại AI Kaiwa đang phát triển; khi được mở,
              chúng chỉ thu âm sau khi bạn chủ động bấm nút và cấp quyền Microphone, và được áp dụng bổ sung các quy
              định tại Điều này và Chính sách Bảo vệ Dữ liệu Cá nhân.
            </li>
            <li>
              <strong>Bản chất tham khảo của kết quả AI:</strong> Kết quả được tạo bởi các mô hình ngôn ngữ lớn (LLM)
              nên có thể sai sót (&ldquo;ảo giác AI&rdquo; – hallucination) về ngữ nghĩa, cách đọc, Hán Việt hoặc sắc
              thái văn hóa. Bạn nên đối chiếu với từ điển/giáo trình khi cần độ chính xác cao.
            </li>
            <li>
              <strong>Miễn trừ trách nhiệm đối với kết quả AI:</strong> Người dùng chỉ sử dụng phản hồi của AI làm tài
              liệu tham khảo học tập, tuyệt đối không sử dụng làm căn cứ dịch thuật công chứng, y tế, pháp lý hay
              thương mại.
            </li>
            <li>
              <strong>Xử lý nội dung qua nhà cung cấp AI:</strong> Khi bạn dùng tính năng AI, phần văn bản, từ vựng
              hoặc trang tài liệu tương ứng được gửi qua kết nối mã hóa tới nhà cung cấp dịch vụ AI do Chúng tôi lựa
              chọn (ví dụ Google Gemini, Groq, OpenRouter, NVIDIA hoặc máy chủ mô hình do Chúng tôi vận hành). Kết quả
              có thể được lưu đệm (cache) để không phải gọi lại AI. Vui lòng không đưa vào công cụ AI thông tin nhạy
              cảm hoặc dữ liệu cá nhân của người khác. Chi tiết tại{" "}
              <Link href="/privacy">Chính sách Bảo vệ Dữ liệu Cá nhân</Link>.
            </li>
            <li>
              <strong>Hạn mức sử dụng và dịch vụ phụ thuộc bên thứ ba:</strong> Tính năng AI có thể bị giới hạn tốc
              độ hoặc tạm gián đoạn khi nhà cung cấp AI hết hạn mức hoặc gặp sự cố; Chúng tôi không bảo đảm AI luôn
              khả dụng.
            </li>
          </ol>
        </section>

        <section id="dieu-6">
          <h2>Điều 6. Gói Dịch vụ, Hạn mức (Quota) và Chính sách Hoàn tiền (khi được mở bán)</h2>
          <ol>
            <li>
              <strong>Hiện trạng:</strong> Tại thời điểm cập nhật Điều khoản này, {siteConfig.name} chưa bán gói trả
              phí và chưa thu bất kỳ khoản phí nào; chưa hiển thị quảng cáo của bên thứ ba. Chúng tôi có thể giới hạn
              mức sử dụng hợp lý (số thẻ mới mỗi ngày, số lượt gọi AI, kích thước tệp nhập...) để bảo đảm chất lượng
              dịch vụ cho mọi người.
            </li>
            <li>
              <strong>Gói trả phí trong tương lai:</strong> Khi mở bán các gói nâng cấp (Pro, VIP), Chúng tôi sẽ công
              bố công khai quyền lợi, giá, hạn mức và cập nhật Điều khoản này trước khi áp dụng; hạn mức theo
              ngày/tháng tự động đặt lại theo chu kỳ và không cộng dồn sang kỳ sau. Nếu bật quảng cáo, Chúng tôi sẽ
              cập nhật Chính sách Bảo vệ Dữ liệu Cá nhân tương ứng.
            </li>
            <li>
              <strong>Phương thức thanh toán (khi áp dụng):</strong>
              <ul>
                <li>
                  <strong>Trên iOS (App Store) và Android (Google Play):</strong> thanh toán trong ứng dụng (In-App
                  Purchase); gia hạn, hủy và hoàn tiền tuân theo chính sách của Apple và Google.
                </li>
                <li>
                  <strong>Trên Website:</strong> thanh toán qua cổng thanh toán điện tử hợp pháp được tích hợp trên
                  Website.
                </li>
              </ul>
            </li>
            <li>
              <strong>Hủy gia hạn và Hoàn tiền (khi áp dụng):</strong> Bạn có thể hủy gia hạn bất kỳ lúc nào, ít nhất
              24 giờ trước ngày gia hạn kế tiếp, và vẫn dùng quyền lợi đến hết chu kỳ đã thanh toán. Phí của chu kỳ
              đang chạy không được hoàn lại, trừ trường hợp lỗi kỹ thuật nghiêm trọng từ hệ thống của Chúng tôi khiến
              bạn không thể sử dụng dịch vụ hơn 72 giờ liên tục mà không khắc phục được, hoặc theo quy định bắt buộc
              của Luật Bảo vệ quyền lợi người tiêu dùng Việt Nam.
            </li>
          </ol>
        </section>

        <section id="dieu-7">
          <h2>Điều 7. Giới hạn Trách nhiệm, Bảo vệ Hệ thống và Quyền của Người tiêu dùng</h2>
          <ol>
            <li>
              Dịch vụ được cung cấp trên cơ sở &ldquo;Nguyên trạng&rdquo; (As-is) và &ldquo;Theo khả năng hiện
              có&rdquo; (As-available). Chúng tôi không chịu trách nhiệm bồi thường đối với các thiệt hại gián tiếp
              phát sinh từ sự cố đường truyền Internet của người dùng, sự cố gián đoạn từ nhà cung cấp hạ tầng đám
              mây/AI bên thứ ba, hoặc sự kiện bất khả kháng theo quy định của Bộ luật Dân sự Việt Nam.
            </li>
            <li>
              <strong>Bảo vệ hệ thống:</strong> Để bảo vệ Nền tảng, Chúng tôi áp dụng giới hạn tần suất truy cập
              (rate limit), ghi nhật ký truy cập và có quyền chặn tạm thời hoặc vĩnh viễn địa chỉ IP có hành vi tấn
              công, dò quét hoặc lạm dụng tài nguyên. Bạn không được thực hiện các hành vi đó.
            </li>
            <li>
              <strong>Sao lưu dữ liệu:</strong> Bạn nên chủ động xuất bộ thẻ của mình (CSV) khi cần lưu bản riêng.
              Chúng tôi nỗ lực bảo toàn dữ liệu nhưng không bảo đảm tuyệt đối không bao giờ mất dữ liệu, nhất là trong
              giai đoạn Nền tảng đang phát triển.
            </li>
            <li>
              <strong>Giai đoạn thử nghiệm:</strong> Nền tảng đang trong giai đoạn phát triển và hoàn thiện. Một số
              tính năng có thể được thêm, thay đổi hoặc ngừng cung cấp; Chúng tôi sẽ thông báo trước trong Ứng dụng
              đối với thay đổi ảnh hưởng đáng kể đến dữ liệu hoặc quyền lợi của bạn.
            </li>
            <li>
              Trong phạm vi pháp luật cho phép, tổng mức trách nhiệm bồi thường tối đa của Chúng tôi đối với một Người
              dùng cho mọi khiếu nại phát sinh không vượt quá tổng số tiền phí dịch vụ thực tế mà Người dùng đó đã
              thanh toán cho {siteConfig.name} trong vòng 03 (ba) tháng gần nhất trước thời điểm phát sinh sự kiện.
            </li>
            <li>
              <strong>Bảo lưu quyền của người tiêu dùng:</strong> Các giới hạn trách nhiệm tại Điều này{" "}
              <strong>không áp dụng</strong> đối với thiệt hại do Chúng tôi cố ý gây ra, do vi phạm quy định bắt buộc
              của pháp luật về bảo vệ dữ liệu cá nhân, và <strong>không loại trừ hay hạn chế</strong> bất kỳ quyền nào
              mà Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15 và pháp luật Việt Nam dành cho bạn. Mọi nội dung
              của Điều khoản này trái với quy định bắt buộc nói trên đều không có hiệu lực áp dụng.
            </li>
          </ol>
        </section>

        <section id="dieu-8">
          <h2>Điều 8. Sửa đổi Điều khoản, Hiệu lực và Ngôn ngữ</h2>
          <ol>
            <li>
              <strong>Hiệu lực:</strong> Điều khoản này được cập nhật và có hiệu lực kể từ ngày {LAST_UPDATED}, thay
              thế các bản công bố trước đó.
            </li>
            <li>
              <strong>Quyền sửa đổi và nghĩa vụ báo trước:</strong> Chúng tôi có thể sửa đổi Điều khoản này khi thay
              đổi tính năng hoặc khi pháp luật thay đổi. Với sửa đổi làm phát sinh nghĩa vụ mới hoặc thu hẹp quyền lợi
              của bạn, Chúng tôi thông báo trong Ứng dụng (và qua email nếu bạn đã cung cấp) ít nhất{" "}
              <strong>{legalConfig.noticeDays} ngày</strong> trước ngày áp dụng. Sửa đổi chỉ nhằm làm rõ câu chữ, sửa
              lỗi hiển thị hoặc tuân thủ yêu cầu bắt buộc của cơ quan nhà nước có thẩm quyền có thể áp dụng ngay.
            </li>
            <li>
              <strong>Quyền của bạn khi không đồng ý:</strong> Nếu không đồng ý với nội dung sửa đổi, bạn có quyền
              ngừng sử dụng dịch vụ và yêu cầu xóa tài khoản trước ngày sửa đổi có hiệu lực; việc bạn tiếp tục sử dụng
              dịch vụ sau ngày đó được hiểu là chấp nhận bản cập nhật. Chúng tôi không áp dụng hồi tố nội dung sửa đổi
              đối với giao dịch đã hoàn tất trước đó.
            </li>
            <li>
              <strong>Hiệu lực từng phần:</strong> Nếu một điều khoản bất kỳ bị cơ quan có thẩm quyền tuyên vô hiệu
              hoặc không thể thi hành, các điều khoản còn lại vẫn giữ nguyên hiệu lực; phần bị vô hiệu được thay thế
              bằng quy định tương ứng của pháp luật Việt Nam.
            </li>
            <li>
              <strong>Ngôn ngữ:</strong> Bản tiếng Việt là bản gốc và có giá trị áp dụng. Bản dịch sang ngôn ngữ khác
              (nếu có) chỉ nhằm mục đích tham khảo; khi có khác biệt, bản tiếng Việt được ưu tiên áp dụng.
            </li>
          </ol>
        </section>
        <section id="dieu-9">
          <h2>Điều 9. Đơn vị vận hành và Thông tin liên hệ</h2>
          <ol>
            <li>
              <strong>Đầu mối tiếp nhận:</strong> Mọi yêu cầu hỗ trợ, khiếu nại về dịch vụ, thông báo vi phạm bản quyền
              theo Điều 4 và yêu cầu liên quan đến dữ liệu cá nhân được tiếp nhận tại:
              <LegalContact />
            </li>
            <li>
              <strong>Thời hạn phản hồi:</strong> Chúng tôi xác nhận đã tiếp nhận trong vòng 72 giờ làm việc và trả lời
              nội dung trong thời hạn do pháp luật quy định cho từng loại yêu cầu.
            </li>
          </ol>
        </section>
        <section id="dieu-10">
          <h2>Điều 10. Luật Áp dụng và Giải quyết Tranh chấp</h2>
          <ol>
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
            <li>
              Người dùng là người tiêu dùng có quyền khiếu nại trực tiếp tới Chúng tôi theo Điều 9, hoặc yêu cầu bảo
              vệ quyền lợi tại cơ quan quản lý nhà nước về bảo vệ quyền lợi người tiêu dùng, tổ chức xã hội tham gia
              bảo vệ quyền lợi người tiêu dùng, hoặc khởi kiện theo quy định của pháp luật. Thỏa thuận tại khoản 2
              không làm mất quyền lựa chọn phương thức giải quyết tranh chấp của người tiêu dùng.
            </li>
          </ol>
        </section>
    </LegalShell>
  );
}
