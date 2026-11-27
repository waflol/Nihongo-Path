# Plan — Học 3 trụ cột (Từ vựng · Ngữ pháp · Kanji)

> **Ngày lập:** 27/11/2026. **Trạng thái:** Đã chốt hướng thiết kế với chủ sản phẩm, chờ triển khai.
> **Mục tiêu:** Tổ chức lại trải nghiệm học cốt lõi của Nihongo-Path thành **3 trụ cột đối xứng** (Từ vựng · Ngữ pháp · Kanji), mỗi trụ cột đều có đủ: **Danh mục/Bộ thẻ + Flashcard học mới + Ôn tập FSRS + Bài tập**.

---

## 1. Bốn quyết định đã chốt (27/11/2026)

1. **Cấu trúc `/learn` theo 3 cụm rõ ràng:** Gom các ô rời rạc trên `/learn` thành 3 cụm chính (**Từ vựng** · **Ngữ pháp** · **Kanji**), mỗi cụm mở ra khu vực riêng có đủ: Tra cứu/Bộ thẻ + Flashcard học mới + Ôn tập + Bài tập. Cụm **Luyện thi JLPT** hợp nhất tại `/learn/exams` (gồm Thi thử tính giờ & Luyện tập theo phần, xem [plan-exam-hub.md](./plan-exam-hub.md)) và **Luyện nghe** (sắp ra mắt) giữ riêng bên dưới.
2. **Có sẵn bộ thẻ mặc định N5–N1 cho Ngữ pháp & Kanji:** Sinh/đồng bộ sẵn 5 bộ thẻ chung theo cấp `N5`–`N1` từ dữ liệu `grammar_points` và `kanjis` đã `PUBLISHED` để người học vào bấm **Học mới** được ngay, không bắt buộc phải tự lưu từng mục trước; đồng thời vẫn giữ nút lưu/tạo bộ thẻ cá nhân.
3. **Bài tập gắn SRS + Luyện tự do:** Phần Bài tập của cả 3 mảng ưu tiên lấy các từ/mẫu/chữ **vừa học hôm nay + đến hạn ôn SRS** (qua `exercise-priority`), kèm nút chuyển sang **Luyện tự do theo cấp N5–N1 / bộ thẻ** khi chưa có thẻ đến hạn hoặc muốn luyện thêm. Câu làm sai có thể lưu/đưa vào hàng đợi ôn.
4. **Tách hạn mức & bộ đếm FSRS theo từng mảng (`pillar`):** Tách riêng hạn mức thẻ mới mỗi ngày (`newCardsPerDay`) và bộ đếm **Đến hạn ôn** (`dueCount`, `queue`, `stats`, `exercise-priority`) cho 3 mảng `vocab` · `grammar` · `kanji`, để học mảng này không làm cạn quota thẻ mới của mảng kia.

---

## 2. Kiến trúc dữ liệu & FSRS tách kênh (`pillar` / `kind`)

### 2.1. Schema Flashcard & Deck

- **`Flashcard` (`apps/api/src/flashcards/schemas/card.schema.ts`):**
  - Mở rộng `CARD_KINDS`: `["VOCABULARY", "GRAMMAR", "KANJI", "CUSTOM"]`.
  - Thêm `kanji?: Types.ObjectId | null` (`ref: "Kanji"`).
  - Quy ước ánh xạ `pillar`:
    - `vocab`: `kind` thuộc `["VOCABULARY", "CUSTOM"]` (tương thích ngược với toàn bộ thẻ từ vựng đã tạo/import trước đây).
    - `grammar`: `kind === "GRAMMAR"`.
    - `kanji`: `kind === "KANJI"`.
- **`FlashcardDeck` (`apps/api/src/flashcards/schemas/deck.schema.ts`):**
  - Thêm `pillar?: "vocab" | "grammar" | "kanji"` (mặc định `"vocab"` cho deck cũ) và `systemKey?: string` (unique thưa, ví dụ `grammar:N5`…`grammar:N1`, `kanji:N5`…`kanji:N1`) cho các bộ thẻ chung mặc định.

### 2.2. Đồng bộ bộ thẻ mặc định N5–N1

- **Kanji:** 5 bộ thẻ chung `Kanji N5` … `Kanji N1` (`shared: true, status: "PUBLISHED", pillar: "kanji", systemKey: "kanji:N5"…`). Khi kanji `PUBLISHED` (hoặc chạy đồng bộ admin/startup idempotent), upsert thẻ `kind: "KANJI"` theo thứ tự `rank`, `kanji: doc._id`, `front` = chữ kanji, `back` = Hán Việt + nghĩa Việt, `reading` = on/kun chính, `hanViet` = âm Hán Việt.
- **Ngữ pháp:** 5 bộ thẻ chung `Ngữ pháp N5` … `Ngữ pháp N1` (`shared: true, status: "PUBLISHED", pillar: "grammar", systemKey: "grammar:N5"…`). Khi mẫu ngữ pháp `PUBLISHED`, upsert thẻ `kind: "GRAMMAR"`, `grammar: doc._id`, giữ nguyên markup sạch để UI render bằng `JaText` (không lộ chuỗi thô `漢[かん]` hay `{…}`).
- Cập nhật nội dung thẻ mặc định luôn giữ nguyên `_id` thẻ để không làm mất tiến độ `UserCardProgress` của người học.
- Người học vẫn dùng nút "Lưu vào bộ thẻ" để gom từ/mẫu/chữ khó vào bộ cá nhân (`Từ vựng của tôi`, `Ngữ pháp của tôi`, `Kanji của tôi`).

### 2.3. Tách hạn mức & bộ đếm FSRS theo mảng

- **`User` (`apps/api/src/users/schemas/user.schema.ts`):**
  - Giữ `newCardsPerDay` (mặc định `20`) cho `vocab` để tương thích ngược.
  - Thêm `newCardsPerDayByPillar?: { vocab: number; grammar: number; kanji: number }` (mặc định `{ vocab: 20, grammar: 10, kanji: 15 }`).
- **`SrsService` & `SrsController`:**
  - `GET /srs/queue/:deckId`: nhận `?pillar=vocab|grammar|kanji` (hoặc suy từ `kind` / `deck.pillar`). Khi tính `introducedToday`, chỉ đếm các thẻ mới đã học hôm nay **cùng `pillar`**.
  - `GET /srs/due-count`: trả `{ total, vocab, grammar, kanji }` (hỗ trợ `?pillar=`).
  - `GET /srs/exercise-priority`: hỗ trợ `?pillar=vocab|grammar|kanji` để trả đúng thẻ học hôm nay + đến hạn của mảng đó.
  - `GET /srs/stats`: hỗ trợ `?pillar=vocab|grammar|kanji` cho biểu đồ tiến độ từng mảng hoặc tổng hợp.
  - `PATCH /srs/settings`: cho phép cập nhật hạn mức thẻ mới/ngày theo từng `pillar`.

---

## 3. Cấu trúc điều hướng & UI đồng nhất

### 3.1. Trang tổng quan `/learn` (`apps/ui/app/learn/page.tsx`)

- **Hàng trên (3 khối trụ cột chính):**
  1. **Từ vựng** — hiển thị số thẻ mới còn lại hôm nay + badge số thẻ đến hạn ôn; bấm vào mở `/learn/vocab`, kèm nút tắt nhanh `Học mới` · `Ôn tập` · `Bài tập`.
  2. **Ngữ pháp** — hiển thị tiến độ học mới & số thẻ đến hạn; bấm vào mở `/learn/grammar`, kèm nút tắt nhanh `Học mới` · `Ôn tập` · `Bài tập`.
  3. **Kanji** — hiển thị tiến độ học mới & số thẻ đến hạn; bấm vào mở `/learn/kanji`, kèm nút tắt nhanh `Học mới` · `Ôn tập` · `Bài tập`.
- **Hàng dưới (Luyện thi & mở rộng):**
  - `Luyện thi JLPT` (`/learn/exams` — gộp `/learn/exam` vào tab Luyện tập theo phần; xem [plan-exam-hub.md](./plan-exam-hub.md))
  - `Luyện nghe` (Sắp ra mắt — Sprint 6)

### 3.2. Ba khu vực đối xứng

| Mảng | Danh mục / Bộ thẻ | Flashcard học mới | Ôn tập (FSRS) | Bài tập |
|---|---|---|---|---|
| **Từ vựng** | `/learn/vocab` (và `/learn/decks`, `/learn/import`) | `/learn/vocab/study` (giữ redirect từ `/learn/study`) | `/learn/vocab/review` (giữ redirect từ `/learn/review`) | `/learn/vocab/exercises` (giữ redirect từ `/learn/exercises`; toggle *SRS hôm nay/đến hạn* ↔ *Luyện tự do theo bộ*) |
| **Ngữ pháp** | `/learn/grammar` (tra cứu N5–N1, chủ đề, bối cảnh, giáo trình) | `/learn/grammar/study` (mặc định deck `Ngữ pháp N5–N1` + lọc; render `JaText`) | `/learn/grammar/review` (`StudySession` `mode="review"`, `pillar="grammar"`) | `/learn/grammar/practice` (toggle *SRS hôm nay/đến hạn* ↔ *Luyện tự do N5–N1*; 4 dạng: chọn nghĩa, chọn cấu trúc, điền mẫu, chọn câu đúng) |
| **Kanji** | `/learn/kanji` (tra cứu N5–N1, Hán Việt, nhóm 20 chữ, chi tiết nét viết) | `/learn/kanji/study` (mặc định deck `Kanji N5–N1`; mặt thẻ có nét viết KanjiVG, Hán Việt, on/kun, liên tưởng, từ liên quan) | `/learn/kanji/review` (`StudySession` `mode="review"`, `pillar="kanji"`) | `/learn/kanji/practice` (toggle *SRS hôm nay/đến hạn* ↔ *Luyện tự do N5–N1*; 4 dạng: chọn Hán Việt/nghĩa, chọn on/kun, chọn chữ Kanji dùng nhiễu `kanji-lookalikes`, gõ đáp án) |

Mỗi khu vực có thanh điều hướng 4 tab đồng nhất ở đầu trang: `Danh mục / Bộ thẻ` · `Học mới` · `Ôn tập` · `Bài tập`.

---

## 4. Lộ trình triển khai theo giai đoạn

### Giai đoạn 1 — Nền tảng dữ liệu, Deck mặc định & Tách kênh FSRS (Backend)
- Mở rộng `Flashcard` (`KANJI`, `kanji` ref), `FlashcardDeck` (`pillar`, `systemKey`), `User` (`newCardsPerDayByPillar`).
- Service đồng bộ idempotent 5 deck `Kanji N5–N1` và 5 deck `Ngữ pháp N5–N1` từ dữ liệu `PUBLISHED`.
- Cập nhật `SrsService` & `SrsController` hỗ trợ `pillar` trên `queue`, `due-count`, `exercise-priority`, `stats`, `settings`.
- Bổ sung unit/integration spec cho tách quota theo `pillar` và đồng bộ deck hệ thống.

### Giai đoạn 2 — Trang chủ `/learn` 3 trụ cột & Khu Từ vựng chuẩn hoá
- Thiết kế lại `/learn/page.tsx`, `DueButton`, `TodayStrip` theo 3 cụm trụ cột + khu Luyện thi.
- Tổ chức `/learn/vocab/*` với thanh điều hướng 4 tab, giữ redirect từ `/learn/study`, `/learn/review`, `/learn/exercises`.
- Thêm toggle *Ưu tiên SRS* ↔ *Luyện tự do* cho Bài tập Từ vựng.

### Giai đoạn 3 — Hoàn thiện Học Ngữ pháp (Flashcard mới + Ôn tập + Bài tập)
- Render sạch markup `JaText` trên thẻ Flashcard ngữ pháp; nối `/learn/grammar/study` với deck mặc định `Ngữ pháp N5–N1`.
- Tạo `/learn/grammar/review` cho ôn tập FSRS riêng của Ngữ pháp.
- Nâng cấp `/learn/grammar/practice` nối `exercise-priority?pillar=grammar` + chế độ Luyện tự do N5–N1, 4 dạng bài, lưu câu sai vào hàng đợi ôn.

### Giai đoạn 4 — Hoàn thiện Học Kanji (Flashcard mới + Ôn tập + Bài tập)
- Nâng cấp `StudySession` hỗ trợ mặt thẻ `kind === "KANJI"` (nét viết KanjiVG, Hán Việt, on/kun, liên tưởng, từ liên quan) + nút lưu Kanji vào bộ cá nhân ở `/learn/kanji/[char]`.
- Tạo `/learn/kanji/study` và `/learn/kanji/review`.
- Xây dựng `/learn/kanji/practice` gắn `exercise-priority?pillar=kanji` + Luyện tự do N5–N1, dùng `kanji-lookalikes` tạo đáp án nhiễu.

---

## 5. Ticket liên kết

- **Nền tảng & Từ vựng:** `NP-1013` (Tách kênh FSRS & deck mặc định N5–N1), `NP-1014` (`/learn` 3 trụ cột & chuẩn hoá khu Từ vựng).
- **Ngữ pháp:** `NP-1008` (FSRS & deck mặc định Ngữ pháp), `NP-1010` (Flashcard học mới & Ôn tập Ngữ pháp), `NP-1011` (Bài tập Ngữ pháp).
- **Kanji:** `NP-1015` (Flashcard học mới & Ôn tập Kanji), `NP-1016` (Bài tập Kanji).
