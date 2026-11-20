# HANDOFF — Nihongo-Path (agent nào đọc file này để tiếp tục)

> **Cập nhật khi commit** (mục "Đã làm" / "Tiếp theo"). File này là nơi duy nhất agent mới cần đọc trước khi code.

## Trạng thái (19/11/2026, sau commit GĐ2-a — xem `git log`)

- **Branch main**, chưa push (4 commit local: NP-406, NP-115, NP-114, + GĐ2-a này).
- **NP-406 (GĐ1) ✅** — commit `dbabe4b`: `mondai.ts`, `exam_stimuli`, `Exam.sections/generated`, chấm theo phần, `groupedOrder`, CRUD stimuli.
- **NP-407 (GĐ2) — giai đoạn 2a (deterministic) ✅ đã commit** — pipeline nhập PDF:
  - `src/exams/import/clean.ts` — loại noise theo tần suất (≥30% trang **và** ≥2 trang), ghép câu CJK bị cắt, `cleanAnswerLine` (giữ ①②③④, NFKC gấp ①→1 làm hỏng key).
  - `src/exams/import/segment.ts` — tách khối theo `問題` (heading sau NFKC: `問題I`/`問題7`/`問題 1:`), sitting (ngày chính thức / `EXAM ID` / `N3-1`), part (文字・語彙/文法/読解/聴解), section `答案/解答` tách ra → `answerKey`.
  - `src/exams/import/structure.ts` — prompt AI + `validateParsed` (chặn bịa: mọi chuỗi AI trả về phải là substring NFKC của khối), `parseAiJson`.
  - `src/exams/import/answer-key.ts` — compact (`問題Ⅰ 4x1 ( 4 点)` + `1① 2④…`) + broken grid; slot không đọc được → `null` (bắt review tay, KHÔNG đoán).
  - `schemas/import-draft.schema.ts` (`exam_import_drafts`, `answers: number[]`, `0` = chưa biết — Mongoose `[Number]` drop null), `schemas/import-job.schema.ts` (`exam_import_jobs` + `exam_import_job_pages` checkpoint).
  - `ai-example.service.ts`: +`ocrExamPageText` (OCR trang đề → text thuần, mục đích `exam-import`); `ai-call-log.schema.ts`: +purpose `"exam-import"`.
  - `mondai.ts` (đã sửa trong GĐ2-a): marker toàn cục `音声`→listening, `全体の内容を考えて`→text-grammar (dù block gợi ý vocab — đúng layout Migii), cross-family fall-through, marker `(1)から(2)` cho reading-mid.
  - `__fixtures__/` — 3 file fixture **tự đặt layout thật** (official_collection / migii / combined_n3), không phải nội dung đề thật (repo public, §8.1).
  - **470 tests xanh, typecheck sạch, lint exit 0** (2 warning mới đã sửa).

## Việc kế tiếp (NP-407 còn lại, theo thứ tự)

1. **`src/exams/exam-import.service.ts` (chưa có)** — job service:
   - `startJob(buffer, {level, rights})`: guard "1 job chạy/user" (pattern `import.service.ts:491`), create `exam_import_jobs`, rồi **từng trang**: pdfjs `getTextContent()` (xem `parsePdf` ở `parsers/pdf.ts:337` — nhưng viết riêng, không dùng `parsePdf` vì nó trả Table vocab) → text layer; trang rỗng → `renderPdfPage` (`parsers/pdf.ts:274`) + `ai.ocrExamPageText` + `ocrWithRetry`; checkpoint `exam_import_job_pages` (unique {job,n}). **Tuần tự, drop PNG sau khi OCR (RAM 4 GB).**
   - Sau khi đọc đủ trang (hoặc resume): `segmentBlocks(pages)` → mỗi block: `structurePrompt` + `AiExampleService.complete(svc, prompt, {temperature:0, purpose:"exam-import"})` → `parseAiJson` → `validateParsed(parsed, rawText, optionCountsOf(mondai))` → ghi `exam_import_drafts` (`needs_review` / `error` + `issues[]`). **AI không bao giờ điền đáp án.**
   - `answers` từ `answerKey`: `parseCompactKey`/`parseBrokenGrid` (split theo heading 問題 trong key) → gắn vào draft `answers` (0 nếu null).
   - `publish(draftId, edits)`: mọi câu ≥1; tạo stimulus (`ExamStimulus`) + questions (`ExerciseQuestion`, `dedupeKey:"imp:"+contentHash`, `verified:true`, `rights` theo draft, cập nhật `questionCount` stimulus), idempotent theo `contentHash` (trùng → skip), draft → `published`.
   - Resume: restart process → tìm job `running` có page thiếu (pattern `import.service.ts:592`).
2. **Routes** trong `exams.controller.ts` (guard `@ContentAdmin()`): `POST exams/admin/import` (multipart, multer memory, ~30 MB như `import.controller.ts:80`), `GET exams/admin/import/:jobId` (progress + drafts), `GET exams/admin/import-drafts?jobId&status`, `PATCH …/:id`, `POST …/:id/publish`, `POST …/:id/discard`.
3. **`exams.module.ts`**: đăng ký `ExamImportDraft`, `ExamImportJob`, `ExamImportJobPage` + `ExamImportService` + import `buildAiModule()` (xem `ai.module.ts` exports `AiExampleService`).
4. **Specs còn lại**: `exam-import.service.spec.ts` (mock `AiExampleService` + models: publish 2 lần → 1 bản ghi; 2 nguồn trùng → 1; block error không chặn job). 4 spec deterministic đã có (46 tests).
5. **UI**: `apps/ui/app/admin/(panel)/exams/import/` (upload + level + rights; list draft theo status; form sửa 2 cột: text gốc ↔ parsed; nút Xuất bản/Bỏ) + Next.js API gateway (copy pattern `apps/ui/app/api/admin/import/` — **đọc kỹ file đó trước**).
6. **Docs**: `database.md` (+`exam_import_drafts`, `exam_import_jobs`, `exam_import_job_pages`), checklist P4-JLPT-05 → `[x]`, ticket NP-407, TICKETS; đo RSS thủ công (1 PDF ~50 MB) ghi vào ticket.
7. **Commit riêng + cập nhật HANDOFF này cùng commit.**

## Bẫy đã biết (đọc kỹ trước khi code)

- **Quota token 5h của user chạm 100% (429 lúc 02:5x/20/11, reset window ~07:54)** — KHÔNG spawn agent phụ (chúng chia sẻ quota, fork đã chết giữa phiên). Làm nhỏ, commit sớm, HANDOFF mới sau mỗi commit.
- **NFKC gấp các ký tự đặc biệt**: `Ⅰ→I`, `①→1`, `１→1` (đã verify bằng node). Mọi regex match heading phải chạy trên text SAU NFKC. Trong **answer region** KHÔNG NFKC (`cleanAnswerLine` chỉ trim + nửa-width digits, giữ ①②③④) — vì `1①` (câu 1 đáp ①) sẽ thành `11` nếu NFKC.
- `segment.ts` trả `Segmented {blocks, answerKey}` (KHÔNG phải `Block[]` như doc cũ).
- `learnNoise` yêu cầu count ≥2 (file 1 trang: mọi dòng đều "100%" → không coi là noise).
- `AiExampleService`: `complete`/`ocrVocabPage`/`ocrExamPageText` public; `call`/`callRaw`/`pace` **private**. `services.available()` trả `RuntimeAiService[]`, `reportOk/reportFailure` trên `AiServicesService`.
- pdfjs: text layer = `page.getTextContent()` → fragments `it.str` + `it.transform[4/5]`; scan → `renderPdfPage` (đã export, `MAX_OCR_PAGES=300`). Import pdfjs bằng `await import("pdfjs-dist/legacy/build/pdf.mjs")`.
- `exam_import_drafts.parsed` = object thô; `rawText` là ground truth; `rights` default `reference`.
- `ExerciseQuestion.contentHash` = `contentHashOf(prompt, options)` (sha1, NFKC) — unique sparse, import dùng `dedupeKey="imp:"+hash`.
- **Repo PUBLIC**: chỉ fixture tự đặt; không commit nội dung đề thật.
- VPS 4 GB RAM, không swap: không song song OCR, không giữ nhiều PNG.

## Lệnh chuẩn

- `pnpm -C apps/api test` (470 tests) · `pnpm -C apps/api lint` · `pnpm -C apps/api typecheck`
- 1 file: `pnpm -C apps/api exec vitest run <path>.spec.ts`
- Probe nhanh (không qua test): `cd apps/api && npx tsx /tmp/probe.mts` (tsx đã install cache)
