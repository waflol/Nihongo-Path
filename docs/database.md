# Database — Nihongo Path

> MongoDB (Mongoose 8). Đối chiếu với code ngày 11/11/2026.
> Collection chỉ được tạo khi tính năng cần đến; nhóm chưa triển khai liệt kê ở [§8](#8-chưa-triển-khai).

## 1. Nguyên tắc

- File lớn (media) **không** lưu trong Mongo — dành cho object storage (chưa chọn).
- Nội dung học có trường `lang`, không hard-code tiếng Việt.
- `Role` (quyền quản trị) tách khỏi `Plan` (quyền lợi thuê bao).
- Không lưu secret dạng rõ trong DB. Khoá API của dịch vụ AI được mã hoá (xem `aiservices`).
- Index đặt theo truy vấn thực tế; index unique dùng để bảo đảm idempotent.

### Tên collection

Tên trong tài liệu này là **tên thật trong MongoDB**. Mongoose tự đặt tên từ tên model (viết thường, số nhiều: `FlashcardDeck` → `flashcarddecks`), trừ khi schema khai báo `collection` riêng.

Các tài liệu kế hoạch cũ dùng tên có gạch dưới. Bảng đối chiếu:

| Tên trong kế hoạch | Tên thật |
|---|---|
| `auth_accounts` | `authaccounts` |
| `auth_sessions` | `authsessions` |
| `vocabulary` | `vocabularies` |
| `grammar_points` | `grammarpoints` |
| `flashcard_decks` | `flashcarddecks` |
| `user_card_progress` | `usercardprogresses` |
| `study_sessions` | `studysessions` |
| `srs_review_logs` | `srs_review_logs` |

Hai collection có gạch dưới trong tên thật: `exercise_questions` và `reading_overrides`.

## 2. Tài khoản

### `users`
- `email`, `passwordHash` (scrypt, dạng `salt$hash`), `authAccounts[]`.
- `role`: USER / ADMIN / SUPER_ADMIN (trục **quản trị**). `status`: ACTIVE / SUSPENDED.
- `plan`: FREE / PRO / VIP (trục **quyền học tập**, mặc định `FREE`) — tách khỏi `role`; quyết định được dùng tính năng nào + hạn mức. Đổi qua `PATCH /admin/entitlements/users/:id/plan` (admin).
- `lang`, `timezone` (mặc định `Asia/Ho_Chi_Minh`).
- `newCardsPerDay` (mặc định 20, khoảng 1–500): số thẻ **mới** tối đa mỗi deck mỗi ngày. Đổi qua `PATCH /srs/settings`.
- Index: `{email: 1}` sparse (tài khoản chỉ dùng OAuth có thể không có email).

### `authaccounts`
- Liên kết user với một provider: `provider` (`google` / `email`; `github` có trong enum nhưng chưa bật), `providerAccountId` (Google `sub` hoặc email).
- Index: `{provider: 1, providerAccountId: 1}` **unique** — một danh tính ngoài không liên kết hai lần.

### `authsessions`
- Refresh token opaque (128-bit), `expiresAt` (theo `JWT_REFRESH_EXPIRES_IN`), `revokedAt` (khi xoay vòng hoặc đăng xuất).
- Index: `{token: 1}` **unique**; `{user: 1, expiresAt: 1}`; `{expiresAt: 1}` TTL — Mongo tự xoá session hết hạn.

Tài khoản admin đầu tiên không được tạo ngầm: xem [development.md §6](./development.md#6-tạo-tài-khoản-admin).

## 3. Nội dung học

Các collection ở mục này có `status` (DRAFT / PUBLISHED) và `lang`. Admin viết; người dùng chỉ đọc bản PUBLISHED.

### `textbooks`
- `title`, `level`. Index: `{status: 1, level: 1}`.

### `units`
- Thuộc một `textbook`; `sortOrder` là thứ tự chuẩn. Index: `{textbook: 1, sortOrder: 1}`.

### `vocabularies`
- `term`, `reading`, `meaning`, `pos`, `example` / `exampleTranslation`, `source`, `tags[]`.
- `textbooks[]`, `units[]`: liên kết tới giáo trình / bài (lưu ngay trên từ).
- Index: `{status: 1, term: 1}`, `{status: 1, textbooks: 1}`.

### `grammarpoints`
- `label`, `meaning`, `structure`, `usage`, `level`, `tags[]`, `sortOrder`.
- `examples[]`: sub-document `{sentence, translation, note}` (không có collection ví dụ riêng).
- Index: `{status: 1, label: 1}`.

### `kanjis` — Kanji Jōyō (2136 chữ)
- `char` (**unique**), `rank` (thứ tự học), `level` suy từ `rank`:

  | Cấp | N5 | N4 | N3 | N2 | N1 |
  |---|---|---|---|---|---|
  | `rank` | 1–120 | 121–320 | 321–720 | 721–1200 | 1201–2136 |

- `hanViet`, `hanVietNorm` (bản bỏ dấu, server tự tính, dùng để tra cứu).
- `onyomi[]`, `kunyomi[]`, `strokeCount`, `strokes[]` (SVG path theo thứ tự nét), `radicals[]`.
- `meanings[]` (tiếng Việt), `meaningsEn[]`, `mnemonic`.
- `words[]`: từ liên quan `{term, reading, meaning, glossEn, chars, level}`. `meaning` tiếng Việt lấy từ `vocabularies` / `flashcards` có sẵn; phần thiếu được AI dịch khi mở trang chi tiết.
- `source`, `strokeCredit`.
- Index: `{char: 1}` **unique**; `{status: 1, level: 1, rank: 1}`; `{status: 1, hanVietNorm: 1}`.
- Nạp dữ liệu: `pnpm --filter @nihongo/api kanji:import -- --write`. Kế hoạch và nguồn: [plans/plan-kanji.md](./plans/plan-kanji.md).
- Bảng này là **nguồn chuẩn** để đánh giá Hán Việt và cách đọc của thẻ ([architecture.md §4.2](./architecture.md#42-nguồn-hán-việt-và-cách-đọc)).

**Giấy phép dữ liệu kanji:**
- On / kun / số nét / nghĩa tiếng Anh: KANJIDIC; từ vựng: JMdict (EDRDG, CC BY-SA 4.0).
- `strokes`: giữ nguyên chuỗi `d` từ KanjiVG © Ulrich Apel (CC BY-SA 3.0).
- Hán Việt: `packages/shared/han-viet.json` + `hanviet-pinyin-words` (MIT) + Unihan.
- **Cấm** dùng các trường `wk_*` của WaniKani.

## 4. Flashcard và học tập

### `flashcarddecks`
- `title`, `summary`, `level`, `category` (nhãn tự do: Từ vựng, Kanji, Ngữ pháp…), `lang`.
- `user`: chủ deck; **null với deck chia sẻ**. `shared`: true = admin viết, mọi user đã đăng nhập đọc.
- `status`: DRAFT / PUBLISHED. Deck tạo từ wizard nhập luôn ở DRAFT; admin tự công khai.
- `exampleTotal`, `exampleDone`, `examplePaused`: tiến độ job tạo ví dụ nền (`exampleTotal = 0` nghĩa là không có job).
- Document cũ có thể còn trường `publishWhenReady` (đã gỡ khỏi code, không còn được đọc).
- Index: `{user: 1, shared: 1, status: 1}`, `{shared: 1, status: 1}`.

### `flashcards`
- `deck`, `kind` (VOCABULARY / GRAMMAR / CUSTOM), `origin` (manual / import / saved).
- `vocabulary` / `grammar`: tham chiếu nguồn khi thẻ được lưu từ nội dung học; `front` / `back` được chép sang thẻ để phần học không phụ thuộc nội dung gốc.
- `front`, `back` (được để trống khi `origin: "import"` — cho phép nhập từ chưa có nghĩa), `reading` (hiragana), `hanViet`.
- `partOfSpeech`: từ loại chính — `verb` / `noun` / `adjective` / `adjective-na` / `adverb` / `phrase`.
- `partsOfSpeech[]`: mọi từ loại của từ, phần tử đầu là từ loại chính; có thêm `noun-suru` (danh từ đi với する). Rỗng = chỉ biết `partOfSpeech`.
- `note`: phần giải thích đi kèm từ trong nguồn nhập (`成績が上がる(=よくなる)` → "よくなる").
- `image`, `imageCredit`, `examples[]` (mỗi ví dụ có `source`: `tatoeba` / `ai-translated` / `ai`), `tags[]`.
- `order`: STT trong file nhập, dùng để sắp xếp.
- `readingChecked`, `backChecked`: dấu (hash của từ + cách đọc / từ + nghĩa) lần kiểm tra cả deck gần nhất; trùng thì lần sau bỏ qua, trừ khi chọn kiểm tra lại tất cả (`?force=1`).
- `reviewIssues[]`: cảnh báo cần xem xét (nghĩa trống / do AI gợi ý / nghi sai chính tả; cách đọc hoặc Hán Việt nghi lệch). Lọc bằng `?review=1`; đóng từng trường bằng `resolve` hoặc tất cả bằng `reviewed: true`.
- `dedupeKey`: sha256 của `(front, back, reading)` đã chuẩn hoá, **server tự tính**. Hai thẻ trùng khi giống cả kanji, hiragana và nghĩa. Thẻ không có `reading` dùng khoá kiểu cũ `(front, back)`. Khi API khởi động, thẻ có `reading` mà khoá chưa đúng dạng mới được tính lại.
- Index: `{deck: 1}`; `{deck: 1, order: 1, _id: 1}` (liệt kê thẻ theo thứ tự); `{deck: 1, dedupeKey: 1}` **unique** (lưu / nhập idempotent, phát hiện trùng).

### `usercardprogresses`
- Một document cho mỗi `(user, card)`.
- `state`: payload SRS có phiên bản ([ADR-srs](./adr/ADR-srs.md)). Từ 18/11/2026: `schemaVersion: 2`, `algorithm: "fsrs"`, `stability`, `difficulty`, `lastReviewAt` (epoch ms), cùng `ease` (suy ra từ `difficulty`), `repetitions`, `intervalDays`, `lapses` để hàng đợi cũ vẫn chạy. Bản ghi SM-2 cũ (`schemaVersion: 1`, `algorithm: "sm2"`, không có `stability`) được nâng cấp ở lần ôn kế tiếp, không migrate hàng loạt.
- `dueAt` (thời điểm UTC), `dueDay` (`YYYY-MM-DD` theo múi giờ user), `seenCount`.
- `lastReviewedAtMs`: dùng cho ghi đa thiết bị — bản ghi mới nhất thắng.
- Index: `{user: 1, card: 1}` **unique**; `{user: 1, dueDay: 1}` (hàng đợi ôn); `{user: 1, createdAt: 1}` (tra "đã học hôm nay": hạn mức thẻ mới, ưu tiên luyện tập).

### `studysessions`
- Phiên học, chỉ ghi thêm: `user`, `deck` (null = ôn chéo deck), `day` (theo múi giờ user), `timezone`, `device` (web / mobile / unknown), `cardsReviewed`, `grades` (số lần AGAIN / HARD / GOOD / EASY), `startedAtMs`, `endedAtMs`.
- Index: `{user: 1, day: -1}`.

### `exercise_questions` — câu luyện thi (問題)
- Câu hỏi kiểu JLPT sinh cho deck / thẻ: `deck`, `card`, `prompt`, `sub`, `options[]`, `answer`, `explain`, `level`, `createdBy`.
- `kind`: `kanji-pick` / `reading-pick` / `meaning-pick` / `synonym-pick` / `sentence-pick` / `formation-pick` / `context-pick`; ngân hàng đề (NP-406): `grammar-form` / `star-order` / `passage-question`.
- `source` (local / ai), `verified`, `dedupeKey`.
- Trường ngân hàng JLPT (NP-406, tất cả tuỳ chọn — câu cũ không có → hành vi cũ): `mondai` (mã dạng chuẩn `src/exams/mondai.ts`), `section` (`vocab`/`grammar`/`reading`/`listening`), `stimulus` (ObjectId `exam_stimuli`), `groupOrder` (thứ tự trong bài đọc / số chỗ trống), `points` (mặc định 1), `rights` (`own`/`licensed`/`reference`, mặc định `own`), `sourceRef {file, sitting?, no?}`, `contentHash` (sha1 prompt+options, unique sparse — chống trùng chéo nguồn).
- Index: `{dedupeKey: 1}` **unique**; `{level: 1, kind: 1}`; `{deck: 1, card: 1}`; NP-406: `{level: 1, mondai: 1, rights: 1}`, `{stimulus: 1, groupOrder: 1}`, `{contentHash: 1}` unique sparse.
- Số phương án: 4 cho các dạng in ấn; 3 hoặc 4 cho `listening-*` (chưa làm). Câu nhập đặt `dedupeKey = "imp:" + contentHash`.
- Dùng ở `/learn/exercises`, `/learn/exam`.

### `exam_stimuli` — bài đọc dùng chung (NP-406)
- Một đoạn đọc / cloze / thông báo / cặp bài A–B mà N câu hỏi cùng trỏ tới: `level`, `mondai`, `section`, `kind` (`passage`/`cloze`/`notice`/`pair`), `title?`, `body` (markdown; cloze giữ `[1]`…`[n]`), `bodyB?` (bài B), `notes?` (chú thích), `imageUrl?` (bảng dạng ảnh — để trống tới P6 media), `questionCount` (số câu thuộc bài — bộ sinh đề khớp theo số này), `rights`, `sourceRef`, `contentHash` (unique sparse), `createdBy`.
- Bài đọc là **đơn vị bốc** khi sinh đề: lấy nguyên bài, không tách lẻ câu. Admin CRUD ở `exams/admin/stimuli` (guard admin). Sit payload gửi `body` cho người học nhưng không kèm đáp án câu (P4-SEC-01).
- Index: `{level: 1, mondai: 1, rights: 1, questionCount: 1}`.

### `exams` — đề thi tự soạn (P4)
- `title`, `description`, `examType`, `year`, `level`, `timeLimitMin` (1–240, trống = không giới hạn giờ), `questions[]` (ObjectId của `exercise_questions`, có thứ tự), `shuffle {questions, options}`, `status` (`DRAFT` / `PUBLISHED`), `createdBy`.
- Đề theo phần (NP-406): `sections[]` (`{key, title?, timeLimitMin?, questions[]}`) — deadline cộng dồn, deadline tổng = deadline phần cuối; (`generated` đã bỏ — không còn sinh đề).
- Đề theo nguồn (plan-exam-by-source, tất cả tuỳ chọn): `kind` (`full`/`section`/`practice`; vắng = đề soạn tay), `origin {key, setName, sitting, jobIds[]}` (index unique thưa trên `origin.key`), `book {key, title, unitNo, unitTitle, order}`, `rights` (`own`/`licensed`/`reference` — yếu nhất trong các câu; `reference` không công khai được), `sections[].timeLocked`, `warnings[]`. Đề có `origin` không sửa được danh sách câu.
- `exam_import_jobs` thêm `kind`, `setName`; `exam_import_drafts` thêm `unitNo`, `questionIds[]`, `examKey`, `jobCreatedAt`. `exam_attempts` (giai đoạn 2): `mode` (`exam`/`practice`), `checked[]`. Đề có `sections` thì `questions` = nối các `sections[].questions` (giữ để code cũ đọc được).
- Index: `{status: 1, level: 1, examType: 1}`. Câu hỏi tái dùng `exercise_questions`, không có collection câu hỏi riêng.

### `exam_attempts` — lượt làm bài (P4)
- `user`, `exam` + bản chụp `examTitle` / `examType` / `level`; `seed`, `questionOrder[]`, `optionOrder{}` (thứ tự xáo cố định cho lượt này); `startedAtMs`, `deadlineMs` (server quyết định hết giờ), `status` (`in_progress` / `submitted` / `timed_out`).
- Đề theo phần (NP-406): `sectionKeys[]`, `questionSections{}` (qid → phần), `sectionDeadlinesMs{}` (deadline cộng dồn mỗi phần); `sectionScores{}`, `points`, `maxPoints` (chỉ đề có phần).
- Nháp: `answers{}`, `flagged[]`. Kết quả (chỉ ghi khi nộp): `correct{}`, `score`, `total`, `percent`, `submittedAtMs`, `durationSec`.
- Index: unique một lượt `in_progress` mỗi (user, exam); `{user: 1, startedAtMs: -1}`; `{exam: 1, status: 1}`. Làm lại đề tạo attempt mới, không ghi đè.
- Response khi đang làm không chứa đáp án đúng / giải thích (kể cả bài đọc — chỉ `body`); điểm ước tính 0–60 theo phần (`estimateJlptScaled`) chỉ hiện ở màn kết quả.

### `cardreports` — báo lỗi thẻ
- Học viên báo lỗi / gợi ý sửa thẻ của deck chung: `card`, `deck`, `user`, `message`, `suggestion`.
- `kind`: translation / hanviet / example / reading / other. `status`: OPEN / RESOLVED / REJECTED.
- Bản chụp lúc báo: `cardFront`, `cardBack`, `cardHanViet`, `deckTitle`.
- Index: `{card: 1}`, `{status: 1}`, `{user: 1, card: 1, kind: 1, status: 1}`.
- Admin duyệt ở `/admin/reports` (`GET/PATCH /flashcards/admin/card-reports`).

### `reading_overrides` — từ điển cách đọc đã học
- `word` (từ tiếng Nhật, khoá tra cứu), `readings[]` (hiragana; một từ giữ được nhiều cách đọc), `updatedAt`.
- `readingMeanings[]` (`{reading, meaning}`, tuỳ chọn): nghĩa của thẻ lúc bấm "Bỏ qua", gắn với cách đọc đó; dùng khi kiểm tra cả deck để báo cách đọc hợp lệ nhưng thuộc nghĩa khác (人気: にんき / ひとけ).
- `reading`: trường cũ, luôn bằng `readings[0]`, giữ để đọc được dữ liệu trước khi có `readings[]`.
- Ghi khi người dùng bấm "Bỏ qua" cảnh báo cách đọc: cách đọc trên thẻ được **thêm** vào danh sách, không thay cách đọc cũ. `ReadingService.analyze` ưu tiên bảng này trước kuromoji.
- Collection thô (không có Mongoose schema, không có index riêng).
- Quản lý ở `/admin/reading-overrides`: `GET/DELETE /flashcards/admin/reading-overrides[/:word]`; `DELETE …/:word?reading=` chỉ quên một cách đọc.

### `hanvietchecklogs` — log kiểm tra Hán Việt cả deck
- Mỗi deck một document (`deck` **unique**), ghi đè mỗi lần chạy.
- `deckTitle`, `startedAt`, `finishedAt`, `total`, `finished`, `changes[]` (`{stt, word, oldHanViet, newHanViet}`).
- Xem ở `/learn/decks/:id/log`, `/admin/decks/:id/log` (`GET /flashcards/decks/:id/han-viet-log`).

### `pdfjobs`, `pdfjobpages` — job đọc PDF nền
- `pdfjobs`: `user`, `deck`, `fileName`, `filePath`, `key` (hash file, dùng làm khoá cache OCR), `kind` (pdf / table), `status` (running / done / error), `done` / `total`, `rows`, `columns`, `pageMap`, `pages`, `draft`, `retry`, `error`, `finishedAt`, `importErrors` (dòng bị loại).
- `pdfjobpages`: kết quả từng trang — `job`, `n`, `rows`, `raw`. Index `{job: 1, n: 1}` **unique**.
- File PDF gốc nằm trên đĩa (`IMPORT_JOB_DIR`), không nằm trong Mongo.
- Huỷ / xoá: `DELETE /flashcards/import/jobs/:id`.

### `tatoebasentences` — chỉ mục ví dụ cục bộ
- `_id` (id câu Tatoeba), `ja` (câu tiếng Nhật ≤ 40 ký tự, khoảng 244k câu), `vi` (bản dịch của người, khoảng 6k câu), `hasVi`.
- `tokens[]`: dạng từ điển của các từ nội dung (bỏ trợ từ, trợ động từ, ký hiệu).
- Index: `{tokens: 1, hasVi: -1}`.
- Nạp: `pnpm --filter @nihongo/api tatoeba:import -- --write` (khoảng 35 MB dữ liệu, 80 MB kể cả index). Nguồn Tatoeba, CC BY 2.0 FR.
- Chỉ mục rỗng → hệ thống gọi API tatoeba.org.

## 5. AI, đánh giá và thông báo

### `aiservices` — dịch vụ AI do admin quản lý
- `provider` (gemini / groq / openrouter / nvidia / antigravity hoặc custom), `label`, `modelName`, `rpm`, `enabled`.
- `baseUrl`, `apiFormat`: cho endpoint custom.
- `keyBox`: khoá API **mã hoá AES-256-GCM**; khoá giải mã lấy từ `AI_KEY_SECRET`, không đặt thì dùng `JWT_ACCESS_SECRET`. Không bao giờ trả về client. `keyHint`: 4 ký tự cuối để nhận diện.
- Thứ tự gọi: `taskPriority` (riêng cho từng tác vụ `translate` / `write` / `grammar` / `pronounce`); tác vụ chưa đặt thì dùng `priority` chung. Số nhỏ thử trước.
- Benchmark: `benchByTask` (kết quả mới nhất mỗi tác vụ), `benchHistory` (tối đa 30 lần mỗi tác vụ), `bench` (dạng gộp cũ, còn hiển thị cho translate / write).
- Trạng thái: `status` (ok / cooldown / invalid / error), `lastError`, `lastOkAt`, `cooldownUntil`.

### `aicalllogs` — nhật ký gọi AI
- Mỗi lần gọi một dịch vụ: `serviceId`, `serviceLabel`, `provider`, `modelName`, `endpoint`, `words[]`, `request` / `response` (đã cắt ngắn), `ok`, `status`, `ms`.
- `purpose`:

  | Giá trị | Nghĩa |
  |---|---|
  | `example`, `vocab` | Tạo câu ví dụ |
  | `verify` | Kiểm tra từ vựng (cách đọc / Hán Việt / nghĩa) |
  | `ocr` | Đọc trang PDF |
  | `translate`, `grammar`, `pronounce` | Sân thử `/admin/ai-playground` |
  | `test` | Thử và benchmark dịch vụ |

- Index: `{createdAt: -1}`, `{purpose: 1}`, `{serviceId: 1}`, `{ok: 1}`; **TTL 30 ngày** theo `createdAt`.
- Xem / xoá ở `/admin/ai` (`GET/DELETE /flashcards/admin/ai/logs`).

### `airesultcache` — cache kết quả AI (bền)
- `key` (**unique**; băm theo tác vụ, gồm cả danh sách dịch vụ đã bị bỏ qua), `ja`, `vi`, `matches`, `term`, `kind`, `serviceLabel`, `modelName`.
- Giữ kết quả dịch / ví dụ để không gọi lại AI. Redis, nếu có, là lớp cache nhanh đứng trước.
- Admin xem câu AI đã lưu nhưng chưa gắn vào thẻ: `GET /flashcards/decks/:id/ai-unused`.

### `pushsubscriptions` — đăng ký nhắc ôn tập (Web Push)
- Một document cho mỗi trình duyệt/thiết bị: `user`, `endpoint` (**unique**), khoá `p256dh` + `auth`, `hour` (0–23, mặc định 20), `timezone`, `lastSentDay`, `userAgent`.
- Đăng ký lại cùng `endpoint` (kể cả đăng nhập tài khoản khác) cập nhật bản ghi cũ. Index: `{user: 1}`, `{endpoint: 1}` unique.
- Chỉ hoạt động khi có `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; xem [plans/plan-pwa.md](./plans/plan-pwa.md).

### `eval_datasets`, `eval_cases`, `eval_runs`, `eval_calls`, `eval_results` — benchmark AI tiếng Nhật
- Bộ dữ liệu (1000 case), mỗi lần chạy, từng lần gọi và kết quả chấm; trang `/admin/ai-eval`. Xem [plans/plan-eval-benchmark.md](./plans/plan-eval-benchmark.md).

## 5b. Hạn mức & gói (entitlements)

Ba collection, chỉ hoạt động khi có `MONGODB_URL` (graceful-degrade như mọi module). Sửa `featureconfigs` có hiệu lực **ngay** ở request kế tiếp — không cần deploy.

### `featureconfigs` — cấu hình hạn mức theo tính năng (P5-QUOTA-01)
- `featureKey` (**unique**, vd `ai-sentence-grade`): tính năng bị đo. **Không có document = tính năng không bị gate** (guard pass-through) — tính năng mới chạy được trước khi có config.
- `enabled`: kill-switch toàn cục (vd AI provider sập).
- `limits[]`: tối đa 3 bản ghi `{plan, limit}` theo `users.plan` (FREE / PRO / VIP). `limit` = số lượt trong một kỳ; `null` = không giới hạn; **không có dòng của gói nào = gói đó không có quyền (403)**; `0` = có quyền nhưng chặn ngay lượt đầu (429).
- `period`: `DAY` | `MONTH` (chu kỳ tính hạn mức). `tz`: zone IANA (mặc định `Asia/Ho_Chi_Minh`) neo rìa kỳ — khác rìa ngày SRS là có chủ đích.
- `overLimit`: `BLOCK` (vượt mức → 429) | `ALLOW` (cho vượt, đánh dấu `overLimit` trên reservation để ghi nhận / tính phí sau — P9).
- Xem / sửa: `GET|POST /admin/entitlements/features[/:key]`, UI `/admin/entitlements`.

### `quotareservations` — sổ đặt trước (P5-QUOTA-02)
- Mỗi lượt chạy tốn tài nguyên: `user`, `featureKey`, `period` (vd `2026-05`), `amount` (mặc định 1), `state` (`RESERVED` → `SETTLED` / `RELEASED`), `reason` (tại sao rời `RESERVED`: `settled` / `job-failed` / `job-cancelled` / `user-deletion` / `admin-reversal`).
- Chỉ `RESERVED` + `SETTLED` tính vào hạn mức (chưa release). Index: `{user: 1, featureKey: 1, period: 1, state: 1}` (hot path "đã dùng bao nhiêu kỳ này"), `{createdAt: -1}`.
- Vòng đời: **reserve** (đặt trước trước khi chạy — `QuotaGuard`) → **settle** khi job thành công / **release** khi fail-huỷ (`QuotaInterceptor`), cả hai idempotent. Job crash giữa chừng để lại reservation `RESERVED` — vẫn chiếm quota (an toàn, không ai được dùng thừa); xoá tài khoản thì `user-deletion`.

### `usagerecords` — lượt đã tiêu thụ (báo cáo / tính phí)
- Bản ghi mirror mỗi reservation `SETTLED`: `user`, `featureKey`, `period`, `amount`, `reservation` (ObjectId trỏ về). Index `{user: 1, featureKey: 1, period: 1}`. Trả lời "tiêu thụ thật của kỳ này" không cần quét lại reservations; nền cho P9-BILL.

Trục `user.plan` vs `role`: `role` (USER/ADMIN/SUPER_ADMIN) là trục **quản trị** (`@Roles`); `plan` (FREE/PRO/VIP) là trục **quyền học tập** (entitlements guards). Hai trục độc lập, không thay thế nhau. Admin / Super admin luôn được miễn đo đếm quota.

## 6. Nhật ký và chặn IP

Chỉ hoạt động khi có `MONGODB_URL`. Truy vấn qua `GET /admin/logs*` (ADMIN / SUPER_ADMIN), giao diện ở `/admin/logs`.

| Collection | Nội dung | Index | Tự xoá |
|---|---|---|---|
| `requestlogs` | Mỗi request HTTP đã kết thúc | `{createdAt: -1}`, `{status: 1, createdAt: -1}`, `{ip: 1, createdAt: -1}` | 30 ngày |
| `applogs` | Dòng log Nest (`log` / `warn` / `error`) và exception | `{createdAt: -1}`, `{level: 1, createdAt: -1}` | 30 ngày |
| `auditlogs` | Thao tác ghi (không phải GET) trên route có `@Roles` | `{createdAt: -1}`, `{actor: 1}` | 365 ngày |
| `blockedips` | IP bị chặn, thủ công hoặc tự động | `{ip: 1}` **unique** | theo `expiresAt`; không có = vĩnh viễn |
| `allowedips` | IP không bao giờ bị chặn | `{ip: 1}` **unique** | — |
| `system_samples` | Mẫu CPU / RAM / ổ đĩa (% dùng) của máy chạy API, 5 phút một mẫu: `{at, cpu, ram, disk?}`. Giao diện `/admin/system`, `GET /admin/system/history` trả trung bình theo bucket | `{at: 1}` | 400 ngày |

Chi tiết từng loại:

- **`requestlogs`:** method, `path` (không kèm query), `query`, status, ms, user, IP, `error`; `reqHeaders` / `reqBody` / `resHeaders` / `resBody` đã lọc secret và giới hạn kích thước. `ipv4` do client tự báo — chỉ để hiển thị, có thể giả. `::1` hiển thị là `127.0.0.1`.
- **`applogs`:** stack, request, user, IP, `details` (khoá nhạy cảm thay bằng `[redacted]`). 5xx ghi mức `error`; 4xx ghi mức `warn`, trừ 401 / 403 / 404 / 429 (bật hết bằng `LOG_4XX_ALL=true`).
- **`auditlogs`:** ai, khi nào, path, body đã lọc, thành công / thất bại.

## 7. Redis (tuỳ chọn)

Không phải collection. Mọi khoá của app nằm dưới tiền tố `np:`:

| Khoá | Nội dung |
|---|---|
| `np:ai:task:*` | Request AI đang chạy |
| `np:ai:queue` | Thẻ đang đợi |
| `np:ai:res:*` | Kết quả đã lưu |

Xem / xoá ở `/admin/redis`. Thiếu `REDIS_URL` → bỏ qua, chỉ dùng Mongo.

## 8. Chưa triển khai

Dự kiến theo đặc tả; tên và cấu trúc sẽ chốt khi làm.

| Nhóm | Collection dự kiến | Ghi chú |
|---|---|---|
| Bài tập / đề thi | `exercise_attempts`, `exam_attempts` | Câu trả lời, điểm, thời gian, giải thích |
| Media | `media_assets`, `transcripts`, `transcript_segments`, `sentence_analyses`, `ai_jobs` | Chỉ lưu metadata; file ở object storage; quota đặt trước rồi quyết toán |
| Thuê bao | `subscription_plans`, `user_subscriptions`, `payments`, webhook events, usage records | Chưa chọn nhà cung cấp thanh toán; quyền lợi gói tách khỏi role |
| Phản hồi | `feedback` | Trạng thái xử lý + lịch sử |
| Quảng cáo | cấu hình placement / cờ bật tắt | Chỉ lưu cấu hình; mặc định tắt |

Chưa quyết định (thuộc chủ sản phẩm, xem [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)):

- Nhà cung cấp thanh toán, tiền tệ, chính sách hoàn tiền.
- Giới hạn media (500 MB / 60 phút / 1080p / 30 ngày chỉ là giá trị thử nghiệm).
- RPO / RTO (gợi ý 24h / 8h, chưa cam kết).

## 9. Xoá tài khoản

`DELETE /users/me` (`apps/api/src/users/account-deletion.service.ts`) — quyền xoá theo Luật BVDLCN 91/2025/QH15, App Store 5.1.1(v), Google Play Data Deletion. Body: `{confirm: "XOA TAI KHOAN", password?}`; tài khoản có `passwordHash` bắt buộc gửi đúng mật khẩu (tài khoản chỉ Google chỉ cần cụm xác nhận).

**Chặn SUPER_ADMIN:** vai trò đọc từ DB (không tin claim token) → 403. Gateway UI `app/api/account/route.ts` chặn lần nữa; trang `/account` không render nút. SUPER_ADMIN chỉ bị gỡ bởi người vận hành có quyền DB.

| Collection | Xử lý |
|---|---|
| `flashcarddecks` (personal, `user` = người xoá) | xoá; kèm `flashcards` của deck, `usercardprogresses` + `cardreports` trỏ vào các thẻ đó (kể cả của người khác), `hanvietchecklogs` của deck |
| `usercardprogresses`, `studysessions`, `cardreports`, `pushsubscriptions`, `userfeedbacks` | xoá theo `user` |
| `quotareservations`, `usagerecords` | xoá theo `user` (sổ quota cá nhân, P5) |
| `pdfjobs` (`user` là string), `pdfjobpages` | xoá, kèm file gốc trên đĩa (`filePath`) |
| `authsessions`, `authaccounts`, `users` | xoá (cuối cùng) |
| `auditlogs.actor`, `requestlogs.user` | **ẩn danh** (`$unset`), không xoá — còn giá trị bảo mật, tự hết hạn theo TTL (365 / 30 ngày) |

Deck chia sẻ (`shared: true`) không bị đụng. Kết quả trả về số bản ghi đã xoá theo từng nhóm. Không dùng transaction nhưng các bước đều idempotent và `users` bị xoá **cuối cùng**: lỗi giữa chừng thì user còn nguyên, bấm xoá lại là chạy tiếp. Test: `account-deletion.service.spec.ts`; đã chạy thật qua API + gateway UI với tài khoản USER (xoá 1 deck, 3 thẻ). Chưa test sống ca SUPER_ADMIN (chỉ test đơn vị).
