/**
 * Local-only HOTP/TOTP and authenticator list utilities.
 *
 * The module deliberately has no persistence, network, logging, DOM, Electron,
 * or Node-only imports.  A renderer can use the platform Web Crypto object,
 * while tests and privileged boundaries may inject the same small crypto port.
 * QR rendering belongs to the renderer. Keeping this shared file standalone is
 * intentional: it is compiled by both the NodeNext main build and the browser
 * renderer build, so importing a TypeScript-source workspace package here would
 * make one of those two consumers own the other consumer's module rules.
 */

export const OTPAUTH_URI_MAX_LENGTH = 4_096;
export const OTP_LABEL_MAX_LENGTH = 256;
export const OTP_SECRET_MAX_LENGTH = 256;
export const OTP_SECRET_MAX_BYTES = 128;
export const OTP_GROUP_MAX_LENGTH = 80;
export const OTP_SEARCH_MAX_LENGTH = 256;
export const OTP_ENTRY_LIMIT = 10_000;
export const OTP_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const OTP_DRIFT_WINDOW_LIMIT = 10;
export const OTP_PERIOD_MIN_SECONDS = 5;
export const OTP_PERIOD_MAX_SECONDS = 300;
export const OTP_COUNTER_MAX = 0xffff_ffff_ffff_ffffn;

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type OtpDigits = 6 | 7 | 8;

export interface OtpCryptoPort {
  readonly subtle: {
    importKey(
      format: 'raw',
      keyData: Uint8Array,
      algorithm: { readonly name: 'HMAC'; readonly hash: string },
      extractable: false,
      keyUsages: readonly ['sign'],
    ): Promise<unknown>;
    sign(algorithm: 'HMAC', key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
  };
}

interface OtpBaseProfile {
  readonly issuer: string;
  readonly account: string;
  readonly secret: string;
  readonly algorithm: OtpAlgorithm;
  readonly digits: OtpDigits;
}

export interface TotpProfile extends OtpBaseProfile {
  readonly kind: 'totp';
  readonly periodSeconds: number;
}

export interface HotpProfile extends OtpBaseProfile {
  readonly kind: 'hotp';
  readonly counter: bigint;
}

export type OtpAuthProfile = TotpProfile | HotpProfile;

export interface ManualTotpInput {
  readonly issuer: string;
  readonly account: string;
  readonly secret: string;
  readonly algorithm?: OtpAlgorithm | string;
  readonly digits?: number;
  readonly periodSeconds?: number;
}

export interface TotpAuthenticatorEntry extends TotpProfile {
  readonly id: string;
  readonly group: string;
}

export interface TotpImportRequest {
  readonly profile: TotpProfile;
  readonly group: string;
}

export interface TotpCodeViewModel {
  readonly currentCode: string;
  readonly nextCode: string;
  readonly groupedCurrentCode: string;
  readonly groupedNextCode: string;
  readonly counter: bigint;
  readonly periodSeconds: number;
  readonly remainingMilliseconds: number;
  readonly remainingSeconds: number;
  readonly elapsedFraction: number;
}

export interface TotpListQuery {
  readonly query: string;
  readonly group: string | null;
}

export interface TotpListModel {
  readonly entries: readonly TotpAuthenticatorEntry[];
  readonly query: TotpListQuery;
  readonly selectedIds: readonly string[];
}

/** A local image/file shape; it intentionally does not require DOM `File`. */
export interface LocalOtpImageSource {
  readonly name: string;
  readonly size: number;
  readonly type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Host hook for an image/QR decoder. Implementations receive bounded local
 * bytes and return only decoded text; this module never uploads the image.
 */
export interface TotpImageImportAdapter {
  decodeOtpAuthUri(source: LocalOtpImageSource): Promise<string | null>;
}

/** Host hook for an explicit clipboard-read action. */
export interface TotpClipboardImportAdapter {
  readText(): Promise<string>;
}

const HASH_NAMES: Readonly<Record<OtpAlgorithm, string>> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const ALLOWED_URI_PARAMETERS = new Set([
  'secret',
  'issuer',
  'algorithm',
  'digits',
  'period',
  'counter',
]);

function fail(message: string): never {
  throw new Error(message);
}

function boundedText(value: string, name: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0) fail(`${name} is required.`);
  if (normalized.length > maximum) fail(`${name} must be ${maximum} characters or fewer.`);
  if (/\p{Cc}/u.test(normalized)) fail(`${name} contains a control character.`);
  return normalized;
}

function boundedOptionalText(value: string, name: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length > maximum) fail(`${name} must be ${maximum} characters or fewer.`);
  if (/\p{Cc}/u.test(normalized)) fail(`${name} contains a control character.`);
  return normalized;
}

function requireInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function normalizeOtpAlgorithm(value: string): OtpAlgorithm {
  const normalized = value.toUpperCase().replaceAll('-', '');
  if (normalized === 'SHA1' || normalized === 'SHA256' || normalized === 'SHA512') return normalized;
  return fail('The algorithm must be SHA1, SHA256, or SHA512.');
}

function normalizeDigits(value: number): OtpDigits {
  requireInteger(value, 'Digits', 6, 8);
  return value as OtpDigits;
}

/** Strict, canonical RFC 4648 base32 normalization. */
export function normalizeBase32Secret(value: string): string {
  if (value.length > OTP_SECRET_MAX_LENGTH + 64) {
    fail(`The shared secret must be ${OTP_SECRET_MAX_LENGTH} characters or fewer.`);
  }
  const withoutSeparators = value.trim().toUpperCase().replace(/[\s-]/g, '');
  const normalized = withoutSeparators.replace(/=+$/, '');
  if (normalized.length === 0) fail('The shared secret is required.');
  if (normalized.length > OTP_SECRET_MAX_LENGTH) {
    fail(`The shared secret must be ${OTP_SECRET_MAX_LENGTH} characters or fewer.`);
  }
  if (!/^[A-Z2-7]+$/.test(normalized)) fail('The shared secret is not valid base32.');
  const bytes = decodeBase32Unchecked(normalized);
  if (bytes.length === 0 || bytes.length > OTP_SECRET_MAX_BYTES) {
    fail(`The shared secret must decode to 1 through ${OTP_SECRET_MAX_BYTES} bytes.`);
  }
  // This rejects non-zero dangling bits instead of silently dropping them.
  if (encodeBase32Unchecked(bytes) !== normalized) fail('The shared secret has non-canonical trailing bits.');
  return normalized;
}

export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0 || bytes.length > OTP_SECRET_MAX_BYTES) {
    fail(`The shared secret must contain 1 through ${OTP_SECRET_MAX_BYTES} bytes.`);
  }
  return encodeBase32Unchecked(bytes);
}

export function decodeBase32(value: string): Uint8Array {
  return decodeBase32Unchecked(normalizeBase32Secret(value));
}

function encodeBase32Unchecked(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
  return output;
}

function decodeBase32Unchecked(value: string): Uint8Array {
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];
  for (const character of value) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) fail('The shared secret is not valid base32.');
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

function defaultCryptoPort(): OtpCryptoPort {
  const candidate = (globalThis as { readonly crypto?: unknown }).crypto as
    | { readonly subtle?: unknown }
    | undefined;
  if (!candidate?.subtle) fail('Web Crypto is unavailable on this device.');
  return candidate as OtpCryptoPort;
}

function counterBytes(counter: bigint): Uint8Array {
  if (counter < 0n || counter > OTP_COUNTER_MAX) {
    fail(`The counter must be between 0 and ${OTP_COUNTER_MAX.toString()}.`);
  }
  const bytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

async function hotpBytes(
  secret: Uint8Array,
  counter: bigint,
  algorithm: OtpAlgorithm,
  digits: OtpDigits,
  cryptoPort: OtpCryptoPort,
): Promise<string> {
  const key = await cryptoPort.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: HASH_NAMES[algorithm] },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await cryptoPort.subtle.sign('HMAC', key, counterBytes(counter)));
  if (digest.length < 20) fail('The HMAC result was shorter than RFC 4226 permits.');
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  if (offset + 3 >= digest.length) fail('The HMAC result cannot be dynamically truncated.');
  const binary =
    ((((digest[offset] ?? 0) & 0x7f) << 24) |
      (((digest[offset + 1] ?? 0) & 0xff) << 16) |
      (((digest[offset + 2] ?? 0) & 0xff) << 8) |
      ((digest[offset + 3] ?? 0) & 0xff)) >>>
    0;
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** RFC 4226 HOTP. */
export function hotp(
  secret: string,
  counter: bigint,
  options: {
    readonly algorithm?: OtpAlgorithm;
    readonly digits?: OtpDigits;
    readonly crypto?: OtpCryptoPort;
  } = {},
): Promise<string> {
  const algorithm = normalizeOtpAlgorithm(options.algorithm ?? 'SHA1');
  const digits = normalizeDigits(options.digits ?? 6);
  return hotpBytes(decodeBase32(secret), counter, algorithm, digits, options.crypto ?? defaultCryptoPort());
}

export function totpCounter(atMilliseconds: number, periodSeconds = 30): bigint {
  if (!Number.isFinite(atMilliseconds) || atMilliseconds < 0) fail('The time must be a non-negative number.');
  requireInteger(periodSeconds, 'Period', OTP_PERIOD_MIN_SECONDS, OTP_PERIOD_MAX_SECONDS);
  return BigInt(Math.floor(atMilliseconds / (periodSeconds * 1_000)));
}

/** RFC 6238 TOTP. */
export function totp(
  secret: string,
  atMilliseconds: number,
  options: {
    readonly algorithm?: OtpAlgorithm;
    readonly digits?: OtpDigits;
    readonly periodSeconds?: number;
    readonly crypto?: OtpCryptoPort;
  } = {},
): Promise<string> {
  const periodSeconds = options.periodSeconds ?? 30;
  return hotp(secret, totpCounter(atMilliseconds, periodSeconds), options);
}

function constantTimeCodeEquals(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyTotp(
  profile: TotpProfile,
  candidate: string,
  atMilliseconds: number,
  driftWindows = 1,
  cryptoPort?: OtpCryptoPort,
): Promise<boolean> {
  const compact = candidate.replace(/\s/g, '');
  if (!/^\d+$/.test(compact) || compact.length !== profile.digits) return false;
  requireInteger(driftWindows, 'Drift windows', 0, OTP_DRIFT_WINDOW_LIMIT);
  const centre = totpCounter(atMilliseconds, profile.periodSeconds);
  let accepted = false;
  const secret = decodeBase32(profile.secret);
  const crypto = cryptoPort ?? defaultCryptoPort();
  for (let offset = -driftWindows; offset <= driftWindows; offset += 1) {
    const counter = centre + BigInt(offset);
    if (counter < 0n) continue;
    const expected = await hotpBytes(secret, counter, profile.algorithm, profile.digits, crypto);
    if (constantTimeCodeEquals(expected, compact)) accepted = true;
  }
  return accepted;
}

export function createManualTotpProfile(input: ManualTotpInput): TotpProfile {
  return {
    kind: 'totp',
    issuer: boundedText(input.issuer, 'Issuer', OTP_LABEL_MAX_LENGTH),
    account: boundedText(input.account, 'Account', OTP_LABEL_MAX_LENGTH),
    secret: normalizeBase32Secret(input.secret),
    algorithm: normalizeOtpAlgorithm(input.algorithm ?? 'SHA1'),
    digits: normalizeDigits(input.digits ?? 6),
    periodSeconds: requireInteger(
      input.periodSeconds ?? 30,
      'Period',
      OTP_PERIOD_MIN_SECONDS,
      OTP_PERIOD_MAX_SECONDS,
    ),
  };
}

function parseDecimal(value: string | null, fallback: number, name: string): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) fail(`${name} must contain decimal digits only.`);
  return Number(value);
}

function parseCounter(value: string | null): bigint {
  if (value === null || !/^\d+$/.test(value)) fail('A HOTP URI requires a decimal counter.');
  const counter = BigInt(value);
  if (counter > OTP_COUNTER_MAX) fail(`The counter must be no greater than ${OTP_COUNTER_MAX.toString()}.`);
  return counter;
}

function decodeLabel(encodedPath: string): { readonly issuer: string; readonly account: string } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedPath);
  } catch {
    return fail('The otpauth label has invalid percent encoding.');
  }
  if (decoded.length > OTP_LABEL_MAX_LENGTH * 2 + 1) fail('The otpauth label is too long.');
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return { issuer: '', account: boundedText(decoded, 'Account', OTP_LABEL_MAX_LENGTH) };
  }
  return {
    issuer: boundedText(decoded.slice(0, separator), 'Issuer', OTP_LABEL_MAX_LENGTH),
    account: boundedText(decoded.slice(separator + 1), 'Account', OTP_LABEL_MAX_LENGTH),
  };
}

/** Strict, bounded parser for standard otpauth://totp and otpauth://hotp URIs. */
export function parseOtpAuthUri(input: string): OtpAuthProfile {
  if (input.length === 0 || input.length > OTPAUTH_URI_MAX_LENGTH) {
    fail(`The otpauth URI must contain 1 through ${OTPAUTH_URI_MAX_LENGTH} characters.`);
  }
  let uri: URL;
  try {
    uri = new URL(input);
  } catch {
    return fail('The value is not a valid otpauth URI.');
  }
  if (uri.protocol !== 'otpauth:') fail('The URI scheme must be otpauth.');
  const kind = uri.hostname.toLowerCase();
  if (kind !== 'totp' && kind !== 'hotp') fail('The otpauth type must be totp or hotp.');
  if (uri.username || uri.password || uri.port || uri.hash) fail('The otpauth URI contains unsupported authority data.');

  for (const [name] of uri.searchParams) {
    if (!ALLOWED_URI_PARAMETERS.has(name)) fail(`The otpauth parameter “${name}” is not supported.`);
    if (uri.searchParams.getAll(name).length !== 1) fail(`The otpauth parameter “${name}” is duplicated.`);
  }
  const label = decodeLabel(uri.pathname.replace(/^\//, ''));
  const queryIssuerValue = uri.searchParams.get('issuer');
  const queryIssuer = queryIssuerValue === null
    ? ''
    : boundedText(queryIssuerValue, 'Issuer', OTP_LABEL_MAX_LENGTH);
  if (label.issuer && queryIssuer && label.issuer !== queryIssuer) {
    fail('The issuer in the label does not match the issuer parameter.');
  }
  const issuer = label.issuer || queryIssuer;
  if (!issuer) fail('The issuer is required in the label or issuer parameter.');
  const secret = normalizeBase32Secret(uri.searchParams.get('secret') ?? '');
  const algorithm = normalizeOtpAlgorithm(uri.searchParams.get('algorithm') ?? 'SHA1');
  const digits = normalizeDigits(parseDecimal(uri.searchParams.get('digits'), 6, 'Digits'));
  const base = { issuer, account: label.account, secret, algorithm, digits };
  if (kind === 'totp') {
    if (uri.searchParams.has('counter')) fail('A TOTP URI cannot contain a counter.');
    return {
      kind: 'totp',
      ...base,
      periodSeconds: requireInteger(
        parseDecimal(uri.searchParams.get('period'), 30, 'Period'),
        'Period',
        OTP_PERIOD_MIN_SECONDS,
        OTP_PERIOD_MAX_SECONDS,
      ),
    };
  }
  if (uri.searchParams.has('period')) fail('A HOTP URI cannot contain a period.');
  return { kind: 'hotp', ...base, counter: parseCounter(uri.searchParams.get('counter')) };
}

function encodeUriPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function formatOtpAuthUri(profile: OtpAuthProfile): string {
  const issuer = boundedText(profile.issuer, 'Issuer', OTP_LABEL_MAX_LENGTH);
  const account = boundedText(profile.account, 'Account', OTP_LABEL_MAX_LENGTH);
  const secret = normalizeBase32Secret(profile.secret);
  const parameters = new URLSearchParams();
  parameters.set('secret', secret);
  parameters.set('issuer', issuer);
  parameters.set('algorithm', normalizeOtpAlgorithm(profile.algorithm));
  parameters.set('digits', normalizeDigits(profile.digits).toString());
  if (profile.kind === 'totp') {
    parameters.set(
      'period',
      requireInteger(
        profile.periodSeconds,
        'Period',
        OTP_PERIOD_MIN_SECONDS,
        OTP_PERIOD_MAX_SECONDS,
      ).toString(),
    );
  } else {
    counterBytes(profile.counter);
    parameters.set('counter', profile.counter.toString());
  }
  return `otpauth://${profile.kind}/${encodeUriPart(issuer)}:${encodeUriPart(account)}?${parameters.toString()}`;
}

export function asTotpProfile(profile: OtpAuthProfile): TotpProfile {
  if (profile.kind !== 'totp') fail('This authenticator surface accepts TOTP entries only.');
  return profile;
}

export async function importTotpFromClipboard(adapter: TotpClipboardImportAdapter): Promise<TotpProfile> {
  const text = await adapter.readText();
  return asTotpProfile(parseOtpAuthUri(text));
}

export async function importTotpFromImage(
  adapter: TotpImageImportAdapter,
  source: LocalOtpImageSource,
): Promise<TotpProfile> {
  if (!Number.isSafeInteger(source.size) || source.size <= 0 || source.size > OTP_IMAGE_MAX_BYTES) {
    fail(`The QR image must contain 1 through ${OTP_IMAGE_MAX_BYTES} bytes.`);
  }
  if (source.type && !/^image\/(?:png|jpeg|webp|gif|bmp)$/i.test(source.type)) {
    fail('The selected file is not an allowed QR image type.');
  }
  const text = await adapter.decodeOtpAuthUri(source);
  if (!text) fail('No otpauth QR code was found in the selected image.');
  return asTotpProfile(parseOtpAuthUri(text));
}

export function groupOtpCode(code: string): string {
  if (!/^\d{6,8}$/.test(code)) fail('An OTP code must contain 6 through 8 decimal digits.');
  return code.match(/.{1,2}/g)?.join(' ') ?? code;
}

export async function createTotpCodeViewModel(
  profile: TotpProfile,
  atMilliseconds: number,
  cryptoPort?: OtpCryptoPort,
): Promise<TotpCodeViewModel> {
  const validated = createManualTotpProfile(profile);
  const periodMilliseconds = validated.periodSeconds * 1_000;
  if (!Number.isFinite(atMilliseconds) || atMilliseconds < 0) fail('The time must be a non-negative number.');
  const withinPeriod = atMilliseconds % periodMilliseconds;
  const remainingMilliseconds = periodMilliseconds - withinPeriod;
  const counter = totpCounter(atMilliseconds, validated.periodSeconds);
  const secret = decodeBase32(validated.secret);
  const crypto = cryptoPort ?? defaultCryptoPort();
  const [currentCode, nextCode] = await Promise.all([
    hotpBytes(secret, counter, validated.algorithm, validated.digits, crypto),
    hotpBytes(secret, counter + 1n, validated.algorithm, validated.digits, crypto),
  ]);
  return {
    currentCode,
    nextCode,
    groupedCurrentCode: groupOtpCode(currentCode),
    groupedNextCode: groupOtpCode(nextCode),
    counter,
    periodSeconds: validated.periodSeconds,
    remainingMilliseconds,
    remainingSeconds: Math.ceil(remainingMilliseconds / 1_000),
    elapsedFraction: withinPeriod / periodMilliseconds,
  };
}

export function normalizeTotpGroup(value: string): string {
  return boundedOptionalText(value, 'Group', OTP_GROUP_MAX_LENGTH);
}

export function createTotpListModel(
  entries: readonly TotpAuthenticatorEntry[],
  query: TotpListQuery = { query: '', group: null },
  selectedIds: readonly string[] = [],
): TotpListModel {
  if (entries.length > OTP_ENTRY_LIMIT) fail(`The authenticator list cannot exceed ${OTP_ENTRY_LIMIT} entries.`);
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = boundedText(entry.id, 'Entry identifier', OTP_LABEL_MAX_LENGTH);
    if (seen.has(id)) fail(`The authenticator entry identifier “${id}” is duplicated.`);
    seen.add(id);
    createManualTotpProfile(entry);
    normalizeTotpGroup(entry.group);
  }
  const normalizedQuery = boundedOptionalText(query.query, 'Search', OTP_SEARCH_MAX_LENGTH);
  const group = query.group === null ? null : normalizeTotpGroup(query.group);
  const selected = [...new Set(selectedIds)].filter((id) => seen.has(id));
  return { entries: [...entries], query: { query: normalizedQuery, group }, selectedIds: selected };
}

function searchable(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

/** Secrets are intentionally excluded from the searchable projection. */
export function visibleTotpEntries(model: TotpListModel): readonly TotpAuthenticatorEntry[] {
  const query = searchable(model.query.query);
  return model.entries.filter((entry) => {
    if (model.query.group !== null && entry.group !== model.query.group) return false;
    if (!query) return true;
    return [entry.issuer, entry.account, entry.group].some((value) => searchable(value).includes(query));
  });
}

export function totpGroupSummary(
  entries: readonly TotpAuthenticatorEntry[],
): readonly { readonly group: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => left.group.localeCompare(right.group));
}

export function toggleTotpSelection(model: TotpListModel, id: string): TotpListModel {
  if (!model.entries.some((entry) => entry.id === id)) return model;
  const selected = new Set(model.selectedIds);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { ...model, selectedIds: [...selected] };
}

export function selectAllVisibleTotp(model: TotpListModel): TotpListModel {
  const selected = new Set(model.selectedIds);
  for (const entry of visibleTotpEntries(model)) selected.add(entry.id);
  return { ...model, selectedIds: [...selected] };
}

export function invertVisibleTotpSelection(model: TotpListModel): TotpListModel {
  const selected = new Set(model.selectedIds);
  for (const entry of visibleTotpEntries(model)) {
    if (selected.has(entry.id)) selected.delete(entry.id);
    else selected.add(entry.id);
  }
  return { ...model, selectedIds: [...selected] };
}

export function clearTotpSelection(model: TotpListModel): TotpListModel {
  return model.selectedIds.length === 0 ? model : { ...model, selectedIds: [] };
}

export function selectedTotpEntries(model: TotpListModel): readonly TotpAuthenticatorEntry[] {
  const selected = new Set(model.selectedIds);
  return model.entries.filter((entry) => selected.has(entry.id));
}
