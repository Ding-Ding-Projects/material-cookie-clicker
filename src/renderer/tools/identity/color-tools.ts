import { contrastRatio, convertColor, formatColor, isOutOfGamut, parseColor, type ColorSpace, type ParsedColor } from "../../../../packages/surface-kernel/src/color";

export interface CmykColor { c: number; m: number; y: number; k: number; alpha: number }

export function rgbToCmyk(color: ParsedColor): CmykColor {
  const rgb = convertColor(color, "rgb");
  const [r, g, b] = rgb.coords.map((channel) => Math.min(1, Math.max(0, channel / 255)));
  const k = 1 - Math.max(r ?? 0, g ?? 0, b ?? 0);
  if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 100, alpha: rgb.alpha };
  return { c: ((1 - (r ?? 0) - k) / (1 - k)) * 100, m: ((1 - (g ?? 0) - k) / (1 - k)) * 100, y: ((1 - (b ?? 0) - k) / (1 - k)) * 100, k: k * 100, alpha: rgb.alpha };
}

export function cmykToRgb(value: CmykColor): ParsedColor {
  const unit = (channel: number) => Math.min(1, Math.max(0, channel / 100));
  const k = unit(value.k);
  return { space: "rgb", coords: [255 * (1 - unit(value.c)) * (1 - k), 255 * (1 - unit(value.m)) * (1 - k), 255 * (1 - unit(value.y)) * (1 - k)], alpha: Math.min(1, Math.max(0, value.alpha)) };
}

export function describeColor(input: string, foreground = "#000000") {
  const parsed = parseColor(input);
  if ("error" in parsed) return { ok: false as const, reason: parsed.error };
  const fg = parseColor(foreground);
  if ("error" in fg) return { ok: false as const, reason: fg.error };
  const spaces: ColorSpace[] = ["named", "hex", "rgb", "hsl", "hwb", "lab", "lch", "oklab", "oklch"];
  return {
    ok: true as const,
    parsed,
    translations: Object.fromEntries(spaces.map((space) => [space, formatColor(parsed, space)])),
    cmyk: rgbToCmyk(parsed),
    outOfSrgbGamut: isOutOfGamut(parsed, "rgb"),
    contrast: contrastRatio(parsed, fg),
  };
}
