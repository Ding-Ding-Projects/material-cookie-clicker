// Standalone WCAG contrast verifier for Material Cookie Clicker's cosy-bakery-arcade color
// tokens. The project deliberately does not conform to Material Design 3 (see design/README.md)
// but keeps M3's primary/secondary/tertiary/surface role vocabulary as a naming convention, and
// keeps computing real ratios rather than asserting them regardless of visual style.
// Not shipped to the app; used only to derive/verify the swatch values
// baked into design/tokens-color.html. Run: node design/_verify/contrast-check.mjs

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
    ['on-primary on primary', '#FFFFFF', '#7A4A1D'],
    ['on-primary-container on primary-container', '#3A2100', '#FFDCB8'],
    ['on-secondary on secondary', '#FFFFFF', '#6B4C3F'],
    ['on-secondary-container on secondary-container', '#2C160B', '#FFDBCB'],
    ['on-tertiary on tertiary', '#FFFFFF', '#5C4E00'],
    ['on-tertiary-container on tertiary-container', '#221B00', '#F8E287'],
    ['on-surface on surface', '#211A14', '#FFF8F3'],
    ['on-surface-variant on surface-variant', '#4F4539', '#F0E0D0'],
    ['outline on surface (non-text min 3:1)', '#7C6F64', '#FFF8F3'],
    ['on-error on error', '#FFFFFF', '#BA1A1A'],
    ['on-error-container on error-container', '#410002', '#FFDAD6'],
    ['primary on surface (large/UI 3:1)', '#7A4A1D', '#FFF8F3'],
    ['tertiary on surface (large/UI 3:1)', '#5C4E00', '#FFF8F3'],
    // Arcade spark accent (decorative glow/ring, never body text) and jewel tiers
    ['spark-ring on surface (non-text min 3:1)', '#D97300', '#FFF8F3'],
    ['on-tier2 on tier2', '#FFFFFF', '#256B3B'],
    ['on-tier2-container on tier2-container', '#04210D', '#B8F0C4'],
    ['tier2 on surface (large/UI 3:1)', '#256B3B', '#FFF8F3'],
    ['on-tier3 on tier3', '#FFFFFF', '#5B3B9C'],
    ['on-tier3-container on tier3-container', '#20004D', '#E6D9FF'],
    ['tier3 on surface (large/UI 3:1)', '#5B3B9C', '#FFF8F3'],
  ],
  dark: [
    ['on-primary on primary', '#4A2800', '#FFB876'],
    ['on-primary-container on primary-container', '#FFDCB8', '#693C00'],
    ['on-secondary on secondary', '#44291E', '#E6BEAC'],
    ['on-secondary-container on secondary-container', '#FFDBCB', '#5D3F32'],
    ['on-tertiary on tertiary', '#383000', '#DBC66E'],
    ['on-tertiary-container on tertiary-container', '#F8E287', '#514600'],
    ['on-surface on surface', '#EDE0D9', '#18120D'],
    ['on-surface-variant on surface-variant', '#D3C4B4', '#4F4539'],
    ['outline on surface (non-text min 3:1)', '#9C8F83', '#18120D'],
    ['on-error on error', '#690005', '#FFB4AB'],
    ['on-error-container on error-container', '#FFDAD6', '#93000A'],
    ['primary on surface (large/UI 3:1)', '#FFB876', '#18120D'],
    ['tertiary on surface (large/UI 3:1)', '#DBC66E', '#18120D'],
    // Arcade spark accent (decorative glow/ring, never body text) and jewel tiers
    ['spark-ring on surface (non-text min 3:1)', '#FFC24D', '#18120D'],
    ['on-tier2 on tier2', '#0C3018', '#8FE3A6'],
    ['on-tier2-container on tier2-container', '#B8F0C4', '#1B4A28'],
    ['tier2 on surface (large/UI 3:1)', '#8FE3A6', '#18120D'],
    ['on-tier3 on tier3', '#2A0A5C', '#CFBCFF'],
    ['on-tier3-container on tier3-container', '#E6D9FF', '#3B2465'],
    ['tier3 on surface (large/UI 3:1)', '#CFBCFF', '#18120D'],
  ],
};

let allPass = true;
for (const [scheme, list] of Object.entries(pairs)) {
  console.log(`\n=== ${scheme} ===`);
  for (const [label, fg, bg] of list) {
    const r = ratio(fg, bg);
    const needsBig = /large|UI|non-text/.test(label);
    const min = needsBig ? 3.0 : 4.5;
    const pass = r >= min;
    if (!pass) allPass = false;
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${fg} / ${bg}  ratio=${r.toFixed(2)}  min=${min}`
    );
  }
}
console.log(`\nOVERALL: ${allPass ? 'ALL PAIRS PASS' : 'SOME PAIRS FAIL'}`);
