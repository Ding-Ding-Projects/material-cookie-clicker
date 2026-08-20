const ROOT = location.pathname.includes('/features/') ? '../' : '';
const STORAGE_KEY = 'mcc-site-shell-v1';
const SETTINGS_KEY = 'mcc-site-settings-v1';

/* Appearance the visitor chose in the control centre has to reach the other sixteen pages, and
   control-center.js is loaded by exactly one of them. Reading the same key here is what makes a
   theme, accent or font choice mean anything outside the settings screen. Applied before the tab
   strip is built so nothing paints in the wrong colours first. */
/* Which label colour survives on a given accent: WCAG relative luminance, then the better of
 * black and white. The picker accepts any six hex digits, so a hard-coded white label went
 * white-on-white on a pale accent. Exported because control-center.js needs the same answer when
 * the picker changes, and two copies of a contrast rule is two rules that will disagree. */
export function onColourFor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(m[1].slice(at, at + 2), 16));
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onBlack >= onWhite ? '#000000' : '#ffffff';
}

function applyStoredAppearance() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return;
  const root = document.documentElement;
  // 'system' matches no stylesheet rule; the absence of the attribute is what follows the system.
  if (saved.theme === 'dark' || saved.theme === 'light') root.dataset.theme = saved.theme;
  else delete root.dataset.theme;
  if (typeof saved.density === 'string') root.dataset.density = saved.density;
  if (saved.rainbow === true || saved.rainbow === false) root.dataset.rainbow = String(saved.rainbow);
  if (typeof saved.accent === 'string' && /^#[0-9a-f]{6}$/i.test(saved.accent)) {
    root.style.setProperty('--user-accent', saved.accent);
    root.style.setProperty('--m3-on-primary', onColourFor(saved.accent));
  }
  if (typeof saved.fontFamily === 'string' && saved.fontFamily) root.style.setProperty('--user-font', saved.fontFamily);
  if (Number.isFinite(Number(saved.fontScale))) root.style.setProperty('--user-font-scale', String(Number(saved.fontScale)));
  if (Number.isFinite(Number(saved.fontWeight))) root.style.setProperty('--user-font-weight', String(Number(saved.fontWeight)));
}

applyStoredAppearance();
addEventListener('storage', (event) => { if (event.key === SETTINGS_KEY) applyStoredAppearance(); });

const TABS = [
  { id: 'home', label: 'Home', href: `${ROOT}index.html`, group: 'Project' },
  { id: 'features', label: 'Feature articles', href: `${ROOT}features/index.html`, group: 'Project' },
  { id: 'settings', label: 'Settings', href: `${ROOT}control-center.html#settings`, group: 'Control centre' },
  { id: 'status', label: 'Status', href: `${ROOT}control-center.html#status`, group: 'Control centre' },
  { id: 'tools', label: 'Local tools', href: `${ROOT}control-center.html#tools`, group: 'Control centre' },
];

const defaultState = {
  dock: 'left',
  pinned: ['home'],
  order: TABS.map((tab) => tab.id),
  closed: [],
  collapsedGroups: [],
};

function readState() {
  try {
    const candidate = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!candidate || typeof candidate !== 'object') return structuredClone(defaultState);
    return {
      dock: ['left', 'right', 'top', 'bottom'].includes(candidate.dock) ? candidate.dock : 'left',
      pinned: Array.isArray(candidate.pinned) ? candidate.pinned.filter((id) => TABS.some((tab) => tab.id === id)) : ['home'],
      order: Array.isArray(candidate.order) ? candidate.order.filter((id) => TABS.some((tab) => tab.id === id)) : defaultState.order,
      closed: Array.isArray(candidate.closed) ? candidate.closed.filter((id) => TABS.some((tab) => tab.id === id)) : [],
      collapsedGroups: Array.isArray(candidate.collapsedGroups) ? candidate.collapsedGroups : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

let state = readState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

function currentId() {
  if (location.pathname.includes('control-center')) return location.hash.slice(1) || 'settings';
  if (location.pathname.includes('/features/')) return 'features';
  return 'home';
}

function announce(message) {
  let region = document.getElementById('site-toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'site-toast-region';
    region.className = 'site-toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = 'site-toast';
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 5000);
}

function orderedTabs() {
  const byId = new Map(TABS.map((tab) => [tab.id, tab]));
  return [...new Set([...state.order, ...TABS.map((tab) => tab.id)])]
    .map((id) => byId.get(id))
    .filter(Boolean);
}

function renderShell() {
  document.documentElement.dataset.siteDock = state.dock;
  document.getElementById('site-tab-shell')?.remove();
  const shell = document.createElement('aside');
  shell.id = 'site-tab-shell';
  shell.className = 'site-tab-shell';
  shell.setAttribute('aria-label', 'Site pages');
  shell.innerHTML = `
    <div class="site-tab-tools">
      <button class="site-icon-button" type="button" data-command="open-palette" aria-label="Open command palette">⌕</button>
      <button class="site-icon-button" type="button" data-command="open-tab-search" aria-label="Search all site tabs">☷</button>
    </div>
    <div class="site-tab-groups"></div>
  `;
  const groups = shell.querySelector('.site-tab-groups');
  for (const groupName of [...new Set(orderedTabs().map((tab) => tab.group))]) {
    const section = document.createElement('section');
    const collapsed = state.collapsedGroups.includes(groupName);
    section.className = 'site-tab-group';
    section.innerHTML = `<button class="site-group-heading" type="button" aria-expanded="${!collapsed}"><span>${groupName}</span><span aria-hidden="true">${collapsed ? '▸' : '▾'}</span></button><div role="tablist" aria-orientation="${['left', 'right'].includes(state.dock) ? 'vertical' : 'horizontal'}"></div>`;
    section.querySelector('.site-group-heading').addEventListener('click', () => {
      state.collapsedGroups = collapsed
        ? state.collapsedGroups.filter((name) => name !== groupName)
        : [...state.collapsedGroups, groupName];
      save();
      renderShell();
    });
    const list = section.querySelector('[role="tablist"]');
    list.hidden = collapsed;
    for (const tab of orderedTabs().filter((item) => item.group === groupName && !state.closed.includes(item.id))) {
      const anchor = document.createElement('a');
      anchor.className = 'site-tab';
      anchor.href = tab.href;
      anchor.dataset.tabId = tab.id;
      anchor.setAttribute('role', 'tab');
      anchor.setAttribute('aria-selected', String(currentId() === tab.id));
      anchor.innerHTML = `<span class="site-tab-pin" aria-hidden="true">${state.pinned.includes(tab.id) ? '●' : ''}</span><span>${tab.label}</span>`;
      anchor.addEventListener('contextmenu', (event) => openContextMenu(event, tab));
      list.append(anchor);
    }
    groups.append(section);
  }
  document.body.prepend(shell);
  shell.querySelector('[data-command="open-palette"]').addEventListener('click', openPalette);
  shell.querySelector('[data-command="open-tab-search"]').addEventListener('click', () => openPalette('tab'));
}

function openContextMenu(event, tab) {
  event.preventDefault();
  document.getElementById('site-context-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'site-context-menu';
  menu.className = 'site-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="site-menu-search"><label for="site-menu-filter">Filter commands</label><div class="site-search-combo"><input id="site-menu-filter" type="search" /><button type="button" data-regex-for="site-menu-filter" aria-label="Open regex builder for menu filter">.*</button></div></div>
    <button type="button" role="menuitem" data-action="pin">${state.pinned.includes(tab.id) ? 'Unpin tab' : 'Pin tab'} <kbd>Alt+P</kbd></button>
    <button type="button" role="menuitem" data-action="close" ${state.pinned.includes(tab.id) ? 'disabled title="Pinned tabs stay open"' : ''}>Close tab <kbd>Ctrl+W</kbd></button>
    <button type="button" role="menuitem" data-action="dock">Dock tabs: ${state.dock}</button>
    <a role="menuitem" href="${ROOT}control-center.html#appearance">Edit tab appearance…</a>
  `;
  // Clamped on one side only, this put the menu at a negative offset on any viewport under
  // 300px — filter field and first item off the top-left corner, unreachable. The 300 was
  // also a guess: the element is min(320px, 94vw) wide, so the real box is measured instead.
  const box = menu.getBoundingClientRect();
  const width = box.width || Math.min(320, innerWidth * 0.94);
  const height = box.height || 300;
  menu.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - height - 8))}px`;
  document.body.append(menu);
  attachRegexBuilder(menu.querySelector('[data-regex-for]'));
  const filter = menu.querySelector('input');
  filter.addEventListener('input', () => {
    for (const item of menu.querySelectorAll('[role="menuitem"]')) item.hidden = !item.textContent.toLowerCase().includes(filter.value.toLowerCase());
  });
  menu.querySelector('[data-action="pin"]').addEventListener('click', () => {
    state.pinned = state.pinned.includes(tab.id) ? state.pinned.filter((id) => id !== tab.id) : [...state.pinned, tab.id];
    save(); renderShell(); menu.remove();
  });
  menu.querySelector('[data-action="close"]').addEventListener('click', () => {
    if (state.pinned.includes(tab.id)) return;
    state.closed = [...new Set([...state.closed, tab.id])];
    save(); renderShell(); menu.remove(); announce(`${tab.label} closed. Restore it from master tab search.`);
  });
  menu.querySelector('[data-action="dock"]').addEventListener('click', () => {
    const edges = ['left', 'top', 'right', 'bottom'];
    state.dock = edges[(edges.indexOf(state.dock) + 1) % edges.length];
    save(); renderShell(); menu.remove();
  });
  filter.focus();
  const close = (closeEvent) => { if (!menu.contains(closeEvent.target)) { menu.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 0);
}

export function attachRegexBuilder(button) {
  if (!button) return;
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.regexFor);
    if (!input) return;
    document.getElementById('site-regex-builder')?.remove();
    const panel = document.createElement('section');
    panel.id = 'site-regex-builder';
    panel.className = 'site-regex-builder';
    panel.setAttribute('aria-label', `Regex builder for ${input.getAttribute('aria-label') || input.labels?.[0]?.textContent || 'search'}`);
    panel.innerHTML = `
      <div class="site-overlay-heading"><strong>Regex builder</strong><button type="button" aria-label="Close regex builder">×</button></div>
      <p>JavaScript regular expressions. Plain text remains the default until regex is enabled.</p>
      <label>Pattern <input type="text" data-pattern maxlength="120" value="${input.value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" /></label>
      <fieldset><legend>Flags</legend><label><input type="checkbox" value="i" checked /> Ignore case</label><label><input type="checkbox" value="m" /> Multiline</label><label><input type="checkbox" value="u" checked /> Unicode</label></fieldset>
      <div class="site-token-row"><button type="button" data-token="^">Start</button><button type="button" data-token="$">End</button><button type="button" data-token="[a-z]">Class</button><button type="button" data-token="()">Group</button><button type="button" data-token="|">Either</button><button type="button" data-token="+">One or more</button></div>
      <label>Sample text <textarea data-sample rows="3">Home\nFeatures\nSettings\nStatus\nLocal tools</textarea></label>
      <p data-feedback role="status"></p>
      <button type="button" data-apply>Apply pattern</button>
    `;
    // The builder used to be appended to <body> unconditionally. Both of its buttons live
    // inside <dialog> elements opened with showModal(), and a modal dialog renders in the top
    // layer and makes everything outside it inert — so the panel was painted behind the very
    // dialog that opened it and could be neither seen nor clicked. At the 'Full window'
    // palette size it was not even peeking out at the edges, so the button simply did nothing.
    // Appending it to the owning dialog puts it in the same top-layer subtree.
    const owner = button.closest('dialog') ?? document.body;
    panel.dataset.inDialog = String(owner !== document.body);
    owner.append(panel);
    const pattern = panel.querySelector('[data-pattern]');
    const feedback = panel.querySelector('[data-feedback]');
    const evaluate = () => {
      try {
        const flags = [...panel.querySelectorAll('fieldset input:checked')].map((item) => item.value).join('');
        const re = new RegExp(pattern.value, flags);
        const matches = panel.querySelector('[data-sample]').value.split(/\r?\n/).filter((line) => re.test(line));
        feedback.textContent = `${matches.length} sample line${matches.length === 1 ? '' : 's'} match. Capture groups use this browser’s JavaScript engine.`;
      } catch (error) { feedback.textContent = `Invalid pattern: ${error.message}`; }
    };
    panel.querySelectorAll('[data-token]').forEach((token) => token.addEventListener('click', () => {
      const addition = token.dataset.token;
      const at = pattern.selectionStart;
      pattern.value = pattern.value.slice(0, at) + addition + pattern.value.slice(pattern.selectionEnd);
      pattern.focus(); pattern.setSelectionRange(at + addition.length, at + addition.length); evaluate();
    }));
    panel.querySelectorAll('input, textarea').forEach((control) => control.addEventListener('input', evaluate));
    panel.querySelector('[data-apply]').addEventListener('click', () => { input.value = pattern.value; input.dataset.regex = 'true'; input.dispatchEvent(new Event('input')); panel.remove(); input.focus(); });
    panel.querySelector('.site-overlay-heading button').addEventListener('click', () => { panel.remove(); input.focus(); });
    evaluate(); pattern.focus();
  });
}

function openPalette(initial = '') {
  document.getElementById('site-command-palette')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'site-command-palette';
  dialog.className = 'site-command-palette';
  dialog.innerHTML = `
    <form method="dialog" class="site-overlay-heading"><strong>Command palette</strong><button aria-label="Close command palette">×</button></form>
    <div class="site-search-combo"><label class="sr-only" for="site-palette-query">Search commands and tabs</label><input id="site-palette-query" type="search" value="${initial}" placeholder="Search commands, pages and settings" /><button type="button" data-regex-for="site-palette-query" aria-label="Open regex builder for command palette">.*</button></div>
    <div class="palette-size"><button type="button" data-size="card">Card</button><button type="button" data-size="full">Full window</button></div>
    <ul class="site-palette-results" role="listbox"></ul>
  `;
  document.body.append(dialog);
  const commands = [
    ...TABS.map((tab) => ({ label: `Open ${tab.label}`, action: () => location.href = tab.href, kind: 'tab' })),
    { label: 'Restore all closed tabs', action: () => { state.closed = []; save(); renderShell(); dialog.close(); announce('All site tabs restored.'); }, kind: 'tab' },
    { label: 'Move tab strip to next edge', action: () => { state.dock = ['left', 'top', 'right', 'bottom'][(['left', 'top', 'right', 'bottom'].indexOf(state.dock) + 1) % 4]; save(); renderShell(); dialog.close(); }, kind: 'appearance' },
    { label: 'Reset site appearance', action: () => { localStorage.removeItem('mcc-site-settings-v1'); location.reload(); }, kind: 'appearance' },
  ];
  const input = dialog.querySelector('input');
  const results = dialog.querySelector('.site-palette-results');
  const render = () => {
    results.replaceChildren();
    let matcher;
    try { matcher = input.dataset.regex === 'true' ? new RegExp(input.value, 'iu') : null; }
    catch { return; }
    const filtered = commands.filter((command) => !input.value || (matcher ? matcher.test(command.label) : command.label.toLowerCase().includes(input.value.toLowerCase())));
    for (const command of filtered) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = command.label; button.dataset.kind = command.kind;
      button.addEventListener('click', command.action); li.append(button); results.append(li);
    }
  };
  input.addEventListener('input', render);
  attachRegexBuilder(dialog.querySelector('[data-regex-for]'));
  dialog.querySelectorAll('[data-size]').forEach((button) => button.addEventListener('click', () => dialog.dataset.size = button.dataset.size));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal(); render(); input.focus();
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault(); openPalette();
  }
});

for (const button of document.querySelectorAll('[data-regex-for]')) attachRegexBuilder(button);
renderShell();
