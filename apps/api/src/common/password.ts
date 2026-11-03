import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * scrypt parameters for dev/MVP (tune before production — see
 * `docs/adr/ADR-auth-provider.md` "Hậu quả / nguồn cần kiểm tra").
 */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

const SALT_BYTES = 16;
/** 32 bytes of scrypt output is plenty for an HMAC-length secret hash. */
const KEY_BYTES = 32;

function toHex(buf: Buffer): string {
  return buf.toString("hex");
}

/**
 * Hash a password into a `salt$hash` hex string (stable, portable, no
 * external KDF library).
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_BYTES);
    scrypt(password, salt, KEY_BYTES, SCRYPT_OPTS, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${toHex(salt)}$${toHex(key)}`);
    });
  });
}

/**
 * Constant-time compare. A malformed stored value or a length mismatch
 * returns `false` (never leaks which part failed — T-P2-02).
 */
export function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [saltHex, hashHex] = stored.split("$");
    if (!saltHex || !hashHex) {
      resolve(false);
      return;
    }
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length === 0) {
      resolve(false);
      return;
    }
    scrypt(password, salt, expected.length, SCRYPT_OPTS, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(timingSafeEqual(key, expected));
    });
  });
}
