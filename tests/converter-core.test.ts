import { describe, expect, it } from 'vitest';

import { convertBytes, detectFileType, validateConvertedOutput } from '../src/shared/converter-core.js';
import { CONVERTER_ADAPTERS, CONVERTER_CATEGORIES } from '../src/shared/converter-registry.js';
import { converterSearchMatches, createConverterSearchState, runConverterSearchLab, validateConverterPattern } from '../src/shared/converter-search.js';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('converter registry and byte detection', () => {
  it('enumerates every required category and gives every category an adapter row', () => {
    expect(CONVERTER_CATEGORIES).toEqual([
      'documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings',
    ]);
    for (const category of CONVERTER_CATEGORIES) expect(CONVERTER_ADAPTERS.some((adapter) => adapter.category === category)).toBe(true);
  });

  it('keeps every enabled adapter bundled with a positive byte bound', () => {
    for (const adapter of CONVERTER_ADAPTERS.filter((entry) => entry.enabled)) {
      expect(adapter.bundled, adapter.id).toBe(true);
      expect(adapter.maximumInputBytes, adapter.id).toBeGreaterThan(0);
    }
    for (const adapter of CONVERTER_ADAPTERS.filter((entry) => !entry.enabled)) {
      expect(adapter.disabledReason, adapter.id).toMatch(/bundled|codec|engine|renderer/i);
    }
  });

  it('detects from bounded bytes rather than filenames or MIME claims', () => {
    expect(detectFileType(encode('%PDF-1.4\n')).type).toBe('pdf');
    expect(detectFileType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])).type).toBe('png');
    expect(detectFileType(encode('{"ok":true}')).type).toBe('json');
    expect(detectFileType(Uint8Array.from([0, 255, 2, 3])).type).toBe('unknown');
    expect(detectFileType(encode('test')).type).toBe('text');
  });
});

describe('bundled converter adapters', () => {
  it('formats and minifies JSON with output validation', () => {
    const pretty = convertBytes('json-pretty', encode('{"a":1,"b":[true]}'));
    expect(decode(pretty.output)).toContain('\n  "a": 1');
    validateConvertedOutput('json-pretty', pretty.output);
    expect(decode(convertBytes('json-minify', pretty.output).output)).toBe('{"a":1,"b":[true]}');
  });

  it('discloses that JSON reserialization is not lexically lossless', () => {
    const adapters = CONVERTER_ADAPTERS.filter((adapter) => adapter.id === 'json-pretty' || adapter.id === 'json-minify');
    expect(adapters.every((adapter) => !adapter.lossless && adapter.metadataBehavior.includes('safe range'))).toBe(true);
  });

  it('round-trips flat JSON records through RFC 4180 CSV quoting', () => {
    const csv = convertBytes('json-to-csv', encode('[{"name":"A, B","note":"say \\"hi\\""}]'));
    expect(decode(csv.output)).toBe('name,note\r\n"A, B","say ""hi"""');
    const json = convertBytes('csv-to-json', csv.output);
    expect(JSON.parse(decode(json.output))).toEqual([{ name: 'A, B', note: 'say "hi"' }]);
  });

  it('rejects nested JSON instead of silently dropping structure', () => {
    expect(() => convertBytes('json-to-csv', encode('[{"nested":{"lost":true}}]'))).toThrow(/flat objects/);
  });

  it('bounds structured input depth, CSV shape, and malformed quoting', () => {
    expect(() => convertBytes('json-pretty', encode(`${'['.repeat(65)}0${']'.repeat(65)}`))).toThrow(/nesting/);
    expect(() => convertBytes('csv-to-json', encode(`${Array.from({ length: 257 }, (_, index) => `h${index}`).join(',')}\n${Array.from({ length: 257 }, () => 'v').join(',')}`))).toThrow(/columns/);
    expect(() => convertBytes('csv-to-json', encode('name,value\n"closed"tail,x'))).toThrow(/closing quote/);
  });

  it('round-trips binary bytes through strict Base64 without guessing a file type', () => {
    const source = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const encoded = convertBytes('bytes-to-base64', source);
    const decoded = convertBytes('base64-to-bytes', encoded.output);
    expect(decoded.output).toEqual(source);
  });

  it('refuses disabled adapters and malformed Base64', () => {
    expect(() => convertBytes('image-transcode', Uint8Array.from([1]))).toThrow(/codec/);
    expect(() => convertBytes('base64-to-bytes', encode('not base64!!'))).toThrow(/Base64/);
  });
});

describe('bounded category regex search', () => {
  it('keeps plain search as the default and supports captures in the live lab', () => {
    expect(converterSearchMatches('JSON formatted output', { ...createConverterSearchState(), query: 'formatted' })).toBe(true);
    const state = { ...createConverterSearchState(), regex: true, pattern: '(JSON)\\s+(formatted)', flags: 'iu', sample: 'JSON formatted output' };
    expect(converterSearchMatches('JSON formatted output', state)).toBe(true);
    expect(runConverterSearchLab(state)[0].captures).toEqual(['JSON', 'formatted']);
  });

  it('rejects unbounded or ambiguous regex inputs', () => {
    expect(validateConverterPattern('(a+)+', 'u')).toMatch(/Nested/);
    expect(validateConverterPattern('(a)\\1', 'u')).toMatch(/Backreferences/);
    expect(validateConverterPattern('a', 'gg')).toMatch(/Supported flags/);
    expect(validateConverterPattern('^(a|aa)+$', 'u')).toMatch(/ambiguous/);
    expect(validateConverterPattern('(?=a)', 'u')).toMatch(/Lookarounds/);
  });
});
