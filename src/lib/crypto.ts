import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
// AES-256-GCM credential encryption. Key from ENCRYPTION_KEY (hex, >=32 bytes).
// If unset, a dev-only ephemeral key is used and a warning is logged — NEVER rely on this in production.
let cachedKey: Buffer | null = null;
export function encryptionReady(): boolean { return !!process.env.ENCRYPTION_KEY; }
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    cachedKey = raw.length >= 64 ? Buffer.from(raw.slice(0, 64), "hex") : createHash("sha256").update(raw).digest();
  } else {
    console.warn("[plasesent] ENCRYPTION_KEY not set — using ephemeral dev key. Credentials will NOT survive restarts.");
    cachedKey = randomBytes(32);
  }
  return cachedKey;
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") });
}
export function decryptSecret(payload: string): string {
  const { iv, tag, data } = JSON.parse(payload);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function randomToken(bytes = 32): string { return randomBytes(bytes).toString("hex"); }
// TOTP (RFC 6238, SHA-1, 30s, 6 digits) — implemented with Node crypto, no extra dep.
export function totpCode(secretBase32: string, timeStep = 30, digits = 6, when = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.toUpperCase().replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);
  const counter = Math.floor(when / 1000 / timeStep);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24 | (h[off + 1] & 0xff) << 16 | (h[off + 2] & 0xff) << 8 | (h[off + 3] & 0xff)) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
export function verifyTotp(secret: string, code: string): boolean {
  const t = Date.now();
  return [totpCode(secret, 30, 6, t - 30000), totpCode(secret, 30, 6, t), totpCode(secret, 30, 6, t + 30000)].includes(code.trim());
}
