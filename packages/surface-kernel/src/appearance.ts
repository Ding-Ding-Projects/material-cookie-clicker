/**
 * Per-element appearance overrides.
 *
 * A person may restyle an individual element, but only through an allowlist of
 * custom properties and only with bounded, inert values. No value may contain
 * a URL, a declaration terminator or a block terminator, so an override cannot
 * escape the property it belongs to.
 */

export type ElementAppearance = Record<string, string>;
export type AppearanceStore = Record<string, ElementAppearance>;

export const APPEARANCE_SCHEMA_VERSION = 1;
export const MAX_APPEARANCE_ELEMENTS = 200;
export const MAX_APPEARANCE_VALUE_LENGTH = 120;
export const MAX_APPEARANCE_BYTES = 65536;

/** The custom properties an individual element is allowed to override. */
export const APPEARANCE_PROPERTIES: readonly string[] = [
  "--element-font-family",
  "--element-font-size",
  "--element-font-weight",
  "--element-line-height",
  "--element-letter-spacing",
  "--element-text-transform",
  "--element-surface",
  "--element-on-surface",
  "--element-outline",
  "--element-accent",
  "--element-radius",
  "--element-padding",
];

const FORBIDDEN_VALUE = /url\(|expression\(|[;{}<>]|@import|\\/i;

export type AppearanceVerdict = { ok: true; store: AppearanceStore } | { ok: false; reason: string };

/** Rejects unknown properties and any value that is not inert. */
export function isAllowedAppearanceValue(property: string, value: string): boolean {
  if (!APPEARANCE_PROPERTIES.includes(property)) return false;
  if (value.length === 0 || value.length > MAX_APPEARANCE_VALUE_LENGTH) return false;
  return !FORBIDDEN_VALUE.test(value);
}

/** Later stores win, property by property. */
export function mergeAppearance(base: AppearanceStore, overlay: AppearanceStore): AppearanceStore {
  const merged: AppearanceStore = {};
  for (const [elementId, properties] of Object.entries(base)) merged[elementId] = { ...properties };
  for (const [elementId, properties] of Object.entries(overlay)) {
    merged[elementId] = { ...(merged[elementId] ?? {}), ...properties };
  }
  return merged;
}

/** Sets one property on one element, or returns the store unchanged. */
export function setAppearanceProperty(
  store: AppearanceStore,
  elementId: string,
  property: string,
  value: string,
): AppearanceStore {
  if (!elementId || !isAllowedAppearanceValue(property, value)) return store;
  if (!(elementId in store) && Object.keys(store).length >= MAX_APPEARANCE_ELEMENTS) return store;
  return { ...store, [elementId]: { ...(store[elementId] ?? {}), [property]: value } };
}

/** Removes one property from one element. */
export function resetAppearanceProperty(
  store: AppearanceStore,
  elementId: string,
  property: string,
): AppearanceStore {
  const current = store[elementId];
  if (!current || !(property in current)) return store;
  const next: ElementAppearance = { ...current };
  delete next[property];
  if (Object.keys(next).length === 0) {
    const withoutElement: AppearanceStore = { ...store };
    delete withoutElement[elementId];
    return withoutElement;
  }
  return { ...store, [elementId]: next };
}

/** Removes every override for one element. */
export function resetElementAppearance(store: AppearanceStore, elementId: string): AppearanceStore {
  if (!(elementId in store)) return store;
  const next: AppearanceStore = { ...store };
  delete next[elementId];
  return next;
}

/** Serializes a store as a portable preset document. */
export function exportAppearancePreset(store: AppearanceStore, name: string): string {
  return `${JSON.stringify(
    { version: APPEARANCE_SCHEMA_VERSION, name: name.slice(0, 80), elements: store },
    null,
    2,
  )}\n`;
}

/** Reads a preset document with the same bounded discipline as vocabulary. */
export function importAppearancePreset(raw: string): AppearanceVerdict {
  if (raw.length > MAX_APPEARANCE_BYTES) {
    return { ok: false, reason: `The preset exceeds the ${MAX_APPEARANCE_BYTES / 1024} KB local limit.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "The preset is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "The root must be an object." };
  }
  const record = parsed as Record<string, unknown>;
  const allowedRoot = new Set(["version", "name", "elements"]);
  if (
    Object.keys(record).some((key) => !allowedRoot.has(key)) ||
    record.version !== APPEARANCE_SCHEMA_VERSION ||
    !record.elements ||
    typeof record.elements !== "object" ||
    Array.isArray(record.elements)
  ) {
    return { ok: false, reason: "Use version 1 with one elements object and no other fields." };
  }
  const elements = Object.entries(record.elements as Record<string, unknown>);
  if (elements.length > MAX_APPEARANCE_ELEMENTS) {
    return { ok: false, reason: `At most ${MAX_APPEARANCE_ELEMENTS} elements are allowed.` };
  }
  const store: AppearanceStore = {};
  for (const [elementId, properties] of elements) {
    if (elementId.length < 1 || elementId.length > 120 || elementId === "__proto__") {
      return { ok: false, reason: "Every element identifier must be a safe 1-120 character string." };
    }
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      return { ok: false, reason: "Every element must map to an object of custom properties." };
    }
    const accepted: ElementAppearance = {};
    for (const [property, value] of Object.entries(properties as Record<string, unknown>)) {
      if (typeof value !== "string" || !isAllowedAppearanceValue(property, value)) {
        return { ok: false, reason: `The property "${property}" is not an allowed appearance override.` };
      }
      accepted[property] = value;
    }
    store[elementId] = accepted;
  }
  return { ok: true, store };
}
