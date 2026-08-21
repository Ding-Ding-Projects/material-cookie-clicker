import { useCallback, useEffect, useState } from 'react';

import { formatExactDigits } from '../../shared/game/format-number.js';
import type { SaveHistoryRecord } from '../../shared/game/ipc-contracts.js';
import { bilingualText, PRESTIGE_SCREEN_COPY } from '../game/copy.js';
import { useArchivedSaves, useRestoreArchivedSave } from '../game/GameProvider.js';

/**
 * THE SURFACE THAT MAKES DELETION REVERSIBLE.
 *
 * Deleting save progress commits the save to a local Git repository instead of destroying it
 * (`src/main/save-history.ts`). That is worth nothing to a player who cannot see the archive, so
 * this is the list that shows it and the control that brings one back.
 *
 * It exists because the alternative was a feature wired at one end and consumed at neither -- the
 * archive would be written on every deletion and read by nothing, which this repository has been
 * bitten by twice and now guards against by name in AGENTS.md.
 *
 * Restoring costs half of what that save produced per second, charged against the save itself.
 * The cost is computed by the same shared function the restore uses, so the number shown on the
 * button and the number actually charged cannot drift apart.
 */
export function DeletedSaves() {
  const listArchivedSaves = useArchivedSaves();
  const restoreArchivedSave = useRestoreArchivedSave();
  const [entries, setEntries] = useState<readonly SaveHistoryRecord[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void listArchivedSaves().then(setEntries);
  }, [listArchivedSaves]);

  useEffect(refresh, [refresh]);

  const restore = useCallback(
    (id: string) => {
      // Guard re-entry in the handler, not only by disabling the button: a keyboard submit walks
      // straight past a disabled attribute, and restoring twice would replace the state twice.
      if (busy) return;
      setBusy(true);
      setStatus('');
      void restoreArchivedSave(id)
        .then((result) => {
          setStatus(
            bilingualText(
              result.ok
                ? PRESTIGE_SCREEN_COPY.historyRestored(formatExactDigits(result.cost))
                : PRESTIGE_SCREEN_COPY.historyRestoreFailed(result.reason),
            ),
          );
          refresh();
        })
        .finally(() => setBusy(false));
    },
    [busy, refresh, restoreArchivedSave],
  );

  return (
    <section className="settings-block deleted-saves" aria-labelledby="deleted-saves-heading">
      <h2 id="deleted-saves-heading">{bilingualText(PRESTIGE_SCREEN_COPY.historyTitle)}</h2>
      <p>{bilingualText(PRESTIGE_SCREEN_COPY.historyExplain)}</p>

      {entries === null ? null : entries.length === 0 ? (
        // An honest empty state rather than a blank panel, which reads as a failure to load.
        <p className="deleted-saves__empty">{bilingualText(PRESTIGE_SCREEN_COPY.historyEmpty)}</p>
      ) : (
        <ul className="deleted-saves__list">
          {entries.map((entry) => (
            <li key={entry.id} className="deleted-saves__item">
              <span className="deleted-saves__when">
                {new Date(entry.archivedAtEpochMs).toLocaleString()}
              </span>
              <span className="deleted-saves__summary">{entry.summary}</span>
              <button
                type="button"
                disabled={busy || entry.restoreCost === null}
                onClick={() => restore(entry.id)}
              >
                {entry.restoreCost === null
                  ? bilingualText(PRESTIGE_SCREEN_COPY.historyUndecodable)
                  : bilingualText(PRESTIGE_SCREEN_COPY.historyRestore(formatExactDigits(entry.restoreCost)))}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Assertive, because the player has just pressed a control that replaced their whole run. */}
      <p className="deleted-saves__status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
