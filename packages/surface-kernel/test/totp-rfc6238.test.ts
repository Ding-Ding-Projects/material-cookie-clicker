import assert from "node:assert/strict";
import test from "node:test";

import {
  TOTP_DIGITS,
  base32Decode,
  base32Encode,
  currentTotp,
  totpUri,
  verifyTotp,
} from "../src/totp.ts";

// The RFC 6238 appendix B test secret, "12345678901234567890" in ASCII. It is
// a published example value and belongs to no account.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// RFC 6238 appendix B, SHA-1 rows. The published codes are eight digits; this
// implementation is fixed at six, which is the same dynamic truncation taken
// modulo one million, so the expected value is the published code's last six
// digits.
const VECTORS: { seconds: number; published: string }[] = [
  { seconds: 59, published: "94287082" },
  { seconds: 1111111109, published: "07081804" },
  { seconds: 1111111111, published: "14050471" },
  { seconds: 1234567890, published: "89005924" },
  { seconds: 2000000000, published: "69279037" },
  { seconds: 20000000000, published: "65353130" },
];

test("the published test secret decodes to its documented ascii value", () => {
  const bytes = base32Decode(RFC_SECRET);
  assert.equal(bytes.length, 20);
  assert.equal(String.fromCharCode(...bytes), "12345678901234567890");
});

test("base32 encoding round-trips", () => {
  const bytes = base32Decode(RFC_SECRET);
  assert.equal(base32Encode(bytes), RFC_SECRET);
});

for (const vector of VECTORS) {
  test(`rfc 6238 sha-1 vector at ${vector.seconds} seconds`, async () => {
    const code = await currentTotp(RFC_SECRET, vector.seconds * 1000);
    assert.equal(code.length, TOTP_DIGITS);
    assert.equal(code, vector.published.slice(-TOTP_DIGITS));
  });
}

test("a correct code verifies and an incorrect one does not", async () => {
  const atMs = 1111111109 * 1000;
  const code = await currentTotp(RFC_SECRET, atMs);
  assert.equal(await verifyTotp(RFC_SECRET, code, atMs, 0), true);
  assert.equal(await verifyTotp(RFC_SECRET, "000000", atMs, 0), false);
});

test("clock drift is accepted only within the requested window", async () => {
  const atMs = 1111111109 * 1000;
  const previous = await currentTotp(RFC_SECRET, atMs - 30_000);
  assert.equal(await verifyTotp(RFC_SECRET, previous, atMs, 1), true);
  assert.equal(await verifyTotp(RFC_SECRET, previous, atMs, 0), false);
});

test("a malformed code is rejected without a comparison", async () => {
  const atMs = 1111111109 * 1000;
  assert.equal(await verifyTotp(RFC_SECRET, "12345", atMs), false);
  assert.equal(await verifyTotp(RFC_SECRET, "abcdef", atMs), false);
});

test("the otpauth uri declares the fixed parameters", () => {
  const uri = totpUri({ issuer: "Example Product", account: "sample account", secret: RFC_SECRET });
  assert.ok(uri.startsWith("otpauth://totp/Example%20Product:sample%20account?"));
  assert.ok(uri.includes(`secret=${RFC_SECRET}`));
  assert.ok(uri.includes("algorithm=SHA1"));
  assert.ok(uri.includes("digits=6"));
  assert.ok(uri.includes("period=30"));
});
