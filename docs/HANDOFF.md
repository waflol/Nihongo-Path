# HANDOFF — Nihongo-Path

> **Agent mới: đọc hết file này trước khi code.** Quy tắc: **mỗi tiến trình phải lưu lại (commit + HANDOFF) để agent khác follow tiếp khi hết token.** Không spawn agent phụ (quota 5h chia sẻ, fork cũng chết — đã gặp 429 giữa phiên).

---

## P4 — NP-407: màn duyệt bản nháp đề (mới thêm)

Trước đây import PDF tạo `exam_import_drafts` nhưng UI không có chỗ xem → thêm:
- `apps/ui/app/admin/(panel)/exams/import/[id]/drafts/page.tsx` + `components/admin/exam-import-drafts.tsx`: xem khối 問題, text gốc, chọn đáp án, Xuất bản / Loại.
- `app/api/exam-import/route.ts`: gateway `?drafts=`, `?publish=`, `?discard=`.
- Link "Duyệt bản nháp" ở tracker (✎), trang log, và danh sách "Các lần nhập gần đây" trên `/admin/exams/import`.
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
1. **Verify thật NP-024 + NP-025** (chạy được trên VPS là đóng): API `/admin/users` đổi role + `/admin/logs` kiểm before/after; API `/feedback` POST + `/admin/feedback` đổi trạng thái → kiểm `history`; trình duyệt `/account` (gửi góp ý), `/admin/feedback` (lọc + lịch sử), `/admin/reports` (báo lỗi thẻ, giờ có history).
2. **NP-504 (P5-SEC-01 + P5-DOC-01)**: rà least privilege toàn endpoint admin (`grep -L "@Roles"` các controller admin) + ADR entitlement + cập nhật `database.md`. **Làm sau quota** để quét toàn bộ P5.
3. **Quota engine NP-501/502/503**: theo layout đã duyệt — `feature-config.schema.ts` (featureKey, enabled, limit, period, tz reset) + `quota_reservations`/`usage_records` + `quota.service` (reserve→settle→release, reset theo kỳ/tz) + `EntitlementGuard`/`QuotaGuard` (plan không có quyền→403, hết mức→429/403) + màn admin cấu hình. Q-07/Q-23 chỉ chốt con số (edit trong admin), không chặn kiến trúc. Xem `docs/issues/NP-501.md`, `NP-502.md`, `NP-503.md`.

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
