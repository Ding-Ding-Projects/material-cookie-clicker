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
