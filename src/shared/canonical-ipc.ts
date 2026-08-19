export const CANONICAL_IPC_CHANNELS = {
  readSharedSettings: 'canonical:read-shared-settings',
  writeSharedSettings: 'canonical:write-shared-settings',
  openApplicationData: 'canonical:open-application-data',
  sharedSettingsChanged: 'canonical:shared-settings-changed',
} as const;

export interface CanonicalSharedSettings {
  readonly version: 1;
  readonly schoolMode: boolean;
  readonly schoolModeName: string;
  readonly updatedAt: string;
}

export type CanonicalReadResult =
  | { readonly ok: true; readonly settings: CanonicalSharedSettings }
  | { readonly ok: false; readonly reason: string };

export type CanonicalWriteResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface CanonicalIpcApi {
  readSharedSettings(): Promise<CanonicalReadResult>;
  writeSharedSettings(settings: CanonicalSharedSettings): Promise<CanonicalWriteResult>;
  openApplicationData(): Promise<CanonicalWriteResult>;
  onSharedSettings(listener: (settings: CanonicalSharedSettings) => void): () => void;
}

export function normalizeCanonicalSharedSettings(value: unknown): CanonicalSharedSettings {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const name = typeof record.schoolModeName === 'string' ? record.schoolModeName.trim().slice(0, 48) : '';
  return {
    version: 1,
    schoolMode: record.schoolMode === true,
    schoolModeName: name || 'School mode',
    updatedAt: typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt))
      ? record.updatedAt
      : new Date(0).toISOString(),
  };
}
