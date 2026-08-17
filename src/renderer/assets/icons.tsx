/* ------------------------------------------------------------------------------------------
 * The illustrated art set.
 *
 * Every entity the player can see on a shelf — the fourteen generators, the upgrade families,
 * the achievement medals, the tool tiers and their tools, the golden cookie — gets a real
 * little drawing here instead of a stock emoji. The rendering language is the v2 arcade-bakery
 * one used by design/tokens-color.html and design/achievement-badge.html: warm browns and
 * golds, jewel tiers for the tool ladder, spark accents, a chunky outline, a solid offset
 * "base" under a shape rather than a blurred shadow, and a white bevel highlight on top.
 *
 * Rules every icon in this file obeys:
 *   - a viewBox and NO width/height attribute, so the CSS slot (`width: 1em`) sizes it and the
 *     screens keep their existing layout metrics;
 *   - `aria-hidden` — the adjacent text, or the parent's aria-label, always carries the name,
 *     so these are decorative and never need to meet text contrast;
 *   - colours come from the theme's CSS custom properties, so light, dark and any future theme
 *     repaint the art automatically;
 *   - no external references at all: no <use href>, no filters, no fonts, no images. Purely
 *     inline geometry, so the app stays completely offline.
 * ---------------------------------------------------------------------------------------- */
import type { ReactElement, ReactNode } from 'react';

/* --- the shared paint box. Names describe the ROLE, so a theme swap stays coherent. --- */
const INK = 'var(--cabinet-frame-dark, #43290f)';
const DOUGH = 'var(--primary-container, #ffdcb8)';
const CRUST = 'var(--primary, #7a4a1d)';
const CRUST_DARK = 'var(--primary-shadow, #3c2107)';
const CHIP = 'var(--on-primary-container, #3a2100)';
const PLATE = 'var(--surface-lowest, #ffffff)';
const PLATE_DIM = 'var(--surface-highest, #eed5b4)';
const GOLD = 'var(--spark, #ffc94d)';
const GOLD_DEEP = 'var(--spark-glow, #ff8a00)';
const GOLD_RING = 'var(--spark-ring, #9c4b00)';
const METAL_HI = 'var(--metal-hi, #fff0c4)';
const METAL_LO = 'var(--metal-lo, #b98a2e)';
const BRONZE = 'var(--tier1, #8a4e12)';
const BRONZE_LIGHT = 'var(--tier1-container, #ffdcba)';
const EMERALD = 'var(--tier2, #1f6337)';
const EMERALD_LIGHT = 'var(--tier2-container, #b8f0c4)';
const AMETHYST = 'var(--tier3, #533593)';
const AMETHYST_LIGHT = 'var(--tier3-container, #e6d9ff)';
const HIGHLIGHT = 'rgba(255, 255, 255, 0.7)';

/** Every drawing shares one canvas and one stroke weight, which is what makes fourteen
 *  separately-drawn machines read as one set rather than fourteen clip-art finds. */
function Art({ children, extraClass }: { children: ReactNode; extraClass?: string }) {
  return (
    <svg
      className={extraClass ? `game-icon ${extraClass}` : 'game-icon'}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      stroke={INK}
      strokeWidth={1.4}
      strokeLinejoin="round"
      strokeLinecap="round"
      fill="none"
    >
      {children}
    </svg>
  );
}

/** The solid "3D base" the v2 language puts under a pressable shape — never a blur. */
function Base({ d, fill = INK }: { d: string; fill?: string }) {
  return <path d={d} fill={fill} stroke="none" opacity={0.35} />;
}

/* ==========================================================================================
 * Generators — one distinct little illustration per rung of the real fourteen-tier ladder in
 * src/shared/game/generators.ts.
 * ======================================================================================== */

function CursorArt() {
  return (
    <Art>
      <Base d="M9 11h6l8 6v10H9z" />
      <path d="M12 18V7a2.2 2.2 0 0 1 4.4 0v8" fill={DOUGH} />
      <path d="M16.4 15v-2a2 2 0 0 1 4 0v2.4" fill={DOUGH} />
      <path d="M20.4 15.6v-1a2 2 0 0 1 4 0v7.6a6 6 0 0 1-6 6h-3a6 6 0 0 1-5.6-4l-2-5a2 2 0 0 1 3.4-2l1.8 2.6" fill={DOUGH} />
      <path d="M13.2 9.4a1.4 1.4 0 0 1 2 0" stroke={HIGHLIGHT} strokeWidth={1.2} />
    </Art>
  );
}

function GrandmaArt() {
  return (
    <Art>
      <Base d="M6 22h20v6H6z" />
      <circle cx="16" cy="10" r="6" fill={PLATE_DIM} />
      <path d="M10.4 7.6a6 6 0 0 1 11.2 0c-2 1.2-9.2 1.2-11.2 0z" fill={PLATE} />
      <circle cx="16" cy="4.4" r="2" fill={PLATE} />
      <circle cx="13.6" cy="10.2" r="1.9" fill={PLATE} />
      <circle cx="18.4" cy="10.2" r="1.9" fill={PLATE} />
      <path d="M15.5 10.2h1" />
      <path d="M13.6 14.4c1.6 1.2 3.2 1.2 4.8 0" />
      <path d="M5 22h22l-2 4H7z" fill={METAL_LO} />
      <circle cx="12" cy="20.4" r="2.2" fill={CRUST} />
      <circle cx="20" cy="20.4" r="2.2" fill={CRUST} />
    </Art>
  );
}

function FarmArt() {
  return (
    <Art>
      <Base d="M2 22h28v6H2z" />
      <circle cx="25" cy="7" r="4.4" fill={DOUGH} />
      <circle cx="24" cy="6" r="0.9" fill={CHIP} stroke="none" />
      <circle cx="26.4" cy="8.2" r="0.8" fill={CHIP} stroke="none" />
      <path d="M2 21c6-3 22-3 28 0v7H2z" fill={CRUST} />
      <path d="M7 21v-6M7 17c-2 0-3-1.4-3-3 2 0 3 1.2 3 3zM7 17c2 0 3-1.4 3-3-2 0-3 1.2-3 3z" fill={GOLD} />
      <path d="M14 21v-7M14 16c-2 0-3-1.4-3-3 2 0 3 1.2 3 3zM14 16c2 0 3-1.4 3-3-2 0-3 1.2-3 3z" fill={GOLD} />
      <path d="M3 25h26" stroke={CRUST_DARK} strokeWidth={1.2} opacity={0.6} />
    </Art>
  );
}

function MineArt() {
  return (
    <Art>
      <Base d="M3 24h26v4H3z" />
      <path d="M3 28V16a13 13 0 0 1 26 0v12z" fill={CRUST} />
      <path d="M10 28v-7a6 6 0 0 1 12 0v7z" fill={INK} opacity={0.85} />
      <path d="M11 26h10" stroke={GOLD} strokeWidth={1.2} />
      <path d="M20 8 9.6 18.4" stroke={PLATE_DIM} strokeWidth={2.6} />
      <path d="M22.6 5.4c-2.6-.4-5 1.6-4.6 4.2 2.6.4 5-1.6 4.6-4.2z" fill={METAL_HI} />
      <path d="M17.4 10.6c.4-2.6 2.8-4.6 5.2-4.2" stroke={INK} />
      <circle cx="7" cy="22" r="1.6" fill={DOUGH} />
    </Art>
  );
}

function FactoryArt() {
  return (
    <Art>
      <Base d="M3 26h26v3H3z" />
      <circle cx="9" cy="6" r="2.6" fill={PLATE_DIM} />
      <circle cx="13.6" cy="4" r="1.8" fill={PLATE_DIM} />
      <path d="M3 29V15l7 4V15l7 4V9h5v10h5v10z" fill={CRUST} />
      <path d="M6 23h3v4H6zM13 23h3v4h-3zM20 23h3v4h-3z" fill={GOLD} />
      <path d="M3 15l7 4" stroke={HIGHLIGHT} strokeWidth={1} />
    </Art>
  );
}

function BankArt() {
  return (
    <Art>
      <Base d="M2 26h28v3H2z" />
      <path d="M16 3 30 11H2z" fill={METAL_LO} />
      <path d="M2 29h28v-3H2z" fill={CRUST} />
      <path d="M5 11h4v15H5zM14 11h4v15h-4zM23 11h4v15h-4z" fill={PLATE_DIM} />
      <circle cx="16" cy="18" r="3.4" fill={GOLD} />
      <path d="M16 15.6v4.8M14.6 17h2.8" stroke={GOLD_RING} strokeWidth={1.2} />
    </Art>
  );
}

function TempleArt() {
  return (
    <Art>
      <Base d="M4 26h24v3H4z" />
      <path d="M16 3 30 10c-4 2-24 2-28 0z" fill={CRUST} />
      <path d="M16 10 27 15c-3 1.6-19 1.6-22 0z" fill={CRUST} />
      <path d="M7 15h18v11H7z" fill={DOUGH} />
      <path d="M13 26v-7a3 3 0 0 1 6 0v7z" fill={GOLD_DEEP} />
      <path d="M2 29h28" strokeWidth={1.6} />
      <path d="M10.6 6.4c3-1 8-1 11 0" stroke={HIGHLIGHT} strokeWidth={1} />
    </Art>
  );
}

function WizardTowerArt() {
  return (
    <Art>
      <Base d="M8 26h16v3H8z" />
      <path d="M16 2 25 13H7z" fill={AMETHYST} />
      <path d="M9 13h14v16H9z" fill={PLATE_DIM} />
      <path d="M13 17h6v5h-6z" fill={INK} opacity={0.8} />
      <path d="M11 25h10" strokeWidth={1.2} />
      <path d="M16 4.6 17 7l2.4.4-1.8 1.7.5 2.4-2.1-1.2-2.1 1.2.5-2.4L12.6 7 15 6.6z" fill={GOLD} stroke={GOLD_RING} strokeWidth={1} />
    </Art>
  );
}

function ShipmentArt() {
  return (
    <Art>
      <Base d="M12 24h8v5h-8z" />
      <path d="M16 2c4 4 5.4 9 5.4 14l-2 5h-6.8l-2-5C10.6 11 12 6 16 2z" fill={PLATE_DIM} />
      <circle cx="16" cy="12" r="2.8" fill={DOUGH} />
      <path d="M10.6 15 6 20l1.4 3 3.6-2M21.4 15 26 20l-1.4 3-3.6-2" fill={CRUST} />
      <path d="M13.4 24h5.2l-2.6 6z" fill={GOLD_DEEP} />
      <path d="M14.6 6.6c.6-1.2 1.4-2.2 2-2.8" stroke={HIGHLIGHT} strokeWidth={1} />
    </Art>
  );
}

function AlchemyLabArt() {
  return (
    <Art>
      <Base d="M7 25h18v4H7z" />
      <path d="M13 3h6v8l6 12a3 3 0 0 1-2.6 4.4H9.6A3 3 0 0 1 7 23l6-12z" fill={PLATE} />
      <path d="M9.4 19h13.2l2.4 4A3 3 0 0 1 22.4 27H9.6A3 3 0 0 1 7 23z" fill={EMERALD} />
      <circle cx="13" cy="22.6" r="1.4" fill={EMERALD_LIGHT} stroke="none" />
      <circle cx="18" cy="24" r="1" fill={EMERALD_LIGHT} stroke="none" />
      <path d="M12 3h8" strokeWidth={1.8} />
      <circle cx="20.6" cy="8" r="1.2" fill={GOLD} />
    </Art>
  );
}

function PortalArt() {
  return (
    <Art>
      <Base d="M6 27h20v2H6z" />
      <ellipse cx="16" cy="16" rx="12" ry="13" fill={AMETHYST} />
      <ellipse cx="16" cy="16" rx="7.6" ry="8.8" fill={AMETHYST_LIGHT} />
      <ellipse cx="16" cy="16" rx="3.4" ry="4.4" fill={INK} />
      <path d="M6.4 8.6c3 2.4 3 12.4 0 14.8" stroke={HIGHLIGHT} strokeWidth={1.2} />
      <circle cx="26" cy="7" r="1.4" fill={GOLD} />
      <circle cx="5" cy="26" r="1.1" fill={GOLD} />
    </Art>
  );
}

function TimeMachineArt() {
  return (
    <Art>
      <Base d="M7 27h18v2H7z" />
      <path d="M8 3h16M8 29h16" strokeWidth={1.8} />
      <path d="M10 3h12c0 5-5 6-5 13s5 8 5 13H10c0-5 5-6 5-13S10 8 10 3z" fill={PLATE} />
      <path d="M11.4 24.4c.8-2.6 3-4 4.6-4s3.8 1.4 4.6 4z" fill={GOLD_DEEP} stroke="none" />
      <path d="M12.4 6.4h7.2c-.4 2.6-2.4 4-3.6 4s-3.2-1.4-3.6-4z" fill={GOLD} stroke="none" />
      <path d="M16 12.6v4" stroke={GOLD_RING} strokeWidth={1.2} />
    </Art>
  );
}

function AntimatterArt() {
  return (
    <Art>
      <Base d="M8 28h16v1.6H8z" />
      <ellipse cx="16" cy="16" rx="13" ry="5.4" stroke={CRUST} />
      <ellipse cx="16" cy="16" rx="13" ry="5.4" transform="rotate(60 16 16)" stroke={CRUST} />
      <ellipse cx="16" cy="16" rx="13" ry="5.4" transform="rotate(-60 16 16)" stroke={CRUST} />
      <circle cx="16" cy="16" r="4.2" fill={GOLD} stroke={GOLD_RING} />
      <circle cx="16" cy="16" r="1.6" fill={INK} stroke="none" />
      <circle cx="28" cy="12.6" r="1.6" fill={AMETHYST} />
      <circle cx="4.6" cy="19.6" r="1.4" fill={EMERALD} />
    </Art>
  );
}

function PrismArt() {
  return (
    <Art>
      <Base d="M6 26h20v3H6z" />
      <path d="M3 17h9" strokeWidth={1.6} stroke={PLATE_DIM} />
      <path d="M16 3 29 26H3z" fill={DOUGH} />
      <path d="M16 3 29 26H16z" fill={CRUST} opacity={0.35} stroke="none" />
      <path d="M18 15l11-3" stroke={GOLD} strokeWidth={1.6} />
      <path d="M18.6 17l11 0" stroke={EMERALD} strokeWidth={1.6} />
      <path d="M19.2 19l10.4 3" stroke={AMETHYST} strokeWidth={1.6} />
      <path d="M16 6.6 21 15h-5z" fill={HIGHLIGHT} stroke="none" />
    </Art>
  );
}

const GENERATOR_ART: Readonly<Record<string, () => ReactElement>> = {
  cursor: CursorArt,
  grandma: GrandmaArt,
  farm: FarmArt,
  mine: MineArt,
  factory: FactoryArt,
  bank: BankArt,
  temple: TempleArt,
  wizardTower: WizardTowerArt,
  shipment: ShipmentArt,
  alchemyLab: AlchemyLabArt,
  portal: PortalArt,
  timeMachine: TimeMachineArt,
  antimatterCondenser: AntimatterArt,
  prism: PrismArt,
};

/** The shop rail's per-generator illustration. Unknown ids fall back to the factory, exactly
 *  as the emoji table it replaces did. */
export function GeneratorIcon({ id }: { id: string }) {
  const Drawing = GENERATOR_ART[id] ?? FactoryArt;
  return <Drawing />;
}

/* ==========================================================================================
 * Upgrades — one illustration per effect family in src/shared/game/upgrades.ts, plus the
 * locked stub and the golden cookie.
 * ======================================================================================== */

export type UpgradeFamily = 'click' | 'generator' | 'global' | 'golden' | 'locked';

function ClickPowerArt() {
  return (
    <Art>
      <Base d="M10 12h6l8 6v10h-14z" />
      <path d="M13 17V8a2.2 2.2 0 0 1 4.4 0v7.4" fill={DOUGH} />
      <path d="M17.4 16v-1.6a2 2 0 0 1 4 0v2" fill={DOUGH} />
      <path d="M21.4 16.4v-.8a2 2 0 0 1 4 0V22a6 6 0 0 1-6 6h-2.6a6 6 0 0 1-5.4-3.6l-2-4.6a2 2 0 0 1 3.4-2l1.6 2.4" fill={DOUGH} />
      <path d="M6 4l1.6 3.4L11 9 7.6 10.6 6 14l-1.6-3.4L1 9l3.4-1.6z" fill={GOLD} stroke={GOLD_RING} strokeWidth={1} />
    </Art>
  );
}

function GeneratorUpgradeArt() {
  return (
    <Art>
      <Base d="M4 22h24v6H4z" />
      <path
        d="M11 2.6h3.4l.6 2.4 2.2 1 2.2-1.2 2.4 2.4-1.2 2.2 1 2.2 2.4.6v3.4l-2.4.6-1 2.2 1.2 2.2-2.4 2.4-2.2-1.2-2.2 1-.6 2.4H11l-.6-2.4-2.2-1-2.2 1.2L3.6 20l1.2-2.2-1-2.2-2.4-.6v-3.4l2.4-.6 1-2.2L3.6 6.6 6 4.2l2.2 1.2 2.2-1z"
        fill={CRUST}
      />
      <circle cx="12.7" cy="13" r="5" fill={DOUGH} />
      <circle cx="11" cy="11.6" r="0.9" fill={CHIP} stroke="none" />
      <circle cx="14.4" cy="14.4" r="0.9" fill={CHIP} stroke="none" />
      <path d="M25 29v-8l4-3v11z" fill={GOLD} />
      <path d="M20 29v-5l4-2v7z" fill={GOLD_DEEP} />
    </Art>
  );
}

function GlobalProductionArt() {
  return (
    <Art>
      <Base d="M3 25h26v4H3z" />
      <path d="M3 11h26v18H3z" fill={CRUST} />
      <path d="M6 14h20v9H6z" fill={GOLD} />
      <circle cx="16" cy="18.6" r="3" fill={GOLD_DEEP} stroke={GOLD_RING} />
      <path d="M3 11l3-4h20l3 4" fill={PLATE_DIM} />
      <path d="M10.4 26h11.2" strokeWidth={1.6} />
      <path d="M12 5.4c0-1.6 2-1.6 2-3.2M18 5.4c0-1.6 2-1.6 2-3.2" stroke={PLATE_DIM} strokeWidth={1.2} />
    </Art>
  );
}

function LockedArt() {
  return (
    <Art>
      <Base d="M6 15h20v14H6z" />
      <path d="M10 15v-4a6 6 0 0 1 12 0v4" fill="none" strokeWidth={2.2} stroke={INK} />
      <path d="M5.4 14h21.2v14H5.4z" fill={PLATE_DIM} />
      <circle cx="16" cy="20" r="2.4" fill={CRUST} />
      <path d="M16 22v3.4" strokeWidth={1.6} />
      <path d="M7.4 16h17" stroke={HIGHLIGHT} strokeWidth={1.2} />
    </Art>
  );
}

/** The golden cookie with its ray burst — the game's one true jackpot mark. */
export function GoldenCookieIcon({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      <g stroke={GOLD_DEEP} strokeWidth={2}>
        <path d="M16 0.6v4M16 27.4v4M0.6 16h4M27.4 16h4M5 5l2.8 2.8M24.2 24.2 27 27M27 5l-2.8 2.8M7.8 24.2 5 27" />
      </g>
      <circle cx="16" cy="16" r="10.4" fill={GOLD} stroke={GOLD_RING} strokeWidth={1.6} />
      <path d="M16 5.6a10.4 10.4 0 0 1 0 20.8z" fill={GOLD_DEEP} stroke="none" opacity={0.45} />
      <circle cx="12.4" cy="13" r="1.5" fill={GOLD_RING} stroke="none" />
      <circle cx="18.6" cy="12.2" r="1.3" fill={GOLD_RING} stroke="none" />
      <circle cx="19.4" cy="19" r="1.5" fill={GOLD_RING} stroke="none" />
      <circle cx="13" cy="19.6" r="1.2" fill={GOLD_RING} stroke="none" />
      <path d="M9.6 10.4a8 8 0 0 1 4-3" stroke={METAL_HI} strokeWidth={1.4} />
    </Art>
  );
}

/** The everyday cookie, used as the hero face and anywhere a plain cookie reads better. */
export function CookieIcon({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      <circle cx="16" cy="16" r="13" fill={DOUGH} stroke={CRUST_DARK} strokeWidth={1.6} />
      <path d="M16 3a13 13 0 0 1 0 26z" fill={CRUST} stroke="none" opacity={0.28} />
      <circle cx="11.4" cy="11.6" r="2" fill={CHIP} stroke="none" />
      <circle cx="19.6" cy="10.6" r="1.7" fill={CHIP} stroke="none" />
      <circle cx="21.4" cy="18.6" r="2.1" fill={CHIP} stroke="none" />
      <circle cx="12.4" cy="20.4" r="1.8" fill={CHIP} stroke="none" />
      <circle cx="16" cy="15.4" r="1.3" fill={CHIP} stroke="none" />
      <path d="M7.6 9.6a11 11 0 0 1 5-4.4" stroke={HIGHLIGHT} strokeWidth={1.6} />
    </Art>
  );
}

const UPGRADE_ART: Readonly<Record<UpgradeFamily, () => ReactElement>> = {
  click: ClickPowerArt,
  generator: GeneratorUpgradeArt,
  global: GlobalProductionArt,
  golden: () => <GoldenCookieIcon />,
  locked: LockedArt,
};

export function UpgradeIcon({ family }: { family: UpgradeFamily }) {
  const Drawing = UPGRADE_ART[family];
  return <Drawing />;
}

/* ==========================================================================================
 * Achievement medal faces. Locked cells get a silhouette that withholds the name AND the art,
 * matching what the screen's copy promises.
 * ======================================================================================== */

export type MedalFamily = 'cookies' | 'clicks' | 'buildings' | 'prestige' | 'locked';

function MedalFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <circle cx="16" cy="16" r="13.6" fill={METAL_LO} stroke={INK} strokeWidth={1.6} />
      <circle cx="16" cy="16" r="10.6" fill={METAL_HI} stroke={INK} strokeWidth={1.2} />
      <path d="M7.6 9.4a11 11 0 0 1 5-4" stroke={PLATE} strokeWidth={1.6} />
      {children}
    </>
  );
}

function MedalCookieArt() {
  return (
    <Art>
      <MedalFrame>
        <circle cx="16" cy="16" r="6.6" fill={DOUGH} stroke={CRUST_DARK} strokeWidth={1.2} />
        <circle cx="13.6" cy="14" r="1.2" fill={CHIP} stroke="none" />
        <circle cx="18.4" cy="15" r="1.1" fill={CHIP} stroke="none" />
        <circle cx="15.6" cy="18.6" r="1.2" fill={CHIP} stroke="none" />
      </MedalFrame>
    </Art>
  );
}

function MedalClickArt() {
  return (
    <Art>
      <MedalFrame>
        <path d="M14 18.6V11a1.8 1.8 0 0 1 3.6 0v5.4" fill={DOUGH} strokeWidth={1.2} />
        <path d="M17.6 16.6v-.8a1.7 1.7 0 0 1 3.4 0v4.6a4.4 4.4 0 0 1-4.4 4.4h-1.4a4.4 4.4 0 0 1-4-2.6l-1.4-3.2a1.6 1.6 0 0 1 2.6-1.6l1.2 1.6" fill={DOUGH} strokeWidth={1.2} />
      </MedalFrame>
    </Art>
  );
}

function MedalBuildingArt() {
  return (
    <Art>
      <MedalFrame>
        <path d="M9.4 22V15l4 2.4V15l4 2.4V11h3.6v11z" fill={CRUST} strokeWidth={1.2} />
        <path d="M11.4 19h1.8v3h-1.8zM15.6 19h1.8v3h-1.8z" fill={GOLD} stroke="none" />
      </MedalFrame>
    </Art>
  );
}

function MedalPrestigeArt() {
  return (
    <Art>
      <MedalFrame>
        <path d="M16 8.6l2.2 4.6 5 .8-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.8z" fill={GOLD_DEEP} stroke={GOLD_RING} strokeWidth={1.2} />
      </MedalFrame>
    </Art>
  );
}

function MedalLockedArt() {
  return (
    <Art>
      <circle cx="16" cy="16" r="13.6" fill={PLATE_DIM} stroke={INK} strokeWidth={1.6} />
      <circle cx="16" cy="16" r="10.6" fill={'var(--surface-high, #f5dfc4)'} stroke={INK} strokeWidth={1.2} opacity={0.9} />
      <path d="M12.6 13.4a3.6 3.6 0 0 1 6.6 1.8c0 2.4-3.2 2.6-3.2 4.6" strokeWidth={1.8} />
      <circle cx="16" cy="22.6" r="1.3" fill={INK} stroke="none" />
    </Art>
  );
}

const MEDAL_ART: Readonly<Record<MedalFamily, () => ReactElement>> = {
  cookies: MedalCookieArt,
  clicks: MedalClickArt,
  buildings: MedalBuildingArt,
  prestige: MedalPrestigeArt,
  locked: MedalLockedArt,
};

export function AchievementMedal({ family }: { family: MedalFamily }) {
  const Drawing = MEDAL_ART[family];
  return <Drawing />;
}

/* ==========================================================================================
 * Tools — a faceted jewel per tier (bronze / emerald / amethyst), and a mini-icon per tool.
 * ======================================================================================== */

function Gem({ body, light, dark }: { body: string; light: string; dark: string }) {
  return (
    <Art>
      <Base d="M6 26h20v3H6z" />
      <path d="M10 5h12l7 8-13 15L3 13z" fill={body} strokeWidth={1.6} />
      <path d="M10 5 7 13l9 15 9-15-3-8z" fill={light} strokeWidth={1.2} />
      <path d="M13 5l-1 8 4 15 4-15-1-8z" fill={dark} strokeWidth={1.2} />
      <path d="M3 13h26" strokeWidth={1.2} />
      <path d="M11.4 6.6 9.6 12" stroke={PLATE} strokeWidth={1.2} />
    </Art>
  );
}

export function ToolTierGem({ tier }: { tier: 1 | 2 | 3 }) {
  if (tier === 1) return <Gem body={BRONZE} light={BRONZE_LIGHT} dark={'var(--on-tier1-container, #2e1600)'} />;
  if (tier === 2) return <Gem body={EMERALD} light={EMERALD_LIGHT} dark={'var(--on-tier2-container, #04210d)'} />;
  return <Gem body={AMETHYST} light={AMETHYST_LIGHT} dark={'var(--on-tier3-container, #20004d)'} />;
}

/** A window/panel chrome most tool icons sit inside, so the twenty tools read as one family. */
function Panel({ children, fill = PLATE }: { children: ReactNode; fill?: string }) {
  return (
    <>
      <Base d="M4 8h24v20H4z" />
      <rect x="3.2" y="6" width="25.6" height="20" rx="3.4" fill={fill} strokeWidth={1.6} />
      <path d="M3.2 11h25.6" strokeWidth={1.2} />
      <circle cx="6.4" cy="8.6" r="0.9" fill={GOLD_DEEP} stroke="none" />
      <circle cx="9.2" cy="8.6" r="0.9" fill={EMERALD} stroke="none" />
      {children}
    </>
  );
}

function CommandPaletteArt() {
  return (
    <Art>
      <Panel>
        <rect x="6.4" y="14" width="19.2" height="3.6" rx="1.8" fill={PLATE_DIM} strokeWidth={1.2} />
        <path d="M8.6 19.8h12M8.6 22.6h8" strokeWidth={1.4} stroke={CRUST} />
        <path d="M8.4 15.8h1.6" strokeWidth={1.4} />
      </Panel>
    </Art>
  );
}

function RegexBuilderArt() {
  return (
    <Art>
      <Panel>
        <path d="M9.6 14.6 7 19l2.6 4.4M22.4 14.6 25 19l-2.6 4.4" strokeWidth={1.6} stroke={CRUST} />
        <path d="M18.4 14.4 13.6 23.6" strokeWidth={1.6} stroke={GOLD_RING} />
        <circle cx="16" cy="19" r="1.2" fill={GOLD} stroke="none" />
      </Panel>
    </Art>
  );
}

function AuthenticatorArt() {
  return (
    <Art>
      <Base d="M6 6h20v22H6z" />
      <path d="M16 3.4 27 7v9c0 6.4-4.6 11-11 13C9 27 4.4 22.4 4.4 16V7z" fill={EMERALD} strokeWidth={1.6} />
      <circle cx="16" cy="14.4" r="3.4" fill={PLATE} />
      <path d="M16 17.8v4.4M14.4 20.6h3.2" strokeWidth={1.6} stroke={PLATE} />
      <path d="M8 8.6 16 6" stroke={HIGHLIGHT} strokeWidth={1.2} />
    </Art>
  );
}

function ConverterArt() {
  return (
    <Art>
      <Panel>
        <path d="M8 16.4h10l-2.4-2.6M24 21.6H14l2.4 2.6" strokeWidth={1.6} stroke={CRUST} />
        <circle cx="22" cy="16.4" r="2" fill={GOLD} />
        <circle cx="10" cy="21.6" r="2" fill={EMERALD} />
      </Panel>
    </Art>
  );
}

function ModelManagerArt() {
  return (
    <Art>
      <Base d="M7 9h18v18H7z" />
      <rect x="6.6" y="7.6" width="18.8" height="18.8" rx="3.4" fill={AMETHYST} strokeWidth={1.6} />
      <path d="M11 12.6h10v8H11z" fill={AMETHYST_LIGHT} strokeWidth={1.2} />
      <path d="M13.6 4v3.6M18.4 4v3.6M13.6 26.4V30M18.4 26.4V30M2.6 13.6H6.6M2.6 18.4H6.6M25.4 13.6h4M25.4 18.4h4" strokeWidth={1.4} />
      <circle cx="16" cy="16.6" r="1.6" fill={GOLD} stroke="none" />
    </Art>
  );
}

function BellArt() {
  return (
    <Art>
      <Base d="M8 22h16v4H8z" />
      <path d="M16 4a8 8 0 0 1 8 8v6l2.4 3.4H5.6L8 18v-6a8 8 0 0 1 8-8z" fill={GOLD} strokeWidth={1.6} />
      <path d="M13 21.4a3 3 0 0 0 6 0" fill={GOLD_DEEP} />
      <circle cx="16" cy="3.4" r="1.6" fill={CRUST} />
      <path d="M10.6 11.6A5.4 5.4 0 0 1 14 7" stroke={PLATE} strokeWidth={1.4} />
    </Art>
  );
}

function HistoryArt() {
  return (
    <Art>
      <circle cx="16" cy="17" r="11" fill={PLATE} strokeWidth={1.6} />
      <path d="M16 10v7l5 3" strokeWidth={1.8} stroke={CRUST} />
      <path d="M5 12h5.4M5 12V6.6" strokeWidth={1.6} />
      <path d="M5 12A11.6 11.6 0 0 1 16 6" strokeWidth={1.6} stroke={GOLD_RING} />
    </Art>
  );
}

function LockToyArt() {
  return (
    <Art>
      <Base d="M7 15h18v13H7z" />
      <path d="M11 15v-4a5 5 0 0 1 10 0v4" strokeWidth={2.2} />
      <rect x="6.6" y="14" width="18.8" height="13.4" rx="3" fill={GOLD} strokeWidth={1.6} />
      <circle cx="16" cy="19.6" r="2.4" fill={CRUST} />
      <path d="M16 21.6v3" strokeWidth={1.8} stroke={CRUST} />
    </Art>
  );
}

function TabsArt() {
  return (
    <Art>
      <Base d="M4 10h24v18H4z" />
      <path d="M3.4 11h9V7.4h8V11h11.2v15.4H3.4z" fill={PLATE} strokeWidth={1.6} />
      <rect x="3.4" y="7.4" width="9" height="3.6" rx="1.6" fill={EMERALD} strokeWidth={1.2} />
      <rect x="12.4" y="9" width="8" height="2" rx="1" fill={PLATE_DIM} stroke="none" />
      <path d="M6.4 16h19M6.4 20h13" strokeWidth={1.4} stroke={CRUST} />
    </Art>
  );
}

function BrushArt() {
  return (
    <Art>
      <Base d="M6 22h14v6H6z" />
      <path d="M24.6 3.6a3 3 0 0 1 4 4.2L16.6 20.2l-4.4-4.4z" fill={PLATE_DIM} strokeWidth={1.6} />
      <path d="M12 15.6 16.6 20l-1.6 4a5 5 0 0 1-8 2.4c1.6-1 1.6-3.2 1-4.6z" fill={GOLD} strokeWidth={1.6} />
      <path d="M23.4 6 26 8.6" stroke={PLATE} strokeWidth={1.4} />
    </Art>
  );
}

function TicketArt() {
  return (
    <Art>
      <Base d="M4 10h24v14H4z" />
      <path d="M3.4 9h25.2v4a3 3 0 0 0 0 6v4H3.4v-4a3 3 0 0 0 0-6z" fill={DOUGH} strokeWidth={1.6} />
      <path d="M8 13.6h12M8 18h8" strokeWidth={1.4} stroke={CRUST} />
      <circle cx="23.6" cy="16" r="1.4" fill={GOLD} stroke="none" />
    </Art>
  );
}

function ScheduleArt() {
  return (
    <Art>
      <Base d="M4 8h24v20H4z" />
      <rect x="3.4" y="6.6" width="25.2" height="20" rx="3.2" fill={PLATE} strokeWidth={1.6} />
      <path d="M3.4 12h25.2" strokeWidth={1.4} />
      <path d="M9 3.6v4.6M23 3.6v4.6" strokeWidth={1.8} />
      <circle cx="21" cy="20" r="5" fill={GOLD} strokeWidth={1.4} />
      <path d="M21 17.2V20l2 1.4" strokeWidth={1.4} stroke={CRUST} />
      <path d="M7 16h5v4H7z" fill={PLATE_DIM} stroke="none" />
    </Art>
  );
}

function BookArt() {
  return (
    <Art>
      <Base d="M4 7h24v21H4z" />
      <path d="M4 5.4h9a3 3 0 0 1 3 3v17a3 3 0 0 0-3-3H4z" fill={PLATE} strokeWidth={1.6} />
      <path d="M28 5.4h-9a3 3 0 0 0-3 3v17a3 3 0 0 1 3-3h9z" fill={PLATE_DIM} strokeWidth={1.6} />
      <path d="M6.6 10h6M6.6 14h6M19.4 10h6M19.4 14h6" strokeWidth={1.2} stroke={CRUST} />
    </Art>
  );
}

function ExportArt() {
  return (
    <Art>
      <Base d="M4 14h24v14H4z" />
      <path d="M3.6 13.4 6.6 7h18.8l3 6.4v13.2H3.6z" fill={DOUGH} strokeWidth={1.6} />
      <path d="M3.6 13.4h24.8" strokeWidth={1.4} />
      <path d="M16 24.4v-9M12.4 18.6 16 15l3.6 3.6" strokeWidth={1.8} stroke={GOLD_RING} />
    </Art>
  );
}

function BulkArt() {
  return (
    <Art>
      <Base d="M4 20h24v8H4z" />
      <path d="M16 4 29 10.4 16 17 3 10.4z" fill={GOLD} strokeWidth={1.6} />
      <path d="M3 16 16 22.4 29 16" fill={DOUGH} strokeWidth={1.6} />
      <path d="M3 21.6 16 28l13-6.4" fill={CRUST} strokeWidth={1.6} />
    </Art>
  );
}

function SpeechArt() {
  return (
    <Art>
      <Base d="M4 7h24v16H4z" />
      <path d="M3.4 10a4 4 0 0 1 4-4h17.2a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H14l-6.6 5v-5a4 4 0 0 1-4-4z" fill={PLATE} strokeWidth={1.6} />
      <path d="M9 12.6h14M9 16.4h9" strokeWidth={1.4} stroke={CRUST} />
      <circle cx="24" cy="16.4" r="1.4" fill={GOLD} stroke="none" />
    </Art>
  );
}

function LogoStarArt() {
  return (
    <Art>
      <Base d="M5 6h22v22H5z" />
      <rect x="4.6" y="4.6" width="22.8" height="22.8" rx="6" fill={CRUST} strokeWidth={1.6} />
      <path d="M16 8.6l2.4 5 5.4.8-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.8z" fill={GOLD} stroke={GOLD_RING} strokeWidth={1.2} />
    </Art>
  );
}

function ExternalEditorArt() {
  return (
    <Art>
      <Panel>
        <path d="M22.6 13.4a2.2 2.2 0 0 1 3 3l-7 7-3.8.8.8-3.8z" fill={GOLD} strokeWidth={1.4} />
        <path d="M7.4 15h6M7.4 19h5" strokeWidth={1.4} stroke={CRUST} />
      </Panel>
    </Art>
  );
}

const TOOL_ART: Readonly<Record<string, () => ReactElement>> = {
  commandPalette: CommandPaletteArt,
  regexBuilder: RegexBuilderArt,
  tabGroups: TabsArt,
  appearanceEditor: BrushArt,
  colourTranslator: ConverterArt,
  notificationCentre: BellArt,
  localHistory: HistoryArt,
  authenticator: AuthenticatorArt,
  toyLocks: LockToyArt,
  supportTickets: TicketArt,
  scheduledSettings: ScheduleArt,
  fileConverter: ConverterArt,
  localModelManager: ModelManagerArt,
  narrator: SpeechArt,
  personalVocabulary: SpeechArt,
  appLogoCustomization: LogoStarArt,
  offlineDocs: BookArt,
  externalEditor: ExternalEditorArt,
  exports: ExportArt,
  bulkActions: BulkArt,
};

/** A tool node's face. An undiscovered node shows the locked silhouette instead, and a tool
 *  with no bespoke drawing yet falls back to its tier's jewel so the ladder still reads. */
export function ToolIcon({ id, tier, hidden }: { id: string; tier: 1 | 2 | 3; hidden?: boolean }) {
  if (hidden) return <MedalLockedArt />;
  const Drawing = TOOL_ART[id];
  return Drawing ? <Drawing /> : <ToolTierGem tier={tier} />;
}

/**
 * The diesel canister for the Diesel Depot (see src/shared/game/diesel-exchange.ts): a jerrycan
 * seen three-quarters on, with the X-brace pressed into its face, a screw cap, a carry handle
 * and a spark on the shoulder so it sits in the same arcade-bakery light as everything else.
 * Drawn, like every mark in this file — never the 🛢 emoji, which would render as somebody
 * else's artwork at somebody else's colour.
 */
export function DieselCanisterIcon({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      {/* the solid offset base every v2 object stands on, rather than a blurred shadow */}
      <path d="M7.5 12.5h17v15a1.6 1.6 0 0 1-1.6 1.6H9.1a1.6 1.6 0 0 1-1.6-1.6z" fill={CRUST_DARK} stroke="none" />
      <path
        d="M7.5 10.5h17v15a1.6 1.6 0 0 1-1.6 1.6H9.1a1.6 1.6 0 0 1-1.6-1.6z"
        fill={EMERALD}
        stroke={INK}
        strokeWidth={1.6}
      />
      {/* the pressed X-brace that says "jerrycan" and nothing else */}
      <path d="M10.6 13.8 21.4 23.8M21.4 13.8 10.6 23.8" stroke={EMERALD_LIGHT} strokeWidth={1.5} />
      {/* carry handle across the shoulder */}
      <path d="M11.4 10.4V8.4h9.2v2" fill="none" stroke={INK} strokeWidth={1.6} />
      {/* screw cap and its spout */}
      <rect x="18.4" y="6.2" width="4.6" height="3" rx="1.1" fill={METAL_LO} stroke={INK} strokeWidth={1.4} />
      <path d="M20.7 6.2V4.6" stroke={INK} strokeWidth={1.4} />
      {/* bevel highlight on top, and one spark, exactly as the rest of the set wears them */}
      <path d="M9.4 12.6a1 1 0 0 1 1-1h4" stroke={METAL_HI} strokeWidth={1.4} />
      <path d="M24.8 15.6l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill={GOLD} stroke={GOLD_RING} strokeWidth={1} />
    </Art>
  );
}

/* ==========================================================================================
 * Purchase-feedback art (src/renderer/game/purchase-fx.tsx). Two pieces the diesel mint
 * sequence needs and nothing else draws: the pump nozzle that swings in, and a jerrycan whose
 * fuel body is a separate, animatable element rather than part of the can's own path.
 * ======================================================================================== */

/** The nozzle on the end of the hose. Points down-left, so it reads as coming off a pump. */
export function FuelNozzleIcon({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      <Base d="M13 8h10v9H13z" />
      {/* the grip body */}
      <path d="M12.6 6.4h8.2a1.8 1.8 0 0 1 1.8 1.8v5.2a1.8 1.8 0 0 1-1.8 1.8h-8.2z" fill={METAL_LO} stroke={INK} strokeWidth={1.6} />
      {/* trigger */}
      <path d="M14.6 15.2v2.6a2 2 0 0 0 2 2h1.2" fill="none" stroke={INK} strokeWidth={1.5} />
      {/* the spout, angled at the can below */}
      <path d="M22.6 9.4h4.2l-1.6 8.4-3 6.6" fill="none" stroke={INK} strokeWidth={1.8} />
      {/* hose running back off the top-left of the frame */}
      <path d="M12.6 8.6H7.4a3 3 0 0 0-3 3v3.2" fill="none" stroke={CRUST_DARK} strokeWidth={2.2} />
      <path d="M13.4 7.6h6.2" stroke={METAL_HI} strokeWidth={1.3} />
    </Art>
  );
}

/**
 * The gauge jerrycan. Same can as `DieselCanisterIcon`, except the fuel inside is its own
 * `<rect>` carrying the class `fx-can__fuel`, anchored at the bottom of the can's interior so
 * a `transform: scaleY()` on it reads as a level rising rather than a box growing both ways.
 */
export function JerrycanGaugeIcon({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      <path d="M7.5 12.5h17v15a1.6 1.6 0 0 1-1.6 1.6H9.1a1.6 1.6 0 0 1-1.6-1.6z" fill={CRUST_DARK} stroke="none" />
      {/* the interior, painted before the fuel so the fuel sits inside it */}
      <path d="M7.5 10.5h17v15a1.6 1.6 0 0 1-1.6 1.6H9.1a1.6 1.6 0 0 1-1.6-1.6z" fill={PLATE_DIM} stroke="none" />
      <rect className="fx-can__fuel" x="8.4" y="11.4" width="15.2" height="15.2" fill={GOLD_DEEP} stroke="none" />
      <rect className="fx-can__fuel fx-can__fuel--crest" x="8.4" y="11.4" width="15.2" height="1.6" fill={GOLD} stroke="none" />
      {/* the can's outline and furniture, over the fuel */}
      <path
        d="M7.5 10.5h17v15a1.6 1.6 0 0 1-1.6 1.6H9.1a1.6 1.6 0 0 1-1.6-1.6z"
        fill="none"
        stroke={INK}
        strokeWidth={1.6}
      />
      <path d="M10.6 13.8 21.4 23.8M21.4 13.8 10.6 23.8" stroke={EMERALD_LIGHT} strokeWidth={1.5} opacity={0.75} />
      <path d="M11.4 10.4V8.4h9.2v2" fill="none" stroke={INK} strokeWidth={1.6} />
      <rect className="fx-can__cap" x="18.4" y="6.2" width="4.6" height="3" rx="1.1" fill={METAL_LO} stroke={INK} strokeWidth={1.4} />
      <path d="M20.7 6.2V4.6" stroke={INK} strokeWidth={1.4} />
      <path d="M9.4 12.6a1 1 0 0 1 1-1h4" stroke={METAL_HI} strokeWidth={1.4} />
    </Art>
  );
}

/* ==========================================================================================
 * The hero cookie — a rendering-realism pass on the one object the whole game is about.
 *
 * This is deliberately NOT drawn on the shared 32-unit canvas: the hero renders two hundred
 * pixels wide, so it can afford (and needs) an order of magnitude more geometry than a shelf
 * icon. Everything the eye uses to decide "baked thing" rather than "brown button" is built
 * here out of plain SVG:
 *
 *   - an IRREGULAR silhouette. A perfect circle is the single strongest tell that something is
 *     a widget; the outline below is a sixteen-lobe wobble smoothed through its own midpoints.
 *   - a BAKE gradient. Real biscuit is pale where the dough stayed thick and browned where the
 *     edge went thin and hot, so the fill runs pale gold at an off-centre core out to a dark
 *     crust ring, with a slightly inset paler plateau over it for the domed middle.
 *   - CRACKS, each drawn twice: a dark fissure and a pale ridge shouldered up beside it toward
 *     the light, so the split reads as having depth instead of as a pen line.
 *   - CHUNKS, not dots. Every chocolate piece is the same irregular chunk path at a different
 *     size and rotation, and each carries a contact shadow beneath it, a lit facet on its
 *     upper-left and a darkened one opposite.
 *
 * The light direction is fixed at upper-left and is the SAME direction the oven glow behind
 * the cookie comes from (.cookie-target-wrap::before in index.css) — a lit side that disagrees
 * with the room is what makes CSS art look pasted on.
 *
 * The rules of this file still hold: no filters, no images, no external references, and every
 * colour comes from a theme token, so the dark "arcade night" theme repaints this as ember-lit
 * biscuit rather than inverting it into something inedible.
 * ======================================================================================== */

/** The baked silhouette. Generated as sixteen varying radii around a centre and smoothed
 *  through their midpoints, rather than hand-nudged until it looked wobbly. */
const COOKIE_EDGE_PATH =
  'M40.8 3.3 Q50 1 57.9 6.3 Q65.9 11.7 75.6 13.2 Q85.4 14.6 87.5 24.1 Q89.7 33.5 93.4 41.8 Q97 50 97.3 59.9 ' +
  'Q97.6 69.7 88.8 74.9 Q80.1 80.1 74.3 87.4 Q68.6 94.8 59.3 94.4 Q50 94 40.1 96 Q30.1 98 24.7 89.4 ' +
  'Q19.2 80.8 13.1 74.3 Q7 67.8 8 58.9 Q9 50 6.2 40.3 Q3.3 30.7 10.9 24.6 Q18.5 18.5 25.1 12.1 Q31.6 5.7 40.8 3.3 Z';

/** The domed middle, which browns less than the rim. Its own wobble, so it never traces the edge. */
const COOKIE_DOME_PATH =
  'M41.3 10.5 Q49 8.5 55.6 13.1 Q62.2 17.6 70.5 18.7 Q78.7 19.8 80.2 27.9 Q81.8 35.9 85.1 42.7 Q88.5 49.5 88.6 57.7 ' +
  'Q88.7 66 81.2 70.1 Q73.7 74.2 69.1 80.6 Q64.5 86.9 56.7 86.5 Q49 86 40.7 87.8 Q32.4 89.7 27.9 82.3 ' +
  'Q23.5 75 18.5 69.6 Q13.4 64.2 14.2 56.9 Q15 49.5 12.6 41.5 Q10.2 33.4 16.5 28.4 Q22.8 23.3 28.3 17.9 Q33.7 12.5 41.3 10.5 Z';

/** One chocolate chunk, centred on its own origin so a transform can size and turn it. */
const CHUNK_PATH =
  'M-5.2 -2.4 Q-4.1 -4.7 -1.4 -4.4 Q1.7 -4.9 3.9 -3.1 Q5.5 -1.5 4.8 1 Q4.3 3.5 1.8 4.3 ' +
  'Q-0.9 5.1 -3.3 3.9 Q-5.6 2.7 -5.2 -2.4 Z';

interface CookieChunkSpec {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly r: number;
}

/** Nine chunks, no two the same size or angle — an even ring of identical dots was the other
 *  half of why the old cookie read as a button face. */
const COOKIE_CHUNKS: readonly CookieChunkSpec[] = [
  { x: 33, y: 31, s: 1.3, r: -14 },
  { x: 58, y: 24, s: 0.95, r: 24 },
  { x: 73, y: 45, s: 1.4, r: -38 },
  { x: 45, y: 48, s: 1.05, r: 9 },
  { x: 24, y: 57, s: 0.9, r: 47 },
  { x: 60, y: 69, s: 1.2, r: -25 },
  { x: 37, y: 75, s: 0.85, r: 16 },
  { x: 78, y: 64, s: 0.78, r: 61 },
  { x: 47, y: 16, s: 0.68, r: -52 },
];

/** Baked speckle: flecks of toasted and under-toasted dough, so the surface is never flat.
 *  Tuple is [x, y, radius, toasted]. */
const COOKIE_SPECKS: readonly (readonly [number, number, number, boolean])[] = [
  [27, 22, 2.4, true],
  [67, 33, 1.8, false],
  [52, 38, 2.1, true],
  [38, 61, 1.6, false],
  [70, 56, 2.6, true],
  [30, 44, 1.4, false],
  [55, 56, 1.9, true],
  [66, 79, 2.2, false],
  [43, 87, 1.5, true],
  [21, 70, 1.7, false],
  [86, 50, 2, true],
  [50, 28, 1.3, false],
];

const COOKIE_CRACKS: readonly string[] = [
  'M33 39 Q39 44 36.5 51 Q34.5 57 39 64',
  'M58 34 Q63 40.5 60 47.5',
  'M45 62 Q52.5 65 56 73',
  'M72 28 Q75 33 72.5 38',
];

function CookieChunk({ chunk, chip, chipHi }: { chunk: CookieChunkSpec; chip: string; chipHi: string }) {
  return (
    <g transform={`translate(${chunk.x} ${chunk.y}) rotate(${chunk.r}) scale(${chunk.s})`}>
      {/* the shadow the chunk casts into the dough it is sunk in — down and to the right,
          because the light is up and to the left */}
      <ellipse cx="0.9" cy="2.9" rx="4.9" ry="3.3" fill="rgba(0,0,0,0.3)" />
      <path d={CHUNK_PATH} fill={chip} />
      {/* the lit facet, and the facet turned away from the light */}
      <path d="M-4.3 -2 Q-3.2 -3.8 -0.9 -3.6 Q1.4 -3.9 3 -2.7" fill="none" stroke={chipHi} strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
      <path d="M4.2 0.4 Q3.6 3 1.3 3.9" fill="none" stroke="#000000" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <circle cx="-1.9" cy="-2.1" r="0.8" fill="rgba(255,255,255,0.5)" />
    </g>
  );
}

/**
 * The hero cookie face. `golden` swaps the whole paint box for gilded metal over exactly the
 * same geometry, so the golden moment is unmistakably the same object, gone gold.
 */
export function HeroCookieArt({ golden = false, extraClass }: { golden?: boolean; extraClass?: string } = {}) {
  const centre = golden ? 'var(--gold-centre, #ffeaa8)' : 'var(--cookie-centre, #f0cd93)';
  const mid = golden ? 'var(--gold-mid, #f2c14a)' : 'var(--cookie-mid, #d9a25c)';
  const edge = golden ? 'var(--gold-edge, #b8801a)' : 'var(--cookie-edge, #a86426)';
  const crust = golden ? 'var(--gold-deep, #7a5208)' : 'var(--cookie-crust, #6f3c14)';
  const chip = golden ? 'var(--gold-deep, #7a5208)' : 'var(--cookie-chip, #3a2109)';
  const chipHi = golden ? 'var(--gold-hi, #fffbe8)' : 'var(--cookie-chip-hi, #7c4c22)';
  const lit = golden ? 'var(--gold-hi, #fffbe8)' : 'var(--cookie-lit, rgba(255, 240, 215, 0.55))';
  const uid = golden ? 'gold' : 'bake';

  return (
    <svg
      className={extraClass ? `hero-cookie ${extraClass}` : 'hero-cookie'}
      viewBox="0 -1 100 102"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The bake itself: pale where the dough stayed thick, browned out at the thin rim. The
            core sits up-left of centre because that is where the light is. */}
        <radialGradient id={`hc-${uid}-bake`} cx="38%" cy="31%" r="74%">
          <stop offset="0%" stopColor={centre} />
          <stop offset="38%" stopColor={centre} />
          <stop offset="62%" stopColor={mid} />
          <stop offset="88%" stopColor={edge} />
          <stop offset="100%" stopColor={crust} />
        </radialGradient>
        {/* The dome: a pale wash that fades out well before the rim, so the middle sits proud of
            the browned edge instead of being a second flat disc. */}
        <radialGradient id={`hc-${uid}-dome`} cx="40%" cy="33%" r="64%">
          <stop offset="0%" stopColor={centre} stopOpacity="0.85" />
          <stop offset="55%" stopColor={centre} stopOpacity="0.32" />
          <stop offset="100%" stopColor={centre} stopOpacity="0" />
        </radialGradient>
        {/* The light itself, falling off with distance from the upper-left source. */}
        <radialGradient id={`hc-${uid}-light`} cx="30%" cy="22%" r="62%">
          <stop offset="0%" stopColor={lit} stopOpacity={golden ? 0.8 : 0.34} />
          <stop offset="45%" stopColor={lit} stopOpacity={0.1} />
          <stop offset="100%" stopColor={lit} stopOpacity={0} />
        </radialGradient>
        {/* The shaded side, opposite the light. */}
        <radialGradient id={`hc-${uid}-shade`} cx="74%" cy="82%" r="62%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {golden ? (
          /* Gilding: a rolled-metal sheen band. Metal is not a ramp from light to dark, it is a
             bright band with darker either side, which is what this reproduces. */
          <linearGradient id="hc-gold-sheen" x1="6%" y1="0%" x2="94%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="26%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.42" />
            <stop offset="48%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="63%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="78%" stopColor="#000000" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.24" />
          </linearGradient>
        ) : null}
        <clipPath id={`hc-${uid}-clip`}>
          <path d={COOKIE_EDGE_PATH} />
        </clipPath>
      </defs>

      {/* The thickness of the biscuit: the same silhouette, dropped and darkened, so the cookie
          has a side rather than being a decal. */}
      <path d={COOKIE_EDGE_PATH} fill={crust} transform="translate(0 2.4)" />
      <path d={COOKIE_EDGE_PATH} fill={edge} transform="translate(0 1.2)" />
      <path d={COOKIE_EDGE_PATH} fill={`url(#hc-${uid}-bake)`} />

      <g clipPath={`url(#hc-${uid}-clip)`}>
        <path d={COOKIE_DOME_PATH} fill={`url(#hc-${uid}-dome)`} />

        {COOKIE_SPECKS.map(([x, y, r, toasted]) => (
          <ellipse
            key={`speck-${x}-${y}`}
            cx={x}
            cy={y}
            rx={r}
            ry={r * 0.72}
            fill={toasted ? crust : centre}
            opacity={toasted ? 0.16 : 0.3}
          />
        ))}

        {COOKIE_CRACKS.map((d) => (
          <g key={d}>
            <path d={d} fill="none" stroke={centre} strokeWidth="2.4" strokeLinecap="round" opacity="0.22" transform="translate(-1.1 -1.1)" />
            <path d={d} fill="none" stroke={crust} strokeWidth="1.6" strokeLinecap="round" opacity="0.26" />
          </g>
        ))}

        {COOKIE_CHUNKS.map((chunk) => (
          <CookieChunk key={`chunk-${chunk.x}-${chunk.y}`} chunk={chunk} chip={chip} chipHi={chipHi} />
        ))}

        {golden ? <path d={COOKIE_EDGE_PATH} fill="url(#hc-gold-sheen)" /> : null}

        {/* the room's light, then the shaded side, laid over everything so the chunks are lit by
            the same lamp as the dough they sit in */}
        <path d={COOKIE_EDGE_PATH} fill={`url(#hc-${uid}-light)`} />
        <path d={COOKIE_EDGE_PATH} fill={`url(#hc-${uid}-shade)`} />
      </g>

      {/* the browned rim, drawn last and only as a rim, plus the specular streak where the rim
          turns into the light */}
      <path d={COOKIE_EDGE_PATH} fill="none" stroke={crust} strokeWidth="2.2" opacity="0.5" />
      <path
        d="M18 30 Q24 19 36 13"
        fill="none"
        stroke={golden ? 'var(--gold-hi, #fffbe8)' : 'rgba(255, 255, 255, 0.55)'}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.26"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------
 * Random-event art (src/shared/game/random-events.ts).
 *
 * Same rules as everything above: one 32x32 canvas, one stroke weight, theme custom properties
 * for every colour, `aria-hidden` because the button or the chip beside them always carries the
 * accessible name. The setback event is the only one drawn in the error role — a player should
 * be able to tell at a glance that this one is taking something away.
 * ---------------------------------------------------------------------------------------- */

const ALARM = 'var(--error, #a33019)';
const ALARM_LIGHT = 'var(--error-container, #ffdad3)';

/** One falling cookie during Cookie Rain. Drawn small and round so twelve of them read as rain. */
export function RainDropArt({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      {/* Chip placement is deliberately lopsided. Three evenly-spaced chips on a pale disc
          read as a face at this size, which is the last thing a falling cookie should be. */}
      <circle cx="16" cy="16" r="13" fill={DOUGH} stroke={CRUST} strokeWidth="2" />
      <path d="M6 13a12 12 0 0 1 9-7" fill="none" stroke={HIGHLIGHT} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="11.5" cy="12.5" r="2.6" fill={CHIP} stroke="none" />
      <circle cx="19.5" cy="17.5" r="3" fill={CHIP} stroke="none" />
      <circle cx="12" cy="21" r="2.2" fill={CHIP} stroke="none" />
      <circle cx="21" cy="9.5" r="1.5" fill={CHIP} stroke="none" />
      <circle cx="15.5" cy="16" r="1" fill={CRUST_DARK} stroke="none" opacity="0.5" />
      <circle cx="24" cy="21" r="1.1" fill={CRUST_DARK} stroke="none" opacity="0.45" />
    </Art>
  );
}

/** The whole Cookie Rain, as one emblem: three cookies under a cloud. */
function CookieRainArt() {
  return (
    <Art>
      <path d="M8 11a5 5 0 0 1 9.4-2.4A4 4 0 0 1 24 11a3.5 3.5 0 0 1-.4 7H9.5A3.5 3.5 0 0 1 8 11Z" fill={PLATE_DIM} />
      <circle cx="11" cy="24" r="3.2" fill={DOUGH} />
      <circle cx="16" cy="28" r="3.2" fill={DOUGH} />
      <circle cx="21" cy="24" r="3.2" fill={DOUGH} />
      <circle cx="11" cy="24" r="0.9" fill={CHIP} stroke="none" />
      <circle cx="16" cy="28" r="0.9" fill={CHIP} stroke="none" />
      <circle cx="21" cy="24" r="0.9" fill={CHIP} stroke="none" />
    </Art>
  );
}

/** Grandma's Surprise Batch: a baking tray straight out of the oven. */
function GrandmasBatchArt() {
  return (
    <Art>
      <path d="M4 18h24v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill={METAL_LO} />
      <path d="M4 18h24" stroke={METAL_HI} strokeWidth="2" />
      <circle cx="10" cy="14" r="3.4" fill={DOUGH} />
      <circle cx="16" cy="13" r="3.4" fill={DOUGH} />
      <circle cx="22" cy="14" r="3.4" fill={DOUGH} />
      <path d="M9 6q1.5 2 0 4M16 4q1.5 2 0 4M23 6q1.5 2 0 4" fill="none" stroke={GOLD_DEEP} strokeWidth="1.4" opacity="0.8" />
    </Art>
  );
}

/** Oven Hiccup: the oven door with a warning bolt across it. The one drawing in the error role. */
export function OvenHiccupArt({ extraClass }: { extraClass?: string } = {}) {
  return (
    <Art extraClass={extraClass}>
      <rect x="4" y="7" width="24" height="21" rx="3" fill={ALARM_LIGHT} />
      <rect x="7.5" y="13" width="17" height="11" rx="2" fill={PLATE_DIM} />
      <path d="M4 11h24" stroke={ALARM} strokeWidth="1.6" />
      <circle cx="8.5" cy="9.2" r="1.1" fill={ALARM} stroke="none" />
      <circle cx="12" cy="9.2" r="1.1" fill={ALARM} stroke="none" />
      <path d="M17 13.5 12.5 19h4L14 24l6.5-6.5h-4L19 13.5Z" fill={GOLD} stroke={ALARM} strokeWidth="1.2" />
    </Art>
  );
}

/** Sugar Rush: a sugar cube going off like a firework. */
function SugarRushArt() {
  return (
    <Art>
      <rect x="10" y="12" width="12" height="11" rx="2" fill={PLATE} />
      <path d="M10 16h12M16 12v11" stroke={PLATE_DIM} strokeWidth="1.4" />
      <path d="M16 3v5M6 7l3 3.5M26 7l-3 3.5M3 17h4M25 17h4" stroke={GOLD_DEEP} strokeWidth="1.8" />
      <circle cx="16" cy="17.5" r="2.2" fill={GOLD} stroke="none" />
    </Art>
  );
}

/** Lucky Crumb: one small crumb with a spark on it. */
function LuckyCrumbArt() {
  return (
    <Art>
      <path d="M11 22 8 15l7-3 6 4-2 7Z" fill={DOUGH} />
      <circle cx="13.5" cy="17.5" r="1.5" fill={CHIP} stroke="none" />
      <path d="M22 5.5 23.4 9l3.6 1.4-3.6 1.4L22 15.4l-1.4-3.6L17 10.4l3.6-1.4Z" fill={GOLD} stroke={GOLD_RING} />
    </Art>
  );
}

/** Market Day: a price tag with the rebate coming back off it. */
function MarketDayArt() {
  return (
    <Art>
      <path d="M16 4h10a2 2 0 0 1 2 2v10L15 29 3 17Z" fill={EMERALD_LIGHT} />
      <circle cx="23" cy="9" r="2.2" fill={EMERALD} stroke="none" />
      <path d="M9 15.5 15 21.5M15 15.5 9 21.5" stroke={EMERALD} strokeWidth="2" opacity="0.35" />
      <path d="M18 22.5a5 5 0 1 0-1.4-4.2" fill="none" stroke={EMERALD} strokeWidth="2" />
      <path d="M13 13.5h4v4" fill="none" stroke={EMERALD} strokeWidth="2" />
    </Art>
  );
}

/** The emblem for one event id, for the HUD indicator and the toast. */
export const RANDOM_EVENT_ART: Record<string, () => ReactElement> = {
  cookie_rain: CookieRainArt,
  grandmas_batch: GrandmasBatchArt,
  oven_hiccup: OvenHiccupArt,
  sugar_rush: SugarRushArt,
  lucky_crumb: LuckyCrumbArt,
  market_day: MarketDayArt,
};
