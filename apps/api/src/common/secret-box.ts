import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM box for secrets stored in the database (AI API keys). The key
 * is derived from `AI_KEY_SECRET`, falling back to the JWT access secret, so
 * a database dump alone does not reveal the keys. Format: `v1.iv.tag.data`
 * (base64url parts).
 */
const b64 = (b: Buffer) => b.toString("base64url");
const fromB64 = (s: string) => Buffer.from(s, "base64url");

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`nihongo-path:secret-box:${secret}`).digest();
}

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(data)].join(".");
}

/** Returns `null` when the box is malformed or the secret changed. */
export function openSecret(box: string, secret: string): string | null {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), fromB64(iv));
    decipher.setAuthTag(fromB64(tag));
    return Buffer.concat([decipher.update(fromB64(data)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
