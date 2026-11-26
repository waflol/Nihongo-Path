# HANDOFF — Nihongo-Path

> **Agent mới: đọc hết file này trước khi code.** Quy tắc: **mỗi tiến trình phải lưu lại (commit + HANDOFF) để agent khác follow tiếp khi hết token.** Không spawn agent phụ (quota 5h chia sẻ, fork cũng chết — đã gặp 429 giữa phiên).

---

## Bỏ "Góp ý & báo lỗi" (báo lỗi thẻ) — dùng Hộp thư phản hồi (26/11/2026)

User yêu cầu bỏ vì đã có Hộp thư phản hồi. Đã xoá: trang `/admin/reports` + `card-reports-console.tsx` + mục menu trong `admin-shell.tsx`; nút cờ "Báo lỗi thẻ" + `card-report-dialog.tsx` trong phiên ôn (`study-session.tsx`). Banner `?card=` ở `deck-cards-manager.tsx` đổi chữ trung tính. **Giữ nguyên**: API card-report backend + dữ liệu cũ (không còn UI gọi, có thể dọn sau); câu chữ "báo lỗi thẻ" trong `/privacy`, `/terms`, `legal-contact.tsx` chưa sửa. `.next/types/validator.ts` cũ còn trỏ `/admin/reports` → tsc báo lỗi đến khi build/dev lại.

**Cập nhật:** nút cờ "Báo lỗi thẻ" trên flashcard đã quay lại để test hộp thư — `components/learn/card-feedback-dialog.tsx` gửi `POST /api/feedback` (`source` translation/vocabulary, `targetId` = id thẻ, `context` = mặt trước — mặt sau), hiện cho mọi bộ thẻ. Báo lỗi vào **Hộp thư phản hồi** (`/admin/feedback`), không còn vào `card_reports`. Người học theo dõi ở **`/account/feedback`** (menu tài khoản → "Báo lỗi & góp ý"; `/account` hiện 3 mục mới nhất): lọc theo trạng thái, bấm mở xem ngữ cảnh + dòng thời gian xử lý + ghi chú admin. API `GET /feedback/me` giờ trả `history` (from/to/note/at, **không** lộ admin nào xử lý — `FeedbackService.shapeMine`, có test). Placeholder ghi chú admin báo "người gửi sẽ thấy". Chưa test khi đăng nhập thật. **Dẫn tới lỗi:** `FeedbackService.resolveTargets` (2 query/trang, có test) phân giải `targetId` → thẻ + bộ thẻ; `adminList`/`adminDetail` trả `target` ({cardId, front, deckId, deckTitle, shared}) — `FeedbackModule` đăng ký thêm model `Flashcard`/`FlashcardDeck` (chỉ đọc). Chi tiết hộp thư có nút **"Mở thẻ để sửa"** → `/admin/decks/{deckId}?card={cardId}` (mở sẵn form sửa); danh sách hiện chip "Thẻ X · bộ Y"; banner trong deck có link quay lại Hộp thư. Chưa kiểm với dữ liệu thật (truy vấn DB bị chặn).

---

## Popup Furigana + gạch chân từ PDF scan (26/11/2026, nhánh np-407-furigana-popup, chưa gộp main)

- **Popup Furigana** (`components/admin/furigana-popover.tsx`, thay `window.prompt`): hiện cạnh chữ đang chọn (điện thoại: đầu màn hình), tự điền cách đọc từ `POST /api/flashcards/reading` (kuromoji), chip gợi ý, xem trước, Enter lưu, Esc huỷ, "Bỏ furigana"; từ lẫn kana đặt cách đọc riêng trên chữ Hán (`rubyOverKanji`, có ô bỏ chọn). Chọn chữ: `pickFurigana()` trong `rich-input.tsx`. Đã chạy Chromium headless với API đọc giả (lưu, undo/redo, sửa, bỏ, Esc, 390px; trang tạm đã xoá).
- **Gạch chân của PDF scan**: trước đây prompt OCR không yêu cầu nên mất hết. Giờ `ocrExamPageText` yêu cầu `<u>…</u>`; `import/ocr-marks.ts` gỡ thẻ thành `Mark` (text vẫn thuần cho tách khối/AI), gắn lại như PDF chữ. Nút "Bổ sung furigana" (`backfillMarks`) với trang scan: đọc lại bằng AI **ở nền** (`markScans`, trả `scanning`), lưu mark theo trang, chỉ sửa bản nháp mở và trường chưa định dạng; tiến độ ở nhật ký lần nhập. API restart sẽ dừng việc nền — bấm lại.
- Vitest `src/exams` + `ai-complete-any` 182 đạt, tsc API + UI đạt. **Chưa thử OCR thật**: model có nhận ra gạch chân hay không phụ thuộc dịch vụ ở tab "Đọc PDF đề thi".
- **OOM khi biên dịch đã sửa (26/11/2026):** `nest start --watch` cần ~700 MB heap trở lên nhưng bị `NODE_OPTIONS=--max-old-space-size=700` (từ `.env`) giới hạn → exit 134, pm2 restart, `dist/main` cũ mồ côi giữ cổng 3000. Script `dev` của API giờ truyền `--max-old-space-size=1280` (cờ dòng lệnh thắng `NODE_OPTIONS`; API con vẫn 700). Đã dọn tiến trình mồ côi, thử 2 lần biên dịch lại: không sập, RSS đỉnh ~1 GB. Nếu `EADDRINUSE` lại xuất hiện: PPID của `dist/main` phải là tiến trình watch; nếu không thì `pm2 stop api`, kill `dist/main`, `pm2 start api`.

---

## `/admin/ai` thiết kế lại (26/11/2026)

Một cột: đầu trang gọn + nút "Thêm dịch vụ" mở form (tự mở khi chưa có dịch vụ); tab tác vụ chia 2 nhóm, tự xuống dòng (trước bị cắt); danh sách là chuỗi ưu tiên đánh số nối bằng đường dọc. Tải lỗi (vd. API đang restart → 500 `ECONNREFUSED`) hiện thông báo + "Thử lại", không còn báo "0 dịch vụ". Đã chụp Chromium headless dữ liệu giả (850, 1100, 360 px; sáng/tối; lỗi, rỗng) qua trang tạm đã xoá; chưa thử đăng nhập thật. tsc đạt; ESLint còn 4 lỗi `set-state-in-effect` cũ.

Kéo thả đổi thứ tự: `components/admin/use-drag-reorder.ts` (pointer events, không thêm thư viện), tay nắm trên mỗi dịch vụ; thả là lưu qua `services/reorder`, Esc huỷ, ▲▼ và phím mũi tên vẫn dùng được. Đã thử chuột + cảm ứng giả lập (CDP) trên Chromium headless, API giả; chưa thử máy thật.

---

## Admin: Hạn mức & gói + Hộp thư phản hồi làm lại UI (26/11/2026)

- **Hạn mức & gói** (`/admin/entitlements`): `entitlements-console.tsx` (khung: thống kê, thêm tính năng + gợi ý, tìm, toast) + `entitlement-card.tsx` (một tính năng). Mỗi gói một ô: **Số lượt / Vô hạn / Không cấp** — đúng ngữ nghĩa API: không có dòng gói = 403, `null` = vô hạn, số (kể cả 0) = giới hạn. UI cũ hiện "—" cho gói không có dòng và lưu khi rời ô (select hay hụt); giờ là bản nháp + nút Lưu/Huỷ, công tắc bật/tắt lưu ngay.
- **Xoá cấu hình**: `DELETE /admin/entitlements/features/:featureKey` (`@ContentAdmin`, audit `before`), `EntitlementsService.deleteFeature` (404 nếu không có); proxy UI thêm `DELETE`. Xoá xong tính năng **không còn bị giới hạn**; reservation/usage giữ nguyên.
- **Hộp thư phản hồi** (`/admin/feedback`): `feedback-console.tsx` (2 cột: danh sách + chi tiết; điện thoại mở chi tiết thay danh sách) + `feedback-detail.tsx` (đề xuất, lịch sử dạng timeline, ghi chú + đổi trạng thái). API: `adminList` trả thêm `counts` theo trạng thái (cùng bộ lọc nguồn — trước đây tab khác luôn 0); `adminDetail` populate `history.by` → tên/email admin thay vì id. Có "Tải thêm" (page), tìm trong trang đã tải.
- Đã chạy: tsc API + UI, eslint 4 file UI, vitest `src/entitlements` (26) + `src/feedback` (7, thêm 1 spec counts). Chụp Chromium headless 1280/390 với dữ liệu giả (trang preview tạm đã xoá). Đã `pm2 restart api` (route DELETE trả 401 khi chưa đăng nhập). Chưa thử với đăng nhập admin thật.

---

## Thứ tự model đọc PDF (26/11/2026)

`/admin/ai`: thêm 2 tab thứ tự `ocr-exam` (chép trang đề scan + tách khối) và `ocr-vocab` (PDF từ vựng scan), lưu ở `taskPriority`, chỉnh tay (benchmark không đụng); chưa chỉnh thì theo `priority`. Kiểu `OrderTask` (`ai-benchmark.ts`, UI `lib/ai-benchmark-score.ts`). Lịch sử gọi AI có mục đích `exam-import` ("Đọc đề thi từ file PDF"), lời gọi tách khối ghi `Tách khối n`. Model chỉ nhận chữ không còn bị khoá khi từ chối ảnh (cả đề lẫn từ vựng). Vitest `src/ai src/exams src/import`, typecheck API + UI đạt; ESLint `ai-services-console.tsx` còn 4 lỗi `set-state-in-effect` có từ trước. Chưa thử trên trình duyệt.

---

## NP-407: nhập sách drill và chịu lỗi AI (26/11/2026)

File `Drill_&_Drill_N2-Moji_Goi.pdf` (167 trang scan) nhập ra 27 khối, 18 lỗi: sách không có tiêu đề `問題`, và AI trả HTTP 503.

- `import/drill.ts`: `segmentBlocks` nhận sách drill (câu `【n】`, gần như không có `問題`): mỗi đợt `第N回`/câu dẫn một khối, dạng theo banner, đáp án `【n】正解x` ghép theo dạng + số câu (không chắc thì để trống). `rules.ts` nhận số câu 3 chữ số.
- `import/retry.ts`: không dịch vụ nào trả lời thì chờ 15/30/60/120/180 s rồi thử lại. Trang OCR hỏng không được lưu, đọc lại cuối lượt; 5 trang liên tiếp hỏng → job `error`. `completeAny` thử lần lượt các dịch vụ khi tách khối.
- OCR đề: Gemini trả text thường (trước bị ép JSON), prompt giữ `【n】`/`正解`/`第N回`; model chỉ nhận text (400 `content must be a string`) không còn bị khoá 1 giờ.
- Đã chạy: vitest `src/exams` + 3 spec AI (212 đạt, 1 skip), typecheck. `ai-antigravity-cli.spec` từng timeout 5 s một lần khi chạy cả `src/ai`, chạy lại đạt.
- **Chưa nhập lại file thật**: test dùng text tự viết theo bố cục sách; chưa biết OCR thật đọc banner/ngoặc/đáp án ra sao. Gạch chân từ được hỏi (漢字読み, 表記) không có ở bản OCR — người duyệt phải thêm.

---

## P5: kiểm chứng trên máy chủ (26/11/2026)

- Đạt: 148/151 route admin trả 403/401; khoá tài khoản; audit trước/sau (trạng thái, gói, hạn mức); phản hồi và lịch sử; quota 429, 403, đổi gói, sửa limit có hiệu lực ngay. Chi tiết trong `issues/NP-024, 025, 501…503`.
- Đã sửa: để trống limit (không giới hạn) bị 400 — `entitlements.controller.ts` + `entitlements.controller.spec.ts` (chưa commit lúc ghi mục này). 26 spec, typecheck, oxlint `src/entitlements/` đạt.
- Checklist: P5-FEEDBACK-01/02, P5-ADMIN-04 → `[x]`; NP-025, NP-503 `done`. Tổng 103/193. Mục này thay số liệu P5 ở phần đồng bộ 25/11.
- Còn: audit phản hồi thiếu trước/sau; 5 request song song ở lượt cuối đều 429; chưa thử đổi role `SUPER_ADMIN`, USER mở `/admin`, `/account`, lịch sử báo lỗi thẻ, reset kỳ, `ALLOW`. Chưa đụng issue GitHub.
- Bẫy: `pm2 restart api` / watch rebuild có thể để lại `node dist/main` mồ côi giữ :3000 (tiến trình mới thoát code 1) → kill rồi restart. Sửa code API sẽ giết job nhập PDF đang chạy.

---

## NP-407: bàn duyệt bản nháp đề (UI mới, 25/11/2026)

Giới hạn PDF nhập đề: 50 MB (trước 30 MB), bằng nhập từ vựng.

Sửa rò bộ nhớ khi OCR PDF scan (file 43 MB, 167 trang từng bị earlyoom tắt API ở trang 94): trang được render từ tài liệu đang mở (`renderPage`), canvas thu về 1×1 sau khi xuất PNG, `ProsePdf.close()` / `loadingTask.destroy()`. Đo với OCR giả: 167 trang đỉnh 446 MB RSS. Chưa nhập lại file thật với AI. `parsePdf` (nhập từ vựng) vẫn chưa destroy tài liệu sau khi đọc.

`/admin/exams/import/[id]/drafts` thiết kế lại: phủ toàn màn dưới header; danh sách khối bên trái, mỗi lần một khối hiển thị như tờ đề, ảnh trang PDF bên cạnh, phiếu đáp án ở đáy (phím 1–4, ↑↓, J/K, Ctrl+Enter). File: `exam-import-drafts.tsx` (khung + danh sách), `exam-import-draft-block.tsx` (một khối), `exam-import-draft-model.ts` (kiểu + helper); style `.exam-desk` trong `globals.css` (sửa CSS xong phải `pm2 restart ui`). ESLint + tsc UI sạch; chụp Chromium headless với dữ liệu giả (máy chủ không có font Nhật). Chưa thử với dữ liệu/đăng nhập thật: xuất bản, loại, lưu chỉnh sửa.

- Furigana: lưu dạng `<ruby=まね>真似</ruby>` (cạnh `<b><i><u>`); nút "Furigana" trong trình soạn (`editFurigana` ở `rich-input.tsx`); hiển thị qua `FormattedText`; `stripFormat` ở API (`mondai.ts`) và UI bỏ cả cách đọc. `PassageText` căn phải dòng nguồn cuối bài（…『…』…／…による）. Nhập PDF (có lớp text) **tự nhận** furigana (chữ kana cỡ ≤65% nằm trên kanji; được bỏ khỏi text trang) và gạch chân (nét ngang sát dưới dòng, bỏ viền bảng): `import/marks.ts`, đánh dấu lưu ở `exam_import_job_pages.marks`, gắn vào bản nháp sau bước kiểm (`withMarks`). Trang OCR không có. Lần nhập cũ: nút "Bổ sung furigana" ở bàn duyệt (`POST /exams/admin/import/:jobId/marks`, `backfillMarks`) — chỉ khối chưa xử lý, field chưa ai định dạng, đồng thời xoá dòng furigana rác trong text. Đã chạy cho job `6b064c846d629eaaa1a0b505` (258/469 khối; sao lưu trước đó: `apps/api/storage/exam-import/backup-drafts-<job>.ejson`, bị dọn sau 30 ngày). Thử 40 trang đầu `40 de thi n2`: 96 furigana, 118 gạch chân.

- Câu sắp xếp ★: đề lưu 4 ô `___ ___ _★_ ___`; `findStarSlots` đọc vị trí ★ từ nét kẻ trong PDF (không đủ đúng 4 ô → giữ nguyên ★ đơn, không đoán). `components/star-sentence.tsx` (bấm/kéo cụm vào ô, cụm ở ô ★ là đáp án) dùng ở bàn duyệt và `exam-sectioned.tsx`; `exam-sitting`/luyện tập chưa dùng. Đã bổ sung job `6b064c84…` (131/139 câu có ô; 8 câu cần sửa tay; sao lưu `backup2-drafts-*.ejson`). 5 câu star đã xuất bản trong ngân hàng không được cập nhật.
- Bàn duyệt trên điện thoại: bàn phủ cả header site dưới `lg`; mở ảnh trang thì chia đôi, nút “Mở rộng” cho ảnh chiếm cả vùng (phiếu đáp án vẫn còn), −/+ phóng 100–300%; <640px ẩn header bàn và tiêu đề khối khi đang xem ảnh. “Các lần nhập gần đây” thiết kế lại thành thẻ (`exam-import-recent.tsx`, tách khỏi `exam-import-form.tsx`): ô cấp độ, tên file, trạng thái tiếng Việt, ngày giờ, số trang, thanh khối ổn/lỗi, nút Duyệt bản nháp/Log/Xoá. Đã chụp thử 360×710 Chromium headless, dữ liệu giả; chưa thử trên máy thật. Badge “Issues” của Next dev trên các trang admin là lỗi `Date.now()` prerender có sẵn, chưa xử lý.
- Cỡ chữ: `<size=80|125|150>` — 4 nút "Cỡ chữ" trong trình soạn (`execCommand fontSize`). Đổi cỡ một phần bên trong đoạn đã đổi cỡ có furigana có thể làm chữ có furigana mất cỡ. Đã thử thêm/sửa/bỏ/undo trên Chromium headless (dữ liệu giả), spec `exam-import-update` 8/8.

---

## Đồng bộ trạng thái ticket (25/11/2026)

`docs/TICKETS.md`, `docs/issues/README.md` và frontmatter đã khớp nhau: NP-022 `done`; NP-407, NP-501/502/503 `partial` (chờ verify thật). Checklist P5-ADMIN-04, P4-JLPT-05, P4-JLPT-07 là `[~]` (đã code, chưa verify thật); P5-SEC-01 `[x]` và NP-504 `done` (151 route admin, 0 thiếu guard quyền). Tổng 100/193. Chưa đụng issue GitHub: #2, #6–#9 còn open dù ticket file đã `done`.

---

## P4 — NP-407: màn duyệt bản nháp đề (mới thêm)

Trước đây import PDF tạo `exam_import_drafts` nhưng UI không có chỗ xem → thêm:
- `apps/ui/app/admin/(panel)/exams/import/[id]/drafts/page.tsx` + `components/admin/exam-import-drafts.tsx`: xem khối 問題, text gốc, chọn đáp án, Xuất bản / Loại.
- `app/api/exam-import/route.ts`: gateway `?drafts=`, `?publish=`, `?discard=`.
- Link "Duyệt bản nháp" ở tracker (✎), trang log, và danh sách "Các lần nhập gần đây" trên `/admin/exams/import`.
- Một PDF nhiều đề: bản nháp nhóm theo `sitting`, lọc theo đề, nút "Xuất bản N khối đã đủ đáp án" (xuất bản tuần tự, dừng ở lỗi đầu tiên). Chưa có sửa nhãn đề; chưa ghép các câu cùng đề thành bài thi (NP-408/409).
- **Sửa pipeline theo file thật `40 de thi n2.pdf` (473 trang, 34 đề):** (1) `prose.ts` sắp dòng từ dưới lên → đảo ngược mọi trang → sửa y giảm dần; cap trang 300→600 + log cảnh báo khi cắt (`totalPages`); (2) nhãn đề `N2 - 4 …` dính vào dòng đầu trang nay nhận được và bị cắt khỏi nội dung, ngày `YYYY年M月` chỉ tính trên dòng ≤30 ký tự; (3) trang `N2-x 解答` (hàng số câu trên hàng đáp án, `問題 1 5x1(5d)`) không còn thành khối rác mà parse thành `sheetKeys[sitting]` → điền sẵn đáp án vào bản nháp theo đề + số 問題; (4) `q.no` luôn đánh lại theo vị trí 1..n. Thử cục bộ: 385 khối / 34 đề / 34 bảng đáp án (trước: 500 khối, 15 nhãn lẫn). Còn: một số 問題 chưa nhận dạng (`mondai` null do OCR sai chữ), phần `part` đọc theo header lặp mỗi trang.
- **Đọc bằng quy tắc (NP-407, theo yêu cầu "mỗi phần là 問題 <số> + yêu cầu"):** `import/mondai-table.ts` = bảng 大問 chính thức N1–N5 lấy từ jlpt.jp/guideline/pdf/n1..n5.pdf (N1 13 phần, N2 14, N3 5+7, N4 5+6, N5 4+6; N3–N5 có 2 tờ, số 問題 đánh lại từ 1 — `PartTracker` nhận ra tờ 2 khi số giảm). `segment.ts` dùng số 問題 để điền dạng khi lời dẫn không phân loại được và để phân biệt 語形成/文脈規定 (cùng lời dẫn); lệch nhau thì ghi `note`. `import/rules.ts` `parseByRules` đọc chính xác các dạng câu (kanji-reading, orthography, word-formation, context, paraphrase, usage, grammar-form, star-order): `N）câu` hoặc `N câu`, phương án `1 a 2 b`/`2.b`, bỏ khung ví dụ & chân trang. Service: quy tắc trước → nếu hợp lệ + khớp số câu trong bảng đáp án thì KHÔNG gọi AI (`parsedBy: "rules"`), không thì AI, AI hỏng thì giữ kết quả quy tắc kèm issues. `prose.ts` nhận trang 2 cột (tìm rãnh giữa, đọc cột trái rồi phải) và dùng bề rộng chữ thật. Thử trên `40 de thi n2`: 468 khối; 155 khối đọc bằng quy tắc khớp bảng đáp án, ~206 khối bài đọc cần AI, ~84 lệch số câu + 22 không đọc được (phần lớn do khối bị cắt ở ngắt trang) → rơi sang AI.
- File nghe: form ghi chú chỉ thêm sau khi duyệt xong (AudioLibrary vẫn ở cùng trang, chưa khoá cứng).
- **Chưa verify trình duyệt/DB thật** (chỉ tsc + eslint sạch).

---

## P5 — Admin, Feedback & Entitlements (tiến độ hiện tại)

**Trình tự đã duyệt (quota sau, cấu hình hoá):** NP-024 → NP-025 → NP-504 (SEC+ADR/DOC, làm sau) → quota engine NP-501/502/503 (100% cấu hình hoá theo Q-07: mỗi feature có bật/tắt + limit + chu kỳ + tz reset, sửa trong admin, không cần deploy).

### ✅ Commit 1 — NP-024 (P5-ADMIN-01/02/03): RBAC 403 + no-self-privilege + audit before/after

Đã commit. 487 tests xanh, TSC clean, lint clean.
| File | Nội dung |
|---|---|
| `src/users/admin-rbac.spec.ts` | **MỚI** — RBAC 403 (RolesGuard: USER→ADMIN route 403, ADMIN→SUPER route 403, pass-through) + no-self-privilege (self-promotion/demotion từ chối, ADMIN không chạm admin, SUPER_ADMIN mới đổi role được, role change revoke sessions) — 11 test |
| `src/logs/audit.interceptor.spec.ts` | **MỚI** — audit row mang `before`/`after`/`summary` khi có `attachAuditNote`; không có note → undefined; route không `@Roles` → không ghi; hành động thất bại ghi status — 4 test |
| `src/logs/audit-note.ts` | **MỚI** — `attachAuditNote(req, {before,after,summary})`: snapshot bị `scrub()` (redact secret) + cap 4000 char, gộp vào `request.auditNote`; `AuditRequest = Request & {user?, auditNote?}` |
| `src/logs/audit-log.schema.ts` | `AuditLog` +`before`/`after`/`summary` (Object, cap) |
| `src/logs/audit.interceptor.ts` | `record()` gộp `req.auditNote?.before/after/summary` vào bản ghi (1 hành động admin = 1 row who/what/before/after) |
| `src/users/admin-users.service.ts` | `setRole`: chặn `id===caller.sub` (tự đổi role) + chỉ `SUPER_ADMIN` mới đổi được (lớp service, trên cả `@Roles`); +`readFields(id, fields)` cho controller snapshot before/after |
| `src/users/admin-users.controller.ts` | 4 endpoint (password/status/role/revoke-sessions) gọi `attachAuditNote` với before/after + summary |
| `src/logs/logs.service.ts` | `listAudit` + CSV export trả về `before`/`after`/`summary` |
| `ui/components/admin/logs-console.tsx` | Tab "Thao tác admin" hiện `summary` + khối "Trước → Sau" |

**Bẫy P5 (đọc trước khi code tiếp):**
- `setRole` service: `@Roles("SUPER_ADMIN")` ở route + check `caller.role` + check `id===caller.sub` ở service → 3 lớp. Test service layer riêng (guard không chạy trong unit test).
- Interceptor `.record()` là fire-and-forget (`.catch(() => undefined)`) → test phải chờ flush (setTimeout 0) và mock `req.headers={}` (`clientIpv4` đọc `headers["x-client-ipv4"]`).
- Repo **double-quote** (committed code) nhưng `.prettierrc` ghi `singleQuote:true` và **không được enforce** (file committed fail `prettier --check`). Code mới theo double-quote để khớp. Đừng chạy `prettier --write` (sẽ đổi cả file sang single-quote, diff khổng lồ).
- VPS 4 GB RAM, không swap. Test full suite: `pnpm -C apps/api exec vitest run --no-file-parallelism`.

### ✅ Commit 2 — NP-025 (P5-FEEDBACK-01/02): phản hồi chung + trạng thái + lịch sử xử lý

Code + spec + UI đã có; còn verify API/trình duyệt thật.

| File | Nội dung |
|---|---|
| `src/feedback/schemas/user-feedback.schema.ts` | **MỚI** — `user_feedbacks`: `source` (vocabulary/grammar/transcript/translation/exam/general), `status` (OPEN→IN_PROGRESS→RESOLVED/REJECTED), `history[]` (from→to, by, note, at), index `{status,createdAt:-1}` |
| `src/feedback/feedback.service.ts` | `create` (anti-spam 30/ngày), `myList`, `adminList` (lọc status/source, phân trang), `adminSetStatus` (mỗi đổi trạng thái push 1 entry `history`), `adminDetail` (history đầy đủ) — 6 spec |
| `src/feedback/feedback.controller.ts` | `/feedback` POST + `/feedback/me` (learner) |
| `src/feedback/admin-feedback.controller.ts` | `/admin/feedback` GET/GET:id/PATCH:id, `@ContentAdmin()` |
| `src/flashcards/schemas/card-report.schema.ts` | `CardReport` +`history[]` — đổi trạng thái báo lỗi thẻ cũng ghi lịch sử |
| `src/flashcards/card-reports.service.ts` | `adminSetStatus(caller,id,status)` ghi history (thay findByIdAndUpdate); `adminList` trả `historyCount` |
| `src/users/account-deletion.service.ts` | Xoá `user_feedbacks` khi xoá tài khoản (+ count) |
| `ui/components/account/feedback-panel.tsx` | **MỚI** — panel gửi góp ý + danh sách góp ý của mình (trạng thái + lần xử lý) ở `/account` |
| `ui/components/admin/feedback-console.tsx` | **MỚI** — hộp thư admin `/admin/feedback`: lọc nguồn/trạng thái, đổi trạng thái có ghi chú, mở lịch sử xử lý (ai, từ→đến, khi nào, note) |
| `ui/app/api/feedback/[[...route]]/route.ts` + `ui/app/api/admin/feedback/[[...route]]/route.ts` | **MỚI** — gateway Next → API `/feedback*` (learner) và `/admin/feedback*` (admin) |

**CHƯA LÀM (việc agent kế tiếp, theo thứ tự):**
1. **Verify thật NP-024 + NP-025 + quota engine** (chạy được trên VPS là đóng): API `/admin/users` đổi role + `/admin/logs` kiểm before/after; API `/feedback` POST + `/admin/feedback` đổi trạng thái → kiểm `history`; trình duyệt `/account` (gửi góp ý), `/admin/feedback` (lọc + lịch sử), `/admin/reports` (báo lỗi thẻ, giờ có history). Quota: `/admin/entitlements` (tạo config `ai-sentence-grade`, FREE=3/THÁNG) → thử chấm câu ở `/learn` cho tới khi 429; đổi gói 1 user FREE→VIP ở bảng Người dùng → chấm lại không còn chặn.
2. ✅ **NP-504 (P5-SEC-01)**: đã rà least privilege toàn endpoint admin, gồm `admin/entitlements`; tất cả controller admin đều có `@ContentAdmin()`/`@Roles`, không phát hiện endpoint thiếu authorization check. Security review focused không có finding confidence ≥8/10. **Gốc P5-DOC-01 đã xong cùng commit quota** (ADR-entitlements.md + `database.md` §5b/§9).
3. ✅ **Quota engine NP-501/502/503** — xong (commit 3 bên dưới).

### ✅ Commit 3 — Quota engine (P5-QUOTA-01/03/04/05, P5-ADMIN-04): hạn mức theo gói, cấu hình hoá, audit

527 tests xanh, TSC clean (api + ui). Kiến trúc theo Q-07: mọi con số (limit theo gói, chu kỳ, múi giờ, chính sách vượt) nằm trong data (`feature_configs`), sửa trong admin có hiệu lực ngay, không deploy.

| File | Nội dung |
|---|---|
| `src/entitlements/schemas/feature-config.schema.ts` | **MỚI** — `feature_configs`: `featureKey` (unique), `enabled` (kill-switch), `limits[]` (≤3 gói FREE/PRO/VIP, `limit` = số lượt/kỳ, `null` = không giới hạn, không có row = gói đó KHÔNG có quyền), `period` (DAY/MONTH), `tz` (IANA), `overLimit` (BLOCK=429 / ALLOW=ghi nhận để tính phí P9). `limitForPlan` helper |
| `src/entitlements/schemas/quota-record.schema.ts` | **MỚI** — `quota_reservations` (user, featureKey, period, amount, state RESERVED→SETTLED/RELEASED, reason, index {user,featureKey,period,state}) + `usage_records` (bản ghi cuối theo kỳ, gắn `reservation`) |
| `src/entitlements/quota.service.ts` | **MỚI** — `checkAccess` (403 gói không có quyền / tính năng tắt), `reserve` (đặt trước slot, create-rồi-tái-kiểm tra; BLOCK vượt mức → xoá slot + 429, ALLOW → ghi `overLimit`), `settle` (idempotent, sinh `usage_record`), `release` (job thất bại/hủy, idempotent), `remaining`, `periodKey` (rìa kỳ theo tz IANA bằng Intl.DateTimeFormat cache; **khác SRS `localDayKey` — có chủ đích, SRS là lịch học, quota là chu kỳ tính phí**) |
| `src/entitlements/decorators.ts` | **MỚI** — `@RequireEntitlement(key)` (403 trục quyền) + `@Quota(key, amount?)` (trục đo đếm), metadata key export cho guard |
| `src/entitlements/guards.ts` | **MỚI** — `EntitlementGuard` (quyền gói) + `QuotaGuard` (đặt trước quota, treo `quotaBooking` lên request) + `QuotaInterceptor` (settle khi handler xong, release khi lỗi — **chờ hoàn tất trước khi response trả** để ledger nhất quán đúng §6.2). Operator (ADMIN/SUPER_ADMIN) miễn đo đếm. Không có row config → ungated (feature mới ship trước config) |
| `src/entitlements/entitlements.service.ts` + `.controller.ts` | **MỚI** — `/entitlements/me/remaining/:key` (learner) + `admin/entitlements`: list/upsert features, set plan user, usage theo kỳ — tất cả `@ContentAdmin()`, mutation có `attachAuditNote` before/after (P5-ADMIN-03). **Route admin nằm dưới `/admin/*` đúng quy ước repo; KHÔNG dùng NestJS `version`** |
| `src/entitlements/entitlements.module.ts` | **MỚI** — dynamic module, graceful-degrade như mọi module (không `MONGODB_URL` → module rỗng); đăng `APP_GUARD` (Entitlement→Quota, sau RolesGuard theo §4.3) + `APP_INTERCEPTOR` |
| `src/entitlements/quota.service.spec.ts` + `guards.spec.ts` | **MỚI** — 25 test: lifecycle reserve→settle/release (idempotent), BLOCK vs ALLOW, 0-limit, unlimited, rìa kỳ DAY/MONTH theo tz (giả lập thời gian), 403/429 theo gói, interceptor settle khi OK / release khi lỗi |
| `src/users/schemas/user.schema.ts` | `User` +`plan` enum (FREE/PRO/VIP, default FREE) — trục quyền học tập tách khỏi `role` (trục quản trị) |
| `src/users/admin-users.service.ts` | list users trả về `plan` |
| `src/flashcards/flashcards.controller.ts` | `@Post decks/:id/grade-sentence` +`@Quota("ai-sentence-grade")` (số lượt phân tích câu AI của §6.2) |
| `src/users/account-deletion.service.ts` | xoá luôn `quota_reservations` + `usage_records` khi xoá tài khoản (Luật BVDLCN 91/2025) |
| `ui/components/admin/entitlements-console.tsx` + page + gateway | **MỚI** — `/admin/entitlements`: tạo/sửa config theo feature (bật/tắt, 3 ô limit theo gói, chu kỳ, tz, chính sách vượt); nav admin-shell + item "Hạn mức & gói" |
| `ui/components/admin/users-console.tsx` | + cột "Gói" (select FREE/PRO/VIP → `PATCH /admin/entitlements/users/:id/plan`) |
| `ui/components/learn/quota-note.tsx` + `compose-drill.tsx` | **MỚI** — dòng "Bạn còn X lượt chấm câu AI trong kỳ này" dưới nút Chấm điểm; 429 → đổi message "đã dùng hết lượt" + refresh con số |
| `ui/app/api/entitlements/[[...route]]` + `admin/entitlements` gateway | **MỚI** — proxy learner + admin, token exchange server-side như các gateway khác |

**Bẫy quota (đọc trước khi code tiếp):**
- `QuotaService` inject model `User` (trục plan) — module phải `imports: [buildAuthModule()]`; models quota tự đăng qua `MongooseModule.forFeature`. Không import `buildUsersModule` (chuỗi vòng qua `user.schema` import `feature-config.schema`).
- Interceptor dùng `mergeMap` (settle) + `catchError`→`from().pipe(switchMap(throwError))` (release-rồi-propagate): `catchError` trả Promise<Observable> sẽ bị phát như **giá trị**, test `firstValueFrom` sẽ resolve thay vì reject.
- `TooManyRequestsException` **không tồn tại** trong `@nestjs/common@12` → `new HttpException({statusCode, error, message}, HttpStatus.TOO_MANY_REQUESTS)` (đúng pattern `rate-limit.guard.ts`).
- Spec: mock model phải trả **live reference** (đóng vai document mongoose) vì service mutate `doc.state` rồi `save()`; `.lean()`/`.exec()`/`aggregate(stages)` chain phải bắt chước đúng.
- Race reserve: create-rồi-tái-sums; 2 caller đồng thời cùng slot có thể cùng qua check một window (VPS single-node, negligible; BLOCK vẫn thu hồi slot thừa). Spec §6.2 yêu cầu test race — hiện chưa (chờ DB thật/multi-process).
- `user.schema.ts` import `PLANS` từ `entitlements/schemas` — schema-only, không vòng module (mới là import type+value của constant array).
- Chưa có migration/seed row config nào trên VPS: chưa bật config thì mọi thứ ungated (endpoint trả `gated:false`), nên deploy API trước khi tạo config trong admin là an toàn.


## 4. Lệnh chuẩn

- `pnpm -C apps/api test` · `pnpm -C apps/api lint` · `pnpm -C apps/api typecheck`
- Test 1 file: `pnpm -C apps/api exec vitest run <path>.spec.ts`
- Full suite (RAM): `pnpm -C apps/api exec vitest run --no-file-parallelism`
- Probe nhanh (không qua test harness): `cd apps/api && npx tsx /tmp/probe.mts`
- Commit rồi cập nhật file này (mục 2/3) **cùng commit**.

---

# (archive) NP-407 — exam import

**NP-407** — Nhập PDF đề JLPT → draft có người duyệt (plan `docs/plans/plan-jlpt-question-bank.md`, giai đoạn 2).
Yêu cầu cốt lõi (plan §6/§11): làm sạch text → tách khối theo 問題 → AI **cấu trúc hoá từng khối nhưng KHÔNG BAO GIỜ đoán đáp án** (chặn nội dung bịa) → parser bảng đáp án → collection `exam_import_drafts` → màn admin duyệt/sửa/xuất bản → chống trùng chéo nguồn bằng `contentHash`. Câu nhập mặc định `rights: reference` (Q-12). Xử lý từng trang, RSS < 500 MB (VPS 4 GB, không swap).

Giai đoạn **đã xong trước** (đừng làm lại):
- NP-406 (GĐ1) commit `dbabe4b`: `mondai.ts` (mã dạng + `contentHashOf` + `optionCountsOf`), `exam_stimuli`, chấm theo phần.
- SRS NP-114/115/116 (commit trước đó) — không liên quan NP-407.

## 2. Trạng thái code (commit `d439ed9` "NP-407 GĐ2b")

**ĐÃ COMMIT — pipeline deterministic + orchestrate + publish, typecheck sạch, 118 tests xanh, lint clean:**

| File | Nội dung | Trạng thái |
|---|---|---|
| `src/exams/import/clean.ts` | NFKC + loại noise theo tần suất (≥30% trang **và** ≥2 trang), ghép câu CJK bị cắt, `cleanAnswerLine` (giữ ①②③④, NFKC gấp ①→1 làm hỏng key) | ✅ |
| `src/exams/import/segment.ts` | `segmentBlocks(pages)→{blocks, answerKey}`: tách theo heading `問題` (sau NFKC: `I/7/ 1:`), sitting (ngày chính thức / `EXAM ID` / `N3-1`), part (文字・語彙/文法/読解/聴解), section `答案/解答` tách riêng | ✅ |
| `src/exams/import/structure.ts` | `structurePrompt` + `validateParsed` (chặn bịa: mọi chuỗi AI trả về phải là substring NFKC của khối) + `parseAiJson` | ✅ |
| `src/exams/import/answer-key.ts` | compact (`4x1 (4点)` + `1① 2④`) + broken grid + `splitCompactKey` (tách key nhiều 問題) + `keyMarker/blockMarker` (line key ↔ block theo marker); slot đọc không ra → `null` (KHÔNG đoán) | ✅ |
| `src/exams/import/prose.ts` | đọc PDF prose (text layer theo dòng, CJK không space) + render→OCR khi không có text layer (tái dùng `renderPdfPage`, **KHÔNG đụng `parsePdf`**) | ✅ |
| `src/exams/exam-import.service.ts` | `startJob` (guard 1 job/user) → đọc từng trang checkpoint (`exam_import_job_pages`, tuần tự cho RAM) → segment → mỗi block: `structurePrompt`+`AiExampleService.complete`(`purpose:"exam-import"`, temp 0, **KHÔNG đoán đáp án**)→`parseAiJson`→`validateParsed`→ ghi draft. `publish`: mọi câu ≥1, upsert stimuli+questions idempotent theo `contentHash` (`dedupeKey:"imp:"+hash`), `verified:true`, rights theo draft. `discard`, resume theo `blockIndex` | ✅ (chưa spec) |
| `src/exams/schemas/import-draft.schema.ts` | `exam_import_drafts` (`answers:number[]`, `0`=chưa biết — Mongoose `[Number]` drop null; `blockIndex` idempotent) | ✅ |
| `src/exams/schemas/import-job.schema.ts` | `exam_import_jobs` + `exam_import_job_pages` checkpoint | ✅ |
| `src/exams/mondai.ts` | marker toàn cục `音声`→listening, `全体の内容を考えて`→text-grammar, cross-family fall-through, marker `(1)から(2)` | ✅ |
| `ai-example.service.ts` +`ocrExamPageText` (OCR trang đề → text); `ai-call-log.schema.ts` +purpose `"exam-import"` | ✅ |
| `__fixtures__/` 3 layout thật (official_collection/migii/combined_n3) — **chỉ đặt layout, không nội dung đề thật (repo public, §8.1)** | ✅ |

**Cập nhật GĐ2c (commit sau `0a7fdeb`):** module + route import đã nối (`exam-import.controller.ts`: POST/GET list/GET :jobId/GET :jobId/log/POST :jobId/cancel/GET drafts/publish/discard). Job có `phase`, `log` (cap 400), trạng thái `cancelled`; restart giữa lúc đọc → `error` ("tải PDF lên lại", PDF không lưu). UI: `components/admin/exam-import-tracker.tsx` (mount ở layout, polling, Hủy, Nhật ký) + gateway `app/api/exam-import/route.ts`. Đã thử `De_Chinh_Thuc_N3.pdf` (95 trang, ~30 s/trang). Lưu ý: 3 trang đầu đều ra 1439 ký tự — kiểm tra xem có phải nhiễu lặp. Chưa có form upload/màn duyệt draft trên UI. `pm2 restart api` có thể kẹt EADDRINUSE do tiến trình mồ côi trên :3000 — kill rồi restart.

**Âm thanh nghe (NP-410) + form upload:** `exam_audio_assets` (file lưu đĩa `EXAM_AUDIO_DIR`, mặc định `apps/api/storage/exam-audio`, tên = sha256; sniff magic bytes mp3/m4a/ogg, ≤ 40 MB). Câu hỏi và `exam_stimuli` có trường `audio {assetId,startSec?,endSec?}` (một file dài cắt theo đoạn cho từng câu, hoặc mỗi câu một file); sit payload trả `audio` trên câu và nhóm; UI phát qua `/api/exam-audio/:id#t=start,end` (gateway chuyển Range). API: `POST/GET exams/admin/audio`, `PUT exams/admin/audio/attach/:question|stimulus/:id`, `GET exams/audio/:id`. Trang admin `/admin/exams/import` (`exam-import-form.tsx`): upload PDF + thư viện file nghe + gắn đoạn theo ID. Chưa có: tự khớp tên file ↔ số câu, gắn từ màn duyệt draft (listening draft chưa có câu để gắn), spec cho `exam-audio.service`.

**CHƯA LÀM (đây là việc của agent kế tiếp, theo thứ tự):**
1. **Đăng ký module**: `src/exams/exams.module.ts` hiện mới có `ExerciseQuestion`+`ExamStimulus`. Cần thêm `forFeature` 3 schema import (`ExamImportJob`, `ExamImportJobPage`, `ExamImportDraft`) + provider `ExamImportService` + import `buildAiModule()` (AI service đang inject vào `ExamImportService` nhưng module chưa export/import nó → **service chưa chạy được trên DI**). Xem pattern: `import.import.module.ts` (module dynamic, graceful-degrade khi không có `MONGODB_URL`).
2. **Routes**: `src/exams/exams.controller.ts` chưa có route nào cho import/draft. Cần (guard `@ContentAdmin()`): `POST exams/admin/import` (multipart, multer memory ~30 MB — copy `withUploadLimits()` từ `import/import.controller.ts:80`), `GET …/import/:jobId` (jobProgress), `GET …/import-drafts?jobId&status` (listDrafts), `PATCH …/import-drafts/:id`, `POST …/import-drafts/:id/publish`, `POST …/import-drafts/:id/discard`.
3. **Specs còn thiếu**: `exam-import.service.spec.ts` (mock `AiExampleService` + models: publish 2 lần → 1 bản ghi; 2 nguồn trùng → 1; block `error` không chặn job), và spec cho `prose.ts`. 4 spec deterministic (clean/segment/structure/answer-key) **đã có, 46 tests**.
4. **UI**: chưa có. Cần `apps/ui/app/admin/(panel)/exams/import/` (upload+level+rights; list draft theo status; form sửa 2 cột text-gốc↔parsed; nút Xuất bản/Bỏ; chặn publish khi còn câu thiếu đáp án) + Next.js API gateway — **đọc kỹ `apps/ui/app/api/admin/import/` trước để copy pattern**.
5. **Docs**: `database.md` (+3 collection), checklist P4-JLPT-05 → `[x]`, ticket NP-407 + TICKETS, đo RSS (1 PDF ~50 MB).

## 3. Bẫy đã biết (đọc kỹ trước khi code)

- **NFKC gấp ký tự đặc biệt**: `Ⅰ→I`, `①→1`, `１→1` (đã verify bằng node). Regex match heading phải chạy trên text SAU NFKC. Trong **answer region KHÔNG NFKC** (`cleanAnswerLine` chỉ trim + nửa-width digits, giữ ①②③④) — vì `1①` (câu 1 đáp ①) sẽ thành `11` nếu NFKC.
- `AiExampleService`: `complete`/`ocrVocabPage`/`ocrExamPageText` **public**; `call`/`callRaw`/`pace` **private**. Lấy service: `AiServicesService.available()[0]` → `ai.complete(svc, prompt, {temperature:0, purpose:"exam-import"})`.
- pdfjs: import bằng `await import("pdfjs-dist/legacy/build/pdf.mjs")`; text layer = `page.getTextContent()` (fragments `it.str` + `it.transform[4/5]`); scan → `renderPdfPage` (`MAX_OCR_PAGES=300`).
- `ExerciseQuestion.contentHash` = `contentHashOf(prompt, options)` (sha1 NFKC), unique sparse; import dùng `dedupeKey="imp:"+hash`. Stimulus dedup theo `contentHash` riêng.
- **Quota token 5h của user chạm 100% (429, reset window ~07:54)** — làm nhỏ, commit sớm, HANDOFF mới sau mỗi commit.
- VPS 4 GB RAM không swap: không song song OCR, không giữ nhiều PNG.

## 4. Lệnh chuẩn

- `pnpm -C apps/api test` · `pnpm -C apps/api lint` · `pnpm -C apps/api typecheck`
- Test 1 file: `pnpm -C apps/api exec vitest run <path>.spec.ts`
- Probe nhanh (không qua test harness): `cd apps/api && npx tsx /tmp/probe.mts`
- Commit rồi cập nhật file này (mục 2/3) **cùng commit**.

### NP-407 — cập nhật đọc bằng quy tắc (941f1ec+)
- N1/N2: dạng 問題 từ nhóm đọc (文章の文法 → 情報検索) lấy theo SỐ 問題 (instruction giống nhau không phân biệt được).
- Quy tắc mới: `parseCloze` (文章の文法: 1 bài cloze `[50]`…, đáp án `50)1 … 2 … 3 … 4 …`), `parseReading` (bài đọc + `55)câu hỏi` / `1 … 4 …`; số câu liên tục; chú thích cuối → `notes`; 統合理解 vẫn để AI).
- Dòng yêu cầu bị ngắt được nối lại; 問題1 không in chữ "問題1" → tự mở khối (`UNLABELLED_FIRST`).
- Đã sửa: bảng đáp án 問題1 (１ … ２ … ３ | ４ …) bị `findGutter` nhận nhầm là 2 cột → đuôi đáp án dồn xuống cuối. Dấu hiệu nhận bảng: số đáp án bên phải NỐI TIẾP bên trái ở ≥3 hàng (2 cột thật thì mỗi cột bắt đầu lại từ １).

### NP-407 — sửa tay bản nháp
- API `POST /exams/admin/import/drafts/:id/update` (`updateDraft`): thay `parsed` bằng bản sửa tay (kiểm hình dạng: kind, đủ 4 phương án, stimulusKey tồn tại, giới hạn kích thước; KHÔNG đối chiếu text gốc), đánh lại `no`/`groupOrder`, `answers` theo vị trí mới, `parsedBy="manual"`, status → needs_review (cả khối `error` điền tay được). Chỉ khối chưa xuất bản/loại.
- UI: nút "✎ Chỉnh sửa" mỗi khối → `components/admin/exam-import-draft-editor.tsx` (trang bài đọc gõ trực tiếp, hoàn tác/làm lại, chèn `[n]`, sửa đề/đáp án, chọn đáp án đúng, thêm/xoá/đổi chỗ câu và bài). Chỉ lưu văn bản thuần (màn học cũng hiển thị thuần) — chưa có in đậm/gạch chân.
- Gateway: `POST /api/exam-import?update=<id>`.

### NP-407 — số câu in trên đề + ảnh trang bên cạnh
- `ParsedQuestion.printedNo` = số IN trên đề (55, 56…; cloze 50–54); `no` vẫn là VỊ TRÍ trong khối (khoá của `answers`). Quy tắc (sentence/cloze/reading) điền `printedNo`; AI: lấy `q.no` AI trả trước khi đánh lại vị trí. Sửa tay có ô "Câu <số>"; publish ghi `ExerciseQuestion.printedNo` (chỉ để hiển thị — màn học chưa dùng).
- Ảnh trang: `startJob` lưu PDF vào `EXAM_IMPORT_DIR` (mặc định `apps/api/storage/exam-import/<jobId>.pdf`, gitignored; dọn file >30 ngày khi khởi động). Draft có `pageFrom/pageTo`. `GET /exams/admin/import/:jobId/pages/:n` render PNG bằng `renderPdfPage` (tuần tự, cache `<jobId>-p<n>.png`). Gateway `GET /api/exam-import?page=<jobId>&n=`. UI: `exam-import-page-preview.tsx` — cạnh trình sửa (luôn hiện khi sửa) hoặc nút "🖼 Xem ảnh trang". Job cũ (trước thay đổi này) không có PDF → báo "nhập lại để xem ảnh".

- Xoá lần nhập: POST /exams/admin/import/:jobId/delete (xoá job, trang, mọi bản nháp, PDF + ảnh; câu đã xuất bản giữ nguyên; job đang chạy phải hủy trước). UI: nút "Xoá" ở "Các lần nhập gần đây".

- Số câu liền mạch trong một đề: `fillPrintedNos` điền số còn thiếu từ câu trước (qua các khối cùng sitting) khi liệt kê bản nháp và khi xuất bản.

- Ô chọn file ở `/admin/exams/import` (PDF + file nghe): nút "Choose File" ẩn sau khi đã chọn (`file:hidden`). ESLint file sạch; chưa xem trình duyệt, chưa chạy tsc.

- Định dạng chữ: bản nháp lưu `<b>` `<i>` `<u>` trong chuỗi (editor `admin/rich-input.tsx`, hiển thị `components/rich-text.tsx` — không chèn HTML); sửa được cả yêu cầu đề (`instruction`). `contentHashOf` bỏ qua thẻ.
