import { UpgradeIcon, type UpgradeFamily } from '../assets/icons.js';

import '../styles/parity-upgrade-scene.css';

export const UPGRADE_PARITY_ART = {
  locked: 'locked',
  buyable: 'click',
  owned: 'global',
} as const satisfies Readonly<Record<'locked' | 'buyable' | 'owned', UpgradeFamily>>;

export function UpgradeParityScene() {
  return (
    <section className="parity-gallery parity-upgrade-scene" aria-label="Upgrade card product gallery">
      <section className="panel upgrade-shelf parity-upgrade-scene__panel">
        <h2 className="parity-upgrade-scene__title">
          <span>Upgrades · 升級</span>
          <span className="parity-upgrade-scene__count">1 / 3</span>
        </h2>

        <div className="parity-upgrade-scene__grid">
          <article
            className="shelf-locked parity-upgrade-card parity-upgrade-card--locked"
            data-parity-upgrade-state="locked"
          >
            <span className="shelf-locked__glyph parity-upgrade-card__art" aria-hidden="true">
              <UpgradeIcon family={UPGRADE_PARITY_ART.locked} />
            </span>
            <span className="shelf-locked__text parity-upgrade-card__copy">
              <span className="shelf-locked__name parity-upgrade-card__name">
                Reinforced Rolling Pin · 加固擀麵杖
              </span>
              <span className="shelf-locked__requirement parity-upgrade-card__description">
                Doubles Grandma&apos;s Bakery CPS. Requires 50 owned. · 令嫲嫲嘅麵包店產量加倍，需要擁有 50 間。
              </span>
            </span>
            <strong className="shelf-locked__counter parity-upgrade-card__state">
              Locked · 未解鎖 (12 / 50)
            </strong>
          </article>

          <button
            type="button"
            className="shelf-ticket shelf-ticket--affordable parity-upgrade-card parity-upgrade-card--buyable"
            data-parity-upgrade-state="buyable"
          >
            <span className="shelf-ticket__glyph parity-upgrade-card__art" aria-hidden="true">
              <UpgradeIcon family={UPGRADE_PARITY_ART.buyable} />
            </span>
            <span className="shelf-ticket__body parity-upgrade-card__copy">
              <span className="shelf-ticket__name parity-upgrade-card__name">Golden Whisk</span>
              <span className="shelf-ticket__name-zh parity-upgrade-card__name-zh">金打蛋器</span>
              <span className="shelf-ticket__effect parity-upgrade-card__description">
                +15% click power · 每一擊力量增加 15%
              </span>
              <strong className="shelf-ticket__cost parity-upgrade-card__state">Buy · 買 — 🍪 5,000</strong>
            </span>
          </button>

          <article
            className="shelf-stamp parity-upgrade-card parity-upgrade-card--owned"
            data-parity-upgrade-state="owned"
            role="img"
            aria-label="Butter Blessing owned"
          >
            <span className="shelf-ticket__glyph parity-upgrade-card__art" aria-hidden="true">
              <UpgradeIcon family={UPGRADE_PARITY_ART.owned} />
            </span>
            <span className="shelf-ticket__body parity-upgrade-card__copy">
              <span className="shelf-ticket__name parity-upgrade-card__name">Butter Blessing</span>
              <span className="shelf-ticket__name-zh parity-upgrade-card__name-zh">牛油祝福</span>
              <span className="shelf-ticket__effect parity-upgrade-card__description">
                Permanently +10% global CPS · 永久令全局每秒產量增加 10%
              </span>
              <strong className="shelf-ticket__cost parity-upgrade-card__state">Already owned · 已經買咗</strong>
            </span>
          </article>
        </div>
      </section>
    </section>
  );
}
