/**
 * Legal identity shown on /terms and /privacy.
 *
 * Nghị định 147/2024/NĐ-CP (chủ quản trang thông tin điện tử phải công bố tên,
 * địa chỉ, đầu mối liên hệ) và Luật Bảo vệ quyền lợi người tiêu dùng 2023 đều
 * buộc công bố danh tính bên vận hành; Luật BVDLCN 91/2025/QH15 buộc công bố
 * đầu mối tiếp nhận yêu cầu của chủ thể dữ liệu.
 *
 * Để trống = trang hiển thị dòng "đang cập nhật" thay vì bịa thông tin.
 * Điền qua biến môi trường khi phát hành (không cần sửa code):
 *   NEXT_PUBLIC_LEGAL_OPERATOR, NEXT_PUBLIC_LEGAL_ADDRESS,
 *   NEXT_PUBLIC_LEGAL_EMAIL, NEXT_PUBLIC_LEGAL_TAX_CODE
 */
export const legalConfig = {
  /** Tên tổ chức/cá nhân vận hành, ví dụ "Công ty TNHH ABC" hoặc "Hộ kinh doanh X". */
  operator: process.env.NEXT_PUBLIC_LEGAL_OPERATOR ?? "",
  /** Mã số doanh nghiệp / mã số thuế / mã số hộ kinh doanh. */
  taxCode: process.env.NEXT_PUBLIC_LEGAL_TAX_CODE ?? "",
  /** Địa chỉ liên hệ tại Việt Nam. */
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "",
  /** Email tiếp nhận yêu cầu dữ liệu cá nhân và khiếu nại bản quyền. */
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "",
  /** Ngày hai văn bản pháp lý có hiệu lực / cập nhật lần cuối. */
  updated: "18/11/2026",
  /** Số ngày báo trước khi sửa đổi điều khoản theo hướng bất lợi cho người dùng. */
  noticeDays: 7,
} as const;

export const hasLegalIdentity =
  legalConfig.operator !== "" || legalConfig.email !== "" || legalConfig.address !== "";
