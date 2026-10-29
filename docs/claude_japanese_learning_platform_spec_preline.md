# Đặc tả đầu vào cho Claude Code --- Nền tảng học tiếng Nhật

> **Mục đích:** Đọc tài liệu này trước khi thiết kế hoặc triển khai hệ
> thống. Hãy phân tích repository và các pattern hiện có trước; sau đó
> đề xuất thiết kế phù hợp. Tài liệu này là yêu cầu/định hướng, không
> phải sự cho phép tự ý thay đổi code, tạo tài khoản hoặc quyết định các
> vấn đề sản phẩm chưa được chốt.

## 1. Quy ước trách nhiệm

Dùng đúng các ký hiệu sau trong kế hoạch, checklist, ADR và sprint:

-   **Tôi** --- quyết định sản phẩm/nghiệp vụ, chọn phương án, cung cấp
    hoặc quản lý tài khoản, API key, thông tin thanh toán, nội dung và
    quyền sử dụng nội dung.
-   **Claude Code** --- viết code theo pattern, cấu trúc, convention và
    thư viện đã có trong repository; bổ sung test và tài liệu kỹ thuật
    tương ứng. Không tự ý thay đổi kiến trúc hoặc chọn dịch vụ trả phí
    khi chưa được duyệt.
-   **Cả hai** --- cùng phân tích, đánh giá lựa chọn, thử nghiệm, xem
    xét kết quả và chốt phương án.

Nếu một nhiệm vụ cần quyết định của **Tôi**, hãy ghi rõ câu hỏi/lựa chọn
cần quyết định và dừng trước hành động không thể tự hoàn tác. Không tạo
tài khoản, đăng ký dịch vụ, nhập thông tin thuế/ngân hàng, bật thanh
toán thật, mua gói, xuất bản quảng cáo hoặc đồng ý điều khoản thay người
dùng.

## 2. Cách làm việc bắt buộc

1.  Trước tiên kiểm tra repository hiện có: cấu trúc thư mục,
    `package.json`, lockfile, framework version, quy ước module, API,
    xác thực, logging, error handling, validation, database, test, UI
    component và cách cấu hình môi trường.
2.  Ưu tiên tái sử dụng pattern và thư viện hiện có. Không tự ý tái cấu
    trúc lớn, thay package manager, đổi framework, thêm microservice hay
    thay đổi database nếu chưa có lý do và phê duyệt.
3.  **Không giả định phiên bản NestJS phải giống số phiên bản Next.js.**
    Xác minh phiên bản stable, tương thích Node.js và peer dependencies
    từ nguồn chính thức tại thời điểm triển khai.
4.  Phân biệt rõ:
    -   **Đã chốt:** yêu cầu sản phẩm đã nêu rõ.
    -   **Đề xuất:** phương án hợp lý nhưng cần duyệt.
    -   **Chưa quyết định:** cần Tôi hoặc Cả hai chốt.
5.  Khi được yêu cầu lập kế hoạch/thiết kế, chỉ tạo đặc tả, ADR, sơ đồ,
    backlog và tiêu chí nghiệm thu; không sửa code. Chỉ viết/sửa file
    code khi được yêu cầu triển khai rõ ràng.
6.  Chia việc theo sprint nhỏ, có tiêu chí nghiệm thu, test case, rủi ro
    và phụ thuộc. Không đánh dấu hoàn thành nếu chưa chạy kiểm thử phù
    hợp.
7.  Mặc định ngôn ngữ UI là **tiếng Việt**. Thiết kế dữ liệu có khả năng
    mở rộng sang ngôn ngữ khác, không hard-code tiếng Việt vào cấu trúc
    dữ liệu nếu có thể tránh.
8.  Với mọi nội dung pháp lý, quyền tác giả, bảo vệ dữ liệu, thanh toán,
    quảng cáo và điều khoản nhà cung cấp, cần xác minh quy định hiện
    hành; không coi giả định là kết luận pháp lý.

## 3. Mục tiêu sản phẩm

Xây dựng nền tảng học tiếng Nhật có nội dung theo giáo trình/JLPT,
flashcard và lặp lại ngắt quãng, bài tập, luyện nghe/chính tả, phân tích
câu, shadowing, AI Kaiwa, quản trị nội dung và các gói Free/Pro/VIP. Hệ
thống có thể phát triển theo từng sprint, ưu tiên MVP và kiểm soát chi
phí AI/media.

## 4. Chức năng người học

### 4.1. Tài khoản và hồ sơ

-   Đăng ký/đăng nhập bằng Google, GitHub hoặc tài khoản/email theo
    phương án xác thực được duyệt.
-   Quản lý hồ sơ, tiến độ học và lịch sử làm bài.
-   Phân biệt role quản trị với quyền lợi gói thuê bao; không dùng role
    làm cơ chế kiểm tra entitlement duy nhất.

### 4.2. Flashcard từ vựng

-   Học theo giáo trình, sách, cấp độ, bài/unit và bộ thẻ.
-   Trường dữ liệu dự kiến: từ/cụm từ tiếng Nhật, cách đọc/furigana,
    nghĩa tiếng Việt, loại từ, ví dụ tiếng Nhật, bản dịch ví dụ, nguồn,
    tags và metadata cần thiết.
-   Nhập nội dung từ PDF, Excel/XLSX hoặc CSV; cần màn hình preview, ánh
    xạ cột, kiểm tra lỗi, phát hiện trùng lặp và xác nhận trước khi nhập
    hàng loạt.
-   Cho phép người dùng tạo/sửa bộ flashcard cá nhân và lưu từ/cụm từ
    trong lúc học.

### 4.3. Flashcard ngữ pháp

-   Điểm ngữ pháp, ý nghĩa tiếng Việt, cấu trúc, cách dùng, ví dụ và bản
    dịch.
-   Phân loại theo cấp độ, nhóm ngữ pháp, giáo trình/unit và tags.
-   Có thể liên kết một điểm ngữ pháp với nhiều ví dụ và bài tập.

### 4.4. Lặp lại ngắt quãng (spaced repetition)

-   Lập lịch ôn dựa trên phản hồi của người học và lịch sử thẻ.
-   Lưu tiến độ riêng cho từng người dùng; hỗ trợ thẻ mới, đến hạn, khó
    nhớ và đã thuộc.
-   Thuật toán cụ thể là **chưa quyết định**; so sánh phương án, mô tả
    dữ liệu cần lưu và test hành vi trước khi chốt.
-   Xử lý timezone, ngày ôn, thay đổi lịch và trường hợp học trên nhiều
    thiết bị.

### 4.5. Bài tập và đề thi

-   Bài tập từ vựng/ngữ pháp có thể cấu hình thời gian, chấm điểm, giải
    thích đáp án và xem lại lỗi.
-   Quản trị viên tạo đề theo cấp độ, loại kỳ thi, năm và bộ câu hỏi.
-   Khi người học làm đề, hệ thống có thể xáo trộn câu hỏi và/hoặc thứ
    tự lựa chọn theo cấu hình; phải giữ nguyên đáp án đúng và quy tắc
    chấm điểm.
-   Lưu attempt, câu trả lời, điểm số, thời gian, giải thích và thống kê
    tiến độ.
-   Hỗ trợ nhóm đề JLPT/JFT/NAT theo cấu hình quản trị. Không sao chép
    hoặc phân phối đề có bản quyền nếu không có quyền sử dụng.

### 4.6. Video, transcript và chính tả

-   Người dùng có thể tải lên video/audio mà họ có quyền sử dụng; hỗ trợ
    các định dạng được kiểm tra thực tế.
-   Tạo transcript bằng dịch vụ STT/AI được lựa chọn sau benchmark.
-   Hiển thị transcript theo từng đoạn có timestamp; có thể bật/tắt
    transcript khi xem video.
-   Hỗ trợ chính tả (dictation), điều chỉnh font/cỡ chữ/màu hiển thị và
    phân tích câu.
-   Cho phép tra từ/ngữ pháp trong transcript và lưu vào flashcard cá
    nhân.
-   Quản lý trạng thái tác vụ như `UPLOADING`, `UPLOADED`, `QUEUED`,
    `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`.
-   Upload, xử lý media và STT nên chạy qua hàng đợi/worker khi phù hợp;
    không giữ video/audio lớn trong MongoDB. Đặt giới hạn dung
    lượng/thời lượng và thời gian lưu có thể cấu hình.
-   Các giới hạn ví dụ như 500 MB/file, 60 phút/video, 1080p hoặc lưu
    file gốc 30 ngày chỉ là **giá trị đề xuất để thử nghiệm**, không
    phải quyết định cuối cùng.

### 4.7. Phân tích câu tiếng Nhật

-   Phân tích câu từ transcript hoặc câu người dùng nhập.
-   Kết quả có thể gồm: phân đoạn từ, cách đọc/furigana, từ loại, dạng
    từ điển, nghĩa, cấu trúc ngữ pháp, bản dịch và giải thích.
-   Dùng bộ phân tích hình thái tiếng Nhật cho tokenization/POS/reading
    khi phù hợp; dùng AI cho các nhiệm vụ ngữ nghĩa. Không phụ thuộc
    hoàn toàn vào một lần gọi LLM để xác định mọi ranh giới từ.
-   Chuẩn hóa kết quả theo schema có version; validate output, xử lý lỗi
    và lưu phiên bản analyzer/model khi cần.
-   So sánh các lựa chọn như Kuromoji.js và Sudachi về độ chính xác,
    hiệu năng, tích hợp và giấy phép trước khi quyết định.

### 4.8. Shadowing

-   Phát audio/video theo câu hoặc đoạn; hỗ trợ lặp lại đoạn và ghi âm
    người học khi có sự đồng ý.
-   Đánh giá phát âm/độ tương đồng bằng provider được chọn sau
    benchmark; hiển thị phản hồi dễ hiểu, không khẳng định điểm AI là
    đánh giá tuyệt đối.
-   Quy định thời gian lưu audio, xóa dữ liệu và quyền truy cập.

### 4.9. AI Kaiwa

-   Luyện hội thoại tiếng Nhật với AI, chọn chủ đề/cấp độ và nhận phản
    hồi sau lượt nói.
-   Tính năng được kiểm soát bởi entitlement của gói.
-   Có giới hạn sử dụng, timeout, xử lý lỗi và đo chi phí; thiết kế
    provider-independent.
-   Provider/model cụ thể **chưa quyết định**.

## 5. Quản trị viên

-   Quản lý người dùng, trạng thái tài khoản và quyền quản trị theo
    nguyên tắc least privilege.
-   Quản lý giáo trình, unit, từ vựng, điểm ngữ pháp, bộ flashcard chia
    sẻ và nội dung học.
-   Quản lý đề thi, năm, cấp độ, câu hỏi, đáp án và giải thích.
-   Quản lý video/transcript và xem lỗi xử lý.
-   Tiếp nhận phản hồi người dùng về từ vựng, transcript, bản dịch hoặc
    phân tích câu; có trạng thái xử lý và lịch sử.
-   Quản lý gói Free/Pro/VIP, tính năng được bật, hạn mức, chu kỳ reset
    và chính sách vượt hạn mức.
-   Quản lý quảng cáo Google AdSense ở mức cấu hình/vị trí hiển thị nếu
    được phép; không tự ý sửa mã quảng cáo, consent hoặc cấu hình tài
    khoản AdSense ngoài phạm vi đã duyệt.
-   Có audit log cho các thao tác quản trị quan trọng.

## 6. Thuê bao và quyền lợi Free/Pro/VIP

### 6.1. Hình thức bán

-   Dự kiến có thanh toán theo tháng, năm và mua một lần.
-   Nhà cung cấp thanh toán, tiền tệ, chính sách gia hạn/hủy/hoàn tiền
    và điều kiện mua một lần đều **chưa quyết định**.
-   Kiểm tra khả năng hỗ trợ quốc gia của pháp nhân, phương thức thanh
    toán địa phương, thuế, webhook và yêu cầu tuân thủ trước khi chốt
    provider.
-   Không bật giao dịch thật cho đến khi Tôi phê duyệt tài khoản, giá,
    tiền tệ, chính sách và môi trường production.

### 6.2. Entitlements

-   Tách `Role` (ví dụ `USER`, `ADMIN`, `SUPER_ADMIN`) khỏi `Plan`
    (`FREE`, `PRO`, `VIP`) và quyền lợi tính năng.
-   Quyền lợi có thể cấu hình theo `featureKey`, trạng thái bật/tắt,
    giới hạn, chu kỳ, timezone reset, chính sách vượt hạn mức và thời
    gian hiệu lực.
-   Ví dụ giới hạn ban đầu chỉ dùng để benchmark: số bộ thẻ cá nhân, số
    thẻ tạo/ngày, số lượt phân tích câu AI/ngày, số phút video/tháng, số
    phút Kaiwa/tháng và số lượt shadowing/tháng. Chưa được coi các con
    số minh họa là quyết định sản phẩm.
-   Đặt trước quota khi tạo job; khi job thành công thì quyết toán
    usage; khi job thất bại/hủy thì giải phóng quota theo quy tắc rõ
    ràng.
-   Kiểm thử race condition, nâng/hạ gói, hết hạn, gia hạn thất bại,
    refund và quyền lợi đã mua một lần.

## 7. Kiếm thu nhập qua Google AdSense --- yêu cầu bổ sung

### 7.1. Mục tiêu

Tích hợp **Google AdSense** để tạo doanh thu quảng cáo trên các trang
nội dung phù hợp của website, nhưng không làm giảm trải nghiệm học tập,
không gây nhầm lẫn với nút điều hướng/đáp án và không vi phạm chính sách
của Google.

### 7.2. Phân công trách nhiệm

-   **Tôi**
    -   Tạo và sở hữu tài khoản Google AdSense; tự thực hiện xác minh
        danh tính, thông tin thanh toán, thuế và các bước xác minh quyền
        sở hữu website.
    -   Quyết định website/domain, khu vực người dùng, trang/vị trí đặt
        quảng cáo, chính sách quyền riêng tư/cookie/consent và nội dung
        được xuất bản.
    -   Cung cấp Publisher ID, mã xác minh hoặc thông tin cấu hình cần
        thiết qua biến môi trường/cấu hình an toàn; không gửi bí mật vào
        repository công khai.
    -   Đọc và chấp nhận điều khoản Google, thực hiện các bước trong
        AdSense yêu cầu chủ sở hữu tài khoản.
-   **Claude Code**
    -   Kiểm tra kiến trúc frontend hiện tại và thiết kế tích hợp theo
        pattern hiện có.
    -   Xây dựng component quảng cáo có thể tái sử dụng, vị trí quảng
        cáo theo cấu hình, trạng thái loading/fallback và responsive
        layout.
    -   Đảm bảo quảng cáo không che nội dung, không đẩy layout bất
        thường, không làm hỏng Core Web Vitals hoặc điều hướng.
    -   Thêm cấu hình theo môi trường, tài liệu cài đặt, checklist kiểm
        thử và cách tắt quảng cáo nhanh.
    -   Không tạo tài khoản, không tự chọn/đăng ký Publisher ID, không
        tuyên bố website đã được AdSense phê duyệt, không giả lập
        click/impression hoặc tạo hành vi tăng doanh thu nhân tạo.
-   **Cả hai**
    -   Cùng quyết định vị trí quảng cáo, điều kiện hiển thị theo loại
        trang/gói, trải nghiệm người dùng và tiêu chí nghiệm thu.
    -   Kiểm tra chính sách Google hiện hành trước khi triển khai
        production; thử nghiệm trên môi trường development bằng
        placeholder/mock, không tạo traffic hoặc click quảng cáo thật để
        kiểm thử.

### 7.3. Phạm vi vị trí quảng cáo đề xuất

Các vị trí dưới đây là đề xuất để thảo luận, không tự động bật hết:

-   Trang công khai: trang chủ, danh mục/chuyên mục, danh sách bài viết
    hoặc trang nội dung công khai.
-   Trang bài viết/kiến thức: vị trí trong hoặc cuối nội dung nếu phù
    hợp chính sách và trải nghiệm.
-   Người dùng Free: có thể hiển thị quảng cáo theo cấu hình.
-   Người dùng Pro/VIP: mặc định **đề xuất không hiển thị quảng cáo**
    như một quyền lợi trả phí; cần Tôi/Cả hai chốt. Nếu chính sách kinh
    doanh khác, phải ghi rõ trong đặc tả.
-   Khu vực học tập cần tập trung (flashcard, bài thi đang làm,
    dictation, shadowing, Kaiwa) nên mặc định không có quảng cáo chen
    ngang; chỉ thay đổi khi có đánh giá UX và chính sách phù hợp.
-   Không đặt quảng cáo sát các nút "Tiếp theo", "Nộp bài", đáp án, nút
    phát/tạm dừng hoặc thành phần có thể khiến người dùng nhấp nhầm.
-   Không hiển thị quảng cáo trong admin dashboard, trang đăng nhập/đăng
    ký, checkout/thanh toán hoặc trang lỗi theo mặc định.

### 7.4. Yêu cầu kỹ thuật

-   Tích hợp theo hướng client component/island phù hợp với Next.js App
    Router; không làm ảnh hưởng Server Components hoặc render phía
    server.
-   Nạp script AdSense theo đúng hướng dẫn chính thức hiện hành, tránh
    nạp trùng script khi chuyển route client-side.
-   Dùng cấu hình môi trường để quản lý Publisher ID và cờ bật/tắt;
    không hard-code thông tin theo nhiều nơi. Các biến môi trường public
    phải được xác định rõ vì có thể xuất hiện trong bundle trình duyệt.
-   Chỉ render slot quảng cáo khi có cấu hình hợp lệ và trang được phép
    hiển thị; có fallback an toàn khi script bị chặn hoặc không có quảng
    cáo.
-   Không tự động refresh quảng cáo, không tự tạo impression/click,
    không yêu cầu người dùng nhấp quảng cáo, không ngụy trang quảng cáo
    thành nội dung hoặc nút điều hướng.
-   Không đặt nội dung/overlay che quảng cáo hoặc can thiệp vào cách
    AdSense hiển thị.
-   Không giả định quảng cáo luôn được trả về; layout phải hoạt động khi
    slot trống, ad blocker hoạt động hoặc script lỗi.
-   Đảm bảo không gửi dữ liệu cá nhân hoặc thông tin học tập vào tham số
    quảng cáo ngoài cơ chế và chính sách đã được phép.
-   Kiểm tra tác động đến hiệu năng, accessibility, responsive design,
    CLS/Core Web Vitals và CSP nếu repository đang sử dụng.
-   Cần có cách tắt toàn bộ quảng cáo nhanh bằng cấu hình mà không cần
    sửa nhiều trang.

### 7.5. Quyền riêng tư, consent và chính sách

-   **Tôi/Cả hai** xác minh các yêu cầu hiện hành về consent/cookie,
    quyền riêng tư, nội dung bị hạn chế, xác minh website, `ads.txt`
    (nếu áp dụng), và điều kiện AdSense cho quốc gia/khu vực mục tiêu.
-   Không tự kết luận rằng chỉ cần thêm script là đủ để được phê duyệt.
-   Nếu website có người dùng ở khu vực yêu cầu cơ chế consent cụ thể,
    cần xác định yêu cầu áp dụng trước khi production.
-   Cung cấp trang/chính sách cần thiết theo phạm vi pháp lý và yêu cầu
    Google đã được xác minh; nội dung pháp lý do Tôi duyệt.
-   Không triển khai quảng cáo trên trang nội dung mỏng, nội dung sao
    chép không có quyền, trang chỉ có dữ liệu tự động chất lượng thấp
    hoặc nội dung vi phạm chính sách.
-   Với nội dung do người dùng đăng hoặc nội dung tự động tổng hợp, cần
    kiểm duyệt chất lượng và quyền sử dụng trước khi đưa vào trang có
    quảng cáo.

### 7.6. Admin và cấu hình quảng cáo

Thiết kế admin tùy theo pattern hiện có; không nhất thiết phải tạo
dashboard phức tạp trong MVP. Tối thiểu cần xác định: - Bật/tắt quảng
cáo toàn hệ thống. - Bật/tắt theo nhóm trang hoặc vị trí (nếu được chấp
thuận). - Bật/tắt theo gói Free/Pro/VIP nếu chính sách sản phẩm đã
chốt. - Cấu hình slot/placement ID theo cách an toàn và có validation. -
Ghi nhận ai thay đổi cấu hình, thời gian và giá trị thay đổi. - Không
lưu private credentials hoặc thông tin thanh toán nhạy cảm trong
database/logs.

### 7.7. Kiểm thử và nghiệm thu AdSense

-   Không có Publisher ID: website chạy bình thường và không lỗi.
-   Cờ quảng cáo tắt: không nạp script quảng cáo.
-   Cờ bật nhưng slot không có quảng cáo: layout vẫn ổn định.
-   Chuyển route trong Next.js không nạp trùng script.
-   Ad blocker, lỗi mạng hoặc script bị từ chối không làm hỏng chức năng
    học.
-   Responsive ở mobile/tablet/desktop; không che nút hoặc nội dung quan
    trọng.
-   Kiểm tra không có quảng cáo ở các vị trí bị cấm theo cấu hình.
-   Kiểm tra người dùng Pro/VIP không thấy quảng cáo nếu chính sách
    "không quảng cáo" đã được chốt.
-   Không có test nào cần nhấp quảng cáo thật hoặc tạo traffic giả.
-   Chỉ nghiệm thu tích hợp kỹ thuật; việc tài khoản/domain được Google
    phê duyệt là quy trình riêng do Tôi thực hiện.

## 8. Video và nguồn nội dung bên ngoài

-   Ưu tiên nội dung do người dùng tải lên mà họ có quyền sử dụng, hoặc
    nguồn có API/điều khoản cho phép đúng thao tác dự định.
-   Với nền tảng video bên ngoài, mặc định dùng embed/link chính thức
    khi được phép; không tải, sao chép, lưu cache hoặc xử lý lại nội
    dung nếu điều khoản/giấy phép không cho phép.
-   Lưu metadata nguồn, URL, attribution, trạng thái quyền sử dụng, thao
    tác được phép và thời điểm kiểm tra chính sách.
-   Bảo vệ chống SSRF: kiểm tra URL, chặn địa chỉ nội bộ/private IP và
    redirect nguy hiểm; giới hạn MIME/type, dung lượng, thời gian và tài
    nguyên xử lý.
-   Trước khi hỗ trợ một nguồn cụ thể, Tôi cung cấp/duyệt nguồn và Cả
    hai kiểm tra điều khoản/API hiện hành.

## 9. Kiến trúc và dữ liệu --- định hướng, chưa phải quyết định khóa cứng

### 9.1. Công nghệ

-   Frontend: Next.js 16, App Router; **Preline là UI component library/design foundation được yêu cầu sử dụng**. Kiểm tra phiên bản Preline, cách tích hợp và khả năng tương thích với Tailwind CSS/Next.js trong repository trước khi triển khai.
-   Backend: NestJS; xác minh stable version và tương thích trước khi
    khóa phiên bản.
-   Database: MongoDB.
-   Các tác vụ dài (import, transcript, STT, phân tích AI) nên được cân
    nhắc chạy qua queue/worker và Redis-compatible service.
-   File media lưu ở object storage, không lưu binary lớn trong MongoDB.
-   Swagger/OpenAPI cho API backend.
-   Provider AI/STT được trừu tượng hóa; chưa chọn nhà cung cấp cụ thể.
-   Hosting, Redis, object storage, email và monitoring chưa chốt; so
    sánh chi phí/giới hạn trước khi chọn.
-   Không bắt buộc Docker nếu repository/định hướng hiện tại không dùng;
    không tự chuyển kiến trúc sang Docker/Kubernetes.

### 9.2. Nhóm dữ liệu dự kiến

Xem xét các nhóm collection/entity sau theo pattern thực tế trong
repository: - Identity: `users`, `auth_accounts`, sessions/tokens nếu
cần. - Learning content: `textbooks`, `units`, `vocabulary`,
`grammar_points`, `flashcard_decks`, `flashcards`. - Progress:
`user_card_progress`, `study_sessions`, `exercise_attempts`,
`exam_attempts`. - Media: `media_assets`, `transcripts`,
`transcript_segments`, `sentence_analyses`, `ai_jobs`. - Billing:
`subscription_plans`, `user_subscriptions`, `payments`, webhook
events. - Admin/quality: `feedback`, `audit_logs`. - Entitlements/usage:
feature configuration, quota reservations, usage records. - Ads: cấu
hình placement/feature flags nếu cần; tránh lưu dữ liệu nhạy cảm không
cần thiết.

Tên trên chỉ là gợi ý logic; không tạo toàn bộ collection ngay từ đầu
nếu MVP chưa cần. Xác định ownership, indexes, retention và quan hệ dữ
liệu trước khi triển khai.

## 10. AI và bộ phân tích tiếng Nhật

-   Tạo interface theo từng nhiệm vụ, không khóa vào một provider:
    sentence analysis, transcription, speech evaluation, conversation và
    embedding nếu thực sự cần.
-   Chuẩn hóa schema đầu ra, validation, timeout, retry, cancellation,
    usage/cost tracking và xử lý lỗi.
-   Benchmark bằng tập dữ liệu tiếng Nhật có đại diện N5--N1; đo chất
    lượng, độ trễ, tỷ lệ lỗi và chi phí trên câu/phút/phiên.
-   Đánh giá transcript bằng WER/CER và độ chính xác timestamp; đánh giá
    phân tích câu theo tiêu chí rõ ràng.
-   Giữ nội dung đầu vào/đầu ra tối thiểu cần thiết; xác định retention
    và quyền sử dụng dữ liệu gửi tới provider.
-   Không quyết định provider chỉ dựa trên chất lượng một vài ví dụ.

## 11. Google AdSense và thuê bao không được trộn lẫn

-   AdSense là nguồn doanh thu quảng cáo; subscription/payment là nguồn
    doanh thu từ người dùng. Thiết kế hai cơ chế độc lập nhưng có thể
    phối hợp qua entitlement/configuration.
-   Không giả định người mua Pro/VIP tự động được bỏ quảng cáo cho đến
    khi chính sách sản phẩm chốt.
-   Không dùng click quảng cáo, lượt hiển thị giả hoặc thao tác tự động
    để kiểm thử doanh thu.
-   Phân tích báo cáo doanh thu phải dựa trên số liệu được cung cấp qua
    công cụ/reporting hợp lệ; không tự suy đoán doanh thu thực.

## 12. Bảo mật, quyền riêng tư và vận hành

-   Secrets/API keys chỉ qua secret manager hoặc environment variables
    phù hợp; không commit vào repository, không log secrets.
-   RBAC, least privilege, validation, rate limit, audit log và bảo vệ
    endpoint quản trị.
-   Xử lý dữ liệu người dùng, transcript, voice recordings, lịch sử học
    và thanh toán theo chính sách retention/xóa được phê duyệt.
-   Backup và phục hồi phải có mục tiêu RPO/RTO được chốt và kiểm thử
    restore; mục tiêu gợi ý ban đầu có thể là RPO 24 giờ/RTO 8 giờ nhưng
    chưa được coi là cam kết.
-   Có monitoring/logging/alert cho API, worker, queue, STT/AI, storage
    và payment webhooks.
-   Kiểm thử webhook chữ ký, idempotency, retry, quota race conditions
    và job thất bại.
-   Xác minh quy định bảo vệ dữ liệu cá nhân hiện hành tại thị trường
    hoạt động trước khi production.

## 13. Các quyết định cần theo dõi trong ADR

Tạo hoặc cập nhật ADR trong repository khi được yêu cầu triển khai tài
liệu: 1. Phiên bản NestJS/Node.js và compatibility matrix. 2. Bộ phân
tích hình thái tiếng Nhật và giấy phép dictionary. 3. AI/STT/speech
evaluation/Kaiwa provider và benchmark. 4. Video upload, giới hạn,
queue, storage, retention. 5. Nguồn video ngoài và quyền sử dụng. 6. Nhà
cung cấp thanh toán, tiền tệ, gia hạn, hủy, refund và mua một lần. 7.
Định nghĩa entitlement/giới hạn Free-Pro-VIP. 8. Hosting, MongoDB,
Redis, object storage, backup và monitoring. 9. Google AdSense: điều
kiện phê duyệt, consent/privacy, placements, Free vs Pro/VIP, cấu hình
và tiêu chí nghiệm thu.

Mỗi ADR nên có: trạng thái (`Proposed`, `Accepted`, `Rejected`,
`Superseded`), bối cảnh, lựa chọn, ưu/nhược điểm, quyết định, hậu quả,
nguồn cần kiểm tra và người chịu trách nhiệm.

## 14. Lộ trình sprint đề xuất

Thứ tự dưới đây là gợi ý; sau khi kiểm tra repository, Claude Code cần
đề xuất lại theo dependency và năng lực hiện có.

-   **Sprint 0 --- Discovery/Spec:** audit repository, làm rõ MVP, sơ đồ
    kiến trúc, data flow, ADR và các quyết định còn mở.
-   **Sprint 1 --- Foundation:** cấu hình môi trường,
    lint/typecheck/test, logging/error handling, health checks, API docs
    và nền tảng UI.
-   **Sprint 2 --- Identity & content:** đăng nhập, hồ sơ, giáo
    trình/unit, quản trị từ vựng/ngữ pháp.
-   **Sprint 3 --- Flashcards & repetition:** bộ thẻ, import preview,
    tiến độ và lịch ôn.
-   **Sprint 4 --- Exercises/exams:** bài tập, chấm điểm, giải thích, đề
    thi và xáo trộn.
-   **Sprint 5 --- Admin/feedback/entitlements:** quản trị, phản hồi,
    cấu hình tính năng/hạn mức.
-   **Sprint 6 --- Media/transcription:** upload, storage, queue/worker,
    transcript, trạng thái lỗi.
-   **Sprint 7 --- Sentence analysis/shadowing:** tokenizer + AI, lưu
    thẻ từ transcript, đánh giá shadowing.
-   **Sprint 8 --- AI Kaiwa:** hội thoại, quota/cost controls và quyền
    lợi gói.
-   **Sprint 9 --- Monetization:** thanh toán sandbox, subscription,
    webhook và quy tắc Free/Pro/VIP.
-   **Sprint 10 --- AdSense:** tích hợp kỹ thuật ở môi trường thử
    nghiệm, consent/policy review, vị trí quảng cáo và kiểm thử UX; chỉ
    bật production sau khi Tôi xác nhận tài khoản/domain/chính sách đã
    sẵn sàng.
-   **Sprint 11 --- Production readiness:** bảo mật, hiệu năng,
    backup/restore, monitoring, accessibility, kiểm thử E2E và checklist
    phát hành.

Không nhất thiết phải làm AdSense sau thanh toán nếu kiến trúc và chính
sách cho phép tách riêng; hãy giải thích dependency và đề xuất thứ tự
phù hợp. Không tự triển khai toàn bộ sprint liên tục khi chỉ được yêu
cầu thiết kế.

## 15. Yêu cầu đầu ra từ Claude Code ở giai đoạn thiết kế

Sau khi đọc tài liệu và kiểm tra repository, hãy **chỉ thiết kế, chưa
sửa code**. Trả về: 1. Tóm tắt repository và pattern hiện có. 2. Bảng
yêu cầu: đã chốt / đề xuất / chưa quyết định. 3. Sơ đồ kiến trúc và
luồng dữ liệu. 4. Module/domain boundaries; chỉ đề xuất microservices
nếu có lý do cụ thể. 5. Thiết kế dữ liệu và indexes quan trọng. 6.
API/module boundaries và luồng quyền truy cập. 7. ADR cho các quyết định
lớn, bao gồm AdSense. 8. Roadmap sprint, dependency, tiêu chí nghiệm thu
và test cases. 9. Danh sách câu hỏi cần **Tôi** quyết định, ưu tiên câu
hỏi chặn thiết kế. 10. Ước tính rủi ro/chi phí ở dạng giả định có căn
cứ; nêu rõ những gì cần benchmark hoặc xác minh. 11. Checklist triển
khai AdSense theo môi trường: local/test/staging/production, và các bước
chỉ Tôi mới có thể thực hiện. 12. Không tạo tài khoản, không chọn
provider trả phí, không bật giao dịch/quảng cáo thật, không thay đổi
file code hoặc commit cho đến khi được yêu cầu rõ ràng.

## 16. Điều kiện nghiệm thu tổng thể

-   Thiết kế bám repository và giải thích mọi thay đổi kiến trúc lớn.
-   Các quyết định chưa chốt được gắn nhãn và có owner rõ ràng.
-   Tính năng dài/đắt được giới hạn bằng quota, timeout, queue và usage
    tracking.
-   Nội dung/media được xử lý theo quyền sử dụng và retention rõ ràng.
-   UI tiếng Việt mặc định; responsive và accessible.
-   Có test plan cho luồng thành công, thất bại, retry, quota, quyền
    truy cập và dữ liệu trùng lặp.
-   AdSense có thể tắt nhanh, không làm hỏng trải nghiệm học, không có
    click/impression giả và không được coi là đã phê duyệt chỉ vì code
    chạy.
-   Thanh toán và quảng cáo chỉ được bật production sau khi các bước tài
    khoản, pháp lý, chính sách và xác nhận của Tôi hoàn tất.


---

## 17. Nhận diện sản phẩm: tên dự án, SEO và icon

> Phần này bổ sung định hướng thương hiệu và SEO. Những tên, metadata và icon dưới đây là **đề xuất ban đầu**; cần người phụ trách sản phẩm duyệt trước khi dùng trên production. Không xem tên miền, tên thương hiệu hoặc quyền sử dụng logo là đã được xác nhận.

### 17.1. Tên dự án

**Tên đề xuất:** Nihongo Path  
**Tên hiển thị tiếng Việt:** Nihongo Path — Học tiếng Nhật  
**Tagline đề xuất:** Học tiếng Nhật mỗi ngày, tiến bộ từng bước.  
**Mô tả ngắn:** Nền tảng học tiếng Nhật với flashcard, ngữ pháp, luyện nghe, phân tích câu, luyện hội thoại AI và lộ trình ôn tập theo trình độ.

Lý do chọn tên:
- Ngắn, dễ đọc và gợi ý hành trình học tập có lộ trình.
- Có thể mở rộng từ JLPT/flashcard sang nghe, nói, phân tích câu và các công cụ học khác.
- Không dùng tên của tổ chức thi, nhà xuất bản hoặc giáo trình như thể sản phẩm được họ chứng nhận.

Tên thay thế để cân nhắc: Kotoba Steps, Nihongo Mate, Manabi Japanese. Trước khi chốt, cần kiểm tra tên miền, nhãn hiệu, tên ứng dụng và các thương hiệu tương tự ở thị trường mục tiêu. Không tự đăng ký tên miền hoặc tài khoản thay người dùng.

### 17.2. Hướng dẫn logo và favicon

**Ý tưởng icon đề xuất:** kết hợp trang sách đang mở với một dấu đường đi/tiến bộ đơn giản. Icon phải dễ nhận diện ở kích thước 16×16 và 32×32 px; tránh chữ nhỏ, chi tiết mảnh hoặc biểu tượng gần giống logo thương hiệu khác.

Yêu cầu thiết kế:
- Tạo phiên bản icon vuông, phiên bản logo ngang và phiên bản đơn sắc.
- Chuẩn bị favicon, icon ứng dụng và ảnh Open Graph từ cùng một hệ thống nhận diện.
- Ưu tiên SVG cho icon giao diện nếu repository hỗ trợ; với favicon/app icon, xuất thêm định dạng raster cần thiết.
- Đảm bảo tương phản màu, khả năng hiển thị trên nền sáng/tối và trạng thái focus.
- Không lấy hình ảnh/logo từ sách, ứng dụng hoặc thương hiệu khác nếu chưa có quyền sử dụng.
- Màu sắc cụ thể là **đề xuất**, cần duyệt cùng thiết kế UI hiện có; không tự thay toàn bộ design system.

Tài sản dự kiến (tên file chỉ là gợi ý, cần theo quy ước repository):
- `public/favicon.ico`
- `app/icon.png` hoặc `app/icon.svg` (tùy khả năng hỗ trợ của Next.js hiện có)
- `public/logo.svg`
- `public/og-image.png`

Không tạo các file này cho đến khi được yêu cầu triển khai rõ ràng. Trước tiên kiểm tra cách repository đang quản lý logo, icon và static assets.

### 17.3. SEO kỹ thuật và metadata

Claude Code cần kiểm tra phiên bản Next.js và cách tổ chức App Router hiện có trước khi chọn cách triển khai. Nếu dự án dùng Next.js App Router, xem xét Metadata API và các file metadata convention tương thích với phiên bản đã cài; không tự thêm thư viện SEO nếu framework đã đáp ứng nhu cầu.

Yêu cầu SEO:
- Đặt `title` mặc định và template tiêu đề nhất quán, ví dụ: `%s | Nihongo Path`.
- Viết `description` riêng cho từng trang quan trọng; tránh lặp mô tả chung trên toàn website.
- Cấu hình canonical URL dựa trên domain production đã được duyệt; không tự đoán domain.
- Thêm Open Graph và Twitter/X card metadata cho các trang công khai phù hợp.
- Tạo sitemap XML và `robots.txt` theo route thực tế; không đưa trang cá nhân, admin, trang kết quả riêng tư hoặc URL có dữ liệu nhạy cảm vào sitemap.
- Dùng URL dễ đọc, ổn định và nhất quán; tránh nhiều URL trùng nội dung. Xác định quy tắc phân trang, query parameters và canonical.
- Dùng semantic HTML, heading có thứ bậc, liên kết nội bộ và breadcrumb khi phù hợp.
- Ảnh cần tên file có ý nghĩa, kích thước phù hợp, định dạng tối ưu và alt text mô tả đúng nội dung; ảnh trang trí nên có alt rỗng khi thích hợp.
- Tối ưu hiệu năng và Core Web Vitals; không để script AI, video hoặc quảng cáo làm hỏng trải nghiệm tải trang.
- Chỉ thêm structured data/schema.org khi đúng với nội dung thực tế và có thể xác minh; không khai báo review, rating, giá, khóa học hoặc thông tin doanh nghiệp không có thật.
- Nội dung học công khai cần có giá trị biên tập, nguồn và quyền sử dụng rõ ràng; không tạo hàng loạt trang mỏng chỉ để tăng thứ hạng.
- Trang học riêng tư, tài khoản, admin, checkout và nội dung cá nhân cần được bảo vệ bằng xác thực/phân quyền; `noindex` chỉ là lớp bổ sung, không thay thế bảo mật.
- Không hứa hẹn thứ hạng tìm kiếm hoặc kết quả SEO cụ thể.

Metadata mặc định **đề xuất**:
- `title`: `Nihongo Path — Học tiếng Nhật mỗi ngày`
- `description`: `Học từ vựng, ngữ pháp và luyện nghe tiếng Nhật với flashcard, bài tập, phân tích câu và lộ trình ôn tập.`
- `applicationName`: `Nihongo Path`
- `locale`: `vi_VN` cho nội dung tiếng Việt; xác định locale phù hợp với từng phiên bản ngôn ngữ.
- `openGraph.type`: `website` cho trang chủ/trang phù hợp.
- `metadataBase` và canonical: chỉ cấu hình sau khi domain production được quyết định.

Các nội dung trên là bản nháp. Cần rà soát theo từng route, ngôn ngữ và nội dung thật trước khi phát hành.

### 17.4. SEO đa ngôn ngữ

- UI mặc định là tiếng Việt theo đặc tả hiện tại; kiến trúc nội dung nên hỗ trợ thêm tiếng Nhật hoặc ngôn ngữ khác khi được phê duyệt.
- Nếu triển khai nhiều ngôn ngữ, thiết kế URL và metadata riêng cho từng locale; dùng `hreflang` chỉ khi tồn tại các phiên bản tương đương thực sự.
- Không tự dịch máy rồi xuất bản hàng loạt nội dung học nếu chưa có bước kiểm tra chất lượng.
- Không trộn nội dung tiếng Việt và tiếng Nhật trong cùng metadata nếu không có mục đích rõ ràng.

### 17.5. Tiêu chí nghiệm thu SEO và thương hiệu

- Tên dự án, tagline, logo, favicon và domain đều có trạng thái quyết định rõ ràng.
- Các trang công khai quan trọng có title/description phù hợp, không bị trùng hàng loạt.
- Canonical, sitemap và robots tuân theo route thực tế và không làm lộ trang riêng tư.
- Open Graph hiển thị đúng ảnh, tiêu đề và mô tả khi chia sẻ URL.
- Structured data nếu có phải khớp nội dung hiển thị, không có dữ liệu bịa đặt.
- Kiểm tra responsive, accessibility, hiệu năng và lỗi metadata trong bản build production.
- Có checklist xác minh bằng công cụ tìm kiếm/SEO phù hợp sau khi domain đã hoạt động; không coi việc tạo sitemap là bảo đảm được index.

## 18. Quy chuẩn UI với Preline

### 18.1. Công nghệ UI bắt buộc

- **Preline là lựa chọn UI được yêu cầu** cho nền tảng này; không tự ý thay bằng Bootstrap, Material UI, shadcn/ui hoặc một component library khác.
- Trước khi viết UI, kiểm tra phiên bản Preline, Tailwind CSS, Next.js và cách cấu hình hiện tại trong `package.json`, lockfile, CSS và cấu hình build.
- Dùng component, pattern và utility class phù hợp với phiên bản Preline thực tế đang cài; tham khảo tài liệu Preline chính thức tương ứng phiên bản. Không sao chép API từ phiên bản khác khi chưa xác minh.
- Tái sử dụng component hiện có và giữ nhất quán design token, spacing, typography, màu sắc, border, radius, shadow và breakpoint.
- Nếu một thành phần chưa có sẵn trong Preline, ưu tiên xây dựng component nhỏ theo pattern của dự án; chỉ đề xuất thư viện bổ sung khi có lý do và được duyệt.
- Không tự nâng cấp Tailwind CSS, Preline hoặc framework nếu việc đó có thể gây thay đổi tương thích ngoài phạm vi đã duyệt.

### 18.2. Yêu cầu triển khai UI

- Thiết kế responsive cho mobile, tablet và desktop.
- Ưu tiên accessibility: semantic HTML, label cho input, điều hướng bằng bàn phím, focus state, contrast và thông báo lỗi dễ hiểu.
- Với dropdown, modal, tabs, accordion, tooltip và các thành phần tương tác, xác minh cách khởi tạo JavaScript của Preline theo phiên bản đang dùng; tránh khởi tạo trùng hoặc lỗi khi Next.js App Router chuyển route.
- Chỉ dùng Client Components khi cần tương tác phía trình duyệt; giữ Server Components khi phù hợp với kiến trúc Next.js.
- Đảm bảo trạng thái loading, empty, error, disabled và success cho các luồng quan trọng.
- Không dùng component quảng cáo hoặc nội dung giả để thay cho dữ liệu thật trong production.
- UI mặc định bằng tiếng Việt; tránh hard-code nội dung hiển thị vào cấu trúc dữ liệu nếu thiết kế cần hỗ trợ đa ngôn ngữ.
- Kiểm tra UI trên các kích thước màn hình phổ biến và xác minh không có lỗi hydration, layout shift hoặc tương tác sau khi chuyển route.

### 18.3. Hướng dẫn cho Claude Code về Preline

Khi khảo sát repository:
1. Xác định Preline đã được cài hay chưa, phiên bản và cách tích hợp.
2. Kiểm tra Tailwind CSS version/configuration, CSS entry point, plugin/import cần thiết và cách khởi tạo component JavaScript.
3. Tìm các component UI hiện có và ghi nhận pattern đang được sử dụng.
4. Xác định rủi ro tương thích với Next.js App Router, Server Components và Client Components.
5. Nếu thiếu Preline hoặc cấu hình chưa rõ, nêu phương án, thay đổi file dự kiến và lệnh cài đặt trước khi thực hiện; chờ duyệt nếu việc đó làm thay đổi dependency.

Khi triển khai:
- Dùng Preline làm nền tảng UI theo đúng phiên bản đã xác minh.
- Không thêm một UI library thay thế hoặc song song nếu chưa được duyệt.
- Không tự ý thay toàn bộ giao diện; triển khai theo từng sprint và từng nhóm màn hình.
- Bổ sung kiểm thử phù hợp cho component tương tác, responsive và accessibility.
- Ghi rõ tài liệu Preline chính thức đã tham khảo và các điểm còn cần xác minh.

### 18.4. Tiêu chí nghiệm thu UI

- [ ] Preline và Tailwind CSS tương thích với phiên bản framework trong repository.
- [ ] Component sử dụng đúng API của phiên bản Preline đang cài.
- [ ] Các tương tác hoạt động sau tải trang và sau chuyển route.
- [ ] Không có lỗi hydration hoặc khởi tạo JavaScript lặp lại.
- [ ] Giao diện responsive, có trạng thái loading/empty/error phù hợp.
- [ ] Các thao tác chính hỗ trợ bàn phím, focus và label/accessibility cần thiết.
- [ ] Không có UI library bổ sung ngoài phạm vi đã duyệt.

Nguồn cần kiểm tra: tài liệu Preline chính thức tại https://preline.co/docs/ và tài liệu tương ứng phiên bản thực tế trong repository.

---

## 19. Hướng dẫn khởi tạo dự án bằng Claude Code

### 18.1. Nguyên tắc

Dùng Claude Code như trợ lý phát triển trong repository. Bắt đầu bằng giai đoạn **đọc và lập kế hoạch**, chưa sửa code. Chỉ cho phép triển khai khi người dùng xác nhận phạm vi cụ thể. Claude Code phải tuân thủ mục “Quy ước trách nhiệm” và “Cách làm việc bắt buộc” ở đầu tài liệu.

### 18.2. Chuẩn bị

1. Cài đặt và xác minh Node.js theo yêu cầu của repository/phiên bản Next.js và NestJS được lựa chọn.
2. Cài Claude Code theo hướng dẫn cài đặt chính thức hiện hành của Anthropic; không dùng lệnh cài đặt chưa được xác minh hoặc chạy script lạ với quyền quản trị.
3. Mở terminal tại thư mục repository của dự án.
4. Đặt file đặc tả này ở vị trí dễ truy cập trong repository, ví dụ `docs/claude_japanese_learning_platform_spec.md`. Nếu repository đã có quy ước tài liệu khác, ưu tiên quy ước hiện tại.
5. Kiểm tra Git status và tạo commit/branch làm việc phù hợp trước khi cho phép thay đổi file.
6. Không đưa API key, mật khẩu, token, thông tin thanh toán hoặc dữ liệu người dùng thật vào prompt hay repository.

### 18.3. Lượt đầu: chỉ khảo sát và lập kế hoạch

Khởi chạy Claude Code từ thư mục gốc repository, sau đó gửi prompt:

```text
Đọc toàn bộ docs/claude_japanese_learning_platform_spec.md trước khi làm việc.

Nhiệm vụ hiện tại CHỈ LÀ DISCOVERY VÀ THIẾT KẾ:
1. Kiểm tra cấu trúc repository, Git status, package manager, lockfile,
   phiên bản Node.js/framework, scripts, test, lint, typecheck, cấu hình
   môi trường, UI components, API, database và quy ước hiện có.
2. Đối chiếu repository với đặc tả; phân loại từng điểm thành:
   ĐÃ CHỐT / ĐỀ XUẤT / CHƯA QUYẾT ĐỊNH.
3. Đề xuất MVP và kiến trúc phù hợp với code hiện có. Không tự ý thay
   framework, package manager, database, thêm microservice hoặc chọn
   dịch vụ trả phí.
4. Đề xuất UI dựa trên Preline: kiểm tra phiên bản, Tailwind CSS, cách tích hợp và pattern component hiện có; không thay bằng UI library khác.
5. Đề xuất tên dự án, metadata SEO, cách tổ chức icon/logo và URL.
   Coi “Nihongo Path” là tên đề xuất, chưa được duyệt.
6. Nêu các quyết định cần tôi xác nhận, đặc biệt domain, tên thương hiệu,
   thiết kế UI, provider AI/STT, hosting, storage, thanh toán và AdSense.
7. Đề xuất sprint nhỏ kèm dependency, tiêu chí nghiệm thu, test cases,
   rủi ro và chi phí cần benchmark.
8. Ghi rõ các lệnh kiểm tra đã chạy và kết quả thực tế.

RÀNG BUỘC:
- Không sửa, tạo, xóa hoặc format bất kỳ file nào.
- Không cài package, không chạy migration, không tạo tài khoản/dịch vụ.
- Không truy cập hay in ra secrets; chỉ kiểm tra tên biến môi trường và
  sự hiện diện của file cấu hình, không hiển thị giá trị bí mật.
- Không bật thanh toán/quảng cáo production và không commit.
- Nếu thiếu thông tin hoặc cần quyết định của tôi, hãy dừng ở câu hỏi
  cụ thể thay vì tự giả định.

Trước tiên hãy báo cáo kế hoạch khảo sát, sau đó thực hiện các bước đọc
chỉ an toàn và trả về báo cáo thiết kế.
```

### 18.4. Lượt hai: chốt kế hoạch

Sau khi đọc báo cáo, người dùng quyết định phạm vi MVP và trả lời các câu hỏi chặn. Yêu cầu Claude Code cập nhật kế hoạch/ADR nhưng chưa triển khai:

```text
Dựa trên báo cáo discovery và các quyết định tôi vừa xác nhận:
- Cập nhật thiết kế, ADR, backlog và tiêu chí nghiệm thu.
- Liệt kê các file tài liệu dự kiến tạo/sửa trước khi thay đổi.
- Chỉ rõ phần nào còn là giả định hoặc cần xác minh nguồn chính thức.
- Chưa sửa code, chưa cài package và chưa chạy migration.
Hãy dừng lại để tôi duyệt kế hoạch cuối cùng.
```

### 18.5. Lượt ba: triển khai từng sprint

Chỉ sau khi kế hoạch được duyệt, yêu cầu một phạm vi nhỏ, ví dụ:

```text
Triển khai Sprint 1 đã được duyệt trong kế hoạch.

Trước khi sửa:
1. Tóm tắt phạm vi và các file dự kiến thay đổi.
2. Kiểm tra working tree để không ghi đè thay đổi chưa commit.
3. Nêu package mới, migration hoặc thay đổi cấu hình nếu có; chờ tôi
   xác nhận trước các thay đổi có rủi ro hoặc phát sinh chi phí.

Khi triển khai:
- Bám convention và pattern repository.
- Không làm ngoài phạm vi sprint.
- Thêm/cập nhật test và tài liệu cần thiết.
- Không dùng secrets thật, không gọi dịch vụ trả phí ngoài môi trường
  đã duyệt, không bật payment/AdSense production.

Sau khi triển khai:
- Chạy các lệnh lint, typecheck, test và build phù hợp với repository.
- Báo cáo chính xác lệnh đã chạy, kết quả, file thay đổi, vấn đề còn lại
  và các bước kiểm thử thủ công cần thực hiện.
- Không tuyên bố hoàn thành nếu chưa xác minh tiêu chí nghiệm thu.
Dừng trước sprint tiếp theo để tôi review.
```

### 18.6. Quy tắc khi làm việc với Claude Code

- Không mặc định Claude Code được phép tự triển khai toàn bộ roadmap.
- Duyệt diff trước khi chấp nhận thay đổi; giữ thay đổi theo từng sprint nhỏ.
- Không cho phép tự ý chạy lệnh phá hủy dữ liệu, reset database, xóa file, thay đổi quyền hoặc ghi đè cấu hình.
- Với lệnh có thể truy cập mạng, cài package, chạy migration hoặc tạo chi phí, yêu cầu giải thích mục đích và xác nhận khi cần.
- Không paste secrets vào hội thoại. Dùng `.env.local`/`.env` phù hợp và bảo đảm file bí mật nằm trong `.gitignore`; cung cấp `.env.example` chỉ chứa tên biến và giá trị giả minh họa.
- Khi gặp lỗi, yêu cầu Claude Code tái hiện, xác định nguyên nhân, thêm regression test phù hợp và báo cáo bằng chứng; không sửa ngẫu nhiên nhiều module.
- Chỉ merge hoặc phát hành khi review, test, bảo mật, quyền nội dung, cấu hình production và checklist nghiệm thu đã hoàn tất.

### 18.7. Kiểm tra sau mỗi sprint

- [ ] Phạm vi triển khai khớp kế hoạch đã duyệt.
- [ ] Diff đã được review; không có secrets hoặc file ngoài ý muốn.
- [ ] Lint, typecheck, test và build phù hợp đã chạy; kết quả được ghi rõ.
- [ ] Có test cho trường hợp thành công, lỗi và quyền truy cập liên quan.
- [ ] Tài liệu cấu hình/migration/rollback được cập nhật nếu cần.
- [ ] Không bật dịch vụ trả phí, thanh toán thật hoặc quảng cáo production khi chưa được phê duyệt.
- [ ] Có xác nhận của người dùng trước khi chuyển sprint hoặc phát hành.

### 18.8. Nguồn cần xác minh

Claude Code phải kiểm tra tài liệu chính thức hiện hành khi hướng dẫn cài đặt và sử dụng, thay vì dựa vào lệnh hoặc phiên bản cũ:
- Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview
- Next.js: https://nextjs.org/docs
- NestJS: https://docs.nestjs.com/
- Google Search Central: https://developers.google.com/search/docs
- Google AdSense: https://support.google.com/adsense/

Nếu URL hoặc cấu trúc tài liệu đã thay đổi, hãy tìm tài liệu chính thức hiện hành và ghi rõ nguồn đã xác minh. Không xem việc nêu URL trong đặc tả là bằng chứng rằng một chính sách hoặc phiên bản đã được kiểm tra.
