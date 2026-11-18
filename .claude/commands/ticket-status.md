---
description: Kiểm tra ticket và tiến độ dự án kèm đường dẫn tới file chi tiết (tuỳ chọn lọc: phase P4, trạng thái, hoặc #số issue)
argument-hint: "[P0-P11 | done | partial | todo | blocked | #issue]"
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(python3:*), Read, Grep
---

Báo cáo trạng thái ticket của Nihongo Path. **Chỉ đọc, không sửa file, không đổi issue.** Bộ lọc người dùng nhập: `$ARGUMENTS` (rỗng = tất cả).

## Nguồn dữ liệu

- Tiến độ task: `docs/IMPLEMENTATION_CHECKLIST.md` (cột TT: `[x]` xong, `[~]` dở, `[ ]` chưa, `⏸` chờ quyết định).
- Ticket chi tiết: `docs/issues/NP-nnn.md`; chỉ mục và bảng GitHub ↔ file ở `docs/issues/README.md`; bản tổng hợp ở `docs/TICKETS.md`.
- Issue trên GitHub: `gh issue list --state all --limit 100 --json number,title,state,labels,url`.

## Cách làm

1. Đếm task theo phase bằng lệnh này, rồi tính % = xong / tổng:

```bash
python3 - <<'PY'
import re,collections
c=collections.defaultdict(collections.Counter)
for l in open('docs/IMPLEMENTATION_CHECKLIST.md',encoding='utf-8'):
    m=re.match(r'\| (P\d+)-[A-Z0-9]+-\d+[a-z]? \|',l)
    if m: c[m.group(1)][l.rstrip().rstrip('|').split('|')[-1].strip().strip('`')]+=1
for k in sorted(c,key=lambda x:int(x[1:])):
    v=c[k];t=sum(v.values());print(k,t,dict(v),f"{100*v['[x]']//t}%")
PY
```

2. Lấy issue GitHub bằng `gh issue list` ở trên. Nếu `gh` lỗi hoặc chưa đăng nhập, bỏ qua phần GitHub và nói rõ.
3. Ghép issue với file chi tiết qua bảng "GitHub Issues ↔ file chi tiết" trong `docs/issues/README.md`.
4. Áp dụng bộ lọc: `Pn` lọc theo phase; `done|partial|todo|blocked` lọc theo trạng thái trong frontmatter `status:` của `docs/issues/*.md` (grep `^status:`); `#n` chỉ hiện issue đó và đọc luôn file chi tiết của nó để tóm tắt tiêu chí còn thiếu.

## Định dạng báo cáo

1. **Tổng quan:** bảng phase | tổng | xong | dở | chưa | chờ | %.
2. **Issue GitHub:** bảng `#` | tiêu đề | trạng thái (open/closed) | nhãn | file chi tiết (liên kết markdown tới `docs/issues/NP-nnn.md`) | link GitHub.
3. **Ticket theo file:** nhóm theo trạng thái (`partial`, `todo`, `blocked`), mỗi dòng gồm id, tiêu đề, phase và liên kết tới file chi tiết. Ẩn nhóm `done` trừ khi người dùng lọc `done`.
4. **Gợi ý tiếp theo:** tối đa 3 ticket làm được ngay (không bị `blocked`), nêu lý do.

Mọi đường dẫn file phải là liên kết markdown tương đối từ gốc repo, ví dụ `[NP-026](docs/issues/NP-026.md)`. Nếu số liệu checklist và `docs/TICKETS.md` lệch nhau, nói rõ lệch ở đâu thay vì tự chọn một bên.
