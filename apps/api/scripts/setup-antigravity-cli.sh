#!/usr/bin/env bash
#
# Chuẩn bị máy chạy API để dùng "Google AI Pro (Antigravity CLI)" trên trang admin.
# (Thay cho Gemini CLI: Google đã ngừng phục vụ gói cá nhân / AI Pro qua Gemini CLI từ 18/06/2026.)
# Chạy lại nhiều lần vẫn an toàn: việc nào đã xong thì bỏ qua.
#
# Việc script làm:
#   1. Cài Antigravity CLI (`agy`) bằng script cài đặt chính thức của Google
#      (https://antigravity.google/cli/install.sh — tải bản nhị phân, tự kiểm sha512) vào ANTIGRAVITY_INSTALL_DIR.
#   2. Kiểm tra lệnh `script` (util-linux/bsdutils): trang admin dùng nó để chạy phần đăng nhập Google
#      của CLI trong một pty. Thiếu thì cài bsdutils bằng apt (Debian/Ubuntu).
#   3. Tạo thư mục dữ liệu của CLI (ANTIGRAVITY_CLI_DATA_DIR) với quyền 700.
#   4. Chạy thử `agy --version` và báo nếu `agy` chưa nằm trong PATH của API.
#
# Script KHÔNG đăng nhập Google: việc đó làm trên trang admin
#   (Dịch vụ AI → Thêm dịch vụ → "Google AI Pro (Antigravity CLI)" → Ủy quyền tài khoản Google).
#
# Chạy `agy` bằng user hệ điều hành riêng (khuyên dùng — `agy` là một agent đọc văn bản không tin cậy, nên không được
# cùng user với API: nó sẽ không đọc được .env, thông tin database hay file của user khác):
#   sudo ANTIGRAVITY_CLI_USER=agy-runner ./apps/api/scripts/setup-antigravity-cli.sh --create-user
#   Script tạo user hệ thống (không đăng nhập được), cài agy vào /usr/local/bin, tạo thư mục dữ liệu ở
#   /var/lib/<user>/homes thuộc user đó, rồi in các dòng cần đặt trong apps/api/.env. API phải chạy bằng root để
#   hạ quyền cho agy (setpriv); node (dùng cho hook chặn công cụ) phải chạy được bởi user đó, vd /usr/bin/node.
#
# Dùng:
#   ./apps/api/scripts/setup-antigravity-cli.sh            # cài (cùng user với API)
#   ./apps/api/scripts/setup-antigravity-cli.sh --check    # chỉ kiểm tra, không cài gì
#   sudo ANTIGRAVITY_CLI_USER=<user> ./apps/api/scripts/setup-antigravity-cli.sh [--create-user]
#
# Biến môi trường:
#   ANTIGRAVITY_CLI_USER        user hệ điều hành chạy agy (mặc định: không đặt = cùng user với API).
#   ANTIGRAVITY_INSTALL_DIR     nơi đặt `agy` (mặc định: ~/.local/bin; /usr/local/bin khi có ANTIGRAVITY_CLI_USER).
#   ANTIGRAVITY_CLI_DATA_DIR    thư mục dữ liệu (mặc định: apps/api/data/antigravity-cli; /var/lib/<user>/homes khi có
#                               ANTIGRAVITY_CLI_USER). Nếu đổi, đặt cùng giá trị trong apps/api/.env.
#
# Lưu ý: agy lưu token đăng nhập trong keyring của hệ điều hành. Máy chủ không giao diện có thể thiếu keyring
# (Secret Service/D-Bus): khi đó đăng nhập xong mà vẫn bị đòi đăng nhập lại — xem docs/development.md.

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGY_USER="${ANTIGRAVITY_CLI_USER:-}"
if [ -n "$AGY_USER" ]; then
  INSTALL_DIR="${ANTIGRAVITY_INSTALL_DIR:-/usr/local/bin}"
  DATA_DIR="${ANTIGRAVITY_CLI_DATA_DIR:-/var/lib/$AGY_USER/homes}"
else
  INSTALL_DIR="${ANTIGRAVITY_INSTALL_DIR:-$HOME/.local/bin}"
  DATA_DIR="${ANTIGRAVITY_CLI_DATA_DIR:-$API_DIR/data/antigravity-cli}"
fi
INSTALLER_URL="https://antigravity.google/cli/install.sh"
CHECK_ONLY=0
CREATE_USER=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --create-user) CREATE_USER=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Tham số không hợp lệ: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[cảnh báo]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[lỗi]\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; elif have sudo; then sudo "$@"; else die "Cần quyền root (hoặc sudo) để chạy: $*"; fi
}

# ── 0. User riêng cho agy (tuỳ chọn) ──────────────────────────────────────
# Chạy một lệnh với quyền của user agy (không nhóm phụ), như API sẽ làm bằng setpriv.
as_agy() { setpriv --reuid="$AGY_UID" --regid="$AGY_GID" --clear-groups -- "$@"; }

if [ -n "$AGY_USER" ]; then
  printf '%s' "$AGY_USER" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$' || die "ANTIGRAVITY_CLI_USER không hợp lệ: $AGY_USER"
  [ "$AGY_USER" != "root" ] || die "ANTIGRAVITY_CLI_USER không được là root"
  [ "$(id -u)" -eq 0 ] || die "Dùng ANTIGRAVITY_CLI_USER cần chạy script (và API) bằng root để hạ quyền: sudo ANTIGRAVITY_CLI_USER=$AGY_USER $0"
  have setpriv || die "Thiếu lệnh 'setpriv' (gói util-linux)"
  if ! id "$AGY_USER" >/dev/null 2>&1; then
    if [ "$CHECK_ONLY" -eq 1 ]; then
      warn "Chưa có user '$AGY_USER' (thêm --create-user để tạo)"
    elif [ "$CREATE_USER" -eq 1 ]; then
      log "Tạo user hệ thống '$AGY_USER' (không đăng nhập được)"
      useradd --system --user-group --home-dir "/var/lib/$AGY_USER" --create-home --shell /usr/sbin/nologin "$AGY_USER"
    else
      die "Chưa có user '$AGY_USER'. Thêm --create-user để script tạo, hoặc tự tạo: useradd --system --user-group --home-dir /var/lib/$AGY_USER --create-home --shell /usr/sbin/nologin $AGY_USER"
    fi
  fi
  if id "$AGY_USER" >/dev/null 2>&1; then
    AGY_UID="$(id -u "$AGY_USER")"
    AGY_GID="$(id -g "$AGY_USER")"
    [ "$AGY_UID" -ne 0 ] || die "User '$AGY_USER' có uid 0"
    log "agy sẽ chạy bằng user $AGY_USER (uid $AGY_UID, gid $AGY_GID)"
  else
    AGY_UID=""; AGY_GID=""
  fi
fi

# ── 1. Antigravity CLI ────────────────────────────────────────────────────
AGY="$INSTALL_DIR/agy"
# Với user riêng, agy phải nằm ở nơi user đó chạy được (INSTALL_DIR), không lấy bản của root trong PATH.
if [ -z "$AGY_USER" ] && have agy; then AGY="$(command -v agy)"; fi

if [ -x "$AGY" ]; then
  log "agy đã có: $AGY ($("$AGY" --version 2>/dev/null | head -1))"
elif [ "$CHECK_ONLY" -eq 1 ]; then
  warn "Chưa cài agy (sẽ đặt ở $INSTALL_DIR)"
else
  have curl || have wget || die "Cần curl hoặc wget để tải script cài đặt"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  log "Tải script cài đặt từ $INSTALLER_URL"
  if have curl; then curl -fsSL "$INSTALLER_URL" -o "$TMP/install.sh"; else wget -q -O "$TMP/install.sh" "$INSTALLER_URL"; fi
  head -1 "$TMP/install.sh" | grep -q '^#!' || die "Script tải về không hợp lệ"
  # Script tải từ mạng chỉ chạy bằng user thường, vào thư mục tạm; quyền root (nếu cần) chỉ để chép binary đã tải.
  if [ -n "$AGY_USER" ]; then
    # Chạy bằng chính user agy (không phải root), trong thư mục tạm của user đó.
    chmod 755 "$TMP"
    install -d -o "$AGY_UID" -g "$AGY_GID" -m 700 "$TMP/work" "$TMP/work/bin" "$TMP/work/home"
    cp "$TMP/install.sh" "$TMP/work/install.sh" && chown "$AGY_UID:$AGY_GID" "$TMP/work/install.sh"
    log "Tải và kiểm tra agy (bằng user $AGY_USER)"
    as_agy env "HOME=$TMP/work/home" bash "$TMP/work/install.sh" --dir "$TMP/work/bin"
    TMP_BIN="$TMP/work/bin"
  else
    if [ "$(id -u)" -eq 0 ]; then
      warn "Đang chạy bằng root: script cài đặt của Google sẽ chạy với quyền root. Nên chạy bằng user thường, hoặc đặt ANTIGRAVITY_CLI_USER để chạy nó bằng user riêng."
    fi
    mkdir -p "$TMP/bin"
    log "Tải và kiểm tra agy"
    HOME="$TMP/home" bash "$TMP/install.sh" --dir "$TMP/bin"
    TMP_BIN="$TMP/bin"
  fi
  [ -x "$TMP_BIN/agy" ] || die "Script cài đặt không tạo ra agy"
  log "Đặt agy vào $INSTALL_DIR"
  if mkdir -p "$INSTALL_DIR" 2>/dev/null && [ -w "$INSTALL_DIR" ]; then install -m 0755 "$TMP_BIN/agy" "$INSTALL_DIR/agy"
  else as_root mkdir -p "$INSTALL_DIR"; as_root install -m 0755 "$TMP_BIN/agy" "$INSTALL_DIR/agy"; fi
  AGY="$INSTALL_DIR/agy"
fi

# ── 2. Lệnh `script` (pty cho phiên đăng nhập) ────────────────────────────
if ! have script; then
  if [ "$CHECK_ONLY" -eq 1 ]; then
    warn "Thiếu lệnh 'script'"
  elif have apt-get; then
    log "Cài bsdutils (lệnh 'script')"
    as_root apt-get install -y bsdutils
  fi
  have script || die "Thiếu lệnh 'script' (gói util-linux hoặc bsdutils): không ủy quyền được từ trang admin"
fi
log "script: $(command -v script)"

# ── 3. Thư mục dữ liệu (mỗi dịch vụ một thư mục con làm HOME của agy) ─────
if [ "$CHECK_ONLY" -eq 0 ]; then
  mkdir -p "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  # Với user riêng, thư mục thuộc user đó; các thư mục con do chính user đó tạo khi dùng (API không ghi vào đây bằng root).
  [ -z "$AGY_USER" ] || chown "$AGY_UID:$AGY_GID" "$DATA_DIR"
fi
if [ -d "$DATA_DIR" ]; then log "Thư mục dữ liệu: $DATA_DIR ($(stat -c '%a' "$DATA_DIR"))"; else warn "Chưa có thư mục dữ liệu: $DATA_DIR"; fi
if [ -z "$AGY_USER" ] && [ "$DATA_DIR" != "$API_DIR/data/antigravity-cli" ]; then
  warn "Đặt ANTIGRAVITY_CLI_DATA_DIR=$DATA_DIR trong apps/api/.env để API dùng đúng thư mục này"
fi

# ── 4. Kiểm tra cuối ──────────────────────────────────────────────────────
[ -x "$AGY" ] || die "Không thấy agy ($AGY)"
VERSION="$("$AGY" --version 2>/dev/null | head -1 | tr -d '[:space:]')"
[ -n "$VERSION" ] || die "'$AGY --version' không chạy được"
log "OK: agy $VERSION"
if ! have agy; then
  warn "agy chưa nằm trong PATH. Đặt trong apps/api/.env:  ANTIGRAVITY_CLI_BIN=$AGY"
fi

if [ -n "$AGY_USER" ] && [ -n "${AGY_UID:-}" ]; then
  # Chính user đó phải chạy được agy và node (hook chặn công cụ chạy bằng node), và không đọc được .env của API.
  AS_VERSION="$(as_agy env "HOME=/var/lib/$AGY_USER" "$AGY" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true)"
  [ -n "$AS_VERSION" ] || die "User $AGY_USER không chạy được $AGY (quyền thư mục chứa file? đặt agy ở /usr/local/bin)"
  log "user $AGY_USER chạy được agy $AS_VERSION"
  NODE_BIN="$(command -v node || true)"
  if [ -n "$NODE_BIN" ] && ! as_agy "$NODE_BIN" -v >/dev/null 2>&1; then
    warn "User $AGY_USER không chạy được node ($NODE_BIN, thường vì nằm trong thư mục của root/nvm): hook chặn công cụ sẽ không chạy. Cài node ở /usr/bin hoặc /usr/local/bin."
  fi
  if as_agy test -r "$API_DIR/.env" 2>/dev/null; then
    warn "User $AGY_USER ĐỌC ĐƯỢC $API_DIR/.env — sai quyền thư mục/file: chmod 600 .env và chặn thư mục cha (vd chmod 750), nếu không thì tách user không có tác dụng."
  else
    log "User $AGY_USER không đọc được $API_DIR/.env"
  fi
fi

cat <<EOF

${AGY_USER:+Đặt trong apps/api/.env (rồi khởi động lại API, chạy bằng root):
  ANTIGRAVITY_CLI_USER=$AGY_USER
  ANTIGRAVITY_CLI_DATA_DIR=$DATA_DIR
  ANTIGRAVITY_CLI_BIN=$AGY
}
Xong. Bước tiếp theo (làm trên trang admin):
  Dịch vụ AI → Thêm dịch vụ → "Google AI Pro (Antigravity CLI)" → Ủy quyền tài khoản Google
  → mở liên kết Google, đăng nhập tài khoản có gói AI Pro, dán mã uỷ quyền → chọn model → Kiểm tra.

Khởi động lại API nếu nó đã chạy trước khi cài (để thấy lệnh 'agy' và biến môi trường mới).
EOF
