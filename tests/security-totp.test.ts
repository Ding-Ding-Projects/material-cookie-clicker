import { describe, expect, it } from 'vitest';
import { encodeQrMatrix } from '../packages/surface-kernel/src/qr.js';
import { encodeLocalOtpQrMatrix } from '../src/renderer/tools/security/TotpAuthenticatorPanel.js';

import {
  OTPAUTH_URI_MAX_LENGTH,
  OTP_ENTRY_LIMIT,
  OTP_IMAGE_MAX_BYTES,
  asTotpProfile,
  clearTotpSelection,
  createManualTotpProfile,
  createTotpCodeViewModel,
  createTotpListModel,
  encodeBase32,
  formatOtpAuthUri,
  hotp,
  importTotpFromClipboard,
  importTotpFromImage,
  invertVisibleTotpSelection,
  parseOtpAuthUri,
  selectAllVisibleTotp,
  selectedTotpEntries,
  toggleTotpSelection,
  totp,
  totpGroupSummary,
  verifyTotp,
  visibleTotpEntries,
  type LocalOtpImageSource,
  type TotpAuthenticatorEntry,
} from '../src/shared/security-totp.js';

const RFC_SHA1_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function base32Ascii(value: string): string {
  return encodeBase32(new TextEncoder().encode(value));
}

const RFC6238_CASES = [
  [59, '94287082', '46119246', '90693936'],
  [1_111_111_109, '07081804', '68084774', '25091201'],
  [1_111_111_111, '14050471', '67062674', '99943326'],
  [1_234_567_890, '89005924', '91819424', '93441116'],
  [2_000_000_000, '69279037', '90698825', '38618901'],
  [20_000_000_000, '65353130', '77737706', '47863826'],
] as const;

function entry(
  id: string,
  issuer: string,
  account: string,
  group: string,
  secret = RFC_SHA1_SECRET,
): TotpAuthenticatorEntry {
  return {
    id,
    group,
    kind: 'totp',
    issuer,
    account,
    secret,
    algorithm: 'SHA1',
    digits: 6,
    periodSeconds: 30,
  };
}

describe('RFC 4226 HOTP', () => {
  it('matches every published SHA-1 counter vector', async () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    await expect(Promise.all(expected.map((_, counter) => hotp(RFC_SHA1_SECRET, BigInt(counter))))).resolves.toEqual(expected);
  });

  it('rejects counters outside the unsigned 64-bit boundary', async () => {
    await expect(hotp(RFC_SHA1_SECRET, -1n)).rejects.toThrow(/counter/i);
    await expect(hotp(RFC_SHA1_SECRET, 0x1_0000_0000_0000_0000n)).rejects.toThrow(/counter/i);
  });
});

describe('RFC 6238 TOTP', () => {
  const sha256Secret = base32Ascii('12345678901234567890123456789012');
  const sha512Secret = base32Ascii('1234567890123456789012345678901234567890123456789012345678901234');

  it.each(RFC6238_CASES)('matches the published vectors at %i seconds', async (seconds, sha1, sha256, sha512) => {
    await expect(totp(RFC_SHA1_SECRET, seconds * 1_000, { digits: 8, algorithm: 'SHA1' })).resolves.toBe(sha1);
    await expect(totp(sha256Secret, seconds * 1_000, { digits: 8, algorithm: 'SHA256' })).resolves.toBe(sha256);
    await expect(totp(sha512Secret, seconds * 1_000, { digits: 8, algorithm: 'SHA512' })).resolves.toBe(sha512);
  });

  it('checks bounded neighbouring windows without accepting malformed codes', async () => {
    const profile = createManualTotpProfile({
      issuer: 'Bakery',
      account: 'oven@example.test',
      secret: RFC_SHA1_SECRET,
    });
    const previous = await totp(profile.secret, 29_999, profile);
    await expect(verifyTotp(profile, previous, 30_001, 1)).resolves.toBe(true);
    await expect(verifyTotp(profile, previous, 60_001, 0)).resolves.toBe(false);
    await expect(verifyTotp(profile, '12x456', 30_001, 1)).resolves.toBe(false);
    await expect(verifyTotp(profile, previous, 30_001, 11)).rejects.toThrow(/drift/i);
  });
});

describe('bounded otpauth parsing and formatting', () => {
  it('round-trips encoded labels and all supported TOTP parameters', () => {
    const profile = createManualTotpProfile({
      issuer: 'Tea & Biscuits',
      account: 'baker+night@example.test',
      secret: RFC_SHA1_SECRET,
      algorithm: 'SHA-512',
      digits: 8,
      periodSeconds: 45,
    });
    expect(parseOtpAuthUri(formatOtpAuthUri(profile))).toEqual(profile);
  });

  it('parses a bounded HOTP URI without turning it into a TOTP entry', () => {
    const parsed = parseOtpAuthUri(
      `otpauth://hotp/Counter:line?secret=${RFC_SHA1_SECRET}&issuer=Counter&algorithm=SHA256&digits=7&counter=42`,
    );
    expect(parsed).toMatchObject({ kind: 'hotp', counter: 42n, algorithm: 'SHA256', digits: 7 });
    expect(() => asTotpProfile(parsed)).toThrow(/TOTP entries only/i);
  });

  it.each([
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=A&issuer=A`,
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=B`,
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=A&algorithm=MD5`,
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=A&period=0`,
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=A&counter=1`,
    `otpauth://totp/A:b?secret=${RFC_SHA1_SECRET}&issuer=A&surprise=true`,
    'https://example.test/not-otpauth',
  ])('fails closed on malformed or ambiguous input: %s', (value) => {
    expect(() => parseOtpAuthUri(value)).toThrow();
  });

  it('rejects overlong URIs and non-canonical base32 instead of truncating', () => {
    expect(() => parseOtpAuthUri(`otpauth://totp/A:b?secret=${'A'.repeat(OTPAUTH_URI_MAX_LENGTH)}`)).toThrow(/4096/);
    expect(() => createManualTotpProfile({ issuer: 'A', account: 'b', secret: 'AB' })).toThrow(/trailing bits/i);
  });

  it('generates a real square QR matrix through the surface kernel', () => {
    const uri = formatOtpAuthUri(createManualTotpProfile({
      issuer: 'Bakery',
      account: 'oven',
      secret: RFC_SHA1_SECRET,
    }));
    const matrix = encodeLocalOtpQrMatrix(uri);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix[0]?.slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(matrix).toEqual(encodeQrMatrix(uri));
  });
});

describe('local import adapter boundaries', () => {
  const uri = `otpauth://totp/Bakery:oven?secret=${RFC_SHA1_SECRET}&issuer=Bakery`;

  it('imports explicit clipboard text through the injected local adapter', async () => {
    let reads = 0;
    await expect(importTotpFromClipboard({ readText: async () => { reads += 1; return uri; } })).resolves.toMatchObject({
      kind: 'totp',
      issuer: 'Bakery',
    });
    expect(reads).toBe(1);
  });

  it('validates image bounds before invoking a decoder', async () => {
    let invoked = false;
    const source: LocalOtpImageSource = {
      name: 'huge.png',
      size: OTP_IMAGE_MAX_BYTES + 1,
      type: 'image/png',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    await expect(importTotpFromImage({ decodeOtpAuthUri: async () => { invoked = true; return uri; } }, source)).rejects.toThrow(/QR image/i);
    expect(invoked).toBe(false);
  });

  it('rejects unsupported image types and accepts a locally decoded URI', async () => {
    const invalid: LocalOtpImageSource = {
      name: 'code.svg',
      size: 10,
      type: 'image/svg+xml',
      arrayBuffer: async () => new ArrayBuffer(10),
    };
    await expect(importTotpFromImage({ decodeOtpAuthUri: async () => uri }, invalid)).rejects.toThrow(/image type/i);

    const valid: LocalOtpImageSource = { ...invalid, name: 'code.png', type: 'image/png' };
    await expect(importTotpFromImage({ decodeOtpAuthUri: async () => uri }, valid)).resolves.toMatchObject({ account: 'oven' });
  });
});

describe('code and list view models', () => {
  it('provides current, next, grouped, and countdown values at a period boundary', async () => {
    const profile = createManualTotpProfile({ issuer: 'Bakery', account: 'oven', secret: RFC_SHA1_SECRET });
    const model = await createTotpCodeViewModel(profile, 29_250);
    expect(model.currentCode).toBe(await totp(profile.secret, 29_250, profile));
    expect(model.nextCode).toBe(await totp(profile.secret, 30_000, profile));
    expect(model.groupedCurrentCode.replaceAll(' ', '')).toBe(model.currentCode);
    expect(model.remainingMilliseconds).toBe(750);
    expect(model.remainingSeconds).toBe(1);
    expect(model.elapsedFraction).toBeCloseTo(0.975);
  });

  it('groups, searches metadata only, and performs visible bulk selection', () => {
    const entries = [
      entry('a', 'Bakery', 'alice@example.test', 'Work'),
      entry('b', 'Cafe', 'bob@example.test', 'Work'),
      entry('c', 'Home', 'carol@example.test', 'Personal'),
    ];
    const work = createTotpListModel(entries, { query: 'bak', group: 'Work' });
    expect(visibleTotpEntries(work).map(({ id }) => id)).toEqual(['a']);
    expect(totpGroupSummary(entries)).toEqual([
      { group: 'Personal', count: 1 },
      { group: 'Work', count: 2 },
    ]);

    const secretSearch = createTotpListModel(entries, { query: RFC_SHA1_SECRET, group: null });
    expect(visibleTotpEntries(secretSearch)).toEqual([]);

    const allWork = createTotpListModel(entries, { query: '', group: 'Work' });
    const selected = selectAllVisibleTotp(allWork);
    expect(selected.selectedIds).toEqual(['a', 'b']);
    expect(selectedTotpEntries(selected).map(({ id }) => id)).toEqual(['a', 'b']);
    expect(invertVisibleTotpSelection(selected).selectedIds).toEqual([]);
    expect(toggleTotpSelection(allWork, 'c').selectedIds).toEqual(['c']);
    expect(clearTotpSelection(toggleTotpSelection(allWork, 'c')).selectedIds).toEqual([]);
  });

  it('keeps the completeness boundaries red when entries disappear or duplicate', () => {
    const duplicate = [entry('same', 'A', 'a', ''), entry('same', 'B', 'b', '')];
    expect(() => createTotpListModel(duplicate)).toThrow(/duplicated/i);

    // Deliberate negative regression: a list beyond the hand-written cap must
    // fail instead of silently dropping the last entry.
    const one = entry('seed', 'A', 'a', '');
    const oversized = Array.from({ length: OTP_ENTRY_LIMIT + 1 }, (_, index) => ({ ...one, id: `id-${index}` }));
    expect(() => createTotpListModel(oversized)).toThrow(new RegExp(String(OTP_ENTRY_LIMIT)));
  });
});
