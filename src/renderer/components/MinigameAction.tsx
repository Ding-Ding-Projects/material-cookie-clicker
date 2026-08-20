import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { showsCantonese, showsEnglish, type Bilingual } from '../game/copy.js';

export type MinigameActionVariant =
  | 'filled'
  | 'tonal'
  | 'outlined'
  | 'text'
  | 'danger-text'
  | 'danger-outlined';
export type MinigameActionIcon =
  | 'play'
  | 'cards'
  | 'move'
  | 'minimize'
  | 'restart'
  | 'abandon'
  | 'complete'
  | 'spark'
  | 'objective'
  | 'advance'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'flag';

export interface MinigameActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  readonly children: ReactNode;
  readonly variant?: MinigameActionVariant;
  readonly icon?: MinigameActionIcon;
  readonly type?: 'button' | 'submit' | 'reset';
}

/** One action-button seam for both playable minigames and scheduled-event controls. */
export const MinigameAction = forwardRef<HTMLButtonElement, MinigameActionProps>(
  function MinigameAction(
    { children, variant = 'tonal', icon, className, type = 'button', onClick, ...props },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        onClick={(event) => {
          if (props['aria-disabled'] === true || props['aria-disabled'] === 'true') {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        className={['md3-action', `md3-action--${variant}`, 'minigame-action', className]
          .filter(Boolean)
          .join(' ')}
      >
        {icon ? <ActionIcon icon={icon} /> : null}
        <span className="md3-action__label">{children}</span>
      </button>
    );
  },
);

/** Keep the Cantonese run explicitly tagged when bilingual action copy is rendered. */
export function MinigameActionLabel({ text }: { readonly text: Bilingual }) {
  const english = showsEnglish();
  const cantonese = showsCantonese();
  return (
    <span className="md3-action__bilingual">
      {english ? <span>{text.en}</span> : null}
      {english && cantonese ? <span aria-hidden="true">·</span> : null}
      {cantonese ? <span lang="zh-HK">{text.yue}</span> : null}
    </span>
  );
}

/** Local vector marks: no icon font, network asset, emoji, or accessible-name pollution. */
function ActionIcon({ icon }: { readonly icon: MinigameActionIcon }) {
  return (
    <svg className="md3-action__icon" viewBox="0 0 24 24" data-icon={icon} aria-hidden="true" focusable="false">
      {icon === 'play' ? <path d="M8 5v14l11-7z" /> : null}
      {icon === 'cards' ? (
        <>
          <rect x="5" y="3" width="12" height="16" rx="2" />
          <path d="m9 7 4 4-4 4" />
        </>
      ) : null}
      {icon === 'move' ? <path d="M5 12h13m-5-5 5 5-5 5" /> : null}
      {icon === 'minimize' ? <path d="M5 11h14v2H5z" /> : null}
      {icon === 'restart' ? <path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 8" /> : null}
      {icon === 'abandon' ? <path d="m6 6 12 12M18 6 6 18" /> : null}
      {icon === 'complete' ? <path d="m5 12 4 4L19 6" /> : null}
      {icon === 'spark' ? <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /> : null}
      {icon === 'objective' ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8 12 3 3 5-6" />
        </>
      ) : null}
      {icon === 'advance' ? <path d="M6 5v14l9-7zm10 0h2v14h-2z" /> : null}
      {icon === 'left' ? <path d="m14 6-6 6 6 6" /> : null}
      {icon === 'right' ? <path d="m10 6 6 6-6 6" /> : null}
      {icon === 'up' ? <path d="m6 14 6-6 6 6" /> : null}
      {icon === 'down' ? <path d="m6 10 6 6 6-6" /> : null}
      {icon === 'flag' ? <path d="M7 21V4m0 1h10l-2 4 2 4H7" /> : null}
    </svg>
  );
}
