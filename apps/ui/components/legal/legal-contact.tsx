import { legalConfig, hasLegalIdentity } from "@/app/legal";

/**
 * Contact block for /terms and /privacy. Renders only the fields that are
 * configured; with none configured it says so plainly instead of printing
 * placeholder text like "[TÊN ĐƠN VỊ]" to end users.
 */
export function LegalContact() {
  if (!hasLegalIdentity) {
    return (
      <p className="legal-note">
        Thông tin pháp lý đầy đủ của đơn vị vận hành (tên, mã số thuế, địa chỉ, email tiếp nhận yêu cầu) đang được
        hoàn tất và sẽ được công bố tại mục này trước khi Nền tảng mở đăng ký rộng rãi hoặc thu phí. Trong thời gian
        đó, bạn gửi yêu cầu và khiếu nại qua chức năng <strong>Phản hồi / Báo lỗi</strong> ngay trong Ứng dụng; mọi
        yêu cầu đều được ghi nhận kèm thời điểm tiếp nhận.
      </p>
    );
  }
  return (
    <ul className="legal-contact">
      {legalConfig.operator ? (
        <li>
          <span>Đơn vị vận hành</span>
          <strong>{legalConfig.operator}</strong>
        </li>
      ) : null}
      {legalConfig.taxCode ? (
        <li>
          <span>Mã số doanh nghiệp / thuế</span>
          <strong>{legalConfig.taxCode}</strong>
        </li>
      ) : null}
      {legalConfig.address ? (
        <li>
          <span>Địa chỉ liên hệ</span>
          <strong>{legalConfig.address}</strong>
        </li>
      ) : null}
      {legalConfig.email ? (
        <li>
          <span>Email tiếp nhận yêu cầu</span>
          <strong>
            <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
          </strong>
        </li>
      ) : null}
    </ul>
  );
}
