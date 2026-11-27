---
name: ticket-status
description: >-
  Kiểm tra tiến độ ticket hiện tại của Nihongo Path (/ticket-status), hoặc cập nhật đồng bộ
  tiến độ vào checklist, file issue, chỉ mục và TICKETS.md (/ticket-status --update).
  Dùng khi người dùng gọi /ticket-status, hỏi tiến độ ticket, hoặc yêu cầu cập nhật trạng thái ticket.
---

# ticket-status

Tham số người dùng: `$ARGUMENTS` (rỗng = tổng quan). Bộ lọc: `P0..P11`, `done|partial|done-partial|todo|blocked|off-roadmap|wontfix`, `NP-nnn`, `#issue`, `current`.

Nguồn dữ liệu (xem `docs/issues/README.md`):
- `docs/IMPLEMENTATION_CHECKLIST.md`: từng task, cột TT `[x] [~] [ ] [—] ⏸`
- `docs/issues/NP-*.md`: frontmatter `status`/`phase`/`labels` + mục `Còn lại`/`Kết quả`
- `docs/issues/README.md`: chỉ mục + bảng GitHub ↔ file
- `docs/TICKETS.md`: tổng hợp (ngày cập nhật, mốc commit, §1 bảng phase, §2 xong, §3 dở)
- `docs/HANDOFF.md`, `git status`, `git log`: tiến trình hiện tại

Script: `python3 .agents/skills/ticket-status/scripts/ticket_status.py` (chỉ đọc; `--no-gh`, `--json`, `--verify [--strict-head]`).

## Chế độ 1: `/ticket-status [bộ lọc]` — CHỈ ĐỌC

Không sửa file, không đổi issue GitHub.

1. Chạy `python3 .agents/skills/ticket-status/scripts/ticket_status.py $ARGUMENTS`. Nếu `gh` lỗi/chưa đăng nhập, script tự báo và dùng bảng ghép trong README; nói rõ điều đó.
2. Báo cáo ngắn gọn bằng tiếng Việt:
   1. **Tiến trình hiện tại**: ticket đang làm (HANDOFF mới nhất, commit sau mốc TICKETS.md, working tree), phần đã làm và phần "Chưa kiểm / Còn lại".
   2. **Tổng quan theo phase**: bảng Phase | Tổng | ✅ | 🟡 | ⬜ | ⏸ | %.
   3. **Issue GitHub** ghép với file `NP-nnn`.
   4. **Ticket theo file** (ẩn `done`/`off-roadmap` trừ khi lọc), liên kết markdown tương đối, ví dụ `[NP-407](docs/issues/NP-407.md)`.
   5. **Lệch dữ liệu** giữa các nguồn (nếu có) và gợi ý chạy `/ticket-status --update`.
   6. **Gợi ý tiếp theo**: tối đa 3 việc làm được ngay (không bị `⏸`/blocked).
3. Với `NP-nnn` hoặc `#n`: đọc thêm file chi tiết và dòng checklist liên quan, tóm tắt tiêu chí còn thiếu.

## Chế độ 2: `/ticket-status --update [NP-nnn | Pn | ghi chú]`

1. Thu thập: `python3 .agents/skills/ticket-status/scripts/ticket_status.py --update --no-gh [bộ lọc]`; đọc mục liên quan trong HANDOFF, checklist, file ticket.
2. Xác định ticket nào đổi trạng thái dựa trên **bằng chứng thật** (commit, lệnh đã chạy, kết quả verify trong HANDOFF). Quy tắc vàng (checklist §0.1):
   - Không tick `[x]` / `status: done` khi chưa có bằng chứng đáp ứng cột "Hoàn thành khi"/"Tiêu chí đóng". Mới code + vitest mà chưa verify trình duyệt/DB thật → giữ `[~]` / `partial`, ghi rõ đã có gì và còn thiếu gì.
   - Hạng mục đã quyết định bỏ (plan/ADR) → TT `[—]` kèm ngày + link, file `status: wontfix` + nhãn `status:wontfix`.
   - Không tự gỡ `⏸` khi chủ sản phẩm chưa chốt trong `docs/OPEN_QUESTIONS.md`.
   - Không bịa bằng chứng; không chạy lại typecheck/test chỉ để cập nhật tài liệu trừ khi người dùng yêu cầu.
3. Sửa đồng bộ theo thứ tự:
   1. `docs/IMPLEMENTATION_CHECKLIST.md`: cột Kiểm thử + TT, dòng "Cập nhật lần cuối".
   2. `docs/issues/NP-nnn.md`: `status:`, `labels:` (`status:<x>`), mục `Còn lại`/`Kết quả` (ngày, commit, lệnh).
   3. `docs/issues/README.md`: cột Trạng thái/Phase khớp frontmatter mọi file.
   4. `docs/TICKETS.md`: dòng `Cập nhật` + `git log đến <sha HEAD>`, đếm lại §1 (tổng khớp checklist), chuyển ticket giữa §2/§3/§5.
4. GitHub: nếu `gh` đã đăng nhập, đối chiếu bảng ghép; **hỏi người dùng trước** khi `gh issue close`/`comment`.
5. Kiểm: `python3 .agents/skills/ticket-status/scripts/ticket_status.py --verify --no-gh` (thêm `--strict-head` nếu đã commit tài liệu). Còn lệch thì sửa tiếp. Tóm tắt file/ticket đã đổi. **Không tự `git commit`** trừ khi được yêu cầu.
