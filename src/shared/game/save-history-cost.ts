import { bnClampNonNegative, bnFloor, bnMulScalar, bnSub, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import type { GameState } from "./types.js";

/**
 * WHAT RESTORING A DELETED SAVE COSTS.
 *
 * The owner's rule: deleting save progress never deletes anything -- the save is committed to a
 * local Git repository and can always be restored -- but restoring costs half of what that save
 * produced per second.
 *
 * The price is charged against THE SAVE BEING RESTORED, not against whatever the player happens to
 * be holding now. That is the only reading that always works: the current run is usually a fresh
 * one with nothing in it, so billing the current balance would either make the restore free or
 * make it impossible, and neither is a price. Charging the archived save keeps the cost
 * proportional to what is being handed back -- a save producing a thousand a second costs five
 * hundred to bring home, and a save producing nothing costs nothing.
 *
 * It is deliberately a fraction of PRODUCTION rather than of the balance, exactly as stated. A
 * hoarder with a huge balance and no generators pays nothing; an empire with everything reinvested
 * pays a lot. The cost is a second or two of that empire's output, so it is real without ever
 * being ruinous.
 */
export const RESTORE_COST_FRACTION = 0.5;

/**
 * Half of the archived save's production, floored to a whole cookie.
 *
 * Floored rather than rounded so the charge can never exceed the stated half, and never turns a
 * save producing a fraction of a cookie per second into a cost of one.
 */
export function saveRestoreCost(archived: GameState): BigNum {
  return bnFloor(bnMulScalar(totalCps(archived), RESTORE_COST_FRACTION));
}

/**
 * The state the player actually gets back: the archived save minus its own restore cost.
 *
 * Clamped at zero, so a save whose production outruns its balance is still restorable -- it simply
 * arrives empty. Refusing the restore instead would break the one promise the feature makes, which
 * is that a deleted save can ALWAYS be brought back. Nothing else about the save is altered.
 */
export function applyRestoreCost(archived: GameState): GameState {
  return { ...archived, cookies: bnClampNonNegative(bnSub(archived.cookies, saveRestoreCost(archived))) };
}
