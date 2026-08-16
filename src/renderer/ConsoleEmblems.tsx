/**
 * The four console emblems, drawn as inline SVG illustrations.
 *
 * Scope note: these belong to the cabinet console and its anchored panels ONLY. Icons for
 * generators, upgrades and individual achievements live in src/renderer/assets/icons.tsx and are
 * owned by a different lane — nothing in this file may grow into that set.
 *
 * Every one of them is inline markup with inline gradients, so there is no file to fetch and the
 * cabinet looks identical offline. Colours come from the v2 tokens (var(--spark), var(--tier2)…)
 * so light and dark themes both hold their AA pairs. They are always decorative: the accessible
 * name sits on the button, and each <svg> carries aria-hidden and focusable="false".
 *
 * Gradient ids are namespaced per emblem because all four can be in the DOM at once (a console
 * button and the open panel's header share a shape) and duplicate ids would cross-wire the fills.
 */

type EmblemProps = { className?: string };

function frame(className?: string) {
  return {
    className: className ? `emblem ${className}` : 'emblem',
    viewBox: '0 0 32 32',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
    focusable: 'false' as const,
  };
}

/** ACHIEVEMENTS — a struck medal hanging from a forked ribbon, with a bevelled rim and a
 *  five-point star punched into the face. */
export function MedalEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <linearGradient id="mcc-medal-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--tier1-container)" />
          <stop offset="1" stopColor="var(--tier1)" />
        </linearGradient>
        <radialGradient id="mcc-medal-face" cx="0.34" cy="0.28" r="0.85">
          <stop offset="0" stopColor="var(--metal-hi)" />
          <stop offset="0.45" stopColor="var(--spark)" />
          <stop offset="1" stopColor="var(--metal-lo)" />
        </radialGradient>
      </defs>
      <path d="M7 2h6l3 8-6 4z" fill="url(#mcc-medal-ribbon)" stroke="var(--spark-ring)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M25 2h-6l-3 8 6 4z" fill="url(#mcc-medal-ribbon)" stroke="var(--spark-ring)" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="16" cy="21" r="9.4" fill="url(#mcc-medal-face)" stroke="var(--spark-ring)" strokeWidth="2" />
      <circle cx="16" cy="21" r="6.4" fill="none" stroke="var(--spark-ring)" strokeWidth="1" opacity="0.55" />
      <path
        d="M16 15.6l1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z"
        fill="var(--metal-hi)"
        stroke="var(--spark-ring)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path d="M10.4 15.2a8 8 0 0 1 4.4-3.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** TOOLS — a cut gem clasped by a spanner head: the tech tree is both the treasure and the
 *  toolkit, so the emblem carries both readings in one silhouette. */
export function GemWrenchEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <linearGradient id="mcc-gem-body" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="var(--tier3-container)" />
          <stop offset="1" stopColor="var(--tier3)" />
        </linearGradient>
        <linearGradient id="mcc-gem-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface-lowest)" />
          <stop offset="1" stopColor="var(--outline)" />
        </linearGradient>
      </defs>
      <path
        d="M4.6 6.6a5.4 5.4 0 0 0 6.8 6.9l13 13a2.6 2.6 0 0 0 3.7-3.7l-13-13A5.4 5.4 0 0 0 8.2 3l3.1 3.1-1.8 3.4-3.5 1.4z"
        fill="url(#mcc-gem-steel)"
        stroke="var(--outline)"
        strokeWidth="1.3"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path d="M21.5 3.5l7 4.2-2.6 7.4-8.8.2-3-7z" fill="url(#mcc-gem-body)" stroke="var(--tier3)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M14.1 8.3l14.4-.6-5.8 7.6z" fill="var(--tier3-container)" opacity="0.75" />
      <path d="M18.2 5.4l3.1-1.9 2.4 2.1" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** STATISTICS — a dial gauge: bevelled bezel, tick marks, a needle swung to the right and a
 *  rising bar chart printed on the face. */
export function GaugeEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <radialGradient id="mcc-gauge-face" cx="0.5" cy="1.1" r="1">
          <stop offset="0" stopColor="var(--surface-lowest)" />
          <stop offset="1" stopColor="var(--surface-highest)" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13.4" fill="url(#mcc-gauge-face)" stroke="var(--tier2)" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="10.4" fill="none" stroke="var(--tier2)" strokeWidth="0.9" opacity="0.45" />
      <path d="M6.4 11.2l2.4 1.2M16 4.6v2.7M25.6 11.2l-2.4 1.2" stroke="var(--tier2)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 22v-4.4M15 22v-7.4M19 22v-5.6M23 22v-9" stroke="var(--tier2)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M16 16L23 9.6" stroke="var(--on-surface)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.8" fill="var(--on-surface)" />
      <circle cx="16" cy="16" r="1.1" fill="var(--surface-lowest)" />
      <path d="M8.2 8.6a11 11 0 0 1 5.6-3.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** PRESTIGE — an ascension star: a four-point burst rising out of an arc, with two sparks
 *  trailing it. This is the only emblem that glows, because prestige is the loud one. */
export function AscensionEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <radialGradient id="mcc-star-core" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="var(--metal-hi)" />
          <stop offset="0.5" stopColor="var(--spark)" />
          <stop offset="1" stopColor="var(--spark-glow)" />
        </radialGradient>
      </defs>
      <path d="M4.6 27a12.6 12.6 0 0 1 22.8 0" fill="none" stroke="var(--spark-ring)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      <path
        d="M16 2.4l3 9.4 9.4 3-9.4 3-3 9.4-3-9.4-9.4-3 9.4-3z"
        fill="url(#mcc-star-core)"
        stroke="var(--spark-ring)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.4 5.6l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="var(--spark)" opacity="0.85" />
      <path d="M26.4 6.8l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="var(--spark)" opacity="0.7" />
      <path d="M13.4 9.6a6 6 0 0 1 2.4-4.6" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Decorative rivets/brackets for the panel header plate — chrome, never content. */
export function PanelCorner({ className }: EmblemProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M2 18V6a4 4 0 0 1 4-4h12" fill="none" stroke="var(--metal-hi)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
      <circle cx="6.5" cy="6.5" r="2.2" fill="var(--metal-lo)" stroke="var(--metal-hi)" strokeWidth="1" />
    </svg>
  );
}

export const CONSOLE_EMBLEMS = {
  achievements: MedalEmblem,
  tools: GemWrenchEmblem,
  statistics: GaugeEmblem,
  prestige: AscensionEmblem,
} as const;
