import { useLayoutEffect, type ReactNode } from 'react';

import { AchievementMedal, GeneratorIcon, HeroCookieArt, ToolIcon, ToolTierGem, UpgradeIcon } from './assets/icons.js';
import { BulkToolbar } from './components/BulkToolbar.js';
import './styles/design-parity-route.css';

export const DESIGN_PARITY_NETWORK_POLICY = 'blocked' as const;
export const DESIGN_PARITY_FROZEN_TIME = '2026-08-19T12:00:00Z' as const;

const COMMON_TUPLE = {
  theme: 'light',
  width: 1280,
  height: 800,
  scale: 1,
  locale: 'en-HK',
} as const;

const ROW_STATES = {
  'achievement-badge--gallery': 'gallery',
  'building-row--gallery': 'gallery',
  'bulk-toolbar--progress': 'progress',
  'cookie-surface--gallery': 'gallery',
  'game-layout--main': 'main',
  'narrator-toast--gallery': 'gallery',
  'prestige-gate--ready': 'ready',
  'search-regex-builder--open': 'open',
  'settings-funny-sliders--default': 'default',
  'stat-tile--gallery': 'gallery',
  'tokens-color--roles': 'roles',
  'tokens-shape-elevation--scale': 'scale',
  'tokens-type--scale': 'scale',
  'tool-card--gallery': 'gallery',
  'tools-tree--mixed': 'mixed',
  'upgrade-card--gallery': 'gallery',
} as const;

export type DesignParityRowId = keyof typeof ROW_STATES;

export const DESIGN_PARITY_ROW_IDS = Object.freeze(Object.keys(ROW_STATES) as DesignParityRowId[]);

export const DESIGN_PARITY_FIXTURES: Readonly<Record<DesignParityRowId, string>> = {
  'achievement-badge--gallery': 'achievement-gallery-v1',
  'building-row--gallery': 'building-gallery-v1',
  'bulk-toolbar--progress': 'bulk-progress-v1',
  'cookie-surface--gallery': 'cookie-gallery-v1',
  'game-layout--main': 'main-game-v1',
  'narrator-toast--gallery': 'narrator-toast-v1',
  'prestige-gate--ready': 'prestige-ready-v1',
  'search-regex-builder--open': 'regex-builder-open-v1',
  'settings-funny-sliders--default': 'settings-default-v1',
  'stat-tile--gallery': 'statistics-gallery-v1',
  'tokens-color--roles': 'color-roles-v1',
  'tokens-shape-elevation--scale': 'shape-elevation-v1',
  'tokens-type--scale': 'type-scale-v1',
  'tool-card--gallery': 'tool-card-gallery-v1',
  'tools-tree--mixed': 'tools-tree-mixed-v1',
  'upgrade-card--gallery': 'upgrade-gallery-v1',
};

export interface DesignParityRequest {
  readonly kind: 'valid';
  readonly rowId: DesignParityRowId;
  readonly state: (typeof ROW_STATES)[DesignParityRowId];
  readonly theme: typeof COMMON_TUPLE.theme;
  readonly width: typeof COMMON_TUPLE.width;
  readonly height: typeof COMMON_TUPLE.height;
  readonly scale: typeof COMMON_TUPLE.scale;
  readonly locale: typeof COMMON_TUPLE.locale;
}

export interface RejectedDesignParityRequest {
  readonly kind: 'rejected';
  readonly rowId: string;
  readonly reason: 'unknown-row' | 'tuple-mismatch';
}

export type ResolvedDesignParityRequest = DesignParityRequest | RejectedDesignParityRequest;

function paramsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
}

/**
 * The product-side route parser is deliberately exact. A capture URL cannot quietly select a
 * different state, size, scale, theme, or locale and still receive pixels labelled as the
 * inventory tuple.
 */
export function resolveDesignParityRequest(input: string | URLSearchParams): ResolvedDesignParityRequest | null {
  const params = paramsFrom(input);
  const rowId = params.get('designParity');
  if (rowId === null) return null;
  if (!Object.prototype.hasOwnProperty.call(ROW_STATES, rowId)) {
    return { kind: 'rejected', rowId, reason: 'unknown-row' };
  }

  const typedRowId = rowId as DesignParityRowId;
  const exact =
    params.get('state') === ROW_STATES[typedRowId] &&
    params.get('theme') === COMMON_TUPLE.theme &&
    params.get('width') === String(COMMON_TUPLE.width) &&
    params.get('height') === String(COMMON_TUPLE.height) &&
    params.get('scale') === String(COMMON_TUPLE.scale) &&
    params.get('locale') === COMMON_TUPLE.locale;
  if (!exact) return { kind: 'rejected', rowId, reason: 'tuple-mismatch' };

  return { kind: 'valid', rowId: typedRowId, state: ROW_STATES[typedRowId], ...COMMON_TUPLE };
}

export function assertDesignParityCoverage(ids: readonly string[]): void {
  const expected = [...DESIGN_PARITY_ROW_IDS].sort();
  const actual = [...new Set(ids)].sort();
  if (actual.length !== ids.length || actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`Design parity route coverage mismatch: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
}

function GalleryFrame({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <section className="parity-gallery" aria-label={label}>
      {children}
    </section>
  );
}

function AchievementGallery() {
  const badges = [
    { family: 'cookies' as const, name: 'First Batch', yue: '第一爐', unlocked: true },
    { family: 'clicks' as const, name: 'Busy Hands', yue: '手板好忙', unlocked: true },
    { family: 'buildings' as const, name: 'Cookie District', yue: '曲奇街坊', unlocked: true },
    { family: 'locked' as const, name: 'Locked achievement', yue: '未解鎖成就', unlocked: false },
  ];
  return (
    <GalleryFrame label="Achievement badge product gallery">
      <div className="achievement-grid parity-achievement-grid">
        {badges.map((badge) => (
          <div className="achievement-cell" key={badge.name}>
            <div className={`achievement-badge ${badge.unlocked ? 'unlocked achievement-badge--minted' : 'locked'}`} role="img" aria-label={`${badge.name} · ${badge.yue}`}>
              <AchievementMedal family={badge.family} />
            </div>
            <div className="achievement-name">{badge.unlocked ? badge.name : 'Locked'}</div>
            <div className="achievement-name-zh">{badge.unlocked ? badge.yue : '未解鎖'}</div>
          </div>
        ))}
      </div>
      <div className="achievement-toast parity-inline-toast" aria-hidden="true">
        <div className="achievement-badge unlocked achievement-badge--minted achievement-toast__badge"><AchievementMedal family="cookies" /></div>
        <div className="achievement-toast__text"><strong>Achievement unlocked · 成就解鎖</strong>First Batch · 第一爐</div>
      </div>
    </GalleryFrame>
  );
}

function BuildingGallery() {
  const rows = [
    { id: 'cursor', name: 'Cursor', yue: '游標', owned: 24, rate: '12.0 cookies/s', cost: '1,125', locked: false },
    { id: 'grandma', name: 'Grandma', yue: '婆婆', owned: 6, rate: '6.0 cookies/s', cost: '1,740', locked: false },
    { id: 'farm', name: 'Farm', yue: '農場', owned: 0, rate: 'Unlock at 1,100 baked', cost: '—', locked: true },
  ];
  return (
    <GalleryFrame label="Building row product gallery">
      <div className="parity-building-stack">
        {rows.map((row) => (
          <div className={`shop-row${row.owned ? ' owned' : ''}${row.locked ? ' locked' : ''}`} key={row.id}>
            <div className="shop-row__icon" aria-hidden="true"><GeneratorIcon id={row.id} /></div>
            <div className="shop-row__names"><span className="shop-row__name">{row.name}</span><span className="shop-row__name-zh">{row.yue}</span><span className="shop-row__sub">{row.rate}</span></div>
            <span className="shop-row__owned">{row.owned}</span>
            <div className="shop-row__controls">
              <div className="stepper" role="group" aria-label={`Buy quantity for ${row.name}`}><button type="button" className="active" aria-pressed="true">×1</button><button type="button" aria-pressed="false">×10</button><button type="button" className="stepper__max" aria-pressed="false"><span>Max</span><span className="stepper__max-zh">最多</span></button></div>
              <button type="button" className="buy-btn" disabled={row.locked}>Buy · 買入 — 🍪 {row.cost}</button>
            </div>
          </div>
        ))}
      </div>
    </GalleryFrame>
  );
}

function BulkProgress() {
  return (
    <GalleryFrame label="Bulk action progress product state">
      <BulkToolbar selectedCount={4} matchingCount={12} onSelectAllMatching={() => undefined} onClearSelection={() => undefined} actions={[{ key: 'buy', label: 'Buy 4 · 買 4 個', onRun: () => undefined }, { key: 'export', label: 'Export 4 · 匯出 4 個', onRun: () => undefined }]} busy resultText={null} />
      <div className="parity-progress-card" role="status"><span>Buying selected buildings · 正在買入已選建築</span><progress value="62" max="100">62%</progress><strong>62% · 5 of 8 complete</strong></div>
    </GalleryFrame>
  );
}

function CookieGallery() {
  return (
    <GalleryFrame label="Cookie surface product gallery">
      <div className="parity-cookie-states">
        {['Rest', 'Hover', 'Pressed', 'Focus visible', 'Golden cookie'].map((label, index) => (
          <div className={`cookie-target-wrap${index === 4 ? ' golden' : ''} parity-cookie-state parity-cookie-state--${index}`} key={label}>
            <button type="button" className="cookie-btn cookie-btn--art cookie-btn--lift" aria-label={`${label} cookie`}><HeroCookieArt golden={index === 4} extraClass="cookie-btn__art" /></button>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </GalleryFrame>
  );
}

function GameLayout() {
  return (
    <div className="parity-game-layout" aria-label="Main product game layout">
      <div className="hud"><div className="hud__readout"><span>Cookies · 曲奇</span><strong>12.48 M</strong></div><div className="hud__readout"><span>Per second · 每秒</span><strong>48,220</strong></div><div className="hud__readout"><span>Per click · 每撳</span><strong>864</strong></div></div>
      <section className="panel parity-layout-cookie"><CookieGallery /></section>
      <section className="panel upgrade-shelf parity-layout-upgrades"><h2 className="panel__title">Upgrades <span className="panel__title-zh">升級</span></h2><UpgradeTickets compact /></section>
      <section className="panel shop-rail parity-layout-shop"><h2 className="panel__title">Buildings <span className="panel__title-zh">建築</span></h2><BuildingGallery /></section>
    </div>
  );
}

function NarratorToastGallery() {
  return (
    <GalleryFrame label="Narrator toast product gallery">
      <div className="parity-toast-stack">
        <div className="canonical-notice" role="status"><strong>Milestone narrated · 里程碑已朗讀</strong><span>One million cookies baked. · 焗咗一百萬塊曲奇。</span><button type="button" aria-label="Dismiss notification">×</button></div>
        <div className="canonical-notice parity-notice--queued" role="status"><strong>Queued next · 下一句排緊隊</strong><span>English speaks before Cantonese. · 先英文，後廣東話。</span><button type="button" aria-label="Dismiss queued notification">×</button></div>
      </div>
    </GalleryFrame>
  );
}

function PrestigeReady() {
  return (
    <GalleryFrame label="Prestige ready product state">
      <section className="projection-card"><h2>Ascension projection · 飛升預覽</h2><p>Prestiging now awards <strong>128 ascension points</strong>. · 而家轉生會攞到 <strong>128 粒飛升點</strong>。</p><p className="projection-card__detail">Each point permanently adds 1% total production. · 每粒永久加 1% 總產量。</p></section>
      <div className="gate parity-gate"><h2>Confirm prestige · 確認轉生</h2><p>This resets cookies, buildings, and ordinary upgrades. Permanent unlocks stay. · 曲奇、建築同普通升級會重置；永久解鎖會保留。</p><div className="gate__keys"><label className="gate__key"><input type="checkbox" defaultChecked />I understand the reset · 我明白會重置</label><label className="gate__key"><input type="checkbox" defaultChecked />Keep permanent progress · 保留永久進度</label></div><label className="gate__slider-label" htmlFor="parity-prestige-slider">Slide fully to ascend · 拉到底轉生</label><input id="parity-prestige-slider" className="gate__slider" type="range" min="0" max="100" defaultValue="100" /><button type="button" className="gate-trigger tone-prestige">Ascend now · 而家飛升</button></div>
    </GalleryFrame>
  );
}

function RegexBuilderOpen() {
  return (
    <GalleryFrame label="Open regex builder product state">
      <div className="search-field-wrap parity-search-wrap"><div className="search-field regex-active"><span aria-hidden="true">🔍</span><input className="search-field__input" aria-label="Search tools, regex mode active" defaultValue="^(cursor|grandma)$" /><button type="button" className="builder-toggle" aria-pressed="true" aria-expanded="true">.*</button></div>
        <div className="regex-popover parity-regex-popover"><div className="mode-row" role="group" aria-label="Search mode"><button type="button" aria-pressed="false">Plain text · 純文字</button><button type="button" aria-pressed="true">Regex · 規則運算式</button></div><label>Pattern · 規則<input type="text" defaultValue="^(cursor|grandma)$" /></label><div className="flag-row"><label><input type="checkbox" defaultChecked /> Ignore case</label><label><input type="checkbox" defaultChecked /> Unicode</label></div><div className="regex-token-list"><span className="regex-token-list__heading">Anchors · 錨點</span><button type="button">^</button><button type="button">$</button><button type="button">\b</button></div><label>Test text · 試驗文字<textarea rows={3} defaultValue={'cursor\ngrandma\nfarm'} /></label><p className="regex-lab__summary">2 matches · 2 個配對</p></div>
      </div>
    </GalleryFrame>
  );
}

function SettingsFunnySliders() {
  return (
    <GalleryFrame label="Funny level settings product state">
      <section className="settings-block"><span className="settings-block__label">Message voice · 訊息語氣</span><p className="settings-caption">These levels style every message without changing facts. · 呢啲級別只改語氣，唔會改事實。</p><div className="settings-sliders"><label className="settings-slider settings-slider--en"><span className="settings-slider__title">English funny level</span><input className="settings-slider__input" type="range" min="1" max="5" defaultValue="2" /><span className="settings-slider__value">2 / 5</span></label><label className="settings-slider settings-slider--yue"><span className="settings-slider__title">廣東話搞笑程度</span><input className="settings-slider__input" type="range" min="1" max="5" defaultValue="4" /><span className="settings-slider__value">4 / 5</span></label></div></section>
    </GalleryFrame>
  );
}

function StatGallery() {
  const stats = [['Total cookies baked', '總共焗咗', '48.22 M', '+12.4%'], ['Cookies per second', '每秒曲奇', '86,400', '+4.8%'], ['Total clicks', '總撳數', '12,804', 'No change'], ['Prestige runs', '轉生次數', '18', '+1']];
  return <GalleryFrame label="Statistic tile product gallery"><div className="stat-grid">{stats.map(([en, yue, value, trend], index) => <div className="stat-tile" key={en}><span className="stat-tile__label-en">{en}</span><span className="stat-tile__label-zh">{yue}</span><span className="stat-tile__value">{value}</span><span className={`stat-tile__trend ${index === 2 ? 'flat' : 'up'}`}>{index === 2 ? '■' : '▲'} {trend}</span></div>)}</div></GalleryFrame>;
}

const COLOR_ROLES = [
  ['Primary', '--primary', '--on-primary'], ['Primary container', '--primary-container', '--on-primary-container'], ['Secondary', '--secondary', '--on-secondary'], ['Tertiary', '--tertiary', '--on-tertiary'], ['Surface', '--surface', '--on-surface'], ['Surface high', '--surface-high', '--on-surface'], ['Error', '--error', '--on-error'], ['Outline', '--outline', '--surface'],
] as const;

function ColorRoles() {
  return <GalleryFrame label="Live product color roles"><div className="parity-token-grid">{COLOR_ROLES.map(([name, background, foreground]) => <div className="parity-color-role" key={name} style={{ background: `var(${background})`, color: `var(${foreground})` }}><strong>{name}</strong><code>{background}</code></div>)}</div></GalleryFrame>;
}

function ShapeElevationScale() {
  const shapes = [['Extra small', '--shape-xs', '--elevation-1'], ['Small', '--shape-sm', '--elevation-1'], ['Medium', '--shape-md', '--elevation-2'], ['Large', '--shape-lg', '--elevation-3'], ['Extra large', '--shape-xl', '--elevation-4'], ['Full', '--shape-full', '--elevation-5']] as const;
  return <GalleryFrame label="Live product shape and elevation scale"><div className="parity-shape-grid">{shapes.map(([name, shape, elevation]) => <div className="parity-shape" key={name} style={{ borderRadius: `var(${shape})`, boxShadow: `var(${elevation})` }}><strong>{name}</strong><code>{shape}</code><code>{elevation}</code></div>)}</div></GalleryFrame>;
}

function TypeScale() {
  const types = [['Display large', 'parity-type-display'], ['Headline large', 'parity-type-headline'], ['Title large', 'parity-type-title'], ['Body large', 'parity-type-body'], ['Label large', 'parity-type-label']] as const;
  return <GalleryFrame label="Live product typography scale"><div className="parity-type-scale">{types.map(([name, className]) => <div className={className} key={name}><span>{name}</span><strong>Cookie cabinet · 曲奇機櫃</strong></div>)}</div></GalleryFrame>;
}

function ToolCards() {
  const tools = [{ id: 'commandPalette', tier: 1 as const, state: 'unlocked', name: 'Command palette', yue: '指令面板' }, { id: 'regexBuilder', tier: 2 as const, state: 'ready', name: 'Regex builder', yue: '規則運算式工具' }, { id: 'appearanceEditor', tier: 3 as const, state: 'locked', name: 'Appearance editor', yue: '外觀編輯器' }];
  return <GalleryFrame label="Tool card product gallery"><ul className="parity-tool-grid">{tools.map((tool) => <li className={`item-card tool-node ${tool.state}`} key={tool.id}><span className="item-card__icon" aria-hidden="true"><ToolIcon id={tool.id} tier={tool.tier} /></span><span className="item-card__name-en">{tool.name}</span><span className="item-card__name-zh">{tool.yue}</span><span className="tool-node__chip">{tool.state}</span><p className="item-card__desc">A real application tool with a visible product-owned progression state. · 真正應用工具，有清楚進度狀態。</p><span className="item-card__progress-line">2 / 3 requirements · 2 / 3 個條件</span><div className="item-card__progress-track"><div className="item-card__progress-fill" style={{ width: tool.state === 'unlocked' ? '100%' : tool.state === 'ready' ? '72%' : '24%' }} /></div></li>)}</ul></GalleryFrame>;
}

function ToolsTree() {
  return <GalleryFrame label="Mixed tool tree product state"><div className="tools-hud"><span className="tools-hud__counter"><span className="tools-hud__counter-value">7<span className="tools-hud__counter-sep">/</span>18</span><span className="tools-hud__counter-label">tools unlocked · 已解鎖工具</span></span><div className="tools-hud__track"><div className="tools-hud__fill" style={{ width: '39%' }} /></div></div><div className="parity-tools-tree">{([1, 2, 3] as const).map((tier) => <section className="tools-tier" data-tier={tier} key={tier}><h2 className="tools-tier__heading"><span className="tools-tier__gem"><ToolTierGem tier={tier} /></span>Tier {tier} · 第 {tier} 層</h2><ToolCards /></section>)}</div></GalleryFrame>;
}

function UpgradeTickets({ compact = false }: { readonly compact?: boolean }) {
  const upgrades = [{ family: 'click' as const, name: 'Reinforced finger', yue: '加固手指', effect: '+2 cookies per click', cost: '500' }, { family: 'generator' as const, name: 'Steel rolling pins', yue: '鋼製擀麵棍', effect: 'Grandmas produce twice as much', cost: '12,000' }, { family: 'golden' as const, name: 'Lucky glaze', yue: '幸運糖霜', effect: '+10% golden cookie rewards', cost: '84,000' }];
  return <div className={`shelf-grid parity-upgrade-grid${compact ? ' parity-upgrade-grid--compact' : ''}`}>{upgrades.map((upgrade) => <button type="button" className="shelf-ticket shelf-ticket--affordable" key={upgrade.name}><span className="shelf-ticket__glyph"><UpgradeIcon family={upgrade.family} /></span><span className="shelf-ticket__body"><span className="shelf-ticket__name">{upgrade.name}</span><span className="shelf-ticket__name-zh">{upgrade.yue}</span><span className="shelf-ticket__effect">{upgrade.effect}</span><span className="shelf-ticket__cost">🍪 {upgrade.cost}</span></span></button>)}</div>;
}

function UpgradeGallery() {
  return <GalleryFrame label="Upgrade card product gallery"><section className="panel upgrade-shelf parity-upgrade-shelf"><div className="panel__header"><h2 className="panel__title">Upgrades <span className="panel__title-zh">升級</span><span className="panel__title-count">3 / 48</span></h2></div><div className="shelf-section shelf-section--buyable"><h3 className="shelf-section__heading">Buyable · 買得起 <span className="shelf-section__badge">3</span></h3><UpgradeTickets /></div></section></GalleryFrame>;
}

const ROUTE_RENDERERS: Readonly<Record<DesignParityRowId, () => ReactNode>> = {
  'achievement-badge--gallery': AchievementGallery,
  'building-row--gallery': BuildingGallery,
  'bulk-toolbar--progress': BulkProgress,
  'cookie-surface--gallery': CookieGallery,
  'game-layout--main': GameLayout,
  'narrator-toast--gallery': NarratorToastGallery,
  'prestige-gate--ready': PrestigeReady,
  'search-regex-builder--open': RegexBuilderOpen,
  'settings-funny-sliders--default': SettingsFunnySliders,
  'stat-tile--gallery': StatGallery,
  'tokens-color--roles': ColorRoles,
  'tokens-shape-elevation--scale': ShapeElevationScale,
  'tokens-type--scale': TypeScale,
  'tool-card--gallery': ToolCards,
  'tools-tree--mixed': ToolsTree,
  'upgrade-card--gallery': UpgradeGallery,
};

assertDesignParityCoverage(Object.keys(ROUTE_RENDERERS));

export function DesignParityRoute({ request }: { readonly request: ResolvedDesignParityRequest }) {
  useLayoutEffect(() => {
    if (request.kind !== 'valid') return undefined;
    const root = document.documentElement;
    const previous = new Map<string, string | null>();
    const attributes: Record<string, string> = {
      'data-theme': request.theme,
      'data-look-colour': 'on',
      'data-look-type': 'on',
      'data-look-shape': 'on',
      'data-look-elevation': 'on',
      'data-look-art': 'on',
      'data-look-motion': 'on',
      'data-look-dark': 'on',
      'data-design-parity': request.rowId,
      'data-network-policy': DESIGN_PARITY_NETWORK_POLICY,
      'data-frozen-time': DESIGN_PARITY_FROZEN_TIME,
      lang: request.locale,
    };
    for (const [name, value] of Object.entries(attributes)) {
      previous.set(name, root.getAttribute(name));
      root.setAttribute(name, value);
    }
    return () => {
      for (const [name, value] of previous) value === null ? root.removeAttribute(name) : root.setAttribute(name, value);
    };
  }, [request]);

  if (request.kind === 'rejected') {
    return <main className="design-parity-rejection" role="alert" data-design-parity-rejected={request.reason}>Design parity route rejected.</main>;
  }

  const Renderer = ROUTE_RENDERERS[request.rowId];
  return (
    <main
      className="design-parity-route"
      data-design-parity-row={request.rowId}
      data-design-parity-state={request.state}
      data-design-parity-fixture={DESIGN_PARITY_FIXTURES[request.rowId]}
      data-motion="paused"
      data-network={DESIGN_PARITY_NETWORK_POLICY}
      data-random-seed={1901 + DESIGN_PARITY_ROW_IDS.indexOf(request.rowId)}
      style={{ width: request.width, height: request.height }}
      aria-label={`Deterministic product route for ${request.rowId}`}
    >
      <Renderer />
    </main>
  );
}
