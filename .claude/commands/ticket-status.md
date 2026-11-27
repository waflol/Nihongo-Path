---
description: Kiểm tra tiến độ ticket (mặc định chỉ đọc) hoặc cập nhật đồng bộ tiến độ với --update
argument-hint: "[--update] [P0-P11 | NP-xxx | done | partial | todo | blocked | #issue | current]"
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(python3:*), Bash(git status:*), Bash(git log:*), Read, Grep, Edit, Write
---

Thực hiện skill `ticket-status`: đọc và làm theo `.agents/skills/ticket-status/SKILL.md` (nguồn duy nhất của quy trình), với tham số: `$ARGUMENTS`.

- Không có `--update`: **chỉ đọc**, không sửa file, không đổi issue GitHub.
- Có `--update`: cập nhật đồng bộ checklist → `docs/issues/NP-*.md` → `docs/issues/README.md` → `docs/TICKETS.md` theo quy tắc vàng (checklist §0.1: không tick `[x]` khi thiếu bằng chứng). Không tự commit.

Script dùng chung: `python3 .agents/skills/ticket-status/scripts/ticket_status.py`.
