import type { ReactNode } from 'react';

import {
  bilingualText, BULK_COPY } from '../game/copy.js';

export interface BulkAction {
  readonly key: string;
  readonly label: string;
  readonly onRun: () => void;
  readonly destructive?: boolean;
}

export interface BulkToolbarProps {
  readonly selectedCount: number;
  readonly matchingCount: number;
  readonly onSelectAllMatching: () => void;
  readonly onClearSelection: () => void;
  readonly actions: readonly BulkAction[];
  readonly busy: boolean;
  readonly resultText: ReactNode | null;
}

/**
 * Generic bulk-action toolbar (design/bulk-toolbar.html): selection count baked into every
 * action label, every action disabled while one is in flight, and an honest partial result
 * replacing the action row once a bulk action completes.
 */
export function BulkToolbar({
  selectedCount,
  matchingCount,
  onSelectAllMatching,
  onClearSelection,
  actions,
  busy,
  resultText,
}: BulkToolbarProps) {
  if (selectedCount === 0 && !resultText) return null;

  const countCopy = BULK_COPY.selectedCount(selectedCount);

  return (
    <div className="bulk-toolbar" role="region" aria-label={bilingualText(countCopy)}>
      <span className="bulk-toolbar__count">
        {bilingualText(countCopy)}
      </span>
      {resultText ? (
        <>
          <span className="bulk-toolbar__result">{resultText}</span>
          <div className="spacer" />
          <button type="button" className="action" onClick={onClearSelection}>
            Dismiss · 知道喇
          </button>
        </>
      ) : (
        <>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`action${action.destructive ? ' destructive' : ''}`}
              disabled={busy}
              onClick={action.onRun}
            >
              {busy ? `${bilingualText(BULK_COPY.inFlight)}` : action.label}
            </button>
          ))}
          <div className="spacer" />
          {matchingCount > selectedCount && (
            <button type="button" className="action" disabled={busy} onClick={onSelectAllMatching}>
              {bilingualText(BULK_COPY.selectAllMatching)}
            </button>
          )}
          <button type="button" className="action" disabled={busy} onClick={onClearSelection}>
            {bilingualText(BULK_COPY.clearSelection)}
          </button>
        </>
      )}
    </div>
  );
}
