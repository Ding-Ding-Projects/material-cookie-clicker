import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { AchievementMedal, GeneratorIcon, HeroCookieArt, ToolIcon, ToolTierGem, UpgradeIcon } from './assets/icons.js';
import { BulkToolbar } from './components/BulkToolbar.js';
import { UpgradeParityScene } from './parity/UpgradeParityScene.js';
import { DestructiveGate } from './components/DestructiveGate.js';
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

interface DesignParityPageCopy {
  readonly title: string;
  readonly lede: string;
  readonly section: string;
}

/** Product-authored framing for the developer-only route. The references are component
 * specification pages, while this route remains executable product code; this copy explains
 * the live state without importing or rendering the reference documents themselves. */
export const DESIGN_PARITY_PAGE_COPY: Readonly<Record<DesignParityRowId, DesignParityPageCopy>> = {
  'achievement-badge--gallery': {
    title: 'Achievement badge · 成就徽章',
    lede: 'Locked medals conceal their identity; unlocked medals use the same minted product artwork and the unlock notification remains non-blocking. · 未解鎖獎牌會收埋身份；解鎖後用產品同一套鑄幣圖案，提示亦唔會阻住操作。',
    section: 'Locked vs unlocked · 未解鎖 / 已解鎖',
  },
  'building-row--gallery': {
    title: 'Building row · 建築物列 — generator list item',
    lede: 'The deterministic list shows an affordable row, an unaffordable row, and a locked row with the real bilingual anatomy, counts, rates, quantity controls, and price labels. · 固定清單用真正雙語結構顯示買得起、買唔起同未解鎖三種狀態。',
    section: 'Affordable, unaffordable, locked · 買得起、買唔起、未解鎖',
  },
  'bulk-toolbar--progress': {
    title: 'Bulk action toolbar · 批量操作列',
    lede: 'Every action names the affected count, disables during work, and reports exact progress instead of hiding behind a spinner. · 每個操作都寫明影響數量，執行期間停用，並顯示真實進度。',
    section: 'In-flight · 執行緊',
  },
  'cookie-surface--gallery': {
    title: 'Cookie surface · 曲奇表面 — primary click target',
    lede: 'One real product click target is presented in each visible interaction state, including the golden-cookie treatment and a focus ring that is not colour-only feedback. · 同一個真正產品曲奇掣顯示各種互動狀態，包括金曲奇同清楚鍵盤焦點。',
    section: 'Interaction states · 互動狀態',
  },
  'game-layout--main': {
    title: 'Game layout · 遊戲版面',
    lede: 'The live product composition keeps the HUD, cookie, upgrades, and generator rail on one surface, with deterministic figures and no navigation inserted into the core loop. · 真正產品版面將 HUD、曲奇、升級同建築欄放喺同一版，固定數字亦唔會插入額外導覽。',
    section: 'Wide layout · 闊版面',
  },
  'narrator-toast--gallery': {
    title: 'Milestone toast · 里程碑提示',
    lede: 'The product-owned notification anatomy shows both an informational milestone and a persistent queued message without becoming a modal. · 產品自己嘅提示結構同時顯示一般里程碑同持續訊息，但唔會變成阻塞對話框。',
    section: 'Notification lifecycle variants · 提示生命週期版本',
  },
  'prestige-gate--ready': {
    title: 'Prestige / wipe gate · 轉生 / 清空閘門 — super-confirmation',
    lede: 'The ready state names the reset, preserves permanent progress, requires two independent keys, and presents the full confirmation range. · 就緒狀態寫清楚會重置乜、保留永久進度，並要求兩條獨立鎖匙同完整確認滑桿。',
    section: 'Prestige ready · 轉生就緒',
  },
  'search-regex-builder--open': {
    title: 'Search field · 搜尋欄 — anchored regex builder',
    lede: 'The builder stays attached to its owning product search field, with regex mode, flags, tokens, sample text, and the exact match count visible together. · 產生器貼住自己嘅產品搜尋欄，規則模式、旗標、符號、樣本文字同配對數量一齊顯示。',
    section: 'Regex mode enabled · 已開啟規則運算式模式',
  },
  'settings-funny-sliders--default': {
    title: 'Language mode & funny-level sliders · 語言模式與搞笑程度滑桿',
    lede: 'English and Cantonese keep separate product controls and separate persisted values; moving one never changes the other. · 英文同廣東話各有自己產品控制同儲存值，郁一條唔會改另一條。',
    section: 'Two independent controls · 兩條獨立控制',
  },
  'stat-tile--gallery': {
    title: 'Stat tile · 統計方塊',
    lede: 'The live score tiles use the product bezel, tabular figures, and glyph-plus-text trends so direction never depends on colour alone. · 真正分數方塊用產品凹槽、等寬數字同圖形加文字趨勢，方向唔會淨係靠顏色。',
    section: 'Score panel · 分數面板',
  },
  'tokens-color--roles': {
    title: 'Material Cookie Clicker design tokens · 設計標記 — Colour',
    lede: 'These swatches read the renderer’s active CSS custom properties; the developer route does not transcribe a second palette. · 呢啲色板直接讀 renderer 生效中嘅 CSS 自訂屬性，開發路線唔會抄多一套色盤。',
    section: 'Live semantic roles · 生效中語意色彩',
  },
  'tokens-shape-elevation--scale': {
    title: 'Material Cookie Clicker design tokens · 設計標記 — Shape & depth',
    lede: 'Each sample consumes the current product shape and elevation variables, preserving the renderer as the only authority. · 每個示例都用現時產品形狀同深度變數，renderer 仍然係唯一權威。',
    section: 'Live shape and elevation scale · 生效中形狀同深度階',
  },
  'tokens-type--scale': {
    title: 'Material Cookie Clicker design tokens · 設計標記 — Type',
    lede: 'The product type stack is shown from display through label with English and Traditional Chinese on every row and no network font request. · 產品字型由 display 到 label，每行都有英文同繁體中文，亦唔會要求網絡字型。',
    section: 'Live type scale · 生效中字型階',
  },
  'tool-card--gallery': {
    title: 'Tool card · 工具卡 — Tools tech tree',
    lede: 'Product-owned cards expose undiscovered, locked, ready, and unlocked progression while the real application feature remains available outside the game bonus. · 產品卡片顯示未發現、未解鎖、就緒同已解鎖進度，而真正應用功能唔會畀遊戲加成鎖住。',
    section: 'Four states · 四種狀態',
  },
  'tools-tree--mixed': {
    title: 'Tools tech tree · 工具科技樹 — overview',
    lede: 'The deterministic tree groups mixed product states into bronze, emerald, and amethyst tiers, with the exact 7 / 17 progress fixture. · 固定科技樹將混合產品狀態分做青銅、翡翠同紫水晶三層，進度固定為 7 / 17。',
    section: 'Mixed tier state · 混合層級狀態',
  },
  'upgrade-card--gallery': {
    title: 'Upgrade card · 升級卡',
    lede: 'The product ticket anatomy shows the three meaningful states: requirement locked, buyable, and permanently owned. · 產品票券結構顯示三種真正狀態：條件未達、可以買、永久已擁有。',
    section: 'Locked, buyable, owned · 未解鎖、可以買、已擁有',
  },
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
    { family: 'locked' as const, name: 'Locked achievement', yue: '未解鎖成就', unlocked: false },
    { family: 'buildings' as const, name: 'Hundred Bakeries', yue: '百間麵包店', unlocked: true },
  ];
  return (
    <GalleryFrame label="Achievement badge product gallery">
      <div className="achievement-grid parity-achievement-grid">
        {badges.map((badge) => (
          <div className="achievement-cell" key={badge.name}>
            <div className={`achievement-badge ${badge.unlocked ? 'unlocked achievement-badge--minted' : 'locked'}`} role="img" aria-label={`${badge.name} · ${badge.yue}`}>
              <AchievementMedal family={badge.family} />
            </div>
            <div className="achievement-name">{badge.unlocked ? badge.name : '???'}</div>
            <div className="achievement-name-zh">{badge.unlocked ? badge.yue : '未解鎖'}</div>
          </div>
        ))}
      </div>
      <div className="achievement-toast parity-inline-toast" aria-hidden="true">
        <div className="achievement-badge unlocked achievement-badge--minted achievement-toast__badge"><AchievementMedal family="buildings" /></div>
        <div className="achievement-toast__text"><strong>Achievement unlocked · 成就解鎖</strong>Hundred Bakeries · 百間麵包店</div>
      </div>
    </GalleryFrame>
  );
}

function BuildingGallery() {
  const rows = [
    { id: 'grandma', name: "Grandma's Bakery", yue: '嫲嫲嘅麵包店', owned: 12, rate: '+18.4 CPS each', cost: '1,240', locked: false, affordable: true },
    { id: 'factory', name: 'Cookie Factory', yue: '曲奇工廠', owned: 3, rate: '+210 CPS each', cost: '88,500', locked: false, affordable: false },
    { id: 'rocket', name: 'Cookie Rocket', yue: '曲奇火箭', owned: 0, rate: 'Unlocks at 500 Cookie Factories owned · 擁有 500 間曲奇工廠先解鎖', cost: '—', locked: true, affordable: false },
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
              <div className="stepper" role="group" aria-label={`Buy quantity for ${row.name}`}><button type="button" aria-pressed="false">×1</button><button type="button" className={row.affordable ? 'active' : undefined} aria-pressed={row.affordable}>×10</button><button type="button" aria-pressed="false">×100</button><button type="button" className="stepper__max" aria-pressed="false"><span>Max</span><span className="stepper__max-zh">最多</span></button></div>
              <button type="button" className="buy-btn" disabled={!row.affordable}>{row.locked ? 'Locked · 未解鎖' : `Buy · 買 — 🍪 ${row.cost}`}</button>
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
      <BulkToolbar selectedCount={7} matchingCount={17} onSelectAllMatching={() => undefined} onClearSelection={() => undefined} actions={[{ key: 'export', label: 'Export 7 · 匯出 7 項', onRun: () => undefined }, { key: 'read', label: 'Mark 7 as read · 標記 7 項為已讀', onRun: () => undefined }, { key: 'delete', label: 'Delete 7 · 刪除 7 項', destructive: true, onRun: () => undefined }]} busy resultText={null} />
      <div className="parity-progress-card" role="status"><span>Deleting selected items · 正在刪除已選項目</span><progress value="4" max="7">4 / 7</progress><strong>4 / 7 done · 完成 4 / 7</strong></div>
    </GalleryFrame>
  );
}

function CookieGallery() {
  return (
    <GalleryFrame label="Cookie surface product gallery">
      <div className="parity-cookie-states">
        {['Rest · 靜止', 'Hover · 滑鼠移入', 'Pressed · 撳落', 'Focus-visible · 鍵盤焦點', 'Reduced motion · 減少動態', 'Disabled · 停用'].map((label, index) => (
          <div className={`cookie-target-wrap parity-cookie-state parity-cookie-state--${index}${index === 4 ? ' reduced-motion' : ''}`} key={label}>
            <button type="button" className="cookie-btn cookie-btn--art cookie-btn--lift" aria-label={`${label} cookie`} disabled={index === 5}><HeroCookieArt extraClass="cookie-btn__art" /></button>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </GalleryFrame>
  );
}

function GameLayout() {
  const [dialogOpen, setDialogOpen] = useState(true);
  return (
    <div className="parity-game-layout" aria-label="Main product game layout">
      <div className="hud"><div className="hud__readout"><span>Cookies · 曲奇</span><strong>4.82 Qa</strong></div><div className="hud__readout"><span>Per second · 每秒</span><strong>18,420</strong></div><div className="hud__readout"><span>Per click · 每撳</span><strong>312</strong></div></div>
      <section className="panel parity-layout-cookie"><div className="cookie-target-wrap parity-layout-hero"><button type="button" className="cookie-btn cookie-btn--art cookie-btn--lift" aria-label="Bake cookie · 焗曲奇"><HeroCookieArt extraClass="cookie-btn__art" /></button><span>Click the cookie · 撳曲奇</span></div><nav className="parity-console" aria-label="Secondary product panels"><button type="button" aria-pressed={dialogOpen} onClick={() => setDialogOpen(true)}>Achievements · 成就</button><button type="button">Tools · 工具</button><button type="button">Statistics · 統計</button><button type="button">Prestige · 轉生</button></nav></section>
      <section className="panel upgrade-shelf parity-layout-upgrades"><h2 className="panel__title">Upgrades <span className="panel__title-zh">升級</span></h2><UpgradeTickets compact /></section>
      <section className="panel shop-rail parity-layout-shop"><h2 className="panel__title">Buildings <span className="panel__title-zh">建築</span></h2>{['Grandma’s Bakery · 嫲嫲麵包店', 'Cookie Farm · 曲奇農場', 'Cookie Factory · 曲奇工廠', 'Cookie Rocket · 曲奇火箭'].map((name, index) => <div className="parity-game-shop-row" key={name}><span>{name}</span><strong>{[12, 8, 3, 0][index]}</strong><button type="button" disabled={index === 3}>Buy · 買</button></div>)}</section>
      {dialogOpen ? <aside className="anchored-panel parity-layout-dialog" aria-label="Achievements anchored panel"><h2>Achievements · 成就</h2><button type="button" aria-label="Close achievements" onClick={() => setDialogOpen(false)}>×</button><p>7 / 17 unlocked · 已解鎖 7 / 17</p></aside> : null}
    </div>
  );
}

function NarratorToastGallery() {
  const [goldenVisible, setGoldenVisible] = useState(true);
  const [offlineVisible, setOfflineVisible] = useState(true);
  return (
    <GalleryFrame label="Narrator toast product gallery">
      <div className="parity-toast-stack">
        {goldenVisible ? <aside className="canonical-notice" role="status"><strong>Golden moment · 金曲奇時刻</strong><span>Golden cookie clicked! +1,337 cookies; frenzy active for 60s. · 撳中金曲奇！+1,337 塊曲奇；狂熱持續 60 秒。</span><button type="button" aria-label="Dismiss golden moment" onClick={() => setGoldenVisible(false)}>×</button></aside> : null}
        {offlineVisible ? <aside className="canonical-notice parity-notice--queued" role="status"><strong>Offline report · 離線報告</strong><span>Welcome back — +2.4 M cookies over 6 h 12 m. · 歡迎返嚟——離線 6 小時 12 分鐘賺咗 2.4 M 塊曲奇。</span><button type="button" aria-label="Dismiss offline report" onClick={() => setOfflineVisible(false)}>×</button></aside> : null}
      </div>
    </GalleryFrame>
  );
}

function PrestigeReady() {
  const [gateOpen, setGateOpen] = useState(true);
  const [completion, setCompletion] = useState<{ en: string; yue: string } | null>(null);
  const projectionRef = useRef<HTMLElement | null>(null);
  return (
    <GalleryFrame label="Prestige ready product state">
      <section ref={projectionRef} className="projection-card" tabIndex={-1}><h2>Ascension projection · 飛升預覽</h2><p>Prestiging now awards <strong>128 ascension points</strong>. · 而家轉生會攞到 <strong>128 粒飛升點</strong>。</p><p className="projection-card__detail">Each point permanently adds 1% total production. · 每粒永久加 1% 總產量。</p></section>
      {gateOpen ? <DestructiveGate tone="prestige" title={{ en: 'Confirm prestige', yue: '確認轉生' }} impact={<><p><strong>This will reset · 呢個會清空</strong><br />Cookies, buildings, and ordinary upgrades. · 曲奇、建築同普通升級。</p><p><strong>This carries forward · 呢個會保留</strong><br />Permanent unlocks and +6 Golden Chips. · 永久解鎖同 +6 粒金籌碼。</p></>} key2Label={{ en: 'Confirm you read the impact', yue: '確認你睇過影響' }} completion={completion} onConfirm={() => setCompletion({ en: 'Prestige authorization complete.', yue: '轉生確認已完成。' })} onExit={() => setGateOpen(false)} returnFocusTo={projectionRef} /> : <button type="button" className="parity-gate-opener" onClick={() => { setCompletion(null); setGateOpen(true); }}>Open prestige confirmation · 開啟轉生確認</button>}
    </GalleryFrame>
  );
}

function RegexBuilderOpen() {
  return (
    <GalleryFrame label="Open regex builder product state">
      <div className="search-field-wrap parity-search-wrap"><div className="search-field regex-active"><span aria-hidden="true">🔍</span><input className="search-field__input" aria-label="Search tools, regex mode active" defaultValue="bak(ery|eries)" /><button type="button" className="builder-toggle" aria-pressed="true" aria-expanded="true">.*</button></div>
        <div className="regex-popover parity-regex-popover"><div className="mode-row" role="group" aria-label="Search mode"><button type="button" aria-pressed="false">Plain text · 純文字</button><button type="button" aria-pressed="true">Regex · 規則運算式</button></div><label>Pattern · 規則<input type="text" defaultValue="bak(ery|eries)" /></label><div className="flag-row"><label><input type="checkbox" defaultChecked /> Ignore case</label><label><input type="checkbox" defaultChecked /> Multiline</label><label><input type="checkbox" defaultChecked /> Unicode</label></div><div className="regex-token-list"><span className="regex-token-list__heading">Anchors · 錨點</span><button type="button">^</button><button type="button">$</button><button type="button">\b</button></div><label>Test text · 試驗文字<textarea rows={3} defaultValue={'Grandma’s Bakery\nCookie Farm\nRolling Bakeries Guild'} /></label><p className="regex-lab__summary">2 of 3 matches · 3 行入面配對 2 行</p></div>
      </div>
    </GalleryFrame>
  );
}

function SettingsFunnySliders() {
  const [languageMode, setLanguageMode] = useState<'en' | 'yue' | 'both'>('both');
  const [funnyLevelEn, setFunnyLevelEn] = useState(2);
  const [funnyLevelYue, setFunnyLevelYue] = useState(4);
  return (
    <GalleryFrame label="Funny level settings product state">
      <section className="settings-block parity-language-block"><span className="settings-block__label">Language mode · 語言模式</span><div className="settings-modes" role="group" aria-label="Language mode"><button type="button" className="settings-modes__button" aria-pressed={languageMode === 'en'} onClick={() => setLanguageMode('en')}>English</button><button type="button" className="settings-modes__button" aria-pressed={languageMode === 'yue'} onClick={() => setLanguageMode('yue')}>粵語 Cantonese</button><button type="button" className="settings-modes__button" aria-pressed={languageMode === 'both'} onClick={() => setLanguageMode('both')}>Bilingual · 雙語</button></div><p className="settings-caption">Persists across restarts and applies to every product surface. · 重新開啟後仍會保留，亦套用到每個產品畫面。</p></section>
      <p className="settings-note settings-note--warning">These are two separate controls. Moving one never changes the other. · 呢兩條係獨立控制，郁一條唔會改另一條。</p>
      <section className="settings-block"><span className="settings-block__label">Message voice · 訊息語氣</span><p className="settings-caption">Facts stay exact at every level; only the voice changes. · 每個程度嘅事實都一樣準確，淨係語氣會變。</p><div className="settings-sliders"><ParityFunnySlider language="en" level={funnyLevelEn} onChange={setFunnyLevelEn} /><ParityFunnySlider language="yue" level={funnyLevelYue} onChange={setFunnyLevelYue} /></div></section>
    </GalleryFrame>
  );
}

function ParityFunnySlider({ language, level, onChange }: { readonly language: 'en' | 'yue'; readonly level: number; readonly onChange: (level: number) => void }) {
  const english = language === 'en';
  return <label className={`settings-slider settings-slider--${language}`}><span className="settings-slider__title">{english ? 'English funny level' : '廣東話搞笑程度'}</span><span className="settings-slider__scale">{english ? '1 = fully serious, 5 = maximum playfulness' : '1 = 完全正經，5 = 最搞笑'}</span><input className="settings-slider__input" type="range" min="1" max="5" value={level} aria-label={english ? `English funny level, currently ${level} of 5` : `廣東話搞笑程度，而家 ${level} / 5`} onChange={(event) => onChange(Number(event.target.value))} /><span className="settings-slider__value">{english ? `Current level: ${level} of 5` : `而家程度：${level} / 5`}</span></label>;
}

function StatGallery() {
  const stats = [['Total cookies baked', '總共烤咗嘅曲奇', '4.82 Qa', '', 'flat'], ['Cookies per second', '每秒曲奇產量', '18,420', '+6.2% this session · 呢節升咗 6.2%', 'up'], ['Click power', '每擊力量', '312', '−3.1% since last prestige · 由上次轉生跌咗 3.1%', 'down'], ['Prestige runs', '轉生次數', '7', '', 'flat']] as const;
  return (
    <GalleryFrame label="Statistic tile product gallery">
      <div className="stat-grid parity-stat-grid">
        {stats.map(([en, yue, value, trend, direction]) => (
          <article className="stat-tile parity-stat-tile" key={en}>
            <span className="stat-tile__label-en">{en}</span>
            <span className="stat-tile__label-zh">{yue}</span>
            <span className="parity-stat-reading">
              <strong className="stat-tile__value">{value}</strong>
              {trend ? <span className={`stat-tile__trend ${direction}`}>{direction === 'down' ? '▼' : '▲'} {trend}</span> : null}
            </span>
          </article>
        ))}
      </div>
      <article className="stat-tile parity-stat-tile parity-goal-tile">
        <span className="parity-goal-tile__title">Next prestige level · 下一個轉生等級</span>
        <strong className="stat-tile__value">Lv 12</strong>
        <progress className="parity-goal-tile__progress" value="68" max="100" aria-label="Next prestige level progress: 68%">68%</progress>
        <span className="parity-goal-tile__detail">68% · 6.8e12 / 1.0e13 Lv 13</span>
      </article>
    </GalleryFrame>
  );
}

interface ColorRoleFixture {
  readonly name: string;
  readonly token: string;
  readonly background?: string;
  readonly foreground: string;
  readonly border?: string;
}

const COLOR_ROLES: readonly ColorRoleFixture[] = [
  { name: 'Primary', token: '--md-sys-color-primary', background: '--md-sys-color-primary', foreground: '--md-sys-color-on-primary' },
  { name: 'Primary container', token: '--md-sys-color-primary-container', background: '--md-sys-color-primary-container', foreground: '--md-sys-color-on-primary-container' },
  { name: 'Secondary', token: '--md-sys-color-secondary', background: '--md-sys-color-secondary', foreground: '--md-sys-color-on-secondary' },
  { name: 'Tertiary', token: '--md-sys-color-tertiary', background: '--md-sys-color-tertiary', foreground: '--md-sys-color-on-tertiary' },
  { name: 'Surface', token: '--md-sys-color-surface', foreground: '--md-sys-color-on-surface' },
  { name: 'Surface high', token: '--md-sys-color-surface-container-high', background: '--md-sys-color-surface-container-high', foreground: '--md-sys-color-on-surface' },
  { name: 'Error', token: '--md-sys-color-error', background: '--md-sys-color-error', foreground: '--md-sys-color-on-error' },
  { name: 'Outline', token: '--md-sys-color-outline', foreground: '--md-sys-color-on-surface', border: '--md-sys-color-outline' },
];

function ColorRoles() {
  return <GalleryFrame label="Live product color roles"><div className="parity-token-grid">{COLOR_ROLES.map((role) => <div className="parity-color-role" key={role.name} style={{ ...(role.background ? { background: `var(${role.background})` } : {}), color: `var(${role.foreground})`, ...(role.border ? { borderColor: `var(${role.border})` } : {}) }}><strong>{role.name}</strong><code>{role.token}</code></div>)}</div></GalleryFrame>;
}

function ShapeElevationScale() {
  const shapes = [['Extra small', '--md-sys-shape-corner-extra-small', '--md-sys-elevation-level-1'], ['Small', '--md-sys-shape-corner-small', '--md-sys-elevation-level-1'], ['Medium', '--md-sys-shape-corner-medium', '--md-sys-elevation-level-2'], ['Large', '--md-sys-shape-corner-large', '--md-sys-elevation-level-3'], ['Extra large', '--md-sys-shape-corner-extra-large', '--md-sys-elevation-level-3'], ['Full', '--md-sys-shape-corner-full', '--md-sys-elevation-level-1']] as const;
  return <GalleryFrame label="Live product shape and elevation scale"><div className="parity-shape-grid">{shapes.map(([name, shape, elevation]) => <div className="parity-shape" key={name} style={{ borderRadius: `var(${shape})`, boxShadow: `var(${elevation})` }}><strong>{name}</strong><code>{shape}</code><code>{elevation}</code></div>)}</div></GalleryFrame>;
}

function TypeScale() {
  const types = [
    ['Display large', 'parity-type-display parity-type-large'], ['Display medium', 'parity-type-display parity-type-medium'], ['Display small', 'parity-type-display parity-type-small'],
    ['Headline large', 'parity-type-headline parity-type-large'], ['Headline medium', 'parity-type-headline parity-type-medium'], ['Headline small', 'parity-type-headline parity-type-small'],
    ['Title large', 'parity-type-title parity-type-large'], ['Title medium', 'parity-type-title parity-type-medium'], ['Title small', 'parity-type-title parity-type-small'],
    ['Body large', 'parity-type-body parity-type-large'], ['Body medium', 'parity-type-body parity-type-medium'], ['Body small', 'parity-type-body parity-type-small'],
    ['Label large', 'parity-type-label parity-type-large'], ['Label medium', 'parity-type-label parity-type-medium'], ['Label small', 'parity-type-label parity-type-small'],
  ] as const;
  return <GalleryFrame label="Live product typography scale"><div className="parity-type-scale">{types.map(([name, className]) => <div className={className} key={name}><span>{name}</span><strong>Cookie cabinet · 曲奇機櫃</strong></div>)}</div></GalleryFrame>;
}

type ToolFixture = {
  readonly id: string;
  readonly tier: 1 | 2 | 3;
  readonly state: 'undiscovered' | 'locked' | 'ready' | 'unlocked';
  readonly name: string;
  readonly yue: string;
  readonly progress: string;
  readonly ratio: number;
};

function ToolFixtureCard({ tool }: { readonly tool: ToolFixture }) {
  const hidden = tool.state === 'undiscovered';
  return <li className={`item-card tool-node ${tool.state}`}><span className="item-card__icon" aria-hidden="true"><ToolIcon id={tool.id} tier={tool.tier} hidden={hidden} /></span><span className="item-card__name-en">{hidden ? '??? Tool' : tool.name}</span><span className="item-card__name-zh">{hidden ? '未發現嘅工具' : tool.yue}</span><span className="tool-node__chip">{tool.state}</span><p className="item-card__desc">{hidden ? 'This tool has not been discovered yet. · 呢個工具仲未被發現。' : 'The gameplay bonus has its own visible progression state. · 遊戲加成有自己清楚嘅進度狀態。'}</p><span className="item-card__progress-line">{tool.progress}</span><div className="item-card__progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tool.ratio}><div className="item-card__progress-fill" style={{ width: `${tool.ratio}%` }} /></div><div className="open-real-feature"><strong>Always available · 一直用得</strong><button type="button" className="open-real-feature__button">Open it now · 而家開啟</button></div></li>;
}

const TOOL_GALLERY_FIXTURES: readonly ToolFixture[] = [
  { id: 'commandPalette', tier: 1, state: 'undiscovered', name: 'Command palette', yue: '指令面板', progress: 'Requirement hidden · 條件未公開', ratio: 0 },
  { id: 'regexBuilder', tier: 1, state: 'locked', name: 'Regex Builder', yue: '正則表達式產生器', progress: '142 / 500 Grandmas · 142 / 500 間嫲嫲屋', ratio: 28 },
  { id: 'authenticator', tier: 2, state: 'ready', name: 'Authenticator', yue: '驗證器', progress: '500 / 500 Grandmas — ready! · 500 / 500 間嫲嫲屋 — 就緒！', ratio: 100 },
  { id: 'appearanceEditor', tier: 3, state: 'unlocked', name: 'Appearance Editor', yue: '外觀編輯器', progress: 'Gameplay bonus: +8% global CPS · 遊戲加成：全局產量 +8%', ratio: 100 },
];

function ToolCards() {
  return <GalleryFrame label="Tool card product gallery"><ul className="parity-tool-grid">{TOOL_GALLERY_FIXTURES.map((tool) => <ToolFixtureCard tool={tool} key={tool.state} />)}</ul></GalleryFrame>;
}

const TREE_TIERS: Readonly<Record<1 | 2 | 3, readonly ToolFixture[]>> = {
  1: TOOL_GALLERY_FIXTURES.slice(1, 4),
  2: [
    { id: 'commandPalette', tier: 2, state: 'locked', name: 'Command Palette', yue: '指令面板', progress: '142 / 500 Grandmas · 142 / 500 間嫲嫲屋', ratio: 28 },
    { id: 'fileConverter', tier: 2, state: 'locked', name: 'File Converter', yue: '檔案轉換器', progress: '3 / 10 upgrades owned · 3 / 10 個升級', ratio: 30 },
    { id: 'localModelManager', tier: 2, state: 'undiscovered', name: 'Local model manager', yue: '本機模型管理器', progress: 'Requirement hidden · 條件未公開', ratio: 0 },
  ],
  3: [
    { id: 'scheduledSettings', tier: 3, state: 'undiscovered', name: 'Scheduled settings', yue: '排程設定', progress: 'Requirement hidden · 條件未公開', ratio: 0 },
    { id: 'localHistory', tier: 3, state: 'undiscovered', name: 'Local history', yue: '本機歷史', progress: 'Requirement hidden · 條件未公開', ratio: 0 },
  ],
};

function ToolsTree() {
  const [query, setQuery] = useState('');
  const [progressVisible, setProgressVisible] = useState(true);
  const normalizedQuery = query.trim().toLocaleLowerCase('en-HK');
  const matches = (tool: ToolFixture): boolean => !normalizedQuery || [tool.name, tool.yue, tool.state, tool.progress].some((value) => value.toLocaleLowerCase('en-HK').includes(normalizedQuery));
  return <GalleryFrame label="Mixed tool tree product state"><div className="tools-hud"><span className="tools-hud__counter"><span className="tools-hud__counter-value">7<span className="tools-hud__counter-sep">/</span>17</span><span className="tools-hud__counter-label">tools unlocked · 已解鎖工具</span></span><div className="tools-hud__track" role="progressbar" aria-label="7 of 17 tools unlocked" aria-valuemin={0} aria-valuemax={17} aria-valuenow={7} hidden={!progressVisible}><div className="tools-hud__fill" style={{ width: '41.18%' }} /></div><button type="button" className="tools-hud__toggle" aria-pressed={progressVisible} onClick={() => setProgressVisible((visible) => !visible)}>Tool progression · 工具進度</button></div><div className="search-field parity-tree-search"><span aria-hidden="true">🔍</span><input className="search-field__input" aria-label="Search tools" placeholder="Search tools… · 搜尋工具…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="builder-toggle" aria-label="Open regex builder">⚙</button></div><div className="parity-tools-tree">{([1, 2, 3] as const).map((tier) => <section className="tools-tier" data-tier={tier} key={tier}><h2 className="tools-tier__heading"><span className="tools-tier__gem"><ToolTierGem tier={tier} /></span>Tier {tier} · 第 {tier} 層</h2><ul className="parity-tree-cards">{TREE_TIERS[tier].filter(matches).map((tool) => <ToolFixtureCard tool={tool} key={`${tier}-${tool.id}`} />)}</ul></section>)}</div></GalleryFrame>;
}

function UpgradeTickets({ compact = false }: { readonly compact?: boolean }) {
  const upgrades = [{ family: 'click' as const, name: 'Reinforced finger', yue: '加固手指', effect: '+2 cookies per click', cost: '500' }, { family: 'generator' as const, name: 'Steel rolling pins', yue: '鋼製擀麵棍', effect: 'Grandmas produce twice as much', cost: '12,000' }, { family: 'golden' as const, name: 'Lucky glaze', yue: '幸運糖霜', effect: '+10% golden cookie rewards', cost: '84,000' }, { family: 'global' as const, name: 'Oven harmony', yue: '焗爐和聲', effect: '+5% global production', cost: '140,000' }];
  return <div className={`shelf-grid parity-upgrade-grid${compact ? ' parity-upgrade-grid--compact' : ''}`}>{upgrades.map((upgrade) => <button type="button" className="shelf-ticket shelf-ticket--affordable" key={upgrade.name}><span className="shelf-ticket__glyph"><UpgradeIcon family={upgrade.family} /></span><span className="shelf-ticket__body"><span className="shelf-ticket__name">{upgrade.name}</span><span className="shelf-ticket__name-zh">{upgrade.yue}</span><span className="shelf-ticket__effect">{upgrade.effect}</span><span className="shelf-ticket__cost">🍪 {upgrade.cost}</span></span></button>)}</div>;
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
  'upgrade-card--gallery': UpgradeParityScene,
};

assertDesignParityCoverage(Object.keys(ROUTE_RENDERERS));
assertDesignParityCoverage(Object.keys(DESIGN_PARITY_PAGE_COPY));

function ProductSpecFrame({ rowId, children }: { readonly rowId: DesignParityRowId; readonly children: ReactNode }) {
  const copy = DESIGN_PARITY_PAGE_COPY[rowId];
  return (
    <article className="parity-spec-shell">
      <header className="parity-spec-intro">
        <h1>{copy.title}</h1>
        <p>{copy.lede}</p>
        <button
          type="button"
          className="parity-theme-toggle"
          onClick={() => {
            const root = document.documentElement;
            root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
          }}
        >
          <span aria-hidden="true">🌗</span> Toggle light / dark · 切換淺色 / 深色
        </button>
      </header>
      <section className="parity-spec-section" aria-labelledby="parity-section-title">
        <h2 id="parity-section-title"><span>{copy.section}</span></h2>
        {children}
      </section>
    </article>
  );
}

export function DesignParityRoute({ request }: { readonly request: ResolvedDesignParityRequest }) {
  useLayoutEffect(() => {
    if (request.kind !== 'valid') return undefined;
    const root = document.documentElement;
    const previous = new Map<string, string | null>();
    const attributes: Record<string, string> = {
      'data-theme': request.theme,
      // These are the real rung attributes from look-tiers.ts. The four this used to write —
      // data-look-colour/type/shape/elevation — match no rung and no stylesheet rule, so a
      // save with palette, cabinet, marquee or glow at 'off' handed the parity route a
      // partly-plain look while it claimed a full one.
      'data-look-palette': 'on',
      'data-look-cabinet': 'on',
      'data-look-marquee': 'on',
      'data-look-glow': 'on',
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
      <ProductSpecFrame rowId={request.rowId}>
        <Renderer />
      </ProductSpecFrame>
    </main>
  );
}
