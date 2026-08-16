import { useCallback } from 'react';

// Minimal scaffold shell: a frameless-window title bar plus a placeholder
// game surface. The cookie-clicker game state lives in src/shared/game/**,
// owned by a different lane, and mounts into this shell once it lands.
export function App() {
  const minimize = useCallback(() => window.materialCookieClicker?.window.minimize(), []);
  const toggleMaximize = useCallback(() => window.materialCookieClicker?.window.toggleMaximize(), []);
  const close = useCallback(() => window.materialCookieClicker?.window.close(), []);

  return (
    <div className="app-shell">
      <header className="title-bar" role="banner">
        <span className="title-bar__label">Material Cookie Clicker</span>
        <div className="title-bar__controls" role="group" aria-label="Window controls">
          <button type="button" className="title-bar__button" aria-label="Minimize window" onClick={minimize}>
            &#x2013;
          </button>
          <button type="button" className="title-bar__button" aria-label="Maximize or restore window" onClick={toggleMaximize}>
            &#x25A1;
          </button>
          <button type="button" className="title-bar__button title-bar__button--close" aria-label="Close window" onClick={close}>
            &#x2715;
          </button>
        </div>
      </header>
      <main className="app-content" id="root-content">
        <h1>Material Cookie Clicker</h1>
        <p>The cookie-clicker game surface mounts here.</p>
      </main>
    </div>
  );
}
