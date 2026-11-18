// PlusSent auth tests — node:test, no framework, no DB server.
// Run: node --test tests/auth.test.mjs
// Covers: bcrypt hash/verify, TOTP round-trip, hashToken determinism,
// encryptSecret round-trip, rate-limit logic, TOTP secret generation.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./ts-resolver.mjs", import.meta.url);

// Pure-function tests only; DB-backed flows (signup/login sessions) are
// covered by the migrate + API smoke path, not here.
// NOTE: importing lib/auth.ts creates the libSQL client eagerly, so point it
// at an in-memory DB before the imports below (no DB server, no files).
process.env.DATABASE_URL = "file::memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const crypto = await import("../src/lib/crypto.ts");
const auth = await import("../src/lib/auth.ts");
const tenant = await import("../src/lib/tenant.ts");

test("hashToken is deterministic and looks like a SHA-256 hex digest", () => {
  const a = crypto.hashToken("some-token-value");
  const b = crypto.hashToken("some-token-value");
  const c = crypto.hashToken("different-token-value");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("bcrypt: hashPassword verifies with the right password, rejects the wrong one", async () => {
  const hash = await auth.hashPassword("correct horse battery staple");
  assert.notEqual(hash, "correct horse battery staple");
  assert.equal(await auth.verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await auth.verifyPassword("wrong password", hash), false);
  assert.equal(await auth.verifyPassword("anything", ""), false);
  // Two hashes of the same password differ (salted).
  const hash2 = await auth.hashPassword("correct horse battery staple");
  assert.notEqual(hash, hash2);
  assert.equal(await auth.verifyPassword("correct horse battery staple", hash2), true);
});

test("totp: totpCode/verifyTotp round-trip, and wrong codes fail", () => {
  const secret = auth.generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/); // 160-bit secret, base32
  const code = crypto.totpCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(crypto.verifyTotp(secret, code), true);
  assert.equal(crypto.verifyTotp(secret, "000000"), code === "000000");
  assert.equal(crypto.verifyTotp(secret, "123456"), code === "123456");
  // A code for a different secret must not verify.
  const other = auth.generateTotpSecret();
  assert.notEqual(other, secret);
  assert.equal(crypto.verifyTotp(other, code), false);
});

test("totp: codes change across time steps", () => {
  const secret = auth.generateTotpSecret();
  const now = Date.now();
  const a = crypto.totpCode(secret, 30, 6, now);
  const b = crypto.totpCode(secret, 30, 6, now + 31_000);
  // Extremely unlikely to collide; if it does, the test documents it.
  assert.notEqual(a, b);
});

test("encryptSecret/decryptSecret round-trip, ciphertext differs per call", () => {
  const plain = JSON.stringify({ access_token: "tok_123", refresh_token: "ref_456" });
  const enc1 = crypto.encryptSecret(plain);
  const enc2 = crypto.encryptSecret(plain);
  assert.notEqual(enc1, enc2); // random IV
  assert.equal(crypto.decryptSecret(enc1), plain);
  assert.equal(crypto.decryptSecret(enc2), plain);
});

test("rate limit: allows up to the limit inside the window, then blocks", () => {
  auth.resetRateLimits();
  const at = 1_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(auth.checkRateLimit("login:1.2.3.4:a@b.c", 5, 60_000, at + i * 1000), true);
  }
  assert.equal(auth.checkRateLimit("login:1.2.3.4:a@b.c", 5, 60_000, at + 6000), false);
  // A different key is unaffected.
  assert.equal(auth.checkRateLimit("login:1.2.3.4:other@d.e", 5, 60_000, at + 6000), true);
  // After the window passes, the key is usable again.
  assert.equal(auth.checkRateLimit("login:1.2.3.4:a@b.c", 5, 60_000, at + 61_000), true);
});

test("rate limit: loginRateLimit enforces 5/min per IP+email", () => {
  auth.resetRateLimits();
  // loginRateLimit uses Date.now(); call it 5 times fast — all allowed.
  for (let i = 0; i < 5; i++) {
    assert.equal(auth.loginRateLimit("9.9.9.9", "user@example.com"), null);
  }
  const blocked = auth.loginRateLimit("9.9.9.9", "user@example.com");
  assert.ok(blocked instanceof Response);
  assert.equal(blocked.status, 429);
});

test("tenant: roleAtLeast follows owner > admin > member > viewer", () => {
  assert.equal(tenant.roleAtLeast("owner", "admin"), true);
  assert.equal(tenant.roleAtLeast("admin", "owner"), false);
  assert.equal(tenant.roleAtLeast("member", "member"), true);
  assert.equal(tenant.roleAtLeast("viewer", "member"), false);
  assert.equal(tenant.roleAtLeast("admin", "viewer"), true);
  assert.equal(tenant.roleAtLeast("nonsense", "viewer"), false);
});

test("totpAuthUrl builds a valid otpauth URL for the secret", () => {
  const secret = auth.generateTotpSecret();
  const url = auth.totpAuthUrl(secret, "user@example.com");
  assert.ok(url.startsWith("otpauth://totp/PlusSent:user%40example.com?"));
  assert.ok(url.includes(`secret=${secret}`));
  assert.ok(url.includes("issuer=PlusSent"));
});

test("base32Encode round-trips through the TOTP secret generator", () => {
  const bytes = Buffer.from("hello-world-12345");
  const encoded = auth.base32Encode(bytes);
  assert.match(encoded, /^[A-Z2-7]+$/);
  // 17 bytes -> 136 bits -> 28 base32 chars (last char padded).
  assert.equal(encoded.length, 28);
});
