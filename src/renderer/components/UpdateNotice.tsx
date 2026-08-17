import { useEffect, useState } from 'react';

import type { UpdateStatus } from '../../shared/game/updates.js';
import { bilingualText } from '../game/copy';
import { dismissalKey, updateNoticeViewModel } from '../game/update-notice';

/**
 * The dev/capture seam.
 *
 * A `window` CustomEvent carrying an `UpdateStatus`, listened to alongside the real IPC push. It
 * exists so a status can be injected into a running development build — which by definition has
 * no Squirrel updater behind it — to photograph the notice and to check the wiring end to end
 * without publishing a release. It is a seam, not a simulation: injecting `ready` renders the
 * notice, and the Restart button still goes to the real main-process channel, where an
 * unpackaged process refuses it because no package was ever downloaded.
 *
 * Nothing in the application dispatches it.
 */
export const UPDATE_STATUS_INJECT_EVENT = 'material-cookie-clicker:update-status';

/**
 * The update notice: a corner card in the same idiom as the offline banner and the achievement
 * toast, and just as non-blocking. It does not dim anything, does not take focus and never
 * appears over the cookie — the game keeps running behind it, and a player who ignores it
 * forever simply keeps playing the version they have.
 *
 * It is a status region rather than an alert: an update is not urgent enough to interrupt a
 * screen reader mid-sentence.
 */
export function UpdateNotice() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const receive = (next: UpdateStatus) => setStatus(next);
    const bridge = window.materialCookieClicker?.updates;
    const unsubscribe = bridge?.onStatus(receive);
    bridge?.requestStatus();

    const injected = (event: Event) => {
      const detail = (event as CustomEvent<UpdateStatus>).detail;
      if (detail && typeof detail.kind === 'string') receive(detail);
    };
    window.addEventListener(UPDATE_STATUS_INJECT_EVENT, injected);
    return () => {
      unsubscribe?.();
      window.removeEventListener(UPDATE_STATUS_INJECT_EVENT, injected);
    };
  }, []);

  const model = updateNoticeViewModel(status, dismissed);
  if (!model) return null;

  return (
    <div className="update-notice" role="status">
      <strong className="update-notice__title">{bilingualText(model.title)}</strong>
      <p className="update-notice__warning">{bilingualText(model.warning)}</p>
      <div className="update-notice__actions">
        <button
          type="button"
          className="update-notice__button update-notice__button--restart"
          onClick={() => window.materialCookieClicker?.updates?.restart()}
        >
          {bilingualText(model.restartLabel)}
        </button>
        <button
          type="button"
          className="update-notice__button"
          onClick={() => setDismissed(dismissalKey(status))}
        >
          {bilingualText(model.laterLabel)}
        </button>
      </div>
    </div>
  );
}
