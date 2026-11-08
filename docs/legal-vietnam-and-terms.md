# Nghiên cứu Pháp lý Việt Nam & Bộ Điều khoản Sử dụng — Nihongo Path

> **Ngày lập:** 07/11/2026. **Phạm vi:** Web (`apps/ui`), Backend API (`apps/api`) và Mobile App iOS/Android (`apps/mobile`).
>
> **Lưu ý quan trọng (Disclaimer):** Tài liệu này tổng hợp và phân tích các quy định pháp luật Việt Nam hiện hành (cập nhật tới năm 2026) nhằm thiết kế cơ chế **phòng vệ pháp lý từ trong kiến trúc sản phẩm (Legal-by-Design)** và cung cấp bộ dự thảo **Điều khoản Sử dụng & Chính sách Bảo vệ Dữ liệu Cá nhân** sát với tính năng thực tế của Nihongo Path. Tài liệu này mang tính chất tham khảo kỹ thuật – pháp lý nội bộ, không thay thế văn bản tư vấn chính thức của tổ chức hành nghề luật sư. Trước khi bật thu phí thương mại quy mô lớn, chủ sản phẩm (**Tôi**) nên rà soát lần cuối cùng đơn vị tư vấn pháp lý/thuế.

---

## Phần I. Nghiên cứu Pháp lý Việt Nam đối với Nihongo Path

Ứng dụng **Nihongo Path** có 6 nhóm tính năng đặc thù chịu sự điều chỉnh trực tiếp của pháp luật Việt Nam:
1. Học từ vựng, ngữ pháp, Kanji Jōyō và làm đề luyện thi JLPT mô phỏng.
2. Người dùng tự tạo bộ thẻ (Flashcard) hoặc **nhập hàng loạt từ file CSV/Excel/PDF (kể cả OCR AI)**, tải lên media (Audio/Video) để luyện nghe/chép lời (STT).
3. Tích hợp **AI tạo sinh (Generative AI)** để dịch câu, gợi ý cách viết/ngữ pháp, luyện phát âm, phân tích câu, chấm điểm Shadowing (thu âm giọng nói) và hội thoại AI Kaiwa.
4. Bán gói thuê bao trả phí (**Free / Pro / VIP**) trên Web và In-App Purchase (Apple App Store / Google Play Store) kèm hiển thị quảng cáo (Google AdSense / AdMob).
5. Lưu trữ dữ liệu trên hạ tầng đám mây quốc tế (MongoDB Atlas, nhà cung cấp AI/Cloud nước ngoài).

Dưới đây là **7 trụ cột pháp lý tại Việt Nam** và giải pháp kỹ thuật/vận hành để **không vi phạm pháp luật**.

---

### 1. Định vị mô hình kinh doanh: Phần mềm tự học (EdTech SaaS) vs. Trung tâm ngoại ngữ

- **Căn cứ pháp lý:** Luật Giáo dục 2019; Nghị định 125/2024/NĐ-CP quy định về điều kiện đầu tư và hoạt động trong lĩnh vực giáo dục.
- **Rủi ro nếu định vị sai:** Nếu quảng cáo ứng dụng như một "Trung tâm đào tạo tiếng Nhật", "Trường dạy tiếng Nhật trực tuyến có cấp chứng chỉ" hoặc tổ chức lớp học có giáo viên giảng dạy theo khóa mà không có Giấy phép hoạt động giáo dục của Sở Giáo dục & Đào tạo, chủ ứng dụng có thể bị xử phạt vi phạm hành chính về hoạt động giáo dục không phép (Nghị định 04/2021/NĐ-CP sửa đổi bởi Nghị định 127/2021/NĐ-CP).
- **Cách phòng vệ (Legal-by-Design):**
  1. **Định vị pháp lý chuẩn:** Nihongo Path là **ứng dụng công nghệ cung cấp công cụ và học liệu điện tử hỗ trợ tự học ngoại ngữ (Self-study EdTech SaaS)** (Mã ngành kinh doanh tham khảo khi đăng ký doanh nghiệp/hộ kinh doanh: `6201` – Lập trình máy vi tính, `6202` – Tư vấn máy vi tính và quản trị hệ thống, `6311` – Xử lý dữ liệu, cho thuê và các hoạt động liên quan, `5820` – Xuất bản phần mềm).
  2. **Không cấp văn bằng/chứng chỉ:** Mọi điểm số bài tập, đề thi thử JLPT trên ứng dụng chỉ là **kết quả tự đánh giá năng lực tham khảo**, tuyệt đối không gọi là "Chứng chỉ" hay "Bằng cấp".

---

### 2. Sở hữu trí tuệ & Bản quyền học liệu (Giáo trình, Đề thi JLPT, PDF Import, Từ điển)

- **Căn cứ pháp lý:** Luật Sở hữu trí tuệ 2005 (sửa đổi, bổ sung năm 2009, 2019, **2022**); Nghị định 17/2023/NĐ-CP; Nghị định 131/2013/NĐ-CP (xử phạt hành chính về quyền tác giả, quyền liên quan); Điều 225 Bộ luật Hình sự 2015 (sửa đổi 2017) về tội xâm phạm quyền tác giả, quyền liên quan.
- **Các điểm nhạy cảm nhất của ứng dụng học tiếng Nhật:**
  1. **Bản quyền giáo trình thương mại:** Các bộ sách như *Minna no Nihongo* (3A Corporation), *Nihongo Soumatome* (Ask Publishing), *Shinkanzen Master* (3A Corporation), *Try!* (ABK)... được bảo hộ quyền tác giả tại Việt Nam theo Công ước Berne. Việc chép nguyên văn (verbatim) bài khóa, đoạn hội thoại, hình minh họa, file audio CD gốc hoặc scan PDF giáo trình lên làm bộ thẻ/bài học công khai là hành vi xâm phạm bản quyền.
  2. **Đề thi JLPT chính thức:** Đề thi thật các năm của **Japan Foundation & JEES** có bản quyền nghiêm ngặt, đồng thời chữ **"JLPT"** là nhãn hiệu đã đăng ký.
  3. **Tính năng Import PDF/CSV/Excel & Upload Audio/Video của người dùng:** Nếu người dùng tải lên PDF giáo trình lậu rồi chia sẻ công khai trên nền tảng, chủ nền tảng có thể bị quy trách nhiệm liên đới nếu không có cơ chế kiểm soát và gỡ bỏ (theo Điều 114 Luật SHTT sửa đổi 2022 về trách nhiệm pháp lý của doanh nghiệp cung cấp dịch vụ trung gian).
- **Cách phòng vệ (Legal-by-Design):**
  1. **Cô lập nội dung người dùng tải lên (`PRIVATE` mặc định):** Toàn bộ bộ thẻ từ CSV/Excel/PDF (`origin: "import"`), file PDF/audio/video do người dùng tải lên **chỉ hiển thị riêng tư cho chính tài khoản của người dùng đó** để phục vụ mục đích tự học cá nhân. Không cho phép người dùng tự bấm nút "Công khai cho toàn hệ thống" khi chưa qua kiểm duyệt của Admin.
  2. **Biên soạn lại nội dung công khai (`SHARED`):** Các danh sách từ vựng/ngữ pháp công khai chỉ dùng dữ liệu ngôn ngữ học (từ vựng, cách đọc, cấu trúc ngữ pháp không thuộc đối tượng bảo hộ độc quyền riêng lẻ) kết hợp với **định nghĩa tiếng Việt và câu ví dụ do đội ngũ tự biên soạn hoặc sinh mới**, không chép nguyên văn câu ví dụ/hội thoại trong sách thương mại.
  3. **Ghi công giấy phép nguồn mở (Attribution):** Trong trang `/about` hoặc phần "Nguồn dữ liệu & Giấy phép" trên Web/App, bắt buộc hiển thị đầy đủ attribution cho:
     - **KANJIDIC2 & JMdict:** Bản quyền thuộc Electronic Dictionary Research and Development Group (**EDRDG**), phát hành theo giấy phép **CC BY-SA 4.0**.
     - **KanjiVG:** Bản quyền thuộc **Ulrich Apel**, phát hành theo giấy phép **CC BY-SA 3.0**.
     - Tuyệt đối không hiển thị dữ liệu `wk_*` (WaniKani/Tofugu) ra API/UI như đã thiết kế trong `docs/database.md`.
  4. **Tuyên bố khước từ liên kết nhãn hiệu (Trademark Disclaimer):** Ghi rõ dưới chân trang và trong Điều khoản sử dụng: *"JLPT (Japanese-Language Proficiency Test) là nhãn hiệu đã đăng ký của Japan Foundation và Japan Educational Exchanges and Services (JEES). Nihongo Path là nền tảng hỗ trợ ôn luyện độc lập, không liên kết, không được tài trợ hay chứng nhận bởi Japan Foundation hay JEES."*
  5. **Cơ chế Notice & Takedown:** Có email tiếp nhận khiếu nại bản quyền và cam kết ẩn/gỡ bỏ nội dung vi phạm trong vòng **24–72 giờ** làm việc.

---

### 3. Bảo vệ Dữ liệu Cá nhân (Luật số 91/2025/QH15 & Nghị định 13/2023/NĐ-CP)

- **Căn cứ pháp lý:** **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** (có hiệu lực thi hành từ **01/01/2026**) và Nghị định 13/2023/NĐ-CP.
- **Đặc thù dữ liệu của Nihongo Path:**
  - **Dữ liệu cá nhân cơ bản:** Họ tên, địa chỉ email, ID tài khoản Google/Apple, ảnh đại diện, múi giờ (`timezone`), lịch sử học tập (SRS progress, điểm bài thi), địa chỉ IP, nhật ký thiết bị.
  - **Dữ liệu cá nhân nhạy cảm (cần lưu ý đặc biệt):**
    - **Bản ghi âm giọng nói (Voice recordings)** của người học ở tính năng **Shadowing (P7)** và **AI Kaiwa (P8)**: Nếu gắn với danh tính người dùng hoặc dùng để phân tích đặc trưng giọng nói, cơ quan quản lý có thể xếp vào nhóm dữ liệu nhạy cảm.
    - Thông tin thanh toán/giao dịch (P9).
  - **Chuyển dữ liệu cá nhân xuyên biên giới:** Dữ liệu người dùng Việt Nam được lưu trên **MongoDB Atlas** (cluster đặt tại Singapore/Tokyo/US) và gửi văn bản/âm thanh qua API của các nhà cung cấp AI nước ngoài (OpenAI, Google Gemini, Anthropic, Groq...).
- **Cách phòng vệ (Legal-by-Design):**
  1. **Cơ chế Đồng ý tường minh (Explicit Opt-in Consent):**
     - Khi đăng ký tài khoản: Checkbox *"Tôi đã đọc và đồng ý với Điều khoản Sử dụng và Chính sách Bảo vệ Dữ liệu Cá nhân"* **không được tick sẵn (unchecked by default)**.
     - Khi bật thu âm lần đầu ở Shadowing / Kaiwa: Hiển thị modal xin đồng ý riêng cho việc thu âm và gửi dữ liệu âm thanh tới dịch vụ xử lý giọng nói/AI (`Q-24`).
  2. **Giảm thiểu lưu trữ dữ liệu nhạy cảm (Data Minimization):**
     - Đối với phát âm/Shadowing: Ưu tiên chấm điểm tức thời và **xoá ngay file audio gốc** sau khi trả kết quả, hoặc chỉ lưu tạm có thời hạn tự động xoá (TTL 7–30 ngày) và cho phép người dùng bấm xoá bất cứ lúc nào.
     - Không tự lưu số thẻ tín dụng/thẻ ngân hàng (chỉ lưu mã giao dịch tham chiếu `providerRef` từ cổng thanh toán hoặc Apple/Google IAP).
  3. **Quyền xoá dữ liệu & Xoá tài khoản (`DELETE /users/me`):**
     - Theo cả **Luật Bảo vệ dữ liệu cá nhân 2025** lẫn **Apple App Store Guideline 5.1.1(v)** và **Google Play Data Deletion Policy**, ứng dụng **bắt buộc** phải có nút **"Xoá tài khoản và dữ liệu cá nhân"** ngay trong phần Cài đặt tài khoản trên Web và Mobile App (xoá hoặc ẩn danh hoá hoàn toàn dữ liệu trong vòng 72 giờ kể từ khi xác nhận yêu cầu).
  4. **Hồ sơ hành chính với Bộ Công an (Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao - A05):**
     - Khi vận hành chính thức, chuẩn bị sẵn bộ **Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân (DPIA)** và **Hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài (TIA)** theo mẫu quy định để lưu giữ và nộp qua Cổng thông tin quốc gia về bảo vệ dữ liệu cá nhân khi thuộc diện phải thông báo.

---

### 4. Quản lý Dịch vụ Internet, Nội dung trên mạng & AI tạo sinh (Nghị định 147/2024/NĐ-CP & Luật An ninh mạng 2018)

- **Căn cứ pháp lý:** Luật An ninh mạng 2018; Nghị định 53/2022/NĐ-CP; **Nghị định 147/2024/NĐ-CP** (có hiệu lực từ 25/12/2024) về quản lý, cung cấp, sử dụng dịch vụ Internet và thông tin trên mạng.
- **Rủi ro lớn nhất cần tránh — Bị phân loại là "Mạng xã hội" (Social Network):**
  - Theo Nghị định 147/2024/NĐ-CP, nếu website/app cho phép người sử dụng thiết lập trang cá nhân công khai, đăng tải bài viết, chia sẻ tài liệu/video/bộ thẻ công khai, bình luận, nhắn tin tương tác với nhau, nền tảng sẽ bị coi là **Mạng xã hội** — kéo theo nghĩa vụ phải xin Giấy phép cung cấp dịch vụ mạng xã hội hoặc thông báo với Bộ TT&TT, bắt buộc **xác thực toàn bộ người dùng bằng số điện thoại di động Việt Nam (hoặc số định danh cá nhân)**, lọc nội dung tự động, v.v.
- **Cách phòng vệ (Legal-by-Design):**
  1. **Không mở tính năng mạng xã hội / UGC công khai tự do:**
     - Người dùng **không** có trang tường cá nhân công khai, **không** có bình luận dưới bài học/đề thi, **không** chat giữa người dùng với nhau.
     - Bộ thẻ người dùng tự tạo hoặc import chỉ có phạm vi **Cá nhân (`PRIVATE`)**.
  2. **Kiểm soát đầu vào/đầu ra AI (AI Guardrails):**
     - Trong System Prompt của `AiService` (`translate`, `write`, `grammar`, `pronounce`, `kaiwa`), luôn cài đặt chỉ dẫn: *Chỉ trả lời các nội dung phục vụ học tiếng Nhật; từ chối trả lời các chủ đề chính trị, tôn giáo, lịch sử nhạy cảm, chủ quyền lãnh thổ, bạo lực, khiêu dâm hoặc vi phạm pháp luật Việt Nam.*
     - Ghi nhãn rõ trên giao diện (`AI Playground`, `Gợi ý nghĩa AI`, `Kaiwa`): *"Kết quả do AI tạo tự động, chỉ dùng để tham khảo học ngôn ngữ và có thể có sai sót."*

---

### 5. Thương mại điện tử & Bảo vệ quyền lợi người tiêu dùng (Luật TMĐT 122/2025/QH15, Nghị định 248/2026/NĐ-CP & Luật BVQLNTD 2023)

- **Căn cứ pháp lý:**
  - **Luật Thương mại điện tử số 122/2025/QH15** và **Nghị định 248/2026/NĐ-CP** (có hiệu lực từ **01/07/2026**, thay thế Nghị định 52/2013/NĐ-CP và Nghị định 85/2021/NĐ-CP).
  - **Luật Bảo vệ quyền lợi người tiêu dùng 2023 (số 19/2023/QH15)** và Nghị định 55/2024/NĐ-CP (quy định chặt về giao dịch từ xa, hợp đồng theo mẫu và dịch vụ cung cấp liên tục/gia hạn tự động).
- **Nghĩa vụ khi bật thu phí gói Pro/VIP:**
  1. **Tư cách pháp nhân:** Để đăng ký cổng thanh toán tại Việt Nam (VNPay, MoMo, ZaloPay, PayOS/VietQR doanh nghiệp), xuất hoá đơn điện tử và thực hiện thủ tục với Bộ Công Thương, chủ ứng dụng cần có **Giấy chứng nhận đăng ký doanh nghiệp** hoặc **Giấy chứng nhận đăng ký Hộ kinh doanh**.
  2. **Thủ tục Thông báo với Bộ Công Thương:**
     - Vì Nihongo Path chỉ bán gói dịch vụ của chính mình (không cho bên thứ ba mở gian hàng bán khóa học), nền tảng thuộc diện **Nền tảng thương mại điện tử kinh doanh trực tiếp** (trước đây gọi là Website/Ứng dụng TMĐT bán hàng).
     - Thủ tục: **Thông báo** (không phải Đăng ký sàn giao dịch) miễn phí lệ phí nhà nước trên cổng `online.gov.vn` cho cả Website và Ứng dụng di động trước khi chính thức thu tiền trực tiếp trên Web.
  3. **Quy định về Gia hạn tự động (Auto-renewal Subscription):**
     - Theo Luật Bảo vệ quyền lợi người tiêu dùng 2023, nếu gói thuê bao có tính năng tự động gia hạn, phải thông báo rõ chu kỳ, mức phí, và cung cấp nút **Huỷ gia hạn tự động** dễ dàng ngay trong phần Quản lý gói thuê bao; thông báo trước cho người dùng trước kỳ扣 phí tiếp theo.

---

### 6. Thanh toán trên Mobile App (In-App Purchase) vs. Thanh toán Web & Nghĩa vụ Thuế

- **Quy định của Apple App Store (Guideline 3.1.1) & Google Play Billing:**
  - Mọi tính năng kỹ thuật số mở khoá bên trong ứng dụng iOS/Android (như nâng cấp gói **Pro / VIP**, mua thêm lượt AI/OCR, mở khoá đề thi) **bắt buộc phải thanh toán qua Apple In-App Purchase (StoreKit 2) trên iOS và Google Play Billing trên Android**.
  - Nếu nhúng cổng thanh toán bên thứ ba (VNPay, MoMo, chuyển khoản VietQR, Stripe) trực tiếp vào màn hình nâng cấp gói trong app iOS/Android để bán nội dung số, app sẽ **bị từ chối duyệt (Reject) hoặc gỡ khỏi Store**.
  - **Mô hình hợp lệ ("Multi-platform Access" — Guideline 3.1.3(b)):**
    - Trên **Mobile App (iOS/Android)**: Tích hợp IAP chính chủ của Apple/Google (đăng ký Apple Small Business Program và Google Play 15% tier để giảm phí hoa hồng từ 30% xuống **15%** cho doanh thu dưới 1 triệu USD/năm).
    - Trên **Website (`apps/ui`)**: Có thể tích hợp cổng thanh toán nội địa Việt Nam (PayOS/VietQR, VNPay, MoMo, Stripe). Người dùng mua gói trên Web khi đăng nhập vào Mobile App sẽ tự động được đồng bộ quyền lợi (`Entitlements`) và ngược lại. Lưu ý: bên trong app iOS không được đặt link/banner kêu gọi người dùng ra web mua để né IAP.
- **Nghĩa vụ Thuế tại Việt Nam:**
  - Doanh thu từ Apple/Google (nhận ngoại tệ về tài khoản tại Việt Nam) và doanh thu từ cổng thanh toán nội địa cần được kê khai thuế theo hình thức pháp nhân đã chọn (Hộ kinh doanh nộp thuế khoán/theo tỷ lệ doanh thu dịch vụ phần mềm, hoặc Công ty TNHH thực hiện kê khai thuế GTGT/TNDN và hưởng ưu đãi thuế đối với sản phẩm phần mềm nếu đủ điều kiện).

---

### 7. Bảng Tóm tắt Kiểm tra Tuân thủ Pháp lý (Compliance Matrix) theo từng Phase

| Hạng mục / Tính năng | Giai đoạn chưa thu phí (Beta / Free) | Giai đoạn Thương mại hoá (Bật Pro/VIP & AdSense/AdMob) |
|---|---|---|
| **Hiển thị Điều khoản Sử dụng & Chính sách Dữ liệu cá nhân** | **Bắt buộc ngay từ bây giờ** (trang `/terms`, `/privacy` trên Web & Mobile + checkbox khi đăng ký) | Bắt buộc + cập nhật thêm điều khoản thanh toán/hoàn tiền |
| **Chức năng Xoá tài khoản (`DELETE /users/me`)** | **Bắt buộc trước khi submit App Store / Google Play** (và tuân thủ Luật BVDLCN 91/2025/QH15) | Bắt buộc |
| **Ghi công giấy phép mở (KANJIDIC2, JMdict, KanjiVG) & Disclaimer JLPT** | **Bắt buộc ngay từ bây giờ** | Bắt buộc |
| **Cô lập nội dung Import PDF/CSV ở chế độ `PRIVATE`** | **Đã thiết kế đúng** (giữ nguyên, không mở chia sẻ công khai tự do) | Giữ nguyên + duy trì kênh báo cáo vi phạm (Notice & Takedown) |
| **Modal xin đồng ý (Opt-in Consent) trước khi thu âm giọng nói** | **Bắt buộc ở P7/P8** khi bật tính năng thu âm | Bắt buộc |
| **Đăng ký Doanh nghiệp / Hộ kinh doanh & Mã số thuế** | Chưa bắt buộc (có thể chạy cá nhân ở bản Beta miễn phí) | **Bắt buộc** trước khi ký hợp đồng cổng thanh toán nội địa & thông báo Bộ Công Thương |
| **Thông báo Website/App TMĐT với Bộ Công Thương (`online.gov.vn`)** | Chưa cần nếu chưa bán gói trả phí trực tiếp trên Web/App | **Bắt buộc** nếu thu tiền trực tiếp trên Website/App |

---

## Phần II. Dự thảo Điều khoản Sử dụng & Chính sách Bảo vệ Dữ liệu Cá nhân (Dành cho User đọc)

> **Hướng dẫn tích hợp vào sản phẩm:**
> - Tạo trang công khai `/terms` (Điều khoản Sử dụng) và `/privacy` (Chính sách Bảo vệ Dữ liệu Cá nhân) trên cả `apps/ui` (Next.js) và `apps/mobile` (iOS/Android), đặt liên kết ở `SiteFooter`, màn hình `/login` (tab Đăng ký) và màn hình Cài đặt tài khoản.
> - Thay thế các trường trong ngoặc vuông `[TÊN ĐƠN VỊ VẬN HÀNH / CHỦ SỞ HỮU]`, `[EMAIL LIÊN HỆ]`, `[ĐỊA CHỈ]` bằng thông tin thật của **Tôi** trước khi phát hành.

---

### VĂN BẢN 1: ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ (TERMS OF SERVICE)

**Cập nhật lần cuối:** Ngày 07 tháng 11 năm 2026

Chào mừng bạn đến với **Nihongo Path** (bao gồm website và ứng dụng di động trên iOS/Android, sau đây gọi chung là **"Nền tảng"** hoặc **"Ứng dụng"**), được quản lý và vận hành bởi **[TÊN ĐƠN VỊ VẬN HÀNH / CHỦ SỞ HỮU]** (sau đây gọi là **"Chúng tôi"**).

Bằng việc đánh dấu vào ô đồng ý khi đăng ký tài khoản, truy cập hoặc sử dụng bất kỳ tính năng nào của Nihongo Path, bạn (sau đây gọi là **"Người dùng"** hoặc **"Bạn"**) xác nhận đã đọc, hiểu rõ và đồng ý chịu sự ràng buộc của toàn bộ Điều khoản Sử dụng này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng ngừng truy cập và sử dụng Ứng dụng.

#### Điều 1. Bản chất Dịch vụ và Tuyên bố Miễn trừ về Giáo dục & Nhãn hiệu

1. **Công cụ hỗ trợ tự học:** Nihongo Path là nền tảng phần mềm cung cấp các công cụ kỹ thuật số và học liệu tham khảo hỗ trợ người dùng **tự học và ôn luyện tiếng Nhật** (bao gồm từ vựng, chữ Hán – Kanji, ngữ pháp, thẻ ghi nhớ Flashcard theo thuật toán lặp lại ngắt quãng SRS, bài tập luyện tập, đề thi thử mô phỏng và các công cụ hỗ trợ bởi trí tuệ nhân tạo).
2. **Không phải cơ sở giáo dục / Không cấp văn bằng:** Nihongo Path **không phải** là trường học, trung tâm ngoại ngữ hay tổ chức khảo thí thuộc hệ thống giáo dục quốc dân. Mọi điểm số, đánh giá năng lực, kết quả làm bài thi thử trên Ứng dụng chỉ mang tính chất **tham khảo cá nhân**, không có giá trị thay thế cho bất kỳ văn bằng, chứng chỉ ngoại ngữ chính thức nào.
3. **Miễn trừ liên kết Nhãn hiệu JLPT:** Thuật ngữ **"JLPT"** (*Japanese-Language Proficiency Test* — Kỳ thi Năng lực Tiếng Nhật) được nhắc đến trên Nền tảng chỉ nhằm mục đích mô tả cấp độ tham chiếu năng lực ngôn ngữ (N5, N4, N3, N2, N1). **JLPT là nhãn hiệu đã đăng ký của Japan Foundation và Japan Educational Exchanges and Services (JEES).** Nihongo Path là sản phẩm độc lập, hoàn toàn không trực thuộc, không liên kết, không được tài trợ hay chứng nhận bởi Japan Foundation, JEES hoặc bất kỳ nhà xuất bản giáo trình nào.
4. **Không cam kết kết quả thi cử:** Chúng tôi nỗ lực cung cấp học liệu và thuật toán ôn tập tối ưu nhưng không cam kết hay bảo đảm rằng việc sử dụng Ứng dụng sẽ giúp Người dùng thi đỗ bất kỳ kỳ thi thực tế nào.

#### Điều 2. Tài khoản Người dùng và Độ tuổi Sử dụng

1. **Điều kiện độ tuổi:**
   - Người dùng từ **đủ 16 tuổi trở lên** được phép tự đăng ký tài khoản theo quy định pháp luật Việt Nam.
   - Người dùng **dưới 16 tuổi** chỉ được tạo tài khoản và sử dụng Ứng dụng khi có sự đồng ý, giám sát và chịu trách nhiệm của cha, mẹ hoặc người giám hộ hợp pháp theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 147/2024/NĐ-CP.
2. **Bảo mật tài khoản:** Bạn có trách nhiệm tự bảo mật mật khẩu, mã xác thực và quyền truy cập thiết bị của mình. Bạn không được cho thuê, bán, nhượng lại hoặc chia sẻ tài khoản trả phí cho nhiều người cùng sử dụng trái phép. Mọi thao tác phát sinh từ tài khoản của bạn được mặc định là do chính bạn thực hiện.

#### Điều 3. Quyền Sở hữu Trí tuệ và Ghi công Nguồn Dữ liệu Mở

1. **Tài sản của Nihongo Path:** Toàn bộ mã nguồn, giao diện, thiết kế, logo, thuật toán SRS, hệ thống câu hỏi/bài tập tự biên soạn và cấu trúc cơ sở dữ liệu trên Nền tảng thuộc quyền sở hữu hợp pháp của Chúng tôi. Nghiêm cấm mọi hành vi sao chép, dịch ngược (reverse engineering), cào dữ liệu tự động (scraping/crawling) hoặc khai thác thương mại trái phép dưới bất kỳ hình thức nào.
2. **Ghi công Dữ liệu Từ điển Nguồn mở (Open-Data Attribution):**
   - Dữ liệu chữ Hán và từ điển tiếng Nhật trên Nền tảng có sử dụng nguồn dữ liệu mở từ dự án **KANJIDIC2** và **JMdict/EDICT**, thuộc bản quyền của **Electronic Dictionary Research and Development Group (EDRDG)** và được sử dụng theo giấy phép **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.
   - Dữ liệu sơ đồ thứ tự nét viết chữ Hán (SVG stroke paths) được lấy từ dự án **KanjiVG**, thuộc bản quyền của **Ulrich Apel** và được sử dụng theo giấy phép **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**.

#### Điều 4. Quy định về Nội dung do Người dùng Tải lên (Import CSV/Excel/PDF, Flashcard, Audio/Video)

1. **Phạm vi sử dụng cá nhân (`PRIVATE`):** Nihongo Path cung cấp công cụ kỹ thuật cho phép Người dùng tự tạo bộ thẻ ghi nhớ hoặc nhập dữ liệu từ tệp tin của mình (CSV, Excel, PDF, âm thanh, video) để phục vụ nhu cầu **tự học cá nhân**. Các nội dung do bạn tải lên được lưu trữ ở chế độ **Riêng tư (chỉ mình bạn truy cập được)**.
2. **Cam kết về Bản quyền và Tính hợp pháp của Tài liệu tải lên:** Khi tạo thẻ hoặc tải lên bất kỳ tệp tin nào (đặc biệt là tệp PDF, âm thanh, video), bạn cam kết và chịu hoàn toàn trách nhiệm trước pháp luật rằng:
   - Bạn là chủ sở hữu hợp pháp hoặc có quyền sử dụng hợp pháp đối với tài liệu đó cho mục đích học tập cá nhân theo quy định của Luật Sở hữu trí tuệ Việt Nam.
   - Bạn **không** sử dụng Nền tảng để lưu trữ, phát tán, chia sẻ trái phép các bản sao lậu của sách giáo trình, đề thi hoặc tài liệu có bản quyền của bên thứ ba.
3. **Các nội dung bị nghiêm cấm tuyệt đối (Theo Điều 8 Luật An ninh mạng 2018 & Nghị định 147/2024/NĐ-CP):** Nghiêm cấm Người dùng tải lên, nhập vào bộ thẻ, nhập vào công cụ dịch/AI hoặc ghi âm các nội dung:
   - Tuyên truyền chống phá Nhà nước Cộng hòa xã hội chủ nghĩa Việt Nam; xuyên tạc lịch sử, phủ nhận thành tựu cách mạng, phá hoại khối đại đoàn kết toàn dân tộc; kích động chiến tranh, khủng bố, gây hận thù, phân biệt chủng tộc, tôn giáo.
   - Sử dụng bản đồ, hình ảnh hoặc thông tin sai lệch xâm phạm chủ quyền biên giới, biển đảo của Việt Nam (bao gồm quần đảo Hoàng Sa và Trường Sa).
   - Nội dung đồi trụy, khiêu dâm, bạo lực, tệ nạn xã hội, mê tín dị đoan, cổ súy tự sát hoặc vi phạm thuần phong mỹ tục Việt Nam.
   - Bí mật nhà nước, bí mật kinh doanh hoặc dữ liệu cá nhân, hình ảnh, giọng nói của người khác khi chưa được sự đồng ý hợp pháp của họ.
   - Tệp tin chứa mã độc, virus, script tấn công (XSS, SQL/NoSQL Injection) hoặc tệp tin nhằm gây quá tải hệ thống.
4. **Quyền kiểm duyệt và Gỡ bỏ (Notice & Takedown):** Chúng tôi có quyền (nhưng không có nghĩa vụ giám sát trước toàn bộ nội dung riêng tư) tạm khóa, xóa bỏ bất kỳ nội dung nào bị phát hiện hoặc bị khiếu nại vi phạm bản quyền hoặc vi phạm pháp luật Việt Nam trong vòng **24 đến 72 giờ** mà không cần báo trước, đồng thời khóa vĩnh viễn tài khoản vi phạm nghiêm trọng.

#### Điều 5. Điều khoản về các Tính năng Trí tuệ Nhân tạo (AI) và Ghi âm Giọng nói

1. **Bản chất tham khảo của kết quả AI:** Các tính năng dịch thuật, trích xuất chữ từ ảnh/PDF (OCR), gợi ý cách viết/ngữ pháp, phân tích câu, chấm điểm phát âm (Shadowing) và hội thoại giả lập (AI Kaiwa) được vận hành bởi các mô hình ngôn ngữ lớn (LLM) và công nghệ nhận diện giọng nói tự động. Kết quả do AI tạo ra **có thể xuất hiện sai sót ("ảo giác AI" – hallucination)** về ngữ nghĩa, sắc thái văn hóa hoặc độ chính xác ngôn ngữ.
2. **Miễn trừ trách nhiệm đối với kết quả AI:** Người dùng chỉ sử dụng phản hồi của AI làm tài liệu tham khảo học tập, tuyệt đối không sử dụng làm căn cứ dịch thuật công chứng, y tế, pháp lý hay thương mại. Điểm số chấm phát âm AI chỉ phản ánh mức độ tương đồng tương đối về âm học, không phải kết luận đánh giá năng lực tuyệt đối.
3. **Xử lý giọng nói và văn bản qua đối tác AI:** Khi bạn chủ động sử dụng tính năng AI hoặc bấm nút thu âm luyện nói, văn bản hoặc đoạn âm thanh tương ứng sẽ được truyền mã hóa tới máy chủ xử lý AI để trả về kết quả học tập theo đúng Chính sách Bảo vệ Dữ liệu Cá nhân.

#### Điều 6. Gói Thuê bao Trả phí (Pro / VIP), Hạn mức (Quota) và Chính sách Hoàn tiền

1. **Các gói dịch vụ và Hạn mức:** Nihongo Path cung cấp gói Miễn phí (Free) và các gói nâng cấp trả phí (Pro, VIP) với hạn mức sử dụng tính năng (số bộ thẻ, lượt gọi AI/OCR, phút hội thoại...) được công bố công khai tại trang Bảng giá. Hạn mức sử dụng theo ngày/tháng sẽ tự động đặt lại (reset) theo chu kỳ đã công bố và không được cộng dồn sang kỳ tiếp theo.
2. **Phương thức thanh toán:**
   - **Trên ứng dụng iOS (Apple App Store) và Android (Google Play Store):** Việc mua gói thuê bao được thực hiện thông qua hệ thống Thanh toán trong ứng dụng (In-App Purchase) của Apple hoặc Google. Việc gia hạn tự động, hủy gia hạn và yêu cầu hoàn tiền đối với các giao dịch qua App Store / Google Play tuân theo chính sách và quy trình trực tiếp của Apple và Google.
   - **Trên Website:** Việc thanh toán được thực hiện qua các cổng thanh toán điện tử hợp pháp được tích hợp trên Website.
3. **Hủy gia hạn và Hoàn tiền:**
   - Bạn có thể hủy gia hạn gói thuê bao bất kỳ lúc nào trong mục **Quản lý gói thuê bao** (hoặc trong phần Subscriptions của Apple ID / tài khoản Google Play) trước ngày gia hạn kỳ tiếp theo ít nhất 24 giờ. Sau khi hủy gia hạn, bạn vẫn được tiếp tục sử dụng đầy đủ quyền lợi của gói đã mua cho đến hết thời hạn của chu kỳ đã thanh toán.
   - Do đặc thù là dịch vụ nội dung số và tài nguyên tính toán AI được cấp phát ngay lập tức khi kích hoạt, các khoản phí đã thanh toán cho chu kỳ đang chạy **không được hoàn lại**, trừ trường hợp lỗi kỹ thuật nghiêm trọng từ phía hệ thống của Chúng tôi khiến bạn không thể sử dụng dịch vụ trong hơn 72 giờ liên tục mà không khắc phục được, hoặc theo quy định bắt buộc của pháp luật bảo vệ quyền lợi người tiêu dùng Việt Nam.

#### Điều 7. Giới hạn Trách nhiệm và Tạm ngừng Dịch vụ

1. Dịch vụ được cung cấp trên cơ sở **"Nguyên trạng" (As-is)** và **"Theo khả năng hiện có" (As-available)**. Chúng tôi không chịu trách nhiệm bồi thường đối với các thiệt hại gián tiếp phát sinh từ sự cố đường truyền Internet của người dùng, sự cố gián đoạn từ nhà cung cấp hạ tầng đám mây/AI bên thứ ba, hoặc sự kiện bất khả kháng theo quy định của Bộ luật Dân sự Việt Nam.
2. Trong mọi trường hợp, tổng mức trách nhiệm bồi thường tối đa của Chúng tôi (nếu có) đối với một Người dùng cho mọi khiếu nại phát sinh sẽ không vượt quá tổng số tiền phí dịch vụ thực tế mà Người dùng đó đã thanh toán cho Nihongo Path trong vòng **03 (ba) tháng** gần nhất trước thời điểm phát sinh sự kiện.

#### Điều 8. Luật Áp dụng và Giải quyết Tranh chấp

1. Điều khoản Sử dụng này được điều chỉnh và giải thích theo **pháp luật nước Cộng hòa xã hội chủ nghĩa Việt Nam**.
2. Mọi tranh chấp phát sinh trước hết sẽ được giải quyết thông qua thương lượng thiện chí trong vòng 30 ngày kể từ khi một bên thông báo bằng văn bản. Trường hợp không đạt được thỏa thuận, tranh chấp sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền tại Việt Nam.

---

### VĂN BẢN 2: CHÍNH SÁCH BẢO VỆ DỮ LIỆU CÁ NHÂN (PRIVACY POLICY)

**Cập nhật lần cuối:** Ngày 07 tháng 11 năm 2026
*(Tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, Nghị định 13/2023/NĐ-CP và quy định của Apple App Store / Google Play Store)*

#### 1. Các loại Dữ liệu Cá nhân Chúng tôi thu thập

1. **Dữ liệu cá nhân cơ bản:**
   - Thông tin tài khoản: Địa chỉ email, tên hiển thị, ảnh đại diện (nếu đăng nhập qua Google/Apple), mật khẩu đã băm một chiều (`scrypt` — Chúng tôi không bao giờ lưu mật khẩu dạng văn bản thuần).
   - Dữ liệu học tập: Lịch sử ôn tập thẻ ghi nhớ (SRS), bộ thẻ cá nhân, kết quả bài tập/đề thi, múi giờ (`timezone`), ngôn ngữ giao diện (`lang`).
   - Dữ liệu kỹ thuật: Địa chỉ IP, loại thiết bị, phiên bản hệ điều hành, nhật ký lỗi hệ thống và lượng token sử dụng AI để kiểm soát hạn mức và chống lạm dụng.
2. **Dữ liệu liên quan đến tính năng Giọng nói và Thanh toán:**
   - **Dữ liệu âm thanh (Microphone):** Chúng tôi **chỉ** truy cập Microphone khi bạn chủ động bấm nút thu âm tại tính năng Luyện phát âm / Shadowing / Hội thoại AI và đã cấp quyền rõ ràng trên thiết bị. Bản ghi âm chỉ được dùng để chấm điểm phát âm/nhận diện lời nói và tự động bị xóa theo chu kỳ lưu trữ ngắn hạn (tối đa 30 ngày) hoặc xóa ngay khi bạn yêu cầu.
   - **Dữ liệu giao dịch:** Chúng tôi chỉ lưu mã giao dịch tham chiếu, tên gói, thời hạn và trạng thái thanh toán; **không** thu thập hay lưu trữ số thẻ ngân hàng, mã CVV hay mật khẩu tài khoản ngân hàng của bạn.

#### 2. Mục đích Xử lý Dữ liệu Cá nhân

- Xác thực danh tính, duy trì phiên đăng nhập và đồng bộ tiến độ học tập đa thiết bị (Web, iOS, Android).
- Tính toán lịch ôn tập ngắt quãng (SRS) chính xác theo múi giờ của bạn.
- Cung cấp các tính năng dịch thuật, OCR tài liệu, phân tích câu và luyện phát âm thông qua tích hợp AI.
- Quản lý hạn mức sử dụng (Quota), gói thuê bao (Entitlements) và hỗ trợ kỹ thuật.
- Phát hiện, ngăn chặn các hành vi gian lận, tấn công mạng hoặc vi phạm Điều khoản Sử dụng.

#### 3. Chia sẻ và Chuyển Dữ liệu Cá nhân Xuyên biên giới

1. **Cam kết không bán dữ liệu:** Chúng tôi **tuyệt đối không bán, trao đổi hoặc cho thuê** dữ liệu cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích tiếp thị.
2. **Các đối tác xử lý dữ liệu phụ (Sub-processors) và Chuyển dữ liệu ra nước ngoài:** Để vận hành ứng dụng, dữ liệu cần thiết được xử lý thông qua các nhà cung cấp hạ tầng đạt chuẩn bảo mật quốc tế có máy chủ đặt ngoài lãnh thổ Việt Nam (như Singapore, Nhật Bản, Hoa Kỳ), bao gồm:
   - Hạ tầng cơ sở dữ liệu đám mây: **MongoDB Atlas**.
   - Dịch vụ xác thực (nếu bạn chọn): **Google Sign-In / Sign in with Apple**.
   - Nhà cung cấp dịch vụ AI xử lý ngôn ngữ/OCR/giọng nói (chỉ nhận đoạn văn bản/tệp tài liệu/âm thanh mà bạn yêu cầu xử lý, không nhận mật khẩu hay thông tin định danh tài chính của bạn).
   - Dịch vụ thanh toán & quảng cáo (khi được bật): **Apple In-App Purchase, Google Play Billing, Google AdSense/AdMob**.

#### 4. Quyền của Chủ thể Dữ liệu và Cách thức Thực hiện (Theo Luật số 91/2025/QH15)

Bạn có đầy đủ các quyền theo pháp luật Việt Nam đối với dữ liệu cá nhân của mình, bao gồm:
1. **Quyền được biết và Quyền truy cập:** Xem toàn bộ thông tin hồ sơ, tiến độ học tập và lịch sử sử dụng của mình ngay trong Ứng dụng.
2. **Quyền chỉnh sửa:** Tự cập nhật tên hiển thị, múi giờ, ngôn ngữ hoặc mật khẩu trong mục Hồ sơ cá nhân.
3. **Quyền rút lại sự đồng ý:** Tắt quyền truy cập Microphone/Camera trong cài đặt thiết bị hoặc ngừng sử dụng tính năng AI bất cứ lúc nào.
4. **Quyền yêu cầu xóa dữ liệu và Xóa tài khoản vĩnh viễn:**
   - Bạn có thể bấm nút **"Xóa tài khoản"** trực tiếp tại mục **Cài đặt tài khoản** trên Website hoặc Ứng dụng di động (iOS/Android), hoặc gửi yêu cầu tới email hỗ trợ.
   - Sau khi xác nhận, toàn bộ thông tin định danh cá nhân, bộ thẻ riêng tư, tệp tải lên và lịch sử học tập của bạn sẽ bị xóa vĩnh viễn khỏi hệ thống sản xuất trong vòng tối đa **72 giờ** (trừ các chứng từ kế toán/giao dịch bắt buộc phải lưu trữ theo quy định của Luật Kế toán và pháp luật về thuế).

#### 5. Thời hạn Lưu trữ và Biện pháp Bảo mật

- Dữ liệu tài khoản được lưu trữ trong suốt thời gian tài khoản của bạn hoạt động và bị xóa khi bạn thực hiện chức năng Xóa tài khoản.
- Mật khẩu được băm bằng thuật toán `scrypt` kèm salt ngẫu nhiên; khóa API được mã hóa chuẩn **AES-256-GCM**; toàn bộ kết nối giữa trình duyệt/ứng dụng di động và máy chủ đều được mã hóa qua giao thức **HTTPS/TLS**.

#### 6. Thông tin Liên hệ và Khiếu nại (Bộ phận Bảo vệ Dữ liệu Cá nhân & Bản quyền)

Mọi thắc mắc, yêu cầu thực hiện quyền dữ liệu cá nhân hoặc thông báo khiếu nại bản quyền (DMCA / Notice & Takedown), vui lòng liên hệ:
- **Đơn vị vận hành:** `[TÊN ĐƠN VỊ VẬN HÀNH / CHỦ SỞ HỮU]`
- **Email hỗ trợ & Pháp lý:** `[EMAIL LIÊN HỆ]`
- **Địa chỉ liên hệ:** `[ĐỊA CHỈ LIÊN HỆ TẠI VIỆT NAM]`
