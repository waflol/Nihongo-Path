# Plan — Japanese AI Evaluation Benchmark (dataset v2, 1000 cases)

Trạng thái: **đã triển khai** (2026-11-12) — code ở `apps/api/src/eval/`, trang `/admin/ai-eval`.

## 1. Kiến trúc hiện tại (đã đọc)

| Thành phần | File | Vai trò hiện tại |
|---|---|---|
| Test set + chấm điểm | `apps/api/src/ai/ai-benchmark.ts` (1051 dòng) | Bộ câu viết tay cố định (10 dịch, 4 đặt câu, 3 ngữ pháp, 2 phát âm, 11 kiểm tra từ). Chấm bằng code: chrF, terminology, độ dài, chứa stem, khớp pattern (substring), so khớp kana. Không có AI Judge. |
| Runner | `AiExampleService.benchmark()` / `benchmarkOnce()` trong `ai-example.service.ts` | Chạy 1 task × 1 service, 1–5 lần lặp, `items` = số câu nạp vào 1 lần gọi (tối đa 40, lặp lại bộ cố định). |
| Gọi provider | `AiExampleService.callRaw()` (private) | Gemini / OpenAI-style / Anthropic / Antigravity CLI. **Temperature cố định 0.4**, **không đọc token usage**, chỉ trả về text. |
| Lưu kết quả | `AiServiceConfig.benchByTask` + `benchHistory` (Mongo `aiservices`) | Kết quả mới nhất + 30 dòng lịch sử / task, **gắn vào document của service**; dùng để xếp hạng ưu tiên service (`rankServices`, `bestOf`). |
| Log gọi AI | `aicalllogs` (TTL 30 ngày), purpose `"test"` | Prompt + answer, ms. Không có token. |
| UI | `ai-benchmark-panel.tsx`, `lib/ai-benchmark-score.ts` | Bảng so sánh service theo task, chọn số lần chạy / số item. |
| Giá | `ai-models.ts` | Chỉ OpenRouter có giá chính xác; còn lại là gợi ý chữ. |

**Khoảng trống so với yêu cầu:**
1. Không có khái niệm dataset/version/case; test set nằm trong code, không lọc theo JLPT level.
2. Chấm bằng exact/substring là chính (vi phạm quy tắc 1–3); không có đánh giá ngữ nghĩa.
3. Không ghi prompt version, temperature, token, chi phí; lịch sử chỉ có điểm tổng.
4. Kết quả bị ghi đè lên service document — không so sánh được giữa các phiên bản model/prompt, không lưu raw/parsed output theo từng case.
5. Vocabulary check hiện tại là bài "sửa thẻ sai", khác hẳn task vocabulary của dataset (đọc + nghĩa theo ngữ cảnh + từ loại + sắc thái).

## 2. Dataset v2 (đã tải và kiểm tra)

- 1000 case = 4 task × 5 level × 50. Không trùng `id`. Top-level: `dataset_name, version (2.0.0), language_pair, levels, tasks, dataset_status, quality_notice, evaluation_policy, cases`.
- Mỗi task có schema riêng:
  - `translation`: `input, reference, direction` (125 ja→vi, 125 vi→ja). Reference có dạng thay thế `học sinh/sinh viên`.
  - `sentence_generation`: `target_pattern, instruction` (4 bối cảnh), `reference_example, reference_translation`; `gold_status = reference_example_not_unique_answer`.
  - `vocabulary_check`: `word, context, expected{reading, meaning_vi, part_of_speech, example_context}`.
  - `grammar_analysis`: `sentence, target_pattern, instruction` (4 hướng phân tích), `expected{meaning_vi, formation, function, sentence_translation}`.
- **Chỉ 50 seed duy nhất / task** (10 / level), mỗi seed có ~5 variant. Vì vậy split dev/val/test phải theo seed, không theo dòng (đúng như README).
- `gold_status` của 750 case là `curated_seed_expansion_needs_review` → báo cáo phải ghi rõ “chưa có gold đã duyệt”.

## 3. Thiết kế đề xuất

### 3.1 Nguyên tắc
- **Module mới `apps/api/src/eval/`**, tách khỏi benchmark nhanh hiện tại. Benchmark cũ (dùng để xếp thứ tự ưu tiên service) giữ nguyên, không đụng vào.
- **Collection riêng** (`eval_*`), không bao giờ ghi vào flashcards / SRS / user data / `aiservices.bench*` → đáp ứng quy tắc 5.
- Sửa module hiện có **chỉ 2 chỗ, có lý do kỹ thuật**:
  1. `AiExampleService`: thêm hàm public `complete(svc, prompt, { temperature, purpose })` trả `{ text, usage: { inputTokens, outputTokens } | null, ms }`. Lý do: cần temperature theo lần chạy và token usage, `callRaw` hiện là private và bỏ mất `usage`. `callRaw` cũ vẫn giữ hành vi (temperature 0.4) cho mọi chỗ đang dùng.
  2. `AI_LOG_PURPOSES` thêm `"eval"` và `"judge"` để log gọi AI không lẫn với `"test"`.

### 3.2 Dataset Loader (`eval/dataset/`)
- File gốc commit vào repo: `apps/api/eval-data/japanese_ai_eval_dataset_v2_1000.json` (read-only), kèm SHA-256.
- `loadDataset(path)` đọc JSON **và** JSONL; validate bằng type guard theo từng task (bắt buộc field, level ∈ N5–N1, task hợp lệ, `case_count` khớp, không trùng id) → trả lỗi có vị trí case.
- `importDataset()` ghi vào Mongo: `eval_datasets {name, version, checksum, status, languagePair, caseCount, importedAt}` và `eval_cases {datasetVersion, caseId, task, level, seedKey, split, payload, goldStatus}`. Import lại cùng version nhưng **checksum khác → từ chối** (bắt buộc tăng version); không bao giờ update case cũ → dữ liệu gốc bất biến, thêm case = version mới.
- `seedKey` = input/pattern/word/sentence chuẩn hoá; `split` = hash(seedKey) → dev 60 / val 20 / test 20, ổn định giữa các lần import.
- Filter: `task[], level[], split[], goldStatus[], caseIds[], limit`.

### 3.3 Evaluation Engine (`eval/evaluators/`)
Mỗi task một evaluator, cùng interface:
```ts
interface TaskEvaluator<C, A> {
  task: EvalTask;
  buildPrompt(cases: C[], promptVersion): string;      // batch nhiều case / 1 lần gọi
  parse(raw: string): Map<caseId, A>;                    // raw và parsed lưu riêng
  deterministic(c: C, a: A): { checks: Record<string, number|boolean>; flags: ErrorTag[] };
  judgeRubric: Criterion[];                              // trọng số theo README
  combine(det, judge): ScoreBreakdown;                   // tổng 0–100
}
```
| Task | Kiểm tra bằng code | AI Judge (rubric README) | Kết hợp |
|---|---|---|---|
| Translation | có output, đúng chữ đích (vi Latin có dấu / ja kana-kanji), tỉ lệ độ dài, chrF với **mọi biến thể** của reference (`a/b` tách ra) — chỉ để tham khảo | meaning 40, completeness 20, grammar/relations 15, naturalness 15, register 10 | Điểm = judge; output rỗng / sai ngôn ngữ → 0 không cần judge; chrF cao + judge thấp → gắn cờ review |
| Sentence Generation | là câu tiếng Nhật, có pattern (chuẩn hoá `～`, chấp nhận dạng chia), **không chép nguyên reference_example**, độ dài | target pattern 30, grammar 25, naturalness 20, instruction compliance 15, level fit 10 | Thiếu pattern → trần điểm pattern = 0; chép reference → compliance = 0 |
| Vocabulary | reading: so kana chuẩn hoá (katakana→hiragana) — **sai reading vẫn đưa judge xét cách đọc thay thế hợp lệ**; POS: map nhãn (danh từ/noun/名詞…) | contextual meaning 30, nuance/usage 30, (reading thay thế, POS khi code không chắc) | reading 20 + POS 20 từ code (judge chỉ override lên khi có lý do), meaning + nuance từ judge |
| Grammar | pattern có trong `grammar[].pattern`; breakdown ghép lại = câu gốc; có translation | pattern 20, meaning/nuance 20, formation 15, translation 15, breakdown/function 20, confusion handling 10 | pattern/breakdown kết hợp code + judge; phần giải thích từ judge |

Reference luôn đưa cho judge với nhãn **“một đáp án chấp nhận được, không phải đáp án duy nhất”** (quy tắc 2–3).

**Kiểm soát AI Judge (quy tắc 4):**
- Judge là service riêng chọn khi tạo run; **từ chối nếu judge trùng provider+model với candidate** (trừ khi bật cờ `allowSelfJudge`, khi đó báo cáo đánh dấu rõ).
- Judge không biết candidate là model nào (blind), temperature 0, prompt judge có version riêng.
- Judge trả điểm từng tiêu chí + `errorTags` + `confidence` + lý do ngắn; parse lỗi → `judgeError`, không tính 0 cho candidate.
- Tuỳ chọn 2 judge: chênh > 20 điểm hoặc confidence thấp → `needsReview`.
- Cache judge theo `(judgeModel, judgePromptVersion, caseId, hash(output))` để chạy lại rẻ.

### 3.4 Provider Benchmark Runner (`eval/runner/`)
- `POST /flashcards/admin/ai/eval/runs` với: `datasetVersion, filter, candidates[{serviceId, model?}], judge{serviceId, model?}, promptVersion, temperature, batchSize (số case / 1 lần gọi), repeats (1–5), split`.
- Chạy nền (không giữ HTTP request): mỗi candidate tuần tự, mỗi batch gọi `complete()`, parse, chấm, **ghi kết quả từng batch ngay vào Mongo** (không giữ 1000 kết quả trong RAM). Concurrency 1–2 (VPS 4 GB), tôn trọng `rpm` của service. Dừng sớm khi 429/auth lỗi liên tiếp; có thể huỷ run; run bị gián đoạn khi restart → `interrupted`, chạy tiếp được từ case chưa có kết quả.
- Batch: token của 1 lần gọi chia đều cho các case trong batch (ghi rõ `tokensEstimated: "batch-share"`); CLI không có usage → ước lượng theo số ký tự, đánh dấu `estimated`.
- Ghi nhận mỗi run: provider, model (id + version string provider trả về nếu có), prompt version, judge model + judge prompt version, temperature, batch size, repeats, git commit, thời gian bắt đầu/kết thúc.

### 3.5 Result Storage
- `eval_runs` — cấu hình + trạng thái + tóm tắt (cập nhật dần).
- `eval_results` — 1 dòng / (run, candidate, case, repeat): `rawOutput` (slice của batch hoặc toàn bộ raw lưu 1 lần ở `eval_calls`), `parsedOutput`, `deterministic`, `judge`, `scoreBreakdown`, `totalScore`, `latencyMs`, `tokens`, `costUsd`, `error`, `errorTags`, `needsReview`.
- `eval_calls` — 1 dòng / lần gọi API: raw text, usage, ms, status (thay vì nhồi raw vào từng case).
- Không TTL (lịch sử phục vụ so sánh model/prompt — quy tắc 6). Index: `{runId, candidate, task, level}`, `{caseId}`.
- (Giai đoạn 2) `eval_reviews` — human override có audit.

### 3.6 Reporting
- `GET /eval/runs/:id/report` và `GET /eval/compare?runs=a,b` — aggregation Mongo (không load hết vào RAM):
  - điểm tổng thể; theo task; theo level; ma trận task × level; theo pattern/evaluation_focus;
  - so sánh candidate cạnh nhau, chênh lệch với run trước cùng model/prompt;
  - latency trung bình / median / p95; token vào/ra; **chi phí ước tính** (bảng giá $/1M token theo model, cấu hình trong admin; OpenRouter lấy giá thật);
  - error rate (HTTP lỗi / parse lỗi / case bị bỏ sót);
  - consistency giữa lần lặp: mean, stdev, pass rate (≥ ngưỡng, mặc định 70), độ giống nhau giữa các output (chrF đôi một);
  - lỗi thường gặp: top `errorTags` (code + judge), kèm vài case ví dụ.
- UI: trang admin mới `/admin/ai-eval` (tạo run, theo dõi tiến độ, xem báo cáo, xuất CSV/JSON). Không thay panel benchmark cũ.

### 3.7 Tests
- Unit (vitest, chạy `--pool=forks --maxWorkers=1`): loader validate (thiếu field, trùng id, sai level, checksum đổi), split ổn định theo seed, từng evaluator với output đúng / diễn đạt khác / sai ngôn ngữ / chép reference / sai reading, parse judge lỗi, chặn self-judge, chia token theo batch, aggregation report.
- Integration: runner chạy với provider giả (fetch stub) + Mongo in-memory hoặc DB test → run hoàn tất, kết quả lưu đúng, report đúng số; mô phỏng 429 giữa chừng và resume.

## 4. Chi phí / tài nguyên ước tính
- Full 1000 case × 1 candidate × 1 lần: batch 10 → 100 lần gọi candidate + ~100–200 lần gọi judge (judge batch 5–10). Với 3 candidate × 3 repeat ≈ 2.700 lần gọi judge → nên mặc định chạy split `dev` hoặc lọc task/level khi thử prompt, full test set khi chốt.
- RAM: dataset ~0,9 MB; runner giữ tối đa 1 batch trong bộ nhớ; aggregation chạy trong Mongo.

## 5. Đã thống nhất (2026-11-12)
1. Dataset gốc lưu trong repo: `apps/api/eval-data/japanese_ai_eval_dataset_v2_1000.json`, tự nhập vào Mongo khi API khởi động (cùng checksum thì bỏ qua).
2. **Luôn 2 AI chấm**, 2 model khác nhau, khác model của bài làm (trừ khi bật “tự chấm có kiểm soát”: khi đó bài đó chỉ do AI chấm còn lại chấm và luôn vào danh sách cần duyệt).
3. Làm luôn trang admin `/admin/ai-eval` + người duyệt sửa/xác nhận điểm (lưu lịch sử ở `eval_reviews`).
4. **Thay benchmark cũ**: điểm từng việc của run hoàn tất được ghi vào `benchByTask` của dịch vụ và tự sắp xếp lại thứ tự ưu tiên:
   `translation → translate`, `sentence_generation → write`, `grammar_analysis → grammar`, `vocabulary_check → verify`.
   Benchmark cũ (bộ câu cố định, panel “Chấm điểm & so sánh dịch vụ”, lịch sử chấm điểm, endpoint `services/:id/benchmark`) đã **xoá hẳn**; điểm cũ còn trong DB bị bỏ qua (chỉ tính kết quả có `source: "eval"`). **Phát âm** không có trong dataset nên hiện không có điểm — thứ tự ưu tiên của nó chỉnh tay.

## 6. Ghi chú triển khai
- Một run chạy một lúc (VPS 4 GB); run khác xếp hàng. Restart giữa chừng → `interrupted`, bấm “Chạy tiếp” để chạy phần còn thiếu.
- Token: lấy từ provider (Gemini `usageMetadata`, OpenAI/Anthropic `usage`); Antigravity CLI không báo → ước lượng theo ký tự (báo cáo ghi rõ). Token và chi phí của 1 lần gọi chia đều cho các câu trong batch.
- Giá token do admin nhập (tab “Giá token”, `provider:model` hoặc `provider:*`).
- Ô “nhiệt độ”, “số câu mỗi lần gọi”, “số bài mỗi lần AI chấm”, “tối đa số câu mỗi việc × trình độ” để trống = tự động theo bộ lọc; nhập tay thì UI báo giá trị thực tế sẽ dùng.
- Test Mongo thật: `EVAL_TEST_MONGODB_URL=mongodb://localhost:27017/nihongo_eval_test pnpm --filter @nihongo/api exec vitest run src/eval/eval-mongo.store.integration.spec.ts` (database đó bị xoá sau test).
