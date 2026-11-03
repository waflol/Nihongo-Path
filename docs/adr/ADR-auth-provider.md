# ADR-001a — Provider xác thực (auth)

> **Trạng thái:** `Accepted` — chốt cùng P2-AUTH-01 (30/10/2026).
> **Quyết định bởi:** Tôi (sản phẩm) + [CC] (thiết kế kỹ thuật).
> **Phạm vi:** P2 (Identity). Thay thế mục "provider auth" của Q-01.

## Bối cảnh

Spec §4.1 cho phép đăng ký/đăng nhập bằng Google, GitHub **hoặc** email
theo phương án được duyệt. Q-01 yêu cầu chốt phương án trước khi viết schema
`auth_accounts`, luồng `/login`, biến env và chính sách bảo mật. Q-02 đã chốt
MongoDB Atlas (DB thật) nên mọi luồng được kiểm chứng bằng DB.

## Lựa chọn

- **Phương án:** (a)+(c) — **Google OAuth + email/password** (theo đề xuất Q-01).
- **Google:** đăng nhập bằng Google One-Tap / ID-token (`credential`), xác
  minh ID-token qua `google-auth-library` (audience = `GOOGLE_CLIENT_ID`).
  Người dùng không cần Google Client Secret ở client — chỉ access-token JWT
  được cấp.
- **Email/password:** mật khẩu băm **scrypt** (Node `crypto`), định dạng lưu
  `salt$hash` (hex). Đăng nhập trả token; sai mật khẩu → 401 chung chung
  (không lộ user có tồn tại hay không — T-P2-02).
- GitHub: không bật ở P2 (schema giữ enum `github` cho tương lai).

## Token & phiên

| Loại | Định dạng | TTL | Lưu ở đâu |
|---|---|---|---|
| Access | JWT (HMAC, `JWT_ACCESS_SECRET`) | `JWT_ACCESS_EXPIRES_IN` (mặc định `15m`) | Không lưu (stateless) |
| Refresh | Opaque (random 128-bit) | `JWT_REFRESH_EXPIRES_IN` (mặc định `7d`) | Collection `auth_sessions` (unique, `expiresAt`) |

**Refresh rotation:** mỗi lần `/auth/refresh` thu hồi token cũ + cấp token
mới (rotate). **Logout** thu hồi phiên hiện tại → token refresh cũ không dùng
được nữa (T-P2-10). Token refresh hết hạn → từ chối (T-P2-08).

- `auth_sessions`: `{ user, token (unique index), expiresAt, revokedAt? }`.
- Access JWT payload: `{ sub: userId, role, lang }` — đủ cho `AuthGuard`
  không phải truy DB mỗi request.

## Ưu / nhược

- **Ưu:** Google nhanh cho user VN; email/password làm dự phòng không phụ
  thuộc OAuth provider; refresh rotation + logout thu hồi được; access
  stateless (ít truy DB).
- **Nhược:** phải vận hành `auth_sessions` (một collection mới); scrypt
  param cần tune (dev: `N=16384, r=8, p=1`); Google cần 2 biến secret.

## Quyết định

Chốt **Google + email/password** như trên.

## Hậu quả / nguồn cần kiểm tra

- Biến env mới: `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`,
  `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (đã khai báo trong `env.types.ts`/`env.validation.ts`
  + `.env.example`, optional — module auth từ chối chạy khi thiếu subset
  bắt buộc, không fail-fast toàn app).
- Rate limit endpoint đăng nhập (P2-AUTH-08) áp lên cả Google lẫn email.
- UI: không lưu refresh token trong nơi script đọc được (P2-UI-05).
- Kiểm tra trước production: scrypt param + chính sách refresh rotation
  (spec §12).
