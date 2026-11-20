# HANDOFF — Nihongo-Path / NP-407 (exam import)

> **Agent mới: đọc hết file này trước khi code.** Trạng thái được cập nhật đúng tại commit `d439ed9`.
> Quy tắc người dùng đặt ra (từ 19/11): **mỗi tiến trình phải lưu lại (commit + HANDOFF) để agent khác follow tiếp khi hết token.** Không spawn agent phụ (quota 5h chia sẻ, fork cũng chết — đã gặp 429 giữa phiên).

## 1. Ticket & mục tiêu

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
