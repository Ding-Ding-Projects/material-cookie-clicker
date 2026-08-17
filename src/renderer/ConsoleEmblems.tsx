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

/** SETTINGS — a machined gear with a bevelled rim, eight teeth and a hub, with a slider bar
 *  laid across its lower half: the panel is a machine control, and the two funny sliders are the
 *  thing inside it. Drawn in the same idiom as the other four (inline gradient, --spark-ring
 *  outline) so the fifth button reads as part of the same console rather than a bolted-on
 *  afterthought. Unlike the other four this one is on the cabinet from the very first frame:
 *  Settings is an application surface, not a game unlock. */
export function GearEmblem({ className }: EmblemProps) {
  // Eight teeth, generated rather than hand-listed so they stay exactly evenly spaced.
  const teeth = Array.from({ length: 8 }, (_, index) => index * 45);
  return (
    <svg {...frame(className)}>
      <defs>
        <radialGradient id="mcc-gear-face" cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="var(--metal-hi)" />
          <stop offset="0.55" stopColor="var(--surface-highest)" />
          <stop offset="1" stopColor="var(--metal-lo)" />
        </radialGradient>
      </defs>
      <g stroke="var(--spark-ring)" strokeWidth="1.2" strokeLinejoin="round" fill="url(#mcc-gear-face)">
        {teeth.map((angle) => (
          <rect key={angle} x="13.6" y="0.9" width="4.8" height="7.4" rx="1.4" transform={`rotate(${angle} 16 16)`} />
        ))}
      </g>
      <circle cx="16" cy="16" r="10.2" fill="url(#mcc-gear-face)" stroke="var(--spark-ring)" strokeWidth="2" />
      <circle cx="16" cy="16" r="4.1" fill="var(--surface-lowest)" stroke="var(--spark-ring)" strokeWidth="1.5" />
      <path d="M8.8 21.6h14.4" stroke="var(--tier2)" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
      <circle cx="19.6" cy="21.6" r="2.6" fill="var(--tier2)" stroke="var(--spark-ring)" strokeWidth="1" />
      <path d="M9.4 10.6a8.6 8.6 0 0 1 4.4-3.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** DIESEL FACTORY — a refinery skyline: two fractionating columns behind a bunded storage tank,
 *  with a feed pipe running in from the left and a plume off the taller column. The tank is
 *  drawn part-filled, because a tank level is the one number this whole subgame is about. */
export function RefineryEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <linearGradient id="mcc-refinery-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--metal-hi)" />
          <stop offset="1" stopColor="var(--metal-lo)" />
        </linearGradient>
        <linearGradient id="mcc-refinery-fuel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--tier2-container)" />
          <stop offset="1" stopColor="var(--tier2)" />
        </linearGradient>
      </defs>
      {/* the plume, drawn first so the columns sit over it */}
      <path d="M20.6 6.4c2.2-1.6 4.4-.6 4.6 1.4" fill="none" stroke="var(--metal-hi)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      {/* feed pipe in from the left */}
      <path d="M1.4 20h5.2v-6" fill="none" stroke="var(--outline)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* the two columns */}
      <rect x="4.4" y="8.2" width="5.2" height="17" rx="1.4" fill="url(#mcc-refinery-steel)" stroke="var(--spark-ring)" strokeWidth="1.2" />
      <rect x="11.6" y="4.4" width="6" height="20.8" rx="1.5" fill="url(#mcc-refinery-steel)" stroke="var(--spark-ring)" strokeWidth="1.2" />
      <path d="M4.9 13h4.2M4.9 17.6h4.2M12.1 10h5M12.1 15h5M12.1 20h5" stroke="var(--outline)" strokeWidth="0.9" opacity="0.6" />
      {/* the storage tank, part filled */}
      <rect x="19.4" y="14" width="10.4" height="11.2" rx="1.6" fill="var(--surface-lowest)" stroke="var(--spark-ring)" strokeWidth="1.5" />
      <path d="M19.4 19.4h10.4v4.2a1.6 1.6 0 0 1-1.6 1.6H21a1.6 1.6 0 0 1-1.6-1.6z" fill="url(#mcc-refinery-fuel)" />
      <path d="M19.4 19.4h10.4" stroke="var(--tier2)" strokeWidth="1.1" />
      {/* the hardstanding everything sits on */}
      <path d="M2.2 25.6h27.6" stroke="var(--outline)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 11.4a3.4 3.4 0 0 1 1.6-2" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** THE HOME — a cutaway house: a pitched roof over a two-storey front, one window lit warm and
 *  one still dark, a chimney with smoke off it, and a door on the ground floor. The lit-versus-
 *  dark pair is the emblem's whole argument: this is a house you are part way through building,
 *  and the point of it is the rooms that are not finished yet. */
export function HouseEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      <defs>
        <linearGradient id="mcc-house-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface-highest)" />
          <stop offset="1" stopColor="var(--surface-lowest)" />
        </linearGradient>
        <linearGradient id="mcc-house-roof" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="var(--tier1-container)" />
          <stop offset="1" stopColor="var(--tier1)" />
        </linearGradient>
        <radialGradient id="mcc-house-lit" cx="0.5" cy="0.4" r="0.75">
          <stop offset="0" stopColor="var(--metal-hi)" />
          <stop offset="0.55" stopColor="var(--spark)" />
          <stop offset="1" stopColor="var(--spark-glow)" />
        </radialGradient>
      </defs>
      {/* smoke, drawn first so the chimney sits over it */}
      <path d="M23.4 5.4c2-1.5 3.9-.5 4.1 1.3" fill="none" stroke="var(--metal-hi)" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <rect x="21.4" y="6.2" width="3.4" height="5.6" rx="0.8" fill="var(--metal-lo)" stroke="var(--spark-ring)" strokeWidth="1" />
      {/* the pitched roof */}
      <path d="M2.6 14.6L16 4.2l13.4 10.4z" fill="url(#mcc-house-roof)" stroke="var(--spark-ring)" strokeWidth="1.4" strokeLinejoin="round" />
      {/* the two-storey front */}
      <rect x="5.6" y="14.2" width="20.8" height="12.4" rx="1.2" fill="url(#mcc-house-wall)" stroke="var(--spark-ring)" strokeWidth="1.4" />
      {/* the floor line — this is a CUTAWAY, so the storeys are drawn separately */}
      <path d="M5.6 20.4h20.8" stroke="var(--outline)" strokeWidth="1.1" opacity="0.7" />
      {/* upstairs: one window lit, one dark */}
      <rect x="8.4" y="15.8" width="4.4" height="3.4" rx="0.7" fill="url(#mcc-house-lit)" stroke="var(--spark-ring)" strokeWidth="0.9" />
      <rect x="19.2" y="15.8" width="4.4" height="3.4" rx="0.7" fill="var(--surface-lowest)" stroke="var(--outline)" strokeWidth="0.9" />
      {/* downstairs: the door, and the kitchen window beside it */}
      <path d="M13.6 26.6v-4.8a2.4 2.4 0 0 1 4.8 0v4.8z" fill="var(--tier1)" stroke="var(--spark-ring)" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="17.3" cy="24.4" r="0.7" fill="var(--metal-hi)" />
      <rect x="8" y="22" width="4" height="3.2" rx="0.7" fill="url(#mcc-house-lit)" stroke="var(--spark-ring)" strokeWidth="0.9" />
      {/* the ground it stands on */}
      <path d="M2.4 26.8h27.2" stroke="var(--outline)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.4 12.4a5 5 0 0 1 3.4-2.8" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** THE PRICES CATALOGUE — a swing tag on a string with a cookie stamped on it and two ruled
 *  lines under it: a price list, hanging off the shelf. Deliberately not a gear and not a coin
 *  slot, because this is the one console button that is never for sale and it should not look
 *  like the one beside it that is. */
export function PriceTagEmblem({ className }: EmblemProps) {
  return (
    <svg {...frame(className)}>
      {/* the string it hangs from */}
      <path d="M4.6 4.6l5.6 5.6" fill="none" stroke="var(--metal-hi)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      {/* the tag body, corner-cut toward the eyelet */}
      <path
        d="M11.4 7.6h14.2a2 2 0 0 1 2 2v14.2a2 2 0 0 1-2 2H13.8a2 2 0 0 1-1.42-.59L6.2 19a2 2 0 0 1 0-2.83l4.2-4.2z"
        fill="var(--surface-highest)"
        stroke="var(--spark-ring)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* the eyelet */}
      <circle cx="11.6" cy="12.4" r="1.9" fill="var(--surface-lowest)" stroke="var(--metal-hi)" strokeWidth="1.2" />
      {/* the cookie stamped on it */}
      <circle cx="20.4" cy="13.4" r="3.4" fill="var(--tier1)" stroke="var(--spark-ring)" strokeWidth="1.1" />
      <circle cx="19.2" cy="12.6" r="0.65" fill="var(--outline)" />
      <circle cx="21.6" cy="14.4" r="0.65" fill="var(--outline)" />
      {/* the two ruled price lines */}
      <path d="M13.6 20.2h11.4" stroke="var(--outline)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.4 23.4h9.6" stroke="var(--outline)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M13.2 10.2a3 3 0 0 1 2.4-1.2" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
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
  factory: RefineryEmblem,
  home: HouseEmblem,
  achievements: MedalEmblem,
  tools: GemWrenchEmblem,
  statistics: GaugeEmblem,
  prestige: AscensionEmblem,
  catalogue: PriceTagEmblem,
  settings: GearEmblem,
} as const;
