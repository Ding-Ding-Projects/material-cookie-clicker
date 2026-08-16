// Standalone WCAG contrast verifier for Material Cookie Clicker's v2 "arcade cabinet" colour
// tokens. The project deliberately does not conform to Material Design 3 (see design/README.md);
// it keeps M3's primary/secondary/tertiary/surface role *vocabulary* as a naming convention only,
// and keeps computing real ratios rather than asserting them regardless of visual style.
//
// v2 deepened the palette (light = "bakery daytime", dark = "arcade night") and added the cabinet
// chrome roles: the radial oven-glow background stops (--bg-core / --bg-edge), the inset HUD bezel
// face (--panel-inset), and the bronze tier that v1 never checked. Every stop of every gradient a
// glyph can land on is checked here, not just flat panels — a radial background means text sits on
// a *range* of colours, so both ends of that range are verified.
//
// Not shipped to the app; used only to derive/verify the values baked into the HTML specs.
// Run: node design/_verify/contrast-check.mjs

function srgbToLin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [R, G, B] = [srgbToLin(r), srgbToLin(g), srgbToLin(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function ratio(hex1, hex2) {
  const L1 = luminance(hex1);
  const L2 = luminance(hex2);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

const pairs = {
  light: [
    // --- core role pairs ---
    ['on-primary on primary', '#FFFFFF', '#7A4A1D'],
    ['on-primary-container on primary-container', '#3A2100', '#FFDCB8'],
    ['on-secondary on secondary', '#FFFFFF', '#6B4C3F'],
    ['on-secondary-container on secondary-container', '#2C160B', '#FFDBCB'],
    ['on-tertiary on tertiary', '#FFFFFF', '#5C4E00'],
    ['on-tertiary-container on tertiary-container', '#221B00', '#F8E287'],
    ['on-surface on surface', '#1E1610', '#FFF3E6'],
    ['on-surface-variant on surface-variant', '#4A3D2E', '#F0DCC4'],
    ['outline on surface (non-text min 3:1)', '#75634E', '#FFF3E6'],
    ['on-error on error', '#FFFFFF', '#BA1A1A'],
    ['on-error-container on error-container', '#410002', '#FFDAD6'],
    ['primary on surface (large/UI 3:1)', '#7A4A1D', '#FFF3E6'],
    ['tertiary on surface (large/UI 3:1)', '#5C4E00', '#FFF3E6'],

    // --- v2 cabinet chrome: oven-glow background stops carry body text ---
    ['on-surface on bg-core (glow centre)', '#1E1610', '#FFF6EC'],
    ['on-surface on bg-mid (glow falloff)', '#1E1610', '#FAECDA'],
    ['on-surface-variant on bg-mid', '#4A3D2E', '#FAECDA'],
    ['on-surface on bg-edge (glow rim)', '#1E1610', '#EFDCC0'],
    ['on-surface-variant on bg-core', '#4A3D2E', '#FFF6EC'],
    ['on-surface-variant on bg-edge', '#4A3D2E', '#EFDCC0'],
    ['outline on bg-edge (non-text min 3:1)', '#75634E', '#EFDCC0'],

    // --- v2 HUD: inset bezel tile face and container ladder ---
    ['on-surface on panel-inset (HUD bezel face)', '#1E1610', '#FFFBF4'],
    ['on-surface-variant on panel-inset', '#4A3D2E', '#FFFBF4'],
    ['on-surface on surface-container-high', '#1E1610', '#F5DFC4'],
    ['on-surface-variant on surface-container-high', '#4A3D2E', '#F5DFC4'],
    ['on-surface on surface-container-highest', '#1E1610', '#EED5B4'],
    ['on-surface-variant on surface-container-highest', '#4A3D2E', '#EED5B4'],

    // --- arcade spark accent (ring is the only text/UI-bearing spark role) ---
    ['spark-ring on surface (non-text min 3:1)', '#9C4B00', '#FFF3E6'],
    ['spark-ring on panel-inset (non-text min 3:1)', '#9C4B00', '#FFFBF4'],
    ['spark-ring as text on surface', '#9C4B00', '#FFF3E6'],
    ['spark-ring as text on surface-container-high', '#9C4B00', '#F5DFC4'],

    // --- jewel tool-tier ladder (bronze / emerald / amethyst) ---
    ['on-tier1 on tier1', '#FFFFFF', '#8A4E12'],
    ['on-tier1-container on tier1-container', '#2E1600', '#FFDCBA'],
    ['tier1 on surface (large/UI 3:1)', '#8A4E12', '#FFF3E6'],
    ['on-tier2 on tier2', '#FFFFFF', '#1F6337'],
    ['on-tier2-container on tier2-container', '#04210D', '#B8F0C4'],
    ['tier2 on surface (large/UI 3:1)', '#1F6337', '#FFF3E6'],
    ['on-tier3 on tier3', '#FFFFFF', '#533593'],
    ['on-tier3-container on tier3-container', '#20004D', '#E6D9FF'],
    ['tier3 on surface (large/UI 3:1)', '#533593', '#FFF3E6'],
  ],
  dark: [
    // --- core role pairs ---
    ['on-primary on primary', '#4A2800', '#FFB876'],
    ['on-primary-container on primary-container', '#FFDCB8', '#693C00'],
    ['on-secondary on secondary', '#44291E', '#E6BEAC'],
    ['on-secondary-container on secondary-container', '#FFDBCB', '#5D3F32'],
    ['on-tertiary on tertiary', '#383000', '#DBC66E'],
    ['on-tertiary-container on tertiary-container', '#F8E287', '#514600'],
    ['on-surface on surface', '#F2E4D6', '#120C08'],
    ['on-surface-variant on surface-variant', '#D8C8B4', '#453A2E'],
    ['outline on surface (non-text min 3:1)', '#A08D78', '#120C08'],
    ['on-error on error', '#690005', '#FFB4AB'],
    ['on-error-container on error-container', '#FFDAD6', '#93000A'],
    ['primary on surface (large/UI 3:1)', '#FFB876', '#120C08'],
    ['tertiary on surface (large/UI 3:1)', '#DBC66E', '#120C08'],

    // --- v2 cabinet chrome: oven-glow background stops carry body text ---
    ['on-surface on bg-core (glow centre)', '#F2E4D6', '#2A1A0A'],
    ['on-surface on bg-mid (glow falloff)', '#F2E4D6', '#1A1008'],
    ['on-surface-variant on bg-mid', '#D8C8B4', '#1A1008'],
    ['on-surface on bg-edge (glow rim)', '#F2E4D6', '#0A0705'],
    ['on-surface-variant on bg-core', '#D8C8B4', '#2A1A0A'],
    ['on-surface-variant on bg-edge', '#D8C8B4', '#0A0705'],
    ['outline on bg-core (non-text min 3:1)', '#A08D78', '#2A1A0A'],

    // --- v2 HUD: inset bezel tile face and container ladder ---
    ['on-surface on panel-inset (HUD bezel face)', '#F2E4D6', '#0B0704'],
    ['on-surface-variant on panel-inset', '#D8C8B4', '#0B0704'],
    ['on-surface on surface-container-high', '#F2E4D6', '#2C2016'],
    ['on-surface-variant on surface-container-high', '#D8C8B4', '#2C2016'],
    ['on-surface on surface-container-highest', '#F2E4D6', '#382A1E'],
    ['on-surface-variant on surface-container-highest', '#D8C8B4', '#382A1E'],

    // --- arcade spark accent (ring is the only text/UI-bearing spark role) ---
    ['spark-ring on surface (non-text min 3:1)', '#FFC24D', '#120C08'],
    ['spark-ring on panel-inset (non-text min 3:1)', '#FFC24D', '#0B0704'],
    ['spark-ring as text on surface', '#FFC24D', '#120C08'],
    ['spark-ring as text on surface-container-high', '#FFC24D', '#2C2016'],

    // --- jewel tool-tier ladder (bronze / emerald / amethyst) ---
    ['on-tier1 on tier1', '#3A1E00', '#F2B27A'],
    ['on-tier1-container on tier1-container', '#FFDCBA', '#5A3208'],
    ['tier1 on surface (large/UI 3:1)', '#F2B27A', '#120C08'],
    ['on-tier2 on tier2', '#0C3018', '#8FE3A6'],
    ['on-tier2-container on tier2-container', '#B8F0C4', '#1B4A28'],
    ['tier2 on surface (large/UI 3:1)', '#8FE3A6', '#120C08'],
    ['on-tier3 on tier3', '#2A0A5C', '#CFBCFF'],
    ['on-tier3-container on tier3-container', '#E6D9FF', '#3B2465'],
    ['tier3 on surface (large/UI 3:1)', '#CFBCFF', '#120C08'],
  ],
};

let allPass = true;
let checked = 0;
let passed = 0;
for (const [scheme, list] of Object.entries(pairs)) {
  console.log(`\n=== ${scheme} ===`);
  for (const [label, fg, bg] of list) {
    const r = ratio(fg, bg);
    const needsBig = /large|UI|non-text/.test(label);
    const min = needsBig ? 3.0 : 4.5;
    const pass = r >= min;
    checked += 1;
    if (pass) passed += 1;
    else allPass = false;
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} ${fg} / ${bg}  ratio=${r.toFixed(2)}  min=${min}`
    );
  }
}
console.log(`\n${passed}/${checked} pairs pass.`);
console.log(`OVERALL: ${allPass ? 'ALL PAIRS PASS' : 'SOME PAIRS FAIL'}`);
if (!allPass) process.exitCode = 1;
