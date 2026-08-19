export const CONVERTER_CATEGORIES = [
  'documents-pdf',
  'images',
  'audio',
  'video',
  'archives',
  'structured-data',
  'code-text',
  'binary-encodings',
] as const;

export type ConverterCategory = (typeof CONVERTER_CATEGORIES)[number];

export interface ConverterCategoryDefinition {
  readonly id: ConverterCategory;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly descriptionEn: string;
  readonly descriptionYue: string;
}

export interface ConverterAdapterDefinition {
  readonly id: string;
  readonly category: ConverterCategory;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly sourceTypes: readonly DetectedFileType[];
  readonly targetType: DetectedFileType;
  readonly enabled: boolean;
  readonly bundled: boolean;
  readonly lossless: boolean;
  readonly metadataBehavior: string;
  readonly encodingBehavior: string;
  readonly maximumInputBytes: number;
  readonly disabledReason?: string;
}

export type DetectedFileType =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'wav'
  | 'mp3'
  | 'mp4'
  | 'webm'
  | 'zip'
  | '7z'
  | 'json'
  | 'csv'
  | 'text'
  | 'base64'
  | 'unknown';

export const CONVERTER_CATEGORY_DEFINITIONS: readonly ConverterCategoryDefinition[] = [
  {
    id: 'documents-pdf',
    nameEn: 'Documents / PDF',
    nameYue: '文件 / PDF',
    descriptionEn: 'Bounded PDF inspection and page operations for classic, unencrypted PDFs.',
    descriptionYue: '為傳統、無加密 PDF 提供有限度檢查同頁面操作。',
  },
  { id: 'images', nameEn: 'Images', nameYue: '圖片', descriptionEn: 'Image formats and declared local adapters.', descriptionYue: '圖片格式同已聲明嘅本機轉換器。' },
  { id: 'audio', nameEn: 'Audio', nameYue: '音訊', descriptionEn: 'Audio formats and declared local adapters.', descriptionYue: '音訊格式同已聲明嘅本機轉換器。' },
  { id: 'video', nameEn: 'Video', nameYue: '影片', descriptionEn: 'Video formats and declared local adapters.', descriptionYue: '影片格式同已聲明嘅本機轉換器。' },
  { id: 'archives', nameEn: 'Archives', nameYue: '壓縮檔', descriptionEn: 'Archive formats and declared local adapters.', descriptionYue: '壓縮格式同已聲明嘅本機轉換器。' },
  { id: 'structured-data', nameEn: 'Structured Data / Spreadsheets', nameYue: '結構化資料 / 試算表', descriptionEn: 'JSON and CSV transformations that keep every represented field.', descriptionYue: '保留所有可表示欄位嘅 JSON 同 CSV 轉換。' },
  { id: 'code-text', nameEn: 'Code / Text', nameYue: '程式碼 / 文字', descriptionEn: 'UTF-8 text normalization with explicit line-ending choices.', descriptionYue: 'UTF-8 文字標準化，清楚選擇換行格式。' },
  { id: 'binary-encodings', nameEn: 'Binary Encodings', nameYue: '二進制編碼', descriptionEn: 'Local Base64 encoding and decoding.', descriptionYue: '本機 Base64 編碼同解碼。' },
] as const;

const MIB = 1024 * 1024;

export const CONVERTER_ADAPTERS: readonly ConverterAdapterDefinition[] = [
  {
    id: 'json-pretty', category: 'structured-data', nameEn: 'JSON → formatted JSON', nameYue: 'JSON → 格式化 JSON',
    sourceTypes: ['json'], targetType: 'json', enabled: true, bundled: true, lossless: false,
    metadataBehavior: 'ECMAScript JSON parsing can round integers beyond the safe range, collapse duplicate keys, and normalize negative zero; review the preview before converting.', encodingBehavior: 'UTF-8 output with LF line endings.', maximumInputBytes: 4 * MIB,
  },
  {
    id: 'json-minify', category: 'structured-data', nameEn: 'JSON → compact JSON', nameYue: 'JSON → 精簡 JSON',
    sourceTypes: ['json'], targetType: 'json', enabled: true, bundled: true, lossless: false,
    metadataBehavior: 'ECMAScript JSON parsing can round integers beyond the safe range, collapse duplicate keys, and normalize negative zero; review the preview before converting.', encodingBehavior: 'UTF-8 output without insignificant whitespace.', maximumInputBytes: 4 * MIB,
  },
  {
    id: 'json-to-csv', category: 'structured-data', nameEn: 'JSON array → CSV', nameYue: 'JSON 陣列 → CSV',
    sourceTypes: ['json'], targetType: 'csv', enabled: true, bundled: true, lossless: false,
    metadataBehavior: 'Only flat objects with the same scalar fields are accepted; nested values are rejected.', encodingBehavior: 'UTF-8 CSV with RFC 4180 quoting and CRLF rows.', maximumInputBytes: 4 * MIB,
  },
  {
    id: 'csv-to-json', category: 'structured-data', nameEn: 'CSV → JSON array', nameYue: 'CSV → JSON 陣列',
    sourceTypes: ['csv'], targetType: 'json', enabled: true, bundled: true, lossless: false,
    metadataBehavior: 'Cells remain strings; duplicate headers are rejected.', encodingBehavior: 'UTF-8 formatted JSON with LF line endings.', maximumInputBytes: 4 * MIB,
  },
  {
    id: 'text-to-lf', category: 'code-text', nameEn: 'Text → LF', nameYue: '文字 → LF',
    sourceTypes: ['text', 'csv', 'json'], targetType: 'text', enabled: true, bundled: true, lossless: true,
    metadataBehavior: 'Text content is retained; only line endings change.', encodingBehavior: 'Validated UTF-8 with LF line endings.', maximumInputBytes: 16 * MIB,
  },
  {
    id: 'text-to-crlf', category: 'code-text', nameEn: 'Text → CRLF', nameYue: '文字 → CRLF',
    sourceTypes: ['text', 'csv', 'json'], targetType: 'text', enabled: true, bundled: true, lossless: true,
    metadataBehavior: 'Text content is retained; only line endings change.', encodingBehavior: 'Validated UTF-8 with CRLF line endings.', maximumInputBytes: 16 * MIB,
  },
  {
    id: 'bytes-to-base64', category: 'binary-encodings', nameEn: 'Bytes → Base64 text', nameYue: '位元組 → Base64 文字',
    sourceTypes: ['pdf', 'png', 'jpeg', 'gif', 'webp', 'wav', 'mp3', 'mp4', 'webm', 'zip', '7z', 'json', 'csv', 'text', 'unknown'],
    targetType: 'base64', enabled: true, bundled: true, lossless: true,
    metadataBehavior: 'Every source byte is represented; file-system metadata is not embedded.', encodingBehavior: 'RFC 4648 Base64 ASCII without line wrapping.', maximumInputBytes: 32 * MIB,
  },
  {
    id: 'base64-to-bytes', category: 'binary-encodings', nameEn: 'Base64 text → bytes', nameYue: 'Base64 文字 → 位元組',
    sourceTypes: ['base64', 'text'], targetType: 'unknown', enabled: true, bundled: true, lossless: true,
    metadataBehavior: 'The decoded bytes are emitted without guessing an extension.', encodingBehavior: 'Strict RFC 4648 Base64; whitespace is accepted and removed.', maximumInputBytes: 44 * MIB,
  },
  {
    id: 'pdf-page-tools', category: 'documents-pdf', nameEn: 'PDF page and metadata tools', nameYue: 'PDF 頁面同中繼資料工具',
    sourceTypes: ['pdf'], targetType: 'pdf', enabled: true, bundled: true, lossless: true,
    metadataBehavior: 'Classic unencrypted PDFs only; unsupported features are rejected before writing.', encodingBehavior: 'Binary PDF is rebuilt with a classic xref table and reopened for validation.', maximumInputBytes: 32 * MIB,
  },
  {
    id: 'office-to-pdf', category: 'documents-pdf', nameEn: 'Office documents → PDF', nameYue: 'Office 文件 → PDF', sourceTypes: ['unknown'], targetType: 'pdf', enabled: false, bundled: false, lossless: false,
    metadataBehavior: 'Unavailable.', encodingBehavior: 'Unavailable.', maximumInputBytes: 0,
    disabledReason: 'No offline Office document renderer is bundled; PATH and network fallbacks are prohibited.',
  },
  {
    id: 'image-transcode', category: 'images', nameEn: 'PNG / JPEG / WebP conversion', nameYue: 'PNG / JPEG / WebP 轉換', sourceTypes: ['png', 'jpeg', 'webp'], targetType: 'png', enabled: false, bundled: false, lossless: false,
    metadataBehavior: 'Unavailable.', encodingBehavior: 'Unavailable.', maximumInputBytes: 0,
    disabledReason: 'No isolated offline image codec is bundled.',
  },
  {
    id: 'audio-transcode', category: 'audio', nameEn: 'WAV / MP3 conversion', nameYue: 'WAV / MP3 轉換', sourceTypes: ['wav', 'mp3'], targetType: 'wav', enabled: false, bundled: false, lossless: false,
    metadataBehavior: 'Unavailable.', encodingBehavior: 'Unavailable.', maximumInputBytes: 0,
    disabledReason: 'No isolated offline audio codec is bundled.',
  },
  {
    id: 'video-transcode', category: 'video', nameEn: 'MP4 / WebM conversion', nameYue: 'MP4 / WebM 轉換', sourceTypes: ['mp4', 'webm'], targetType: 'mp4', enabled: false, bundled: false, lossless: false,
    metadataBehavior: 'Unavailable.', encodingBehavior: 'Unavailable.', maximumInputBytes: 0,
    disabledReason: 'No isolated offline video codec is bundled.',
  },
  {
    id: 'archive-repack', category: 'archives', nameEn: 'ZIP / 7z repack', nameYue: 'ZIP / 7z 重新封裝', sourceTypes: ['zip', '7z'], targetType: 'zip', enabled: false, bundled: false, lossless: true,
    metadataBehavior: 'Unavailable.', encodingBehavior: 'Unavailable.', maximumInputBytes: 0,
    disabledReason: 'No isolated offline archive engine is bundled.',
  },
] as const;

export function getConverterAdapter(id: string): ConverterAdapterDefinition | undefined {
  return CONVERTER_ADAPTERS.find((adapter) => adapter.id === id);
}

export function adaptersForCategory(category: ConverterCategory): readonly ConverterAdapterDefinition[] {
  return CONVERTER_ADAPTERS.filter((adapter) => adapter.category === category);
}

export function compatibleConverterAdapters(type: DetectedFileType): readonly ConverterAdapterDefinition[] {
  return CONVERTER_ADAPTERS.filter((adapter) => adapter.enabled && adapter.sourceTypes.includes(type));
}
