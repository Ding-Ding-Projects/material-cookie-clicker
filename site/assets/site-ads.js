/* House ads: a small, dismissible, non-blocking card promoting the project's OWN feature
 * articles under site/features/. No third party, no network request, no payment — every ad
 * links to a real article that already exists in this checkout. Mounted by site-shell.js on
 * every page so the surface is universal rather than owned by one screen.
 *
 * Bilingual per the shared settings key (mcc-site-settings-v1: language "en"|"yue"|"both",
 * funnyEn 1-5, funnyYue 1-5). The funny level styles the VOICE only — the feature name and
 * what it actually does stay factually exact at every level, in both languages.
 */

const SETTINGS_KEY = 'mcc-site-settings-v1';
const DISMISS_KEY = 'mcc-site-ads-v1';
const ROOT = location.pathname.includes('/features/') ? '../' : '';

/* Every article referenced here exists under site/features/ at the time this was written;
 * check-site.mjs's link-resolution pass would fail the build if one of these hrefs went stale. */
export const AD_SLOTS = [
  {
    id: 'diesel-factory',
    icon: '🛢️',
    href: `${ROOT}features/diesel-factory.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'The diesel factory turns baked cookies into real litres through a four-stage production line — and it stalls honestly when a stage cannot run.',
      cta: 'Read how the factory works',
    },
    yue: {
      eyebrow: '功能推介',
      body: '柴油廠將曲奇變成真正嘅公升數，四個生產階段逐級運作 —— 邊個階段做唔到，佢就老實咁停低，唔會呃你。',
      cta: '睇下柴油廠點運作',
    },
  },
  {
    id: 'generator-ladder',
    icon: '🏭',
    href: `${ROOT}features/generator-ladder.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'Twenty-one generator tiers from Cursor to the Wok of the Gods, one constant 1.15 cost curve, and a buy-quantity stepper for every rung.',
      cta: 'See the full ladder',
    },
    yue: {
      eyebrow: '功能推介',
      body: '由游標到眾神之鑊，21 層生產器，統一 1.15 加價曲線，每一層都有「一次買幾多」嘅步進掣。',
      cta: '睇晒成條生產階梯',
    },
  },
  {
    id: 'prestige',
    icon: '♻️',
    href: `${ROOT}features/prestige.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'Prestige runs a cube-root ascension curve worth +1% production per point — and it sits behind a real two-key destructive-action gate, not a bare confirm box.',
      cta: 'Read about ascending',
    },
    yue: {
      eyebrow: '功能推介',
      body: '轉生用開立方根曲線計數，每點 +1% 產量 —— 而且要過兩重確認先可以做，唔係㩒一下就得嘅簡單掣。',
      cta: '睇下轉生點運作',
    },
  },
  {
    id: 'golden-cookies',
    icon: '✨',
    href: `${ROOT}features/golden-cookies.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'A golden cookie appears somewhere random on the stage. Catch it, then stop a moving needle inside its band three times running.',
      cta: 'See golden-cookie events',
    },
    yue: {
      eyebrow: '功能推介',
      body: '金曲奇會喺畫面隨機位置出現。捕捉到之後，仲要連續三次喺指定範圍內停低指針。',
      cta: '睇下金曲奇事件',
    },
  },
  {
    id: 'home-construction',
    icon: '🏠',
    href: `${ROOT}features/home-construction.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'You live over the shop. Buy the drawing, pay the builders, then wait — a room takes real minutes to go up, and furnishing it afterwards pays you back.',
      cta: 'Read about building the home',
    },
    yue: {
      eyebrow: '功能推介',
      body: '你住喺舖頭樓上。買圖則、俾錢請師傅，然後真係要等 —— 起一間房要真實嘅幾分鐘，起完仲要裝修先有回報。',
      cta: '睇下點起屋',
    },
  },
  {
    id: 'tools-tech-tree',
    icon: '🧰',
    href: `${ROOT}features/tools-tech-tree.html`,
    en: {
      eyebrow: 'Feature spotlight',
      body: 'Twenty of the application’s own real features double as in-game unlockables in the Tools tech tree — and an unlock never gates the real feature underneath it.',
      cta: 'Read the Tools tech tree',
    },
    yue: {
      eyebrow: '功能推介',
      body: '呢個工具科技樹入面二十個「解鎖項目」，其實全部係應用程式真正嘅功能 —— 未解鎖都唔會鎖死背後嗰個真功能。',
      cta: '睇下工具科技樹',
    },
  },
];

/* Funny-level framing sentences, English then Cantonese. Level 1 is fully serious and adds
 * nothing; level 5 is maximum playfulness. These wrap the factual body above — they never
 * replace or soften what the body says. */
const FRAMING_EN = {
  1: (body) => body,
  2: (body) => body,
  3: (body) => `Psst — ${body[0].toLowerCase()}${body.slice(1)}`,
  4: (body) => `Okay but hear us out: ${body[0].toLowerCase()}${body.slice(1)}`,
  5: (body) => `A WORD FROM YOUR OWN APP (we made this, no ads here, just us): ${body[0].toLowerCase()}${body.slice(1)}`,
};
const FRAMING_YUE = {
  1: (body) => body,
  2: (body) => body,
  3: (body) => `唔該借歪 —— ${body}`,
  4: (body) => `等陣先，聽埋先啦：${body}`,
  5: (body) => `自己人廣告（真係自己人，冇第三方）：${body}`,
};

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return {
        language: ['en', 'yue', 'both'].includes(saved.language) ? saved.language : 'en',
        funnyEn: Number.isFinite(Number(saved.funnyEn)) ? Math.min(5, Math.max(1, Number(saved.funnyEn))) : 3,
        funnyYue: Number.isFinite(Number(saved.funnyYue)) ? Math.min(5, Math.max(1, Number(saved.funnyYue))) : 3,
        adsEnabled: saved.adsEnabled !== false,
        adsDisabledIds: Array.isArray(saved.adsDisabledIds)
          ? saved.adsDisabledIds.filter((id) => typeof id === 'string')
          : [],
      };
    }
  } catch { /* fall through to defaults below */ }
  return { language: 'en', funnyEn: 3, funnyYue: 3, adsEnabled: true, adsDisabledIds: [] };
}

function readDismissed() {
  try {
    const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || 'null');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch { return []; }
}

function writeDismissed(list) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...new Set(list)]));
}

/** Mark one ad dismissed. Persists across reloads and across pages. */
export function dismissAd(id) {
  writeDismissed([...readDismissed(), id]);
  document.querySelector(`.site-house-ad[data-ad-id="${CSS.escape(id)}"]`)?.remove();
  if (!document.querySelector('.site-house-ad')) document.querySelector('.site-house-ads')?.remove();
}

/** Clear every dismissal, restoring the full rotation. Exposed for a Reset control elsewhere. */
export function resetDismissedAds() {
  localStorage.removeItem(DISMISS_KEY);
}

/** The full catalogue of house ads, unfiltered — for a listing/settings surface to enumerate. */
export function listAds() {
  return AD_SLOTS;
}

function buildCard(ad, settings) {
  const card = document.createElement('article');
  card.className = 'site-house-ad';
  card.dataset.adId = ad.id;
  card.setAttribute('role', 'complementary');

  const enBody = FRAMING_EN[settings.funnyEn](ad.en.body);
  const yueBody = FRAMING_YUE[settings.funnyYue](ad.yue.body);
  const showEn = settings.language !== 'yue';
  const showYue = settings.language !== 'en';
  const label = settings.language === 'yue' ? ad.yue.eyebrow : ad.en.eyebrow;

  card.setAttribute('aria-label', `${label}: ${ad.en.body}`);

  const icon = document.createElement('span');
  icon.className = 'site-ad-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ad.icon;
  card.append(icon);

  const eyebrow = document.createElement('p');
  eyebrow.className = 'site-ad-eyebrow';
  eyebrow.textContent = label;
  card.append(eyebrow);

  if (showEn) {
    const p = document.createElement('p');
    p.className = 'site-ad-body';
    p.textContent = enBody;
    card.append(p);
  }
  if (showYue) {
    const p = document.createElement('p');
    p.className = 'site-ad-body';
    p.lang = 'zh-HK';
    p.textContent = yueBody;
    card.append(p);
  }

  const actions = document.createElement('div');
  actions.className = 'site-ad-actions';
  const link = document.createElement('a');
  link.href = ad.href;
  link.textContent = settings.language === 'yue' ? ad.yue.cta : ad.en.cta;
  actions.append(link);
  card.append(actions);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'site-ad-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss this ad');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => dismissAd(ad.id));
  card.append(dismiss);

  return card;
}

/** Renders at most one not-yet-dismissed house ad into a fixed, non-blocking stack.
 * Idempotent: calling it again replaces whatever it previously mounted. Never runs before
 * first paint — callers mount it after the page's own content is up. */
export function renderHouseAds() {
  if (!document.getElementById('site-house-ads-css')) {
    const link = document.createElement('link');
    link.id = 'site-house-ads-css';
    link.rel = 'stylesheet';
    link.href = `${ROOT}assets/site-ads.css`;
    document.head.append(link);
  }
  document.getElementById('site-house-ads')?.remove();
  const settings = readSettings();
  if (!settings.adsEnabled) return;
  const dismissed = readDismissed();
  const eligible = AD_SLOTS.filter((ad) =>
    !dismissed.includes(ad.id) && !settings.adsDisabledIds.includes(ad.id));
  if (!eligible.length) return;
  // Rotate by day-of-year so the same visitor sees a different ad tomorrow rather than one
  // fixed favourite forever, without needing any state beyond what is already read above.
  const dayIndex = Math.floor(Date.now() / 86400000);
  const ad = eligible[dayIndex % eligible.length];

  const stack = document.createElement('div');
  stack.id = 'site-house-ads';
  stack.className = 'site-house-ads';
  stack.append(buildCard(ad, settings));
  document.body.append(stack);
}
