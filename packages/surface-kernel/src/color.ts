/**
 * Colour parsing, conversion and contrast reporting.
 *
 * This replaces the single crude luminance comparison the documentation site
 * shipped, which only ever chose between two fixed foreground colours. Values
 * that fall outside a destination gamut are reported as out of gamut rather
 * than quietly clamped, so a colour picker can tell the truth about what a
 * display will actually show.
 *
 * Conversions follow the CSS Color 4 definitions: sRGB with the standard
 * transfer function, CIE Lab and LCH on the D50 white point with Bradford
 * adaptation, and Oklab and Oklch on D65.
 */

export type ColorSpace = "hex" | "rgb" | "hsl" | "hwb" | "lab" | "lch" | "oklab" | "oklch" | "named";

export type ParsedColor = {
  space: ColorSpace;
  /** Channel values in the conventions documented for each space. */
  coords: [number, number, number];
  alpha: number;
};

export type ColorError = { error: string };

export type TextSize = "normal" | "large";

type Triple = [number, number, number];
type Matrix = [Triple, Triple, Triple];

/**
 * The colour keywords this module accepts. The list is deliberately the CSS
 * Level 1 keyword set plus `orange` and `transparent`; any other keyword is
 * reported as unrecognized instead of being guessed at.
 */
export const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  orange: "#ffa500",
};

const GAMUT_EPSILON = 1e-5;

const LINEAR_SRGB_TO_XYZ_D65: Matrix = [
  [0.4123907992659595, 0.35758433938387796, 0.1804807884018343],
  [0.21263900587151036, 0.7151686787677559, 0.07219231536073371],
  [0.019330818715591851, 0.11919477979462599, 0.9505321522496607],
];

const XYZ_D65_TO_LINEAR_SRGB: Matrix = [
  [3.2409699419045213, -1.5373831775700935, -0.4986107602930033],
  [-0.9692436362808798, 1.8759675015077206, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const XYZ_D65_TO_D50: Matrix = [
  [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
  [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
  [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];

const XYZ_D50_TO_D65: Matrix = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

const XYZ_D65_TO_LMS: Matrix = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446865574018],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];

const LMS_TO_XYZ_D65: Matrix = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const LMS_TO_OKLAB: Matrix = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

const OKLAB_TO_LMS: Matrix = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

const D50_WHITE: Triple = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585];
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function multiply(matrix: Matrix, vector: Triple): Triple {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function srgbToLinear(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const magnitude = Math.abs(channel);
  return magnitude <= 0.04045 ? channel / 12.92 : sign * ((magnitude + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const magnitude = Math.abs(channel);
  return magnitude <= 0.0031308 ? channel * 12.92 : sign * (1.055 * magnitude ** (1 / 2.4) - 0.055);
}

function hueToRgb(hue: number, saturation: number, lightness: number): Triple {
  const h = ((hue % 360) + 360) % 360;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const component = (n: number): number => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [component(0), component(8), component(4)];
}

function rgbToHsl(rgb: Triple): Triple {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness * 100];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, Math.min(1, Math.max(0, saturation)) * 100, lightness * 100];
}

/** Gamma-encoded sRGB in 0..1, which may fall outside the range. */
function toSrgb(color: ParsedColor): Triple {
  const [a, b, c] = color.coords;
  switch (color.space) {
    case "hex":
    case "rgb":
    case "named":
      return [a / 255, b / 255, c / 255];
    case "hsl":
      return hueToRgb(a, b / 100, c / 100);
    case "hwb": {
      const white = b / 100;
      const black = c / 100;
      if (white + black >= 1) {
        const grey = white / (white + black);
        return [grey, grey, grey];
      }
      const base = hueToRgb(a, 1, 0.5);
      return [
        base[0] * (1 - white - black) + white,
        base[1] * (1 - white - black) + white,
        base[2] * (1 - white - black) + white,
      ];
    }
    case "lab":
    case "lch": {
      const lab: Triple = color.space === "lab" ? [a, b, c] : lchToLab([a, b, c]);
      const xyzD50 = labToXyzD50(lab);
      const xyzD65 = multiply(XYZ_D50_TO_D65, xyzD50);
      return multiply(XYZ_D65_TO_LINEAR_SRGB, xyzD65).map(linearToSrgb) as Triple;
    }
    case "oklab":
    case "oklch": {
      const oklab: Triple = color.space === "oklab" ? [a, b, c] : lchToLab([a, b, c]);
      const lms = multiply(OKLAB_TO_LMS, oklab).map((value) => value ** 3) as Triple;
      const xyzD65 = multiply(LMS_TO_XYZ_D65, lms);
      return multiply(XYZ_D65_TO_LINEAR_SRGB, xyzD65).map(linearToSrgb) as Triple;
    }
    default:
      return [0, 0, 0];
  }
}

function labToXyzD50(lab: Triple): Triple {
  const [l, a, b] = lab;
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const x = fx ** 3 > LAB_EPSILON ? fx ** 3 : (116 * fx - 16) / LAB_KAPPA;
  const y = l > LAB_KAPPA * LAB_EPSILON ? ((l + 16) / 116) ** 3 : l / LAB_KAPPA;
  const z = fz ** 3 > LAB_EPSILON ? fz ** 3 : (116 * fz - 16) / LAB_KAPPA;
  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
}

function xyzD50ToLab(xyz: Triple): Triple {
  const scaled: Triple = [xyz[0] / D50_WHITE[0], xyz[1] / D50_WHITE[1], xyz[2] / D50_WHITE[2]];
  const f = scaled.map((value) =>
    value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116,
  ) as Triple;
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

function labToLch(lab: Triple): Triple {
  const [l, a, b] = lab;
  const chroma = Math.sqrt(a * a + b * b);
  let hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return [l, chroma, chroma < 1e-8 ? 0 : hue];
}

function lchToLab(lch: Triple): Triple {
  const [l, chroma, hue] = lch;
  const radians = (hue * Math.PI) / 180;
  return [l, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

function fromSrgb(rgb: Triple, space: ColorSpace): Triple {
  switch (space) {
    case "hex":
    case "rgb":
    case "named":
      return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
    case "hsl":
      return rgbToHsl(rgb);
    case "hwb": {
      const hsl = rgbToHsl(rgb);
      const white = Math.min(rgb[0], rgb[1], rgb[2]);
      const black = 1 - Math.max(rgb[0], rgb[1], rgb[2]);
      return [hsl[0], white * 100, black * 100];
    }
    case "lab":
    case "lch": {
      const linear = rgb.map(srgbToLinear) as Triple;
      const xyzD65 = multiply(LINEAR_SRGB_TO_XYZ_D65, linear);
      const lab = xyzD50ToLab(multiply(XYZ_D65_TO_D50, xyzD65));
      return space === "lab" ? lab : labToLch(lab);
    }
    case "oklab":
    case "oklch": {
      const linear = rgb.map(srgbToLinear) as Triple;
      const xyzD65 = multiply(LINEAR_SRGB_TO_XYZ_D65, linear);
      const lms = multiply(XYZ_D65_TO_LMS, xyzD65).map((value) => Math.cbrt(value)) as Triple;
      const oklab = multiply(LMS_TO_OKLAB, lms);
      return space === "oklab" ? oklab : labToLch(oklab);
    }
    default:
      return [0, 0, 0];
  }
}

function readNumber(token: string, scale: number): number | null {
  const trimmed = token.trim().toLowerCase();
  if (trimmed === "none") return 0;
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? (percent / 100) * scale : null;
  }
  if (trimmed.endsWith("deg")) {
    const degrees = Number.parseFloat(trimmed.slice(0, -3));
    return Number.isFinite(degrees) ? degrees : null;
  }
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
}

function splitArguments(body: string): { channels: string[]; alpha: string | null } {
  const [main, alphaPart] = body.split("/");
  const channels = (main ?? "")
    .replaceAll(",", " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return { channels, alpha: alphaPart === undefined ? null : alphaPart.trim() };
}

function readAlpha(token: string | null): number {
  if (token === null) return 1;
  const value = readNumber(token, 1);
  if (value === null) return 1;
  return Math.min(1, Math.max(0, value));
}

function parseHex(input: string): ParsedColor | ColorError {
  const body = input.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(body) || ![3, 4, 6, 8].includes(body.length)) {
    return { error: "A hexadecimal colour must use 3, 4, 6 or 8 hexadecimal digits." };
  }
  const expand = (value: string): number => Number.parseInt(value.length === 1 ? value + value : value, 16);
  const size = body.length <= 4 ? 1 : 2;
  const parts: string[] = [];
  for (let index = 0; index < body.length; index += size) parts.push(body.slice(index, index + size));
  const [r, g, b, a] = parts;
  return {
    space: "hex",
    coords: [expand(r ?? "0"), expand(g ?? "0"), expand(b ?? "0")],
    alpha: a === undefined ? 1 : expand(a) / 255,
  };
}

/** Parses a colour string, or returns a plain reason. */
export function parseColor(input: string): ParsedColor | ColorError {
  const text = input.trim();
  if (text.length === 0) return { error: "Enter a colour value." };
  if (text.startsWith("#")) return parseHex(text);

  const named = NAMED_COLORS[text.toLowerCase()];
  if (named) {
    const parsed = parseHex(named);
    if ("error" in parsed) return parsed;
    return { space: "named", coords: parsed.coords, alpha: 1 };
  }
  if (text.toLowerCase() === "transparent") {
    return { space: "named", coords: [0, 0, 0], alpha: 0 };
  }

  const call = /^([a-z]+)\((.*)\)$/i.exec(text);
  if (!call) return { error: "The value is not a recognized colour." };
  const fn = (call[1] ?? "").toLowerCase();
  const { channels, alpha } = splitArguments(call[2] ?? "");
  if (channels.length !== 3) return { error: `The ${fn}() function takes three channel values.` };
  const [first, second, third] = channels as [string, string, string];

  const build = (space: ColorSpace, coords: [number | null, number | null, number | null]): ParsedColor | ColorError => {
    if (coords[0] === null || coords[1] === null || coords[2] === null) {
      return { error: `One of the ${fn}() channel values is not a number.` };
    }
    return { space, coords: [coords[0], coords[1], coords[2]], alpha: readAlpha(alpha) };
  };

  switch (fn) {
    case "rgb":
    case "rgba":
      return build("rgb", [readNumber(first, 255), readNumber(second, 255), readNumber(third, 255)]);
    case "hsl":
    case "hsla":
      return build("hsl", [readNumber(first, 360), readNumber(second, 100), readNumber(third, 100)]);
    case "hwb":
      return build("hwb", [readNumber(first, 360), readNumber(second, 100), readNumber(third, 100)]);
    case "lab":
      return build("lab", [readNumber(first, 100), readNumber(second, 125), readNumber(third, 125)]);
    case "lch":
      return build("lch", [readNumber(first, 100), readNumber(second, 150), readNumber(third, 360)]);
    case "oklab":
      return build("oklab", [readNumber(first, 1), readNumber(second, 0.4), readNumber(third, 0.4)]);
    case "oklch":
      return build("oklch", [readNumber(first, 1), readNumber(second, 0.4), readNumber(third, 360)]);
    default:
      return { error: `The ${fn}() colour function is not supported.` };
  }
}

/** Converts a parsed colour into another space without clamping. */
export function convertColor(color: ParsedColor, space: ColorSpace): ParsedColor {
  if (color.space === space) return { ...color, coords: [...color.coords] as Triple };
  return { space, coords: fromSrgb(toSrgb(color), space), alpha: color.alpha };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function hexPart(value: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

/** Serializes a colour in the requested space using CSS syntax. */
export function formatColor(color: ParsedColor, space: ColorSpace): string {
  const converted = convertColor(color, space);
  const [a, b, c] = converted.coords;
  const alpha = converted.alpha;
  const alphaSuffix = alpha >= 1 ? "" : ` / ${round(alpha, 3)}`;
  switch (space) {
    case "hex":
      return `#${hexPart(a)}${hexPart(b)}${hexPart(c)}${alpha >= 1 ? "" : hexPart(alpha * 255)}`;
    case "named": {
      const hex = formatColor(converted, "hex");
      const match = Object.entries(NAMED_COLORS).find(([, value]) => value === hex);
      return match ? match[0] : hex;
    }
    case "rgb":
      return `rgb(${Math.round(a)} ${Math.round(b)} ${Math.round(c)}${alphaSuffix})`;
    case "hsl":
      return `hsl(${round(a, 2)} ${round(b, 2)}% ${round(c, 2)}%${alphaSuffix})`;
    case "hwb":
      return `hwb(${round(a, 2)} ${round(b, 2)}% ${round(c, 2)}%${alphaSuffix})`;
    case "lab":
      return `lab(${round(a, 3)} ${round(b, 3)} ${round(c, 3)}${alphaSuffix})`;
    case "lch":
      return `lch(${round(a, 3)} ${round(b, 3)} ${round(c, 3)}${alphaSuffix})`;
    case "oklab":
      return `oklab(${round(a, 4)} ${round(b, 4)} ${round(c, 4)}${alphaSuffix})`;
    case "oklch":
      return `oklch(${round(a, 4)} ${round(b, 4)} ${round(c, 4)}${alphaSuffix})`;
    default:
      return formatColor(converted, "hex");
  }
}

/** WCAG 2 relative luminance of the colour as an sRGB display would show it. */
export function relativeLuminance(color: ParsedColor): number {
  const [r, g, b] = toSrgb(color).map((channel) => srgbToLinear(Math.min(1, Math.max(0, channel)))) as Triple;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: ParsedColor, b: ParsedColor): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Reports the highest WCAG 2 level a contrast ratio satisfies for a text size. */
export function wcagVerdict(ratio: number, size: TextSize): "AAA" | "AA" | "AA Large" | "Fail" {
  if (size === "large") {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA";
    return "Fail";
  }
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

/**
 * Reports whether the colour falls outside the destination gamut. Lab, LCH,
 * Oklab and Oklch are unbounded, so a colour is only out of gamut relative to
 * the sRGB-bounded spaces, and the answer is reported rather than clamped away.
 */
export function isOutOfGamut(color: ParsedColor, space: ColorSpace): boolean {
  if (space === "lab" || space === "lch" || space === "oklab" || space === "oklch") return false;
  return toSrgb(color).some((channel) => channel < -GAMUT_EPSILON || channel > 1 + GAMUT_EPSILON);
}

/** Picks the shipped foreground colour with the better measured contrast. */
export function readableForeground(background: ParsedColor, candidates: ParsedColor[]): ParsedColor | null {
  let best: ParsedColor | null = null;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}
