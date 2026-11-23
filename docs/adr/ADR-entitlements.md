# ADR-entitlements — Hạn mức & gói học tập (entitlements / quota)

> **Trạng thái:** `Accepted` — chốt cùng P5-QUOTA-01…06 + P5-ADMIN-04 (23/11/2026).
> **Quyết định bởi:** Tôi (sản phẩm) + [CC] (thiết kế kỹ thuật).
> **Phạm vi:** P5 (entitlements). Chốt kiến trúc Q-07 / Q-23; con số cụ thể
> (Free được bao nhiêu lượt, Pro bao nhiêu) **không** nằm trong code — admin
> chỉnh trong data, xem §Lựa chọn. Cập nhật `database.md` §5b + §9.
> **File code:** `apps/api/src/entitlements/` (schema, service, guards, module,
> controller) + màn admin `/admin/entitlements` + dòng quota trong `compose-drill`.

## Bối cảnh

Spec §6.2: "Quota tính theo lượt / phút / tài nguyên, **hết mức thì chặn hoặc
đưa về gói khác**; hiển thị rõ mức dùng / hạn mức". §6.2 tách hai trục:
`Role` (quản trị) và `Plan` (quyền học tập) — "không dùng lại `Role` làm trục
quyền học tập". §4.3 chốt thứ tự guard (auth → RBAC → entitlement).
Q-07 / Q-23 chưa chốt con số; Q-23 nêu 2 vế: "mức giới hạn có nên cấu hình
được không?" (đề xuất: **cấu hình được**) và "vượt mức: chặn hay cho vượt"
(đề xuất: **chặn / 429**, "cho vượt có ghi nhận" chỉ nếu cần tính phí).

Bài toán kỹ thuật: các tính năng tốn AI (chấm câu, sau này hội thoại P8)
phải **đặt trước quota rồi chạy**, job fail/huỷ phải **hoàn trả**, sang kỳ
mới (ngày/tháng) theo **múi giờ** thì hạn mức về 0 — không ai được "dùng thừa"
khi crash giữa chừng.

## So sánh phương án

| Tiêu chí | A: cờ cứng theo role (ví dụ `role=PRO` → được) | B: cấu hình data-driven (`feature_configs`) | C: tính theo "credit" trừ dần trên user |
|---|---|---|---|
| Đổi hạn mức khi Q-07 chốt | deploy | sửa 1 document, hiệu lực request sau | sửa 1 document |
| Thêm tính năng mới bị đo | viết code + deploy | thêm 1 row config | thêm 1 row config |
| Kill-switch khi AI sập | deploy | `enabled: false` | `enabled: false` |
| Trục quyền học tập tách `role` (§6.2) | ❌ vi phạm | ✅ `user.plan` (FREE/PRO/VIP) | ✅ |
| Job crash → rò quota | không có đặt-trước | reservation `RESERVED` vẫn chiếm (an toàn) | trừ khi fail thì phải cộng lại |
| Reset theo tz | tự viết | `tz` (IANA) trong config | tự viết |
| Ghi nhận để tính phí P9 | khó | `overLimit: ALLOW` + `usage_records` | credit âm |

Chọn **B** — khớp đúng đề xuất Q-23 ("cấu hình được") + "cho vượt có ghi
nhận" (vế `ALLOW`) mà không cần quyết con số; **A** bị loại vì vi phạm trục
quyền §6.2 và mất kill-switch; **C** bị loại vì ledger âm phức tạp hơn và
không trả lời được "đã tiêu thụ thật của kỳ này" để báo cáo.

## Lựa chọn

1. **Hai trục độc lập.** `user.role` (USER/ADMIN/SUPER_ADMIN) = trục quản trị,
   chạy bởi `RolesGuard` (`@Roles`). `user.plan` (FREE/PRO/VIP, default FREE)
   = trục quyền học tập, chạy bởi `EntitlementGuard`. Admin / Super admin
   **luôn miễn đo đếm quota** (họ vận hành, không học).
2. **Data-driven (Q-07/23 "cấu hình được").** `feature_configs` (1 row /
   featureKey): `enabled` (kill-switch), `limits[]` (≤3 dòng theo gói,
   `limit` = số lượt/kỳ, `null` = không giới hạn, **không có dòng = gói đó
   không có quyền → 403**, `0` = có quyền nhưng chặn lượt đầu → 429),
   `period` (DAY/MONTH), `tz` (IANA, neo rìa kỳ), `overLimit`
   (BLOCK=429 / ALLOW=ghi nhận để tính phí P9). **Không có row config = tính
   năng ungated** (guard pass-through) → tính năng mới ship trước khi có config.
3. **Sổ đặt trước (P5-QUOTA-02/03).** `quota_reservations`:
   `reserve` (đặt trước *trước* khi chạy, `QuotaGuard`) → `settle` (thành
   công, `QuotaInterceptor`; mirror sang `usage_records`) / `release` (thất
   bại/huỷ). Chỉ `RESERVED`+`SETTLED` tính hạn mức. **Job crash để lại
   `RESERVED` → vẫn chiếm quota (an toàn, không ai được dùng thừa)**; xoá tài
   khoản thì `release` với `reason: "user-deletion"`. Cả settle/release
   idempotent (gọi 2 lần = 1 hiệu ứng).
4. **Trật tự guard (§4.3):** `RolesGuard` (RBAC, 403) → `EntitlementGuard`
   (quyền gói / kill-switch, 403) → `QuotaGuard` (đặt trước quota, 429 khi
   BLOCK-exhausted). Cả hai entitlements guard là `APP_GUARD` đăng trong
   `entitlements.module.ts`, chỉ tác động route có metadata (`@RequireEntitlement`
   / `@Quota`); route không khai báo thì pass-through.
5. **Hiệu lực tức thì (P5-QUOTA-01).** Limit đọc ở **mỗi** lần check (không
   cache module-level) → sửa config trong admin có hiệu lực ngay, không deploy.
6. **Rìa kỳ theo tz (P5-QUOTA-05).** `periodKey` = ngày/tháng theo `tz` IANA
   (Intl, cacheformatter), **đặc biệt KHÔNG dùng `srs.days.ts`** (rìa ngày
   SRS là lịch học, rìa quota là chu kỳ tính phí — khác nhau là có chủ
   đích; ví dụ tháng 2/2026 + UTC+7 sang 1/3 lúc 00:00 HC, trong khi SRS
   vẫn theo anchor riêng).
7. **Admin surface (P5-ADMIN-04).** `GET|POST /admin/entitlements/features`
   (+ `PATCH /users/:id/plan`, `GET features/:key/usage/:userId`),
   `@ContentAdmin()`; mọi mutation `attachAuditNote` before/after (P5-ADMIN-03).
   UI: `/admin/entitlements` (cấu hình) + cột "Gói" trong bảng Người dùng.
   Learner: `GET /entitlements/me/remaining/:key` → dòng "Bạn còn X lượt…".
8. **Xoá tài khoản (BVDLCN 91/2025).** Xoá `quotareservations` +
   `usagerecords` theo `user` (bên cạnh mọi collection cá nhân khác).

## Hệ quả / chi phí

- **Race đặt-trước:** 2 caller đồng thời cùng slot có thể cùng qua bước
  "check rồi create" trong 1 window (VPS single-node, negligible); BLOCK
  vẫn tự thu hồi slot thừa (create-rồi-tái-tổng). Chưa có test race DB thật
  (chờ DB/multi-process) — spec §6.2 yêu cầu, đã ghi ở HANDOFF bẫy.
- **`usage_records` tăng theo lượt** (không TTL): nền P9, có thể TTL sau khi
  billing chốt (Q chưa có).
- Chưa có seed row `feature_configs` nào: deploy API trước khi tạo config là
  an toàn (ungated).

## Lối thoát

- Đổi policy / con số: sửa document `feature_configs` (không migration).
- Đổi trạng thái ledger: thêm state (migration lười, như SRS v1→v2→v3).
- Đổi chu kỳ (VD quý): thêm `period` value (enum mở, không migrate).
- Gỡ gate tính năng: xoá decorator hoặc `enabled: false`.
