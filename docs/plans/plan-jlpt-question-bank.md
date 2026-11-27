# Plan — Ngân hàng câu hỏi JLPT theo level × mondai và sinh đề ngẫu nhiên

> **Ngày lập:** 19/11/2026. **Người lập:** [CC]. **Người thực hiện:** agent khác (plan này tự đủ, không cần đọc lại hội thoại).
> **Trạng thái:** chưa bắt đầu. **Phụ thuộc:** P4 hiện tại ([NP-401](../issues/NP-401.md)…[NP-404](../issues/NP-404.md)) — dùng lại engine làm bài, không viết lại.
> **Gate pháp lý:** Q-12 (quyền dùng đề chính thức) đang ⏸ — xem §2.

## 1. Mục tiêu

Đọc PDF đề JLPT → tách **từng câu** (và **từng bài đọc** dùng chung) → gắn nhãn **level (N5–N1)** + **dạng mondai chuẩn** → lưu DB. Từ ngân hàng đó, **sinh ngẫu nhiên một đề mới đúng cấu trúc JLPT** của level, rồi cho người học làm bằng engine P4 sẵn có (start / lưu nháp / hết giờ server / nộp / chấm / xem lại / thống kê).

Ngoài phạm vi: phần **聴解 (nghe)** — cần kho media P6 ([NP-601](../issues/NP-601.md) đang blocked). Schema chừa chỗ (`section: "listening"`) nhưng không làm import / UI nghe.

## 2. Ràng buộc cứng (đọc trước khi code)

1. **Repo `waflol/Nihongo-Path` là PUBLIC.** Không commit bất kỳ nội dung đề nào lấy từ PDF (câu, bài đọc, đáp án) — kể cả trong fixture test. Fixture test phải là câu **tự viết** theo đúng layout (xem §8.1). PDF/text mẫu để ở thư mục ngoài repo hoặc thư mục gitignore.
2. **Q-12 chưa chốt** → mã hoá thành dữ liệu, không phải ghi chú: mỗi item có trường `rights` ∈ `own | licensed | reference`. Item nhập từ PDF bên ngoài mặc định `reference`. **Bộ sinh đề cho người học chỉ bốc `own | licensed`**; `reference` chỉ dùng cho admin xem thử / test nội bộ. Có unit test khẳng định điều này (giống cách plan-kanji khoá dữ liệu WaniKani bằng test).
3. **VPS 4 GB RAM, không swap.** Xử lý PDF **từng trang**, không giữ toàn bộ file đã render trong RAM; không chạy song song nhiều PDF; OCR tái dùng `ocrWithRetry` (concurrency 3) của `apps/api/src/import/parsers/pdf.ts`. Mục tiêu RSS < 500 MB khi nhập file 15 MB.
4. **Đáp án không bao giờ nằm trong sit payload** (P4-SEC-01, T-P4-03) — áp dụng cả cho bài đọc và câu ★.
5. Không đổi hành vi các đề phẳng đang có: đề cũ (chỉ có `questions[]`) phải làm bài, chấm, xem lại y như trước.

## 3. Hiện trạng code (đã khảo sát 19/11)

| Thành phần | File | Ghi chú |
|---|---|---|
| Ngân hàng câu | `apps/api/src/flashcards/schemas/exercise-question.schema.ts` | Collection `exercise_questions`. 7 `kind` đều là từ vựng. `options` ngầm định **đúng 4**. `dedupeKey` unique. |
| Đề | `apps/api/src/exams/schemas/exam.schema.ts` | `questions: ObjectId[]` phẳng, `timeLimitMin` một giá trị, `shuffle {questions, options}`. |
| Lượt làm | `apps/api/src/exams/schemas/attempt.schema.ts` | `seed`, `questionOrder`, `optionOrder`, `answers`, `correct`, `score/total/percent`. |
| Logic thuần | `apps/api/src/exams/exams.service.ts` (dòng ~120–330) | `positionsOf`, `servedOptions`, `pickIsCorrect`, `gradeAttempt`, `buildSitPayload`, `buildResultPayload`, `finishStatus`. Đã có test: `grading.spec.ts`, `deadline-stats.spec.ts`. |
| Xáo | `apps/api/src/exams/shuffle.ts` | `seededOrder(seed,n)`, `optionOrder(seed,qid,count,shuffleOptions)`. Test: `shuffle.spec.ts`. |
| Soạn câu admin | `ExamsService.adminAuthorQuestion` | Kiểm `options.length !== 4` — phải nới theo dạng (3 hoặc 4). |
| Route | `apps/api/src/exams/exams.controller.ts` | `exams`, `exams/:id/start`, `exams/attempts/*`, `exams/admin/exam-questions`, `exams/admin/exams`. |
| PDF | `apps/api/src/import/parsers/pdf.ts` | pdfjs + OCR từng trang, checkpoint `PageStore`. Parser hiện tại hướng **bảng từ vựng** — không dùng `parsePdf` cho đề; chỉ tái dùng phần đọc text/ render trang/ OCR. |
| AI | `apps/api/src/ai/ai-example.service.ts` `complete(svc, prompt, {temperature, purpose})` | Có log, pace rpm, lỗi phân loại `auth/rate/transient`. |
| UI | `apps/ui/app/learn/exams/`, `apps/ui/app/learn/exams/[attemptId]`, `apps/ui/app/admin/(panel)/exams/page.tsx` | Màn làm bài + admin soạn đề. |
| Test/lint | `pnpm -C apps/api test` (vitest), `pnpm -C apps/api lint` (oxlint), `pnpm -C apps/api typecheck`, `pnpm -C apps/ui lint`, `pnpm -C apps/ui typecheck` | |

## 4. Quyết định thiết kế

**D1 — Mở rộng `exercise_questions`, không tạo collection câu hỏi thứ hai.** Engine P4 (`loadBank`, chấm, sit/result payload) đã đọc collection này; mở rộng giữ diff nhỏ. Câu cũ không có các trường mới → hành vi cũ.

**D2 — Bài đọc là collection riêng `exam_stimuli`.** Một bài đọc / đoạn cloze / bảng thông tin + N câu hỏi trỏ về nó. Bài đọc **là đơn vị bốc** khi sinh đề (bốc cả bài, không bốc lẻ câu).

**D3 — Nhãn theo mã dạng chuẩn, không theo số 問題.** Cùng dạng nhưng số 問題 khác nhau giữa nguồn (đề chính thức N3: 文法 問題1; Migii N1: 問題7). Phân loại bằng **lời dẫn** (§5.2) — lời dẫn JLPT gần như cố định.

**D4 — Khung đề (blueprint) là dữ liệu.** Hằng số seed trong code + collection `exam_blueprints` để admin chỉnh. Có `version`; đề sinh ra lưu `blueprintVersion`.

**D5 — Đề sinh ra là một `Exam` bình thường** (thêm `sections[]` + `generated {seed, blueprintVersion, level}`), nên start/nộp/chấm/thống kê dùng lại nguyên vẹn.

**D6 — Import có người duyệt.** PDF → bản nháp (`exam_import_drafts`) → admin duyệt/sửa → xuất bản vào ngân hàng. Không bao giờ tự xuất bản.

**D7 — Điểm.** Mỗi câu có `points` (mặc định 1). Kết quả tính theo phần (`section`) và tổng; hiển thị thêm **điểm quy đổi ước tính** kiểu JLPT (0–60 mỗi phần, ghi rõ "ước tính, không phải điểm chính thức").

## 5. Mô hình dữ liệu

### 5.1. Mã dạng mondai (`MONDAI_TYPES`) — file mới `apps/api/src/exams/mondai.ts`

| Mã | Phần (`section`) | Lời dẫn nhận diện (regex trên text đã chuẩn hoá) | Số phương án | Dùng bài đọc? |
|---|---|---|---|---|
| `kanji-reading` | `vocab` | `読み方として` | 4 | không |
| `orthography` | `vocab` | `漢字で書くとき` | 4 | không |
| `word-formation` | `vocab` | `語形成` hoặc `（　）に入れる` + level N2/N1 đứng ngay sau `orthography` | 4 | không |
| `context` | `vocab` | `（\s*）に入れるのに最もよいもの` trong khối 文字・語彙 | 4 | không |
| `paraphrase` | `vocab` | `意味が最も近いもの` | 4 | không |
| `usage` | `vocab` | `使い方として` | 4 | không |
| `grammar-form` | `grammar` | `次の文の（\s*）に入れる` trong khối 文法 | 4 | không |
| `star-order` | `grammar` | `★` + `に入る最もよいもの` | 4 | không |
| `text-grammar` | `grammar` | `文章全体の内容を考えて` | 4 | **có** (đoạn cloze, các chỗ trống `[1]`…`[n]` hoặc số câu) |
| `reading-short` | `reading` | `次の(1)から(4)` / `(5)` + bài ngắn | 4 | có (1 câu/bài) |
| `reading-mid` | `reading` | `次の(1)から(3)` / `(1)と(2)` + nhiều câu/bài | 4 | có |
| `reading-long` | `reading` | `次の文章を読んで` (một bài) | 4 | có |
| `reading-integrated` | `reading` | `AとB` | 4 | có |
| `reading-thematic` | `reading` | N2/N1 bài chủ trương dài | 4 | có |
| `info-retrieval` | `reading` | `次のページは` / `案内` / `右のページは` | 4 | có (bảng/thông báo, có thể có ảnh) |
| `listening-*` | `listening` | — (ngoài phạm vi) | 3 hoặc 4 | có (audio) |

Bảng regex này nằm trong `mondai.ts` dạng dữ liệu, có test riêng (§8.1).

### 5.2. `exercise_questions` — thêm trường (tất cả optional)

```ts
kind: thêm "grammar-form" | "star-order" | "passage-question"   // vào EXERCISE_KINDS
mondai?: MondaiType            // mã chuẩn §5.1
section?: "vocab" | "grammar" | "reading" | "listening"
stimulus?: ObjectId            // ref exam_stimuli
groupOrder?: number            // thứ tự câu trong bài đọc (1..n) hoặc số chỗ trống [n]
points?: number                // mặc định 1
rights?: "own" | "licensed" | "reference"   // mặc định "own" cho câu admin tự soạn
sourceRef?: { file: string; sitting?: string; no?: string }   // vd {file:"De_Chinh_Thuc_N3.pdf", sitting:"2010-07", no:"文法-3"}
contentHash?: string           // sha1(norm(prompt)+norm(sorted options)) — chống trùng chéo nguồn
```

- Nới kiểm tra số phương án: `options.length` phải là 4, trừ `listening-*` cho phép 3. Bỏ hằng "4" cứng trong `adminAuthorQuestion` và thông báo lỗi.
- `star-order`: `prompt` chứa câu có 4 ô `＿＿` với một ô `★`; `options` là 4 mảnh; `answer` là mảnh đứng ở ô ★. Chấm như MCQ thường.
- Index mới: `{ level: 1, mondai: 1, rights: 1 }`; `{ contentHash: 1 }` (unique, sparse); `{ stimulus: 1, groupOrder: 1 }`.
- `dedupeKey` vẫn bắt buộc: với câu nhập, đặt `dedupeKey = "imp:" + contentHash`.

### 5.3. `exam_stimuli` — collection mới (`apps/api/src/exams/schemas/stimulus.schema.ts`)

```ts
level: string; mondai: MondaiType; section: string
kind: "passage" | "cloze" | "notice" | "pair"     // pair = bài A/B
title?: string
body: string                 // markdown đơn giản; cloze giữ ký hiệu [1]..[n]
bodyB?: string               // bài B cho reading-integrated
notes?: string               // (注) chú thích
imageUrl?: string            // info-retrieval có bảng dạng ảnh (để trống nếu chưa có media)
questionCount: number        // số câu thuộc bài — bộ sinh đề khớp theo số này
rights, sourceRef, contentHash, createdBy, timestamps
```

### 5.4. `exam_blueprints` — collection mới + seed

```ts
level: "N5".."N1"; version: number; active: boolean
sections: {
  key: "vocab" | "grammar_reading" | "vocab_grammar_reading" | ...;   // JLPT gộp phần khác nhau theo level
  title: string; timeLimitMin: number
  slots: { mondai: MondaiType; count: number; unit: "question" | "stimulus"; questionsPerStimulus?: number; points?: number }[]
}[]
```

Seed **N3** (đã đối chiếu đề chính thức 7/2010 trong mẫu):

```
vocab (文字・語彙) 30 phút:
  kanji-reading 8 · orthography 6 · context 11 · paraphrase 5 · usage 5
grammar_reading (文法・読解) 70 phút:
  grammar-form 13 · star-order 5 · text-grammar 1 bài × 5
  reading-short 4 bài × 1 · reading-mid 2 bài × 3 · reading-long 1 bài × 4 · info-retrieval 1 bài × 2
```

N5, N4, N2, N1: **agent phải lấy số câu/thời gian từ trang chính thức jlpt.jp ("問題構成", "試験科目と試験時間") và ghi nguồn + ngày truy cập vào comment seed.** Không lấy theo đề Migii — đề Migii N1 trong mẫu có `orthography` 5 câu, khác cấu trúc N1 chính thức. Nếu không truy cập được jlpt.jp: chỉ seed N3, để N5/N4/N2/N1 `active: false` và ghi TODO vào TICKETS.

## 6. Các giai đoạn

Mỗi giai đoạn kết thúc bằng: test xanh, lint/typecheck sạch, cập nhật `docs/IMPLEMENTATION_CHECKLIST.md` + `docs/TICKETS.md` + file ticket `docs/issues/NP-4xx.md` mới (dùng số NP-406…NP-409), commit riêng.

### Giai đoạn 1 — Schema, phân loại, chấm theo phần (NP-406)

Change list:

- `apps/api/src/exams/mondai.ts` — **Create.** `MONDAI_TYPES`, `SECTION_OF`, `OPTION_COUNT_OF`, `USES_STIMULUS`, `classifyInstruction(text, level, context): MondaiType | null` (regex §5.1, chuẩn hoá NFKC + bỏ khoảng trắng trước khi so).
- `apps/api/src/flashcards/schemas/exercise-question.schema.ts` — **Modify.** Thêm `kind` + trường §5.2 + index. *Risk: medium — schema dùng chung với phần luyện tập; mọi trường mới optional, không đổi index `dedupeKey`.*
- `apps/api/src/exams/schemas/stimulus.schema.ts` — **Create.** §5.3.
- `apps/api/src/exams/schemas/exam.schema.ts` — **Modify.** Thêm optional `sections?: { key; title; timeLimitMin; questions: ObjectId[] }[]` và `generated?: { seed; blueprintVersion; level }`. Đề có `sections` thì `questions` = nối các `sections[].questions` (giữ để code cũ đọc được).
- `apps/api/src/exams/schemas/attempt.schema.ts` — **Modify.** Thêm `sectionDeadlinesMs?: Record<string, number>`, `sectionScores?: Record<string, {score; total; points; maxPoints}>`, `points?`, `maxPoints?`.
- `apps/api/src/exams/shuffle.ts` — **Modify.** Thêm `groupedOrder(seed, items: {id; group?: string; groupOrder?: number}[])`: xáo các **đơn vị** (câu lẻ hoặc cả nhóm bài đọc), trong nhóm giữ `groupOrder`. Không đổi chữ ký `seededOrder`/`optionOrder`.
- `apps/api/src/exams/exams.service.ts` — **Modify.**
  - `buildSitPayload`: thêm `stimuli: {id, kind, title, body, bodyB, notes, imageUrl}[]` (chỉ bài có câu trong đề) và mỗi câu thêm `mondai`, `section`, `stimulusId`, `groupOrder`; thêm `sections` (key, title, remainingMs). Không thêm `answer`/`explain`.
  - `gradeAttempt`: tính thêm `points`/`maxPoints` và `sectionScores`; `score/total/percent` giữ nguyên nghĩa cũ (số câu đúng) để thống kê cũ không đổi.
  - Hàm thuần mới `estimateJlptScaled(sectionScores, level)` → 0–60 mỗi phần, tuyến tính theo % điểm phần. Đặt tên rõ "estimate".
  - `start`: đề có `sections` → dùng `groupedOrder` theo từng phần; tính `sectionDeadlinesMs` cộng dồn theo `timeLimitMin` từng phần (phần sau bắt đầu khi phần trước hết giờ hoặc người học bấm "sang phần sau" — v1: **cộng dồn cố định**, deadline tổng = deadline phần cuối).
  - `adminAuthorQuestion`: nới kiểm số phương án theo `OPTION_COUNT_OF`; nhận `mondai`, `section`, `stimulus`, `groupOrder`, `points`, `rights`.
  - Endpoint stimulus CRUD qua service mới (dưới).
- `apps/api/src/exams/stimuli.service.ts` — **Create.** CRUD admin cho `exam_stimuli`, kiểm `questionCount` khớp số câu trỏ về.
- `apps/api/src/exams/exams.controller.ts` — **Modify.** `GET/POST/PATCH/DELETE exams/admin/stimuli`, guard admin như các route `admin/*` hiện có.
- `apps/api/src/exams/exams.module.ts` — **Modify.** Đăng ký `ExamStimulus` schema + `StimuliService`.
- `docs/database.md` — **Modify.** Mô tả trường/collection mới.

Test:

- `apps/api/src/exams/mondai.spec.ts` — mỗi dạng ≥ 2 lời dẫn **tự viết** đúng format (cả có/không khoảng trắng, full-width/half-width) → đúng mã; lời dẫn lạ → `null`.
- `apps/api/src/exams/shuffle.spec.ts` (bổ sung) — `groupedOrder`: cùng seed → cùng thứ tự; câu cùng nhóm luôn liền nhau, đúng `groupOrder`; mọi id xuất hiện đúng 1 lần.
- `apps/api/src/exams/grading.spec.ts` (bổ sung) — `points` khác nhau; `sectionScores`; câu 3 phương án; câu ★; đề phẳng cũ cho kết quả **giống hệt** trước khi sửa (snapshot số liệu cụ thể, không snapshot object).
- `apps/api/src/exams/sit-payload.spec.ts` — **Create.** Payload có bài đọc + ★: duyệt đệ quy toàn bộ object, khẳng định không có khoá `answer`, `explain`, `correct`, `isCorrect`.

### Giai đoạn 2 — Import PDF có người duyệt (NP-407)

Luồng: upload PDF (admin) → job nền theo trang → tách khối theo lời dẫn 問題 → AI cấu trúc hoá từng khối thành JSON → kiểm tra → lưu `exam_import_drafts` → admin duyệt → xuất bản vào `exercise_questions` / `exam_stimuli`.

Change list:

- `apps/api/src/exams/import/clean.ts` — **Create.** Chuẩn hoá text trang: NFKC; bỏ dòng watermark/header/footer lặp (dòng xuất hiện ≥ 30% số trang, vd `Facebook: SachTiengNhat`, `Tổng hợp đề thi chính thức…`, `— 12 —`, `-１-`, `Vào app Migii…`); bỏ dòng URL/mailto; ghép dòng bị ngắt giữa câu.
- `apps/api/src/exams/import/segment.ts` — **Create.** Tách theo: tiêu đề kỳ thi (`\d{4}年\d{1,2}月`, `N[1-5]-\d+`, `EXAM ID: \d+`), tiêu đề phần (`文字・語彙`, `文法`, `読解`, `聴解`), lời dẫn `問題\s*[0-9０-９ⅠⅡⅢⅣⅤ]+`. Mỗi khối = {sitting, sectionHint, instruction, rawText, pageFrom, pageTo}. Gọi `classifyInstruction`.
- `apps/api/src/exams/import/answer-key.ts` — **Create.** Parser bảng đáp án hai dạng: (a) dạng gọn `[1] [2] … \n 3 2 4 …` kèm `8x2 ( 16 点)` → cũng lấy `points`; (b) dạng lưới OCR vỡ của tuyển tập chính thức → best-effort, câu không chắc trả `null` (bắt duyệt tay). Đáp án dạng ①②③④ → 1..4.
- `apps/api/src/exams/import/structure.ts` — **Create.** Với mỗi khối: prompt AI (temperature 0, `purpose: "exam-import"`) yêu cầu JSON theo schema cố định: `{stimuli:[{key,kind,title,body,bodyB,notes}], questions:[{no,prompt,options[],stimulusKey?,groupOrder?}]}`. **Không** yêu cầu AI đoán đáp án. Sau đó `validate()`: số phương án đúng dạng; số câu liên tục; ★ có đúng 4 mảnh và prompt có 1 ★; bài đọc có ≥ 1 câu; mọi chuỗi xuất hiện (sau chuẩn hoá) trong `rawText` của khối — chặn AI bịa nội dung. Khối hỏng → draft `status: "error"` kèm lý do, không ném lỗi cả job.
- `apps/api/src/exams/schemas/import-draft.schema.ts` — **Create.** `exam_import_drafts`: `{jobId, file, level, sitting, mondai, section, block (rawText, pages), parsed (JSON trên), answers: (number|null)[], status: "needs_review"|"error"|"published"|"discarded", issues: string[], rights (mặc định "reference"), createdBy}`.
- `apps/api/src/exams/import/exam-import.service.ts` — **Create.** `startJob(file buffer, {level, rights})`: chạy tuần tự từng trang (tái dùng text-layer + `ocrWithRetry` + `PageStore` checkpoint của `import/parsers/pdf.ts`; nếu cần, tách hàm đọc text từng trang ra export riêng — **không đổi hành vi `parsePdf`**). Một job chạy một lúc (khoá trong process). `publish(draftId, edits)`: ghi bank/stimuli với `contentHash` (trùng → bỏ qua, báo "đã có"), `verified: true`, `rights` theo draft. *Risk: medium — ghi DB hàng loạt; idempotent theo `contentHash`.*
- `apps/api/src/exams/exams.controller.ts` — **Modify.** `POST exams/admin/import` (multipart, giới hạn 100 MB, chỉ `application/pdf`), `GET exams/admin/import/:jobId` (tiến độ), `GET exams/admin/import-drafts?jobId&status`, `PATCH exams/admin/import-drafts/:id` (sửa + đáp án), `POST exams/admin/import-drafts/:id/publish`, `POST …/discard`.
- `apps/ui/app/admin/(panel)/exams/import/page.tsx` — **Create.** Upload + chọn level + `rights`; danh sách draft nhóm theo kỳ thi → mondai; mỗi draft: text gốc bên trái, form sửa bên phải (prompt, phương án, đáp án, bài đọc); nút Xuất bản / Bỏ. Draft thiếu đáp án không cho xuất bản.

Test:

- `apps/api/src/exams/import/clean.spec.ts` — watermark lặp bị bỏ; câu bị ngắt dòng được ghép.
- `apps/api/src/exams/import/segment.spec.ts` — fixture **tự viết** mô phỏng 3 layout (§8.1) → đúng số khối, đúng `mondai`, đúng kỳ thi.
- `apps/api/src/exams/import/answer-key.spec.ts` — dạng gọn (kèm điểm) và dạng ①②③④; dạng vỡ trả `null` đúng chỗ.
- `apps/api/src/exams/import/structure.spec.ts` — `validate()` với JSON AI giả (mock `complete`): bắt ★ sai số mảnh, phương án thiếu, chuỗi không có trong rawText.
- `apps/api/src/exams/import/exam-import.service.spec.ts` — publish hai lần cùng draft → 1 bản ghi; hai nguồn có câu giống nhau → 1 bản ghi.
- Đo RAM thủ công (ghi số vào ticket): nhập file mẫu lớn nhất, theo dõi RSS bằng `ps -o rss`.

### Giai đoạn 3 — Bộ sinh đề (NP-408)

Change list:

- `apps/api/src/exams/blueprints.ts` — **Create.** Seed blueprint (§5.4) + `validateBlueprint()`.
- `apps/api/src/exams/schemas/blueprint.schema.ts` — **Create.** `exam_blueprints`; seed khi khởi động nếu rỗng (giống cách các seed khác trong repo, kiểm `bootstrap/`).
- `apps/api/src/exams/generator.ts` — **Create.** Hàm **thuần** `generateExam(blueprint, pool, opts) → {sections:[{key,title,timeLimitMin,questionIds[]}], seed}`:
  - `pool` = câu/bài đã lọc `level`, `rights ∈ allowedRights`, `verified: true`.
  - Slot `unit: "question"`: bốc `count` câu cùng `mondai` không thuộc bài đọc.
  - Slot `unit: "stimulus"`: bốc bài có `questionCount === questionsPerStimulus`, lấy toàn bộ câu theo `groupOrder`.
  - Ràng buộc: không trùng `contentHash`; không trùng `answer` giữa các câu `vocab`; ưu tiên câu người học chưa gặp (`excludeIds` truyền vào, mềm — thiếu thì cho phép lặp); trộn nguồn (`sourceRef.file` không quá 60% một slot khi pool đủ).
  - Thiếu câu → **ném lỗi có cấu trúc** `{slot, need, have}` cho từng slot thiếu; không sinh đề thiếu.
  - PRNG có seed (dùng lại `seededOrder` hoặc mulberry32 hiện có trong `shuffle.ts`) → cùng seed + cùng pool = cùng đề.
- `apps/api/src/exams/exams.service.ts` — **Modify.**
  - `adminGenerateExam(caller, {level, seed?, allowReference?})` → tạo `Exam` `status: "DRAFT"`, `examType: "JLPT <level> — Đề ngẫu nhiên"`, `sections`, `generated`. `allowReference` chỉ admin.
  - `generateForLearner(caller, level)` → `allowedRights = ["own","licensed"]` **cứng**, `excludeIds` = câu trong 5 lượt gần nhất của người đó; tạo `Exam` `PUBLISHED` đánh dấu `generated.forUser`, rồi gọi `start` luôn. Ẩn các đề này khỏi `listExams` công khai.
  - Endpoint ngân hàng: `bankCoverage(level)` → mỗi slot: cần bao nhiêu, có bao nhiêu (theo `rights`).
- `apps/api/src/exams/exams.controller.ts` — **Modify.** `POST exams/admin/generate`, `GET exams/admin/bank-coverage?level`, `GET/PUT exams/admin/blueprints/:level`, `POST exams/generate` (người học, rate limit như các endpoint công khai khác).

Test:

- `apps/api/src/exams/generator.spec.ts` — pool giả tự sinh (vài trăm câu, 3 nguồn):
  - đề đúng blueprint: đủ số câu từng slot, đúng thời gian từng phần;
  - nhóm bài đọc nguyên vẹn và đúng `questionsPerStimulus`;
  - không trùng `contentHash`, không trùng đáp án vocab;
  - cùng seed → cùng đề; seed khác → khác đề;
  - pool thiếu → lỗi liệt kê đúng slot thiếu;
  - **khoá Q-12:** pool chỉ có `reference` → `generateForLearner` luôn lỗi thiếu câu, không bao giờ trả câu `reference`.
- `apps/api/src/exams/blueprints.spec.ts` — seed hợp lệ; tổng câu N3 = 35 (vocab) + 23 (grammar) + 16 (reading).

### Giai đoạn 4 — UI làm bài + admin (NP-409)

Change list:

- `apps/ui/app/learn/exams/[attemptId]/…` — **Modify.** Hiển thị theo phần (tab/tiêu đề phần, đồng hồ phần), lời dẫn 問題 trên mỗi nhóm, bài đọc ghim bên trái (desktop) / thu gọn được (mobile), câu ★ hiển thị 4 ô với ô ★ tô đậm, câu 3 phương án. Màn kết quả: điểm từng phần + điểm quy đổi **ước tính** có chú thích.
- `apps/ui/app/learn/exams/page.tsx` — **Modify.** Nút "Đề ngẫu nhiên N5…N1" (ẩn level chưa đủ ngân hàng — dựa vào `bank-coverage`).
- `apps/ui/app/admin/(panel)/exams/page.tsx` — **Modify.** Mục "Ngân hàng": bảng phủ theo level × mondai (cần / có / theo rights); nút "Sinh đề thử" (cho phép `reference`, chỉ xem nội bộ); sửa blueprint.
- Bám theo pattern UI hiện có của `learn/exams` và `admin/(panel)` (Preline, mobile-first — xem `docs/plans/plan-mobile.md`).

Test:

- Bấm thử trình duyệt (Chromium headless như NP-020): sinh đề N3 từ ngân hàng fixture `own` → làm hết, nộp, xem lại; kiểm mobile 375 px. Lưu screenshot vào thư mục evidence gitignore (giống `.p2-evidence/`).

## 7. Song song hoá

Giai đoạn 1 phải xong trước. Sau đó **Giai đoạn 2 (import)** và **Giai đoạn 3 (sinh đề)** độc lập — chỉ dùng chung schema của GĐ1; có thể giao hai agent, mỗi agent một worktree. Giai đoạn 4 cần cả 2 và 3.

## 8. Dữ liệu mẫu và fixture

### 8.1. Fixture trong repo — tự viết, không chép đề

Viết tay 3 file text nhỏ trong `apps/api/src/exams/import/__fixtures__/` mô phỏng **layout** (không phải nội dung) của 3 loại nguồn đã thấy:

1. **Tuyển tập đề chính thức (OCR):** watermark `Facebook: …` lặp, footer tiếng Việt lặp, số câu kiểu `①`, phương án bị dồn dòng (`2つづんで 3つうつんで 4 うづんで`), bảng đáp án dạng lưới cuối mỗi kỳ.
2. **Đề Migii:** `EXAM ID: 6xx`, `問題 n:` + lời dẫn, câu bài đọc đánh số `56.1`, cloze `[1]…[4]`, `— 12 —` số trang, không có đáp án, phần nghe chỉ `1 2 3 4`.
3. **Bộ đề tổng hợp (26 đề N3 / 40 đề N2):** `N3-1`, `問題Ⅰ`, `［1］`, phương án `① ② ③ ④`, bảng đáp án `問題Ⅰ 8x2 ( 16 点)`.

Mọi câu trong fixture là câu tự đặt (vd 「毎朝、公園を散歩します。」).

### 8.2. Mẫu thật — ngoài repo

- Text đã trích (bị cắt ở ~170 KB/file do giới hạn công cụ Drive): `/root/exam-samples/` — `n3_official.txt` (7 kỳ 2010–2014, chỉ 言語知識+読解), `n2_official.txt` (đến trang 155), `n3_26de.txt` (có đáp án + điểm), `n2_40de.txt` (vài đề đầu).
- PDF gốc trên Google Drive của chủ dự án, thư mục id `1ll2JnSW_o3-9EdN9lsi7OPVtsT2ZwJcs`: `De_Chinh_Thuc_N3.pdf`, `De_Chinh_Thuc_N2.pdf`, `FULL - 26 DE - 日本語能力試験N3.pdf`, `40 de thi n2 pdf.pdf`, `MIGII_JLPT_EXAM_VI_616.pdf`, `MIGII_JLPT_EXAM_VI_617.pdf`. Chỉ dùng để chạy thử import trên máy dev; draft sinh ra mang `rights: "reference"`.
- Quan sát đã có: Migii 616 và 617 **trùng câu** (「雪がすべてをおおい（ ）」, câu 南北問題) → test chống trùng chéo nguồn là bắt buộc. Đề chính thức N3/N2 trong tuyển tập **không có phần nghe**.

## 9. Kiểm tra cuối mỗi giai đoạn

```
pnpm -C apps/api test
pnpm -C apps/api lint
pnpm -C apps/api typecheck
pnpm -C apps/ui lint        # GĐ2, GĐ4
pnpm -C apps/ui typecheck   # GĐ2, GĐ4
```

Chạy lần lượt, không chạy `pnpm -r` song song (RAM 4 GB).

## 10. Tiêu chí hoàn thành toàn bộ

- [ ] Đề phẳng cũ chạy y như trước (test số liệu cũ xanh).
- [ ] Nhập một PDF mẫu → draft nhóm đúng theo kỳ × mondai; ≥ 90% câu của 言語知識 N3 7/2010 tách đúng (ghi tỉ lệ thật vào ticket); đáp án khớp bảng đáp án cuối kỳ.
- [ ] Xuất bản lại cùng draft / cùng câu từ nguồn khác không tạo bản ghi trùng.
- [ ] Admin sinh được đề N3 đúng blueprint; người học sinh đề chỉ từ câu `own|licensed`.
- [ ] Sit payload không có đáp án (test đệ quy).
- [ ] Kết quả có điểm từng phần + điểm ước tính ghi rõ "ước tính".
- [ ] Không có nội dung đề bên ngoài trong git (`git grep` vài câu mẫu từ `/root/exam-samples/` trả rỗng).
- [ ] Checklist, TICKETS, `database.md`, ticket NP-406…409 cập nhật.

## 11. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| OCR tuyển tập chính thức vỡ (phương án dồn dòng, ký tự sai) | AI cấu trúc hoá + `validate()` chống bịa + duyệt tay bắt buộc |
| AI "sửa" nội dung hoặc đoán đáp án | Không hỏi đáp án; mọi chuỗi phải có trong rawText |
| Bài đọc ít → đề lặp nhanh | `bank-coverage` cho admin thấy; ưu tiên câu chưa gặp; bổ sung đề tự soạn |
| Bản quyền | `rights` + khoá test ở bộ sinh đề; repo public → fixture tự viết |
| RAM | Xử lý từng trang, một job/lúc, đo RSS |
| Blueprint N5/N4/N2/N1 sai | Lấy từ jlpt.jp kèm nguồn; chưa xác minh thì `active: false` |
