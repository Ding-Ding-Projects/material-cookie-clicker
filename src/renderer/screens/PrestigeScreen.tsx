import { useMemo, useState } from 'react';

import { bnCompare, bnFromNumber } from '../../shared/game/big-number.js';
import { ascensionValue } from '../../shared/game/prestige.js';
import type { GameState } from '../../shared/game/types.js';
import { DestructiveGate } from '../components/DestructiveGate.js';
import { PRESTIGE_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useGameWipe, useStructureSnapshot } from '../game/GameProvider.js';

/** 1 trillion lifetime cookies — mirrors prestige.ts#canPrestige's own threshold exactly. */
const PRESTIGE_LIFETIME_THRESHOLD = bnFromNumber(1e12);

export function PrestigeScreen() {
  const dispatch = useGameDispatch();
  const wipe = useGameWipe();
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();
  const [prestigeMessage, setPrestigeMessage] = useState<Bilingual | null>(null);
  const [wipeMessage, setWipeMessage] = useState<Bilingual | null>(null);

  // Eligibility must react to every tick (lifetimeCookies lives in the fast slice), not only to
  // discrete structural events — reading it off `structure` alone would leave the trigger
  // showing "not yet eligible" for a while after the player has actually crossed the threshold.
  const eligible = bnCompare(fast.lifetimeCookies, PRESTIGE_LIFETIME_THRESHOLD) >= 0;
  const projectedPoints = useMemo(() => ascensionValue(fast.lifetimeCookies), [fast.lifetimeCookies]);

  function handlePrestigeConfirm(): void {
    const before = structure.prestige.ascensionPoints;
    const next: GameState = dispatch({ type: 'prestige' });
    const earned = next.prestige.ascensionPoints - before;
    setPrestigeMessage(PRESTIGE_SCREEN_COPY.prestigeCompleted(earned));
  }

  function handleWipeConfirm(): void {
    void wipe();
    setWipeMessage(PRESTIGE_SCREEN_COPY.wipeCompleted);
  }

  return (
    <div className="screen">
      <h1>
        Prestige<span className="screen-title-zh">轉生</span>
      </h1>

      <div className="projection-card">
        <h2>
          {PRESTIGE_SCREEN_COPY.projectionTitle.en} <span className="screen-title-zh">{PRESTIGE_SCREEN_COPY.projectionTitle.yue}</span>
        </h2>
        {eligible ? (
          <p>
            {PRESTIGE_SCREEN_COPY.projectionBody(projectedPoints).en} · {PRESTIGE_SCREEN_COPY.projectionBody(projectedPoints).yue}
          </p>
        ) : (
          <p>
            {PRESTIGE_SCREEN_COPY.notYetEligible.en} · {PRESTIGE_SCREEN_COPY.notYetEligible.yue}
          </p>
        )}
      </div>

      <div className="permanent-shop-card">
        <h2>
          {PRESTIGE_SCREEN_COPY.permanentShopTitle.en} <span className="screen-title-zh">{PRESTIGE_SCREEN_COPY.permanentShopTitle.yue}</span>
        </h2>
        <p>
          {PRESTIGE_SCREEN_COPY.permanentShopEmpty.en} · {PRESTIGE_SCREEN_COPY.permanentShopEmpty.yue}
        </p>
      </div>

      <DestructiveGate
        tone="prestige"
        triggerLabel={PRESTIGE_SCREEN_COPY.prestigeButton}
        triggerDisabled={!eligible}
        title={PRESTIGE_SCREEN_COPY.gatePrestigeTitle}
        key1Label={PRESTIGE_SCREEN_COPY.key1Label}
        key2Label={PRESTIGE_SCREEN_COPY.key2PrestigeLabel}
        sliderAriaLabel={PRESTIGE_SCREEN_COPY.sliderAriaPrestige}
        onConfirm={handlePrestigeConfirm}
        completionMessage={prestigeMessage}
        impact={
          <>
            <strong>
              {PRESTIGE_SCREEN_COPY.gatePrestigeResets.en}
              <br />
              {PRESTIGE_SCREEN_COPY.gatePrestigeResets.yue}
            </strong>
            <strong>
              {PRESTIGE_SCREEN_COPY.gatePrestigeKeeps(structure.prestige.ascensionPoints).en}
              <br />
              {PRESTIGE_SCREEN_COPY.gatePrestigeKeeps(structure.prestige.ascensionPoints).yue}
            </strong>
          </>
        }
      />

      <DestructiveGate
        tone="wipe"
        triggerLabel={PRESTIGE_SCREEN_COPY.wipeButton}
        title={PRESTIGE_SCREEN_COPY.gateWipeTitle}
        key1Label={PRESTIGE_SCREEN_COPY.key1Label}
        key2Label={PRESTIGE_SCREEN_COPY.key2WipeLabel}
        sliderAriaLabel={PRESTIGE_SCREEN_COPY.sliderAriaWipe}
        onConfirm={handleWipeConfirm}
        completionMessage={wipeMessage}
        impact={
          <strong>
            {PRESTIGE_SCREEN_COPY.gateWipeBody.en}
            <br />
            {PRESTIGE_SCREEN_COPY.gateWipeBody.yue}
          </strong>
        }
      />
    </div>
  );
}
