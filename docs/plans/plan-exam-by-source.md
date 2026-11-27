# Plan — Đề thi theo nguồn: đề đầy đủ, đề theo phần, sách luyện tập (bỏ ngân hàng câu hỏi)

> **Ngày lập:** 27/11/2026. **Trạng thái:** chủ dự án đã duyệt 27/11/2026 (gồm 3 đề xuất ở §8). Xong giai đoạn 0 và 1.1–1.5 (đã kiểm các màn chính trên Chrome Live); tiếp theo giai đoạn 2 (sách luyện tập).
> **Thay thế:** các phần ngân hàng / sinh đề của [plan-jlpt-question-bank.md](./plan-jlpt-question-bank.md) (NP-408, và phần "phủ ngân hàng / sinh đề thử" của NP-409). Phần schema, import (NP-406/407) và màn làm bài vẫn dùng.
> **Điều kiện bắt đầu:** working tree đang có nhiều thay đổi NP-407/410 và trang cấu trúc đề chưa commit, đụng đúng các file plan này sửa (`exam-import.service.ts`, `exams.service.ts`, `exams.controller.ts`, hai `exams-console.tsx`). Commit xong phần đó rồi mới làm.

## 1. Mục tiêu

Mỗi file PDF tải lên cho ra **đề thi** hoặc **bài luyện** giữ đúng thứ tự bản in. Mỗi câu hỏi thuộc về nguồn của nó. Không còn ngân hàng để admin nhặt câu, không sinh đề ngẫu nhiên.

| | Đề đầy đủ (`full`) | Đề theo phần (`section`) | Sách luyện tập (`practice`) |
|---|---|---|---|
| 1 file ra | mỗi kỳ thi 1 đề | mỗi kỳ thi 1 đề, chỉ các phần có trong file | 1 sách, nhiều bài |
| Thời gian | theo phần thi của cấp độ | theo các phần có mặt | không giới hạn |
| Chấm | sau khi nộp, điểm từng phần | sau khi nộp, điểm phần đó | ngay từng câu |
| Xáo trộn | tắt | tắt | tắt |

Ngoài phạm vi: lời giải ở cuối sách; sách có bố cục khác `drill` và khác đề thi (bộ tách riêng); điểm quy đổi cho đề theo phần.

## 2. Ràng buộc

- Repo **PUBLIC**: không commit nội dung đề; fixture tự viết.
- VPS 4 GB, không swap: chạy test/typecheck lần lượt.
- Đáp án và lời giải không nằm trong sit payload (P4-SEC-01). Ở chế độ luyện tập, chỉ trả đáp án của **câu đã chốt**.
- Đề phẳng đang có (không `kind`, không `sections`) làm bài, chấm, xem lại như cũ.
- Giữ collection `exercise_questions`. Hiện chỉ module `exams` đọc/ghi nó (`exams`, `exam-import`, `exam-audio`, `stimuli` service). Không đổi tên, không chuyển dữ liệu.

## 3. Quyết định thiết kế

**D1 — Loại file khai báo lúc upload.** Form nhập thêm `kind` (`full` | `section` | `practice`) và `setName` (tên bộ đề / tên sách, mặc định là tên file). Với `practice`: bố cục drill → `segmentDrillBook`; bố cục khác → tách theo 問題 như đề, mỗi khối là một bài. Với hai loại đề: không dùng bộ tách drill. `isDrillBook` chỉ còn là cảnh báo khi loại khai báo có vẻ sai.

**D2 — `kind` của đề đề được tính từ nội dung.** `full` khi đề có đủ mọi phần thi của cấp độ theo `JLPT_STRUCTURE` (`jlpt-structure.ts`), ngược lại `section`. Phần gộp của N1/N2 chỉ tính là đủ khi có cả 文字・語彙, 文法 và 読解. Loại admin chọn chỉ quyết định cảnh báo (vd chọn "đầy đủ" mà thiếu 聴解). Thiếu vài câu trong một phần không đổi `kind`, chỉ cảnh báo.

**D3 — Khoá đề.** `origin.key = level | setName (chuẩn hoá) | sitting`. Cùng khoá → cùng đề, nên file 文字・語彙 và file 聴解 cùng `setName` + kỳ gộp làm một. Hai sách khác nhau đều có `N3-1` không đụng nhau vì khác `setName`. `sitting = "unknown"` → bắt admin đặt tên trước khi xuất bản. Với `practice`: `level | setName | mondai | unitNo` (số `第N回` lặp lại theo từng dạng).

**D4 — Xuất bản draft = ghi câu hỏi + đồng bộ đề.**
- `dedupeKey = imp:<draftId>:<q.no>`; bài đọc cũng theo `draftId + key`. Bỏ tra `contentHash` toàn cục (hiện `if (exists) continue` làm đề sau thiếu câu). Cả hai collection có index **unique** trên `contentHash`, nên hash của bản nhập được tính kèm `draftId` (không phải đổi index).
- Draft lưu `questionIds[]` sau khi ghi. Ghi bằng upsert theo `dedupeKey` để chạy lại sau lỗi giữa chừng không nhân đôi.
- Sau đó dựng lại `sections` + `questions` của đề từ **mọi draft đã xuất bản cùng khoá** (hàm thuần, chạy bao nhiêu lần cũng ra một kết quả).
- Hai lần nhập cùng phủ một 問題: draft của job mới nhất thắng. Nhiều khối cùng 問題 trong một job thì nối theo `blockIndex`.
- Câu cũ không xoá (lượt làm cũ còn trỏ tới). Draft đã xuất bản vốn không sửa được, nên không phải sửa câu tại chỗ.
- Đề mới ở trạng thái `DRAFT`. Đề đã `PUBLISHED` được cập nhật thì giữ trạng thái; lượt đang làm giữ snapshot câu.

**D5 — Phần và thời gian.** Mỗi câu vào phần thi chứa `mondai` của nó trong `JLPT_STRUCTURE` (`language-reading` | `language` | `grammar-reading` | `listening`); không có `mondai` thì suy từ `section` + cấp độ. Thứ tự: phần → 問題 → `blockIndex`. Thời gian: phần đủ mọi 問題 lấy `timeMin`; phần thiếu lấy theo tỉ lệ số câu (làm tròn lên, tối thiểu 5, tối đa `timeMin`). Admin sửa được, và đồng bộ lại không ghi đè giá trị đã sửa.

**D6 — Sách luyện tập tái dùng `Exam` + `ExamAttempt`.** Một bài = một `Exam` `kind: "practice"` có `book`. Không tạo collection sách. Chấm từng câu bằng endpoint mới; câu đã chốt không đổi được.

**D7 — Quyền sử dụng** *(đã duyệt — §8)*. Đề mang `rights` yếu nhất trong các câu. Đề `reference` không công khai được (`adminUpdateExam` từ chối `PUBLISHED`; `listExams` và `start` lọc cho người học). Admin vẫn xem thử.

## 4. Schema

```ts
// exams — thêm, đều optional
kind?: "full" | "section" | "practice"     // vắng = đề soạn tay kiểu cũ
origin?: { key: string; setName: string; sitting: string; jobIds: string[] }   // index unique sparse trên origin.key
book?: { key: string; title: string; unitNo: number; unitTitle: string; order: number }
rights?: "own" | "licensed" | "reference"
sections[].timeLocked?: boolean            // admin đã sửa thời gian
warnings?: string[]                        // cảnh báo của lần dựng đề gần nhất

// exam_import_jobs
kind: "full" | "section" | "practice"      // job cũ: coi như "full"
setName: string

// exam_import_drafts
unitNo?: number                            // số 第N回
questionIds?: ObjectId[]                   // điền khi xuất bản
examKey?: string                           // đề chứa khối (= origin.key)
jobCreatedAt?: Date                        // giữ lại vì job có thể bị xoá; xoá job không xoá draft đã xuất bản

// exam_attempts
mode?: "exam" | "practice"                 // vắng = exam
checked?: string[]                         // qid đã chốt (practice)
```

`generated` trên `Exam` bỏ khỏi code (chưa có chỗ nào ghi).

## 5. Giai đoạn 0 — Kiểm dữ liệu (chỉ đọc)

Đếm: draft `published`, câu có `dedupeKey` bắt đầu `imp:`, đề đang tham chiếu chúng, đề `PUBLISHED` chứa câu `reference`. Cách đọc DB: script Node chạy với `--env-file`, chỉ `find`/`count`.

- Không có draft đã xuất bản → bỏ qua chuyển đổi.
- Có → hỏi chủ dự án: (a) xoá và nhập lại, hoặc (b) script điền `questionIds` bằng cách tính lại `contentHash` rồi tạo đề. Không tự xoá dữ liệu.

**Kết quả 27/11/2026:** 0 draft `published` (518 `needs_review`, 142 `error`), 0 đề, 0 bài đọc → **không cần chuyển đổi**. Còn 44 câu `imp:` (trong 175 câu) không đề nào trỏ tới; để nguyên. Có 3 lượt làm cũ dù không còn đề.

## 6. Giai đoạn 1 — Đề đầy đủ và đề theo phần

Mỗi bước: test xanh, lint + watcher tsc sạch, cập nhật HANDOFF, commit riêng.

**1.1 Lắp đề (hàm thuần)**
- Tạo `apps/api/src/exams/assemble.ts`: `examKeyOf()`, `partOf(level, mondai, section)`, `assembleExam(level, drafts, previous?) → {sections, questions, kind, warnings}`.
- Test `assemble.spec.ts`: N3 đủ 3 phần → `full`; thiếu nghe → `section` + cảnh báo; gộp 2 job; job mới thắng; thứ tự đúng bản in; thời gian theo tỉ lệ; giữ `timeLocked`; chạy hai lần ra một kết quả.

**1.2 Upload + xuất bản**
- `exam.schema.ts`, `import-job.schema.ts`, `import-draft.schema.ts`: trường ở §4.
- `exam-import.controller.ts`: nhận `kind`, `setName`; `POST :jobId/publish-exam {sitting}` xuất bản mọi khối đủ đáp án của một kỳ rồi đồng bộ **một lần**; `PATCH :jobId` đổi `setName` / tên kỳ khi chưa xuất bản khối nào.
- `exam-import.service.ts`: `publish` theo D4; `syncExam(key)`; trả `{examId, questions, warnings}`. Khoá theo `origin.key` trong process để hai lần xuất bản song song không ghi đè nhau.
- `segment.ts` / `runJob`: chọn bộ tách theo `kind` (D1).
- Test: hai đề trùng một câu → cả hai đủ câu; xuất bản lại không nhân đôi; lỗi giữa chừng rồi chạy lại ra đúng.

**1.3 Quản lý đề + quyền**
- `exams.service.ts` / `exams.controller.ts`: `adminListExams` trả `kind`, `origin`, cảnh báo; đề có `origin` thì từ chối sửa `questionIds`; sửa thời gian từng phần; áp D7; `listExams` trả `kind`, lọc `?kind`.
- Soạn câu tay chuyển vào trong đề: `POST admin/exams/:id/questions` (giữ kiểm tra của `adminAuthorQuestion`).
- Test: đề `reference` không công khai được và người học không `start` được; đề phẳng cũ không đổi.

**1.4 UI**
- `exam-import-form.tsx`: chọn loại (3 nút), ô tên bộ đề.
- `exam-import-drafts.tsx`: nút "Xuất bản đề" theo kỳ; hiện cảnh báo thiếu phần / thiếu câu; link tới đề.
- `components/admin/exams-console.tsx`: bỏ tab "Ngân hàng câu hỏi" và trình chọn câu; danh sách đề theo loại, trạng thái, nguồn.
- `components/learn/exams-console.tsx`: lọc "Đề đầy đủ" / "Theo phần"; thẻ đề ghi các phần có mặt.
- Kiểm trình duyệt: nhập → duyệt → xuất bản đề → làm bài → xem kết quả, cả màn 375 px.

**1.5 Dọn tài liệu**
- `plan-jlpt-question-bank.md`, `TICKETS.md`, checklist: đóng NP-408 (không làm), thu hẹp NP-409; `database.md` mô tả trường mới.
- Thêm ADR ngắn: bỏ ngân hàng + sinh đề, lý do.

## 7. Giai đoạn 2 — Sách luyện tập

- `drill.ts`: giữ số `第N回` vào `Block.unitNo`; hiện `sitting` luôn `"unknown"`, với `practice` không đòi tên kỳ. Không nhận được số → đánh số theo thứ tự và cảnh báo.
- `assemble.ts`: nhóm draft theo `mondai + unitNo` thành các bài; đề không `timeLimitMin`.
- `exams.service.ts`: `start` đặt `mode: "practice"`; `POST attempts/:id/check {qid, answer}` ghi đáp án + `checked` bằng một update có điều kiện, trả `{correct, correctIndex, explain}`; `saveDraft`/`submit` không đổi được câu đã chốt; "làm lại câu sai" tạo lượt mới chỉ gồm câu sai; thống kê đề thi loại `practice` ra.
- UI: khu "Sách luyện tập" (sách → bài → tiến độ), màn làm từng câu.
- Test: payload không có đáp án của câu chưa chốt (duyệt đệ quy); chốt hai lần không đổi kết quả; không chốt được câu của người khác.

## 8. Đã quyết (27/11/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Đề `reference` (mặc định khi nhập) có cho người học làm không? | Không, tới khi chốt Q-12. Hệ quả: đề nhập từ sách ngoài chỉ admin thấy. |
| 2 | Soạn câu thủ công còn giữ không? | Giữ, soạn trong một đề. |
| 3 | Phần thi thiếu 問題 tính giờ thế nào? | Theo tỉ lệ số câu, admin sửa được. |

## 9. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Tên kỳ đọc sai → đề tách đôi hoặc gộp nhầm | Hiện khoá đề trước khi xuất bản, cho sửa; test khoá |
| Nhập lại đè đề đang công khai bằng bản kém hơn | Hộp xác nhận ghi số 問題 sẽ bị thay |
| Số câu trong `JLPT_STRUCTURE` chỉ là 目安 và chưa đối chiếu hết | Chỉ cảnh báo, không chặn xuất bản |
| Sách thật có bố cục khác dự đoán | Thử một sách thật trước khi làm UI giai đoạn 2 |

## 10. Hoàn thành khi

- [ ] Một PDF nhiều kỳ ra đúng số đề, đúng thứ tự in, không thiếu câu kể cả khi trùng nội dung.
- [ ] Hai file cùng kỳ gộp thành một đề.
- [ ] Không còn màn ngân hàng câu hỏi.
- [ ] Đề phẳng cũ chạy y như trước.
- [ ] Sách luyện tập: chốt từng câu, làm lại câu sai.
- [ ] Số đo thật trên một PDF mỗi loại ghi vào ticket.
