import { UnprocessableEntityException } from "@nestjs/common";

/** Hosts a plain-http endpoint is acceptable for: this machine / private network. */
function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "host.docker.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    !host.includes(".") // docker-compose service name, e.g. `ollama`
  );
}

/** Cloud metadata / link-local targets — never a legitimate LLM endpoint. */
const BLOCKED = /^(169\.254\.|0\.0\.0\.0$|\[?fd00:ec2::|metadata\.google\.internal$|metadata$)/i;

/**
 * Validates and normalises the base URL of a custom AI endpoint (admin-only).
 * Local servers (Ollama, LM Studio, vLLM…) are the point, so localhost and
 * private addresses are allowed over http; anything public must be https so a
 * key is never sent in clear. Cloud-metadata addresses are refused.
 */
export function validateBaseUrl(raw: string | undefined): string {
  let u: URL;
  try {
    u = new URL((raw ?? "").trim());
  } catch {
    throw new UnprocessableEntityException("Base URL không hợp lệ (vd: http://localhost:11434/v1)");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UnprocessableEntityException("Base URL phải bắt đầu bằng http:// hoặc https://");
  }
  if (u.username || u.password) {
    throw new UnprocessableEntityException("Không đặt tên đăng nhập/mật khẩu trong URL — dùng ô Khoá API");
  }
  if (u.search || u.hash) {
    throw new UnprocessableEntityException("Base URL không được chứa query hoặc #");
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED.test(host)) {
    throw new UnprocessableEntityException("Địa chỉ này không được phép");
  }
  if (u.protocol === "http:" && !isLocalHost(host)) {
    throw new UnprocessableEntityException("Địa chỉ công khai phải dùng https:// (http chỉ cho máy nội bộ / localhost)");
  }
  return u.toString().replace(/\/+$/, "");
}
