# Plan — Khu Luyện thi JLPT hợp nhất: Thi thử (Cố định & Xáo trộn cùng cấp) và Luyện tập theo Phần × Dạng 問題

> **Ngày lập:** 27/11/2026. **Trạng thái:** Chủ dự án đã duyệt hướng thiết kế (27/11/2026), chờ triển khai.
> **Liên kết:** Mở rộng Giai đoạn 2 của [plan-exam-by-source.md](./plan-exam-by-source.md) (sách luyện tập + trộn đề thi thử từ các đề đã xuất bản cùng cấp, vẫn giữ nguyên tắc không có màn quản trị ngân hàng câu hỏi rời) và đồng bộ với [plan-three-pillars.md](./plan-three-pillars.md), [ADR-exam-by-source.md](../adr/ADR-exam-by-source.md).

---

## 1. Mục tiêu & Tổng quan kiến trúc

Tổ chức lại toàn bộ trải nghiệm **Luyện thi JLPT** thành **một khu vực duy nhất** tại `/learn/exams`, xoay quanh **Mức độ muốn thi (`targetLevel`: `N5`–`N1`)** của người học và phân tách rõ ràng hai chế độ:

1. **Thi thử có tính thời gian (`?mode=mock`):**
   - **Thi theo đề cố định:** Đề đầy đủ (`full`) hoặc đề theo phần (`section`) giữ nguyên thứ tự bản in.
   - **Thi dạng xáo trộn từ các đề:** Trộn câu hỏi từ các đề đã công khai **chỉ trong đúng cấp `targetLevel` đã chọn**, lắp đúng cấu trúc phần thi, dạng `問題` và thời gian chuẩn của cấp đó.
2. **Luyện tập theo phần (`?mode=practice`):**
   - Không giới hạn thời gian, chấm và hiện lời giải ngay từng câu.
   - Chia theo **4 kỹ năng lớn (`Từ vựng · Ngữ pháp · Đọc hiểu · Nghe hiểu`)** → bên trong chia sâu theo **đúng các dạng `問題` của `targetLevel` đang chọn**.

### 1.1. Điều hướng trên Khu học tập (`/learn`)
- **Hợp nhất lối vào:** Trên [apps/ui/app/learn/page.tsx](../../apps/ui/app/learn/page.tsx), gộp 2 ô cũ (`Luyện thi 問題` tại `/learn/exam` và `Đề thi có thời gian` tại `/learn/exams`) thành **1 khối Luyện thi JLPT** duy nhất dẫn vào `/learn/exams` (kèm 2 nút tắt nhanh `Thi thử tính giờ` · `Luyện tập theo phần` và badge mức mục tiêu hiện tại).
- **Giữ tương thích đường dẫn:** `/learn/exam` tự động chuyển hướng sang `/learn/exams?mode=practice` để không gãy bookmark cũ.

### 1.2. Mức độ muốn thi (`targetLevel`: `N5`–`N1`)
- **Đồng bộ Tài khoản + Trình duyệt:**
  - Mở rộng `User` schema (`targetLevel?: "N5" | "N4" | "N3" | "N2" | "N1"`), `GET/PATCH /users/me`, `PublicUser`, `SessionUser`, proxy `PATCH /api/account` và trang `/account`.
  - Thanh chọn **Mức mục tiêu: `N5 · N4 · N3 · N2 · N1`** đặt cố định ở đầu `/learn/exams`, dùng chung `use-exam-level.ts` (`localStorage` key `jlpt-exam-level`).
  - **Thứ tự ưu tiên khi mở trang:** URL `?level=` → `user.targetLevel` → `localStorage("jlpt-exam-level")` → mặc định `"N3"`.
  - Khi người học bấm đổi cấp trên `/learn/exams`: lọc ngay lập tức cả danh sách đề thi thử lẫn cây dạng bài luyện tập, lưu `localStorage` và đồng bộ nhẹ lên `PATCH /users/me` để giữ đồng nhất giữa các thiết bị.

---

## 2. Chế độ 1 — Thi thử có tính thời gian (`?mode=mock`)

### 2.1. Thi theo đề cố định (Đề gốc chuẩn bản in)
- Hiển thị các đề đã `PUBLISHED` (và `rights !== "reference"`) thuộc `targetLevel` (`kind !== "practice"`).
- Bộ lọc nhanh: `Tất cả` · `Đề đầy đủ` (`full`) · `Đề theo phần` (`section`).
- Giữ nguyên thứ tự bản in (`shuffle: false`), đồng hồ đếm ngược trên máy chủ (`deadlineMs` tổng và `sectionDeadlinesMs` cộng dồn theo từng phần), nộp bài mới chấm và xem giải thích.

### 2.2. Thi dạng xáo trộn từ các đề (`mixExamByStructure`)
Người học bấm **"Tạo đề thi thử xáo trộn (`N5`–`N1`)"**, có thể chọn **Thi cả đề đầy đủ** hoặc **Thi thử 1 phần thi** (ví dụ chỉ `言語知識・読解` hoặc chỉ `聴解`).

#### Các bất biến (Invariants) bắt buộc
1. **Cách ly cấp độ tuyệt đối (Single-Level Invariant):**
   - Khi người học chọn mức `X` (ví dụ `N2`), hệ thống **CHỈ** truy vấn các đề `PUBLISHED` có `exam.level === "N2"` (và kiểm tra kép `question.level === "N2"` / `stimulus.level === "N2"`).
   - **Tuyệt đối không** bốc lẫn câu từ cấp khác (`N1`, `N3`, …) hoặc đề không gắn cấp độ (`level: ""`), kể cả khi kho đề của cấp `X` đang thiếu câu ở một dạng nào đó. Nếu thiếu, trả về danh sách phần/dạng còn thiếu của cấp `X`.
2. **Quyền sử dụng (Q-12 Invariant):**
   - Người học chỉ được bốc từ đề và câu có `rights ∈ ["own", "licensed"]`. Đề/câu `reference` bị loại tuyệt đối (admin có thể truyền `allowReference` để xem thử nội bộ).
3. **Bám chuẩn `JLPT_STRUCTURE[targetLevel]`:**
   - Duyệt đúng các phần thi (`part`) và thứ tự `問題` (`mondai`), số lượng câu (`count`) và thời gian (`timeMin`) của cấp đã chọn trong `jlpt-structure.ts`.
   - **Câu đơn (`USES_STIMULUS = false`):** Bốc đủ `count` câu cùng `mondai`, chống trùng `contentHash`, chống trùng đáp án trong phần từ vựng, ưu tiên câu người học chưa gặp trong các lượt thi gần đây.
   - **Câu gắn bài đọc / nhóm nghe (`USES_STIMULUS = true`):** Bốc **nguyên cụm `stimulusId`** kèm toàn bộ câu hỏi con theo đúng `groupOrder`, không bao giờ cắt rời câu hỏi khỏi bài đọc/đoạn nghe.
   - **Thứ tự phương án:** Câu nghe (`isListeningMondai`) hoặc câu có hình (`image`) luôn giữ nguyên thứ tự phương án `1–4` (`keepsOptionOrder`).

#### Lưu trữ & API
- `GET /exams/mix-availability?level=N2`: Trả trạng thái sẵn sàng theo từng phần thi của cấp `N2` (đủ để trộn hay thiếu bao nhiêu câu ở dạng nào).
- `POST /exams/mix/start` (`{ level, partKeys? }`): Sinh đề tạm gắn `generated: { seed, forUser: caller.sub, level, partKeys }` (ẩn khỏi `listExams` công khai và danh sách quản trị thủ công) rồi khởi tạo `ExamAttempt` (`mode: "exam"`) để dùng chung 100% engine đồng hồ, lưu nháp F5, hết giờ tự chấm, bảng điểm từng phần và ước tính `0–60`.

### 2.3. Lịch sử & Thống kê thi thử
- `GET /exams/attempts` và `GET /exams/stats` mặc định lọc `mode: "exam"` (hoặc vắng `mode` cho dữ liệu cũ) để các bài luyện tập lẻ không làm sai lệch điểm trung bình và chuỗi 30 ngày của phần Thi thử.

---

## 3. Chế độ 2 — Luyện tập theo phần & dạng 問題 (`?mode=practice`)

Không giới hạn thời gian (`deadlineMs: null`), chấm và hiện lời giải ngay sau từng câu.

### 3.1. Cấu trúc 2 tầng theo `targetLevel`
1. **Tầng 1 — 4 tab Kỹ năng (`SectionKey`):**
   - `Từ vựng` (`文字・語彙` — `vocab`)
   - `Ngữ pháp` (`文法` — `grammar`)
   - `Đọc hiểu` (`読解` — `reading`)
   - `Nghe hiểu` (`聴解` — `listening`)
2. **Tầng 2 — Danh sách dạng `問題` (`MondaiType`) của đúng cấp `targetLevel`** (lấy trực tiếp từ `JLPT_STRUCTURE`):

| Phần | N5 | N4 | N3 | N2 | N1 |
|---|---|---|---|---|---|
| **Từ vựng** | `kanji-reading`, `orthography`, `context`, `paraphrase` *(4)* | + `usage` *(5)* | Giống N4 *(5)* | + `word-formation` *(6)* | `kanji-reading`, `context`, `paraphrase`, `usage` *(4)* |
| **Ngữ pháp** | `grammar-form`, `star-order`, `text-grammar` *(3)* | Giống N5 *(3)* | Giống N5 *(3)* | Giống N5 *(3)* | Giống N5 *(3)* |
| **Đọc hiểu** | `reading-short`, `reading-mid`, `info-retrieval` *(3)* | Giống N5 *(3)* | + `reading-long` *(4)* | `reading-short`, `reading-mid`, `reading-integrated`, `reading-thematic`, `info-retrieval` *(5)* | + `reading-long` *(6)* |
| **Nghe hiểu** | `listening-task`, `listening-point`, `listening-utterance`, `listening-quick` *(4)* | Giống N5 *(4)* | + `listening-summary` *(5)* | `listening-task`, `listening-point`, `listening-summary`, `listening-quick`, `listening-integrated` *(5)* | Giống N2 *(5)* |

### 3.2. Nguồn bài & Trải nghiệm làm bài luyện tập
- Trong mỗi `level × section × mondai`:
  - Liệt kê các bài luyện từ sách luyện tập (`Exam` có `kind: "practice"`, `level === targetLevel`, khớp `practiceMeta.section` & `practiceMeta.mondai`), nhóm theo bộ sách và số bài (`第N回` / `unitNo`), kèm tiến độ đã làm.
  - Hỗ trợ **Luyện nhanh 10 câu dạng này** (rút ngẫu nhiên cùng `level === targetLevel` và `mondai`, giữ nguyên cụm `stimulus` nếu có).
  - Riêng phần `vocab`: giữ lối tắt **Luyện từ bộ thẻ Flashcard** (mở nhanh bài luyện từ vựng từ thẻ đã học).
- **Chấm từng câu (`mode: "practice"`):**
  - `POST /exams/attempts/:id/check` (`{ qid, answer }`): Cập nhật có điều kiện (chỉ ghi nếu `qid` chưa nằm trong `checked`), trả `{ correct, correctIndex, explain }`.
  - **Bảo mật (`P4-SEC-01`):** `GET /exams/attempts/:id` chỉ trả `{ correct, correctIndex, explain }` cho các câu đã nằm trong `checked`; câu chưa chốt tuyệt đối không có đáp án trong payload. `saveDraft` và `submit` không được phép sửa đáp án của câu đã nằm trong `checked`.
  - **Làm lại câu sai:** `POST /exams/:id/start` nhận `{ retryWrongFromAttemptId }` tạo lượt luyện tập mới chỉ gồm các câu đã trả lời sai của lượt trước.

---

## 4. Schema & API tổng hợp

```ts
// users
targetLevel?: "N5" | "N4" | "N3" | "N2" | "N1"

// exams (bổ sung cho practiceMeta; giữ origin cho đề nhập, generated cho đề trộn)
practiceMeta?: {
  bookTitle: string;
  section: SectionKey;
  mondai: MondaiType;
  unitNo: number;
  unitTitle?: string;
  order: number;
}
generated?: {
  seed: number;
  level: string;
  partKeys?: string[];
  forUser?: string;
}

// exam_attempts
mode?: "exam" | "practice"     // vắng = "exam"
checked?: string[]             // danh sách qid đã chốt ở chế độ practice
```

- **Endpoints chính:**
  - `GET / PATCH /users/me` (+ `PATCH /api/account`): đọc/lưu `targetLevel`.
  - `GET /exams/mix-availability?level=`: kiểm tra độ phủ từng phần để trộn đề cùng cấp.
  - `POST /exams/mix/start`: tạo và bắt đầu lượt thi thử xáo trộn theo cấu trúc cấp độ.
  - `GET /exams/practice-overview?level=`: trả cây `4 phần → dạng mondai` của cấp đó kèm số bài và tiến độ.
  - `POST /exams/attempts/:id/check`: chốt và chấm 1 câu ở chế độ `practice`.

---

## 5. Lộ trình triển khai & Kiểm thử

1. **Giai đoạn 1 — Mục tiêu cấp độ (`targetLevel`):**
   - Thêm `targetLevel` vào `User`, `UsersService`, `UsersController`, `PublicUser`, `SessionUser`, `PATCH /api/account`, trang `/account` và đồng bộ với `use-exam-level.ts`.
   - Test: validate `targetLevel` chỉ nhận `N5`–`N1`.
2. **Giai đoạn 2 — Bộ trộn đề thi thử cùng cấp (`mixer.ts` + API):**
   - Viết hàm thuần `mixExamByStructure` + `mixer.spec.ts` (khẳng định bất biến 100% cùng `level`, không lấy câu `reference` cho người học, giữ nguyên cụm `stimulus`, giữ thứ tự phương án nghe/hình).
   - Thêm `mix-availability` và `mix/start` trong `ExamsService` / `ExamsController`.
3. **Giai đoạn 3 — Engine Luyện tập theo phần × dạng `問題`:**
   - Hoàn thiện xuất bản sách luyện tập (`kind: "practice"`), `practice-overview`, `attempts/:id/check`, làm lại câu sai, tách `mode` trong `listAttempts`/`stats`.
   - Test: `sit-payload` không lộ đáp án câu chưa chốt, chốt 2 lần idempotent, không sửa được câu đã chốt, thống kê tách biệt `exam` vs `practice`.
4. **Giai đoạn 4 — Giao diện hợp nhất `/learn` & `/learn/exams`:**
   - Gộp ô trên `/learn`, chuyển hướng `/learn/exam` → `/learn/exams?mode=practice`.
   - Thiết kế lại `exams-console.tsx` (thanh chọn `targetLevel` + 2 tab lớn **Thi thử có tính giờ** / **Luyện tập theo phần**) và màn làm bài luyện từng câu.
   - Kiểm chứng lần lượt: `vitest`, `oxlint`, `tsc`, `eslint` và test trình duyệt desktop + mobile 375 px.
