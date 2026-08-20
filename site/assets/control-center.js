import { attachRegexBuilder, onColourFor } from './site-shell.js';

const SETTINGS_KEY = 'mcc-site-settings-v1';
const RECORDS_KEY = 'mcc-site-records-v1';
const SHELL_KEY = 'mcc-site-shell-v1';

const defaults = {
  language: 'en', funnyEn: 3, funnyYue: 3, dialogEmoji: true, schoolMode: false,
  schoolName: 'School mode', narratorEnabled: false, narratorLanguage: 'en', voiceEn: '', voiceYue: '',
  narratorRate: 1, narratorPitch: 1, theme: 'system', density: 'comfortable', accent: '#7a4a1d',
  rainbow: false, rainbowSpeed: 3, fontFamily: 'Segoe UI', fontScale: 1, fontWeight: 400,
  logo: 'cookie', logoFit: 'contain', logoX: 50, logoY: 50, customLogo: '', vocabulary: null,
  schedules: [], locks: [], tickets: [], totpEntries: [], notifications: [], history: [],
};

function readJson(key, fallback) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || 'null') || {}) }; }
  catch { return structuredClone(fallback); }
}

let settings = readJson(SETTINGS_KEY, defaults);
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

function addHistory(action, label) {
  settings.history.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action, label });
  settings.history = settings.history.slice(0, 300);
  saveSettings(); renderHistory();
}

function notify(title, body, kind = 'info') {
  const record = { id: crypto.randomUUID(), at: new Date().toISOString(), title, body, kind };
  settings.notifications.unshift(record); settings.notifications = settings.notifications.slice(0, 100); saveSettings();
  const region = document.getElementById('site-toast-region') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'site-toast-region', className: 'site-toast-region' }));
  region.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  const toast = document.createElement('div'); toast.className = `site-toast site-toast--${kind}`; toast.textContent = `${settings.dialogEmoji ? 'ℹ️ ' : ''}${title}: ${body}`; region.append(toast);
  if (kind !== 'error') setTimeout(() => toast.remove(), 5000);
  renderNotifications();
}

function download(name, type, content) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function matchesInput(input, text) {
  const query = input.value.trim();
  if (!query) return true;
  if (input.dataset.regex !== 'true') return text.toLowerCase().includes(query.toLowerCase());
  try { return new RegExp(query, 'iu').test(text); }
  catch { return false; }
}

function bind(id, key, event = 'change', transform = (value) => value) {
  const control = document.getElementById(id); if (!control) return;
  if (control.type === 'checkbox') control.checked = Boolean(settings[key]); else control.value = settings[key];
  control.addEventListener(event, () => {
    settings[key] = control.type === 'checkbox' ? control.checked : transform(control.value);
    saveSettings(); applyAppearance(); addHistory('settings changed', `${id} changed`);
  });
}

function applyAppearance() {
  // 'system' is not a value any stylesheet matches. Writing it verbatim left the control
  // centre light on a dark machine at its own default, which is most first visits. Removing
  // the attribute is what actually means 'follow the system' — the prefers-color-scheme block
  // is written :not([data-theme="light"]) so it takes over exactly then.
  if (settings.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.density = settings.density;
  document.documentElement.dataset.rainbow = String(settings.rainbow);
  document.documentElement.style.setProperty('--user-accent', settings.accent);
  document.documentElement.style.setProperty('--m3-on-primary', onColourFor(settings.accent));
  document.documentElement.style.setProperty('--user-font', settings.fontFamily);
  document.documentElement.style.setProperty('--user-font-scale', settings.fontScale);
  document.documentElement.style.setProperty('--user-font-weight', settings.fontWeight);
  document.documentElement.style.setProperty('--rainbow-duration', `${[24, 18, 12, 8, 5][Number(settings.rainbowSpeed) - 1] || 12}s`);
  document.body.style.fontFamily = `var(--user-font), var(--font-en)`;
  document.body.style.fontSize = `${16 * Number(settings.fontScale)}px`;
  document.body.style.fontWeight = String(settings.fontWeight);
  const accent = document.getElementById('accent'); if (accent) accent.value = settings.accent;
  const text = document.getElementById('accent-text'); if (text) text.value = settings.accent;
  const contrast = document.getElementById('contrast-status'); if (contrast) contrast.textContent = `Active colour: ${settings.rainbow ? 'animated rainbow sentinel' : settings.accent}. Contrast is checked against the current surface before activation in the installed application; this site preview does not certify every possible custom colour.`;
  const cantoneseFunny = document.getElementById('funny-yue')?.closest('.setting-card');
  const vocabulary = document.getElementById('vocabulary-file')?.closest('.setting-card');
  if (cantoneseFunny) cantoneseFunny.hidden = settings.schoolMode;
  if (vocabulary) vocabulary.hidden = settings.schoolMode;
  if (settings.schoolMode) {
    settings.language = 'en';
    const language = document.getElementById('language'); if (language) language.value = 'en';
    document.body.dataset.schoolMode = 'true';
  } else delete document.body.dataset.schoolMode;
}

function activatePanel(id, focus = false) {
  const target = document.getElementById(id) ? id : 'settings';
  document.querySelectorAll('.control-tabs [role="tab"]').forEach((tab) => {
    const selected = tab.getAttribute('aria-controls') === target;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.control-panel').forEach((panel) => panel.hidden = panel.id !== target);
  history.replaceState(null, '', `#${target}`);
  if (focus) document.getElementById(`tab-${target}`)?.focus();
}

const tabs = [...document.querySelectorAll('.control-tabs [role="tab"]')];
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activatePanel(tab.getAttribute('aria-controls')));
  tab.addEventListener('keydown', (event) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return; event.preventDefault(); const next = tabs[(index + delta + tabs.length) % tabs.length]; activatePanel(next.getAttribute('aria-controls'), true);
  });
});
activatePanel(location.hash.slice(1));
addEventListener('hashchange', () => activatePanel(location.hash.slice(1)));

bind('language', 'language'); bind('funny-en', 'funnyEn', 'input', Number); bind('funny-yue', 'funnyYue', 'input', Number);
bind('dialog-emoji', 'dialogEmoji'); bind('school-mode', 'schoolMode'); bind('school-name', 'schoolName', 'input');
bind('narrator-enabled', 'narratorEnabled'); bind('narrator-language', 'narratorLanguage'); bind('voice-en', 'voiceEn'); bind('voice-yue', 'voiceYue');
bind('narrator-rate', 'narratorRate', 'input', Number); bind('narrator-pitch', 'narratorPitch', 'input', Number);
bind('theme', 'theme'); bind('density', 'density'); bind('accent', 'accent', 'input'); bind('rainbow', 'rainbow'); bind('rainbow-speed', 'rainbowSpeed', 'input', Number);
bind('font-family', 'fontFamily'); bind('font-scale', 'fontScale', 'input', Number); bind('font-weight', 'fontWeight', 'input', Number);
bind('logo-fit', 'logoFit'); bind('logo-x', 'logoX', 'input', Number); bind('logo-y', 'logoY', 'input', Number);

for (const id of ['funny-en', 'funny-yue']) {
  const control = document.getElementById(id); const output = control?.parentElement.querySelector('output');
  if (control && output) { output.value = control.value; control.addEventListener('input', () => output.value = control.value); }
}

function enumerateVoices() {
  if (!('speechSynthesis' in window)) { document.getElementById('voice-status').textContent = 'Speech synthesis is unavailable in this browser.'; return; }
  const voices = speechSynthesis.getVoices();
  for (const [id, prefix, selected] of [['voice-en', 'en', settings.voiceEn], ['voice-yue', 'zh-HK', settings.voiceYue]]) {
    const select = document.getElementById(id); const old = select.value; select.replaceChildren(new Option('Choose automatically', ''));
    voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix.toLowerCase())).forEach((voice) => select.add(new Option(`${voice.name} · ${voice.lang}${voice.localService ? '' : ' · network-backed'}`, voice.voiceURI)));
    select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
    if (selected && !select.value) select.add(new Option(`Selected voice is not installed (${selected})`, selected, true, true));
    if (!selected && old) select.value = old;
  }
  document.getElementById('voice-status').textContent = voices.length ? `${voices.length} browser voice${voices.length === 1 ? '' : 's'} detected. Each language picker lists only matching voices.` : 'Voice enumeration returned empty; waiting for the browser voice list to arrive.';
}
enumerateVoices(); if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', enumerateVoices);
document.getElementById('test-narrator').addEventListener('click', () => {
  if (!settings.narratorEnabled) return notify('Narrator is off', 'Enable narration before testing the selected voices.');
  if (!('speechSynthesis' in window)) return notify('Narrator unavailable', 'This browser does not expose speech synthesis.', 'error');
  speechSynthesis.cancel();
  const parts = settings.narratorLanguage === 'both'
    ? [['The site narrator is ready.', 'en', settings.voiceEn], ['網站朗讀功能已準備好。', 'zh-HK', settings.voiceYue]]
    : settings.narratorLanguage === 'yue'
      ? [['網站朗讀功能已準備好。', 'zh-HK', settings.voiceYue]]
      : [['The site narrator is ready.', 'en', settings.voiceEn]];
  const voices = speechSynthesis.getVoices();
  for (const [text, lang, uri] of parts) {
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = lang; utterance.rate = settings.narratorRate; utterance.pitch = settings.narratorPitch;
    utterance.voice = voices.find((voice) => voice.voiceURI === uri) || null; speechSynthesis.speak(utterance);
  }
});

document.getElementById('vocabulary-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const status = document.getElementById('vocabulary-status');
  if (file.size > 65536) { status.textContent = 'Rejected: file exceeds the 64 KiB local limit.'; return; }
  try {
    const text = await file.text();
    if (/"(?:__proto__|prototype|constructor)"\s*:/.test(text)) throw new Error('unsafe object key');
    const parsed = JSON.parse(text);
    if (parsed.version !== 1 || !parsed.replacements || typeof parsed.replacements !== 'object' || Array.isArray(parsed.replacements)) throw new Error('expected version 1 and a replacements object');
    const entries = Object.entries(parsed.replacements);
    if (entries.length > 200 || entries.some(([key, value]) => typeof value !== 'string' || key.length > 100 || value.length > 200)) throw new Error('entry count or string bounds exceeded');
    settings.vocabulary = parsed; saveSettings(); status.textContent = `${entries.length} local replacement${entries.length === 1 ? '' : 's'} validated and loaded. File name and contents are omitted from exports.`; addHistory('imported', 'Personal vocabulary loaded');
  } catch (error) { status.textContent = `Rejected without partial application: ${error.message}.`; }
});
document.getElementById('clear-vocabulary').addEventListener('click', () => { settings.vocabulary = null; saveSettings(); document.getElementById('vocabulary-status').textContent = 'No file loaded. Original site wording is active.'; addHistory('settings changed', 'Personal vocabulary cleared'); });

document.getElementById('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
document.getElementById('schedule-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const days = [...document.getElementById('schedule-days').selectedOptions].map((option) => Number(option.value));
  settings.schedules.push({ id: crypto.randomUUID(), label: document.getElementById('schedule-label').value, startDate: document.getElementById('schedule-start-date').value, endDate: document.getElementById('schedule-end-date').value, startTime: document.getElementById('schedule-start-time').value, endTime: document.getElementById('schedule-end-time').value, days: days.length ? days : [0,1,2,3,4,5,6], theme: document.getElementById('schedule-theme').value, enabled: true });
  saveSettings(); addHistory('created', 'Scheduled setting rule created'); renderSchedules();
});
function renderSchedules() {
  const list = document.getElementById('schedule-list'); list.replaceChildren();
  for (const rule of settings.schedules) {
    const li = document.createElement('li'); li.innerHTML = `<label><input type="checkbox" ${rule.enabled ? 'checked' : ''} /> ${rule.label}</label><span>${rule.startTime}–${rule.endTime} · ${rule.theme} · ${rule.days.length === 7 ? 'every day' : `${rule.days.length} weekday(s)`}</span><button type="button">Remove…</button>`;
    li.querySelector('input').addEventListener('change', (event) => { rule.enabled = event.target.checked; saveSettings(); addHistory('settings changed', `${rule.label} schedule ${rule.enabled ? 'enabled' : 'disabled'}`); });
    li.querySelector('button').addEventListener('click', () => { settings.schedules = settings.schedules.filter((item) => item.id !== rule.id); saveSettings(); addHistory('deleted', `${rule.label} schedule deleted`); renderSchedules(); }); list.append(li);
  }
}
renderSchedules();
function scheduleMatches(rule, now) {
  if (!rule.enabled || !rule.days.includes(now.getDay())) return false;
  const date = now.toISOString().slice(0, 10); if (rule.startDate && date < rule.startDate) return false; if (rule.endDate && date > rule.endDate) return false;
  const minutes = now.getHours() * 60 + now.getMinutes(); const [startH,startM] = rule.startTime.split(':').map(Number); const [endH,endM] = rule.endTime.split(':').map(Number);
  const start = startH * 60 + startM; const end = endH * 60 + endM; return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
function applySchedules() { const matched = settings.schedules.filter((rule) => scheduleMatches(rule, new Date())); const active = matched.at(-1); if (active) { if (active.theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = active.theme; document.documentElement.dataset.scheduled = active.id; } else delete document.documentElement.dataset.scheduled; }
applySchedules(); setInterval(applySchedules, 60000);

document.getElementById('accent-text').addEventListener('change', (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) { settings.accent = event.target.value; saveSettings(); applyAppearance(); } else notify('Invalid colour', 'Use six hexadecimal digits after #.', 'error'); });
document.querySelectorAll('input[name="logo"]').forEach((radio) => { radio.checked = radio.value === settings.logo; radio.addEventListener('change', () => { settings.logo = radio.value; settings.customLogo = ''; saveSettings(); renderLogo(); addHistory('settings changed', `Logo preset changed to ${radio.value}`); }); });
function renderLogo() {
  const preview = document.getElementById('logo-preview'); preview.style.objectFit = settings.logoFit; preview.style.objectPosition = `${settings.logoX}% ${settings.logoY}%`;
  preview.replaceChildren();
  if (settings.customLogo) { const image = new Image(); image.src = settings.customLogo; image.alt = 'Custom local logo preview'; preview.append(image); }
  else preview.textContent = ({ cookie: '🍪', oven: '♨', factory: '🏭' })[settings.logo] || '🍪';
}
document.getElementById('logo-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; const status = document.getElementById('logo-status'); if (!file) return;
  if (file.size > 2_000_000) { status.textContent = 'Rejected: custom logo exceeds 2 MB.'; return; }
  if (!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)) { status.textContent = 'Rejected: unsupported image format.'; return; }
  const url = URL.createObjectURL(file); const image = new Image();
  image.onload = () => { if (image.naturalWidth * image.naturalHeight > 16_000_000) { status.textContent = 'Rejected: decoded image exceeds 16 megapixels.'; URL.revokeObjectURL(url); return; } const reader = new FileReader(); reader.onload = () => { settings.customLogo = reader.result; saveSettings(); renderLogo(); status.textContent = `${image.naturalWidth}×${image.naturalHeight} local image validated for site preview. No package identity changed.`; addHistory('imported', 'Custom local logo loaded'); URL.revokeObjectURL(url); }; reader.readAsDataURL(file); };
  image.onerror = () => { status.textContent = 'Rejected: the browser could not decode this image.'; URL.revokeObjectURL(url); }; image.src = url;
});
document.getElementById('reset-logo').addEventListener('click', () => { settings.logo = 'cookie'; settings.customLogo = ''; saveSettings(); renderLogo(); addHistory('settings changed', 'Logo reset to shipped Cookie preset'); });
document.getElementById('export-appearance').addEventListener('click', () => download('material-cookie-clicker-site-appearance.json', 'application/json', JSON.stringify({ version: 1, theme: settings.theme, density: settings.density, accent: settings.accent, fontFamily: settings.fontFamily, fontScale: settings.fontScale, fontWeight: settings.fontWeight, logo: settings.logo, privateCustomImageOmitted: Boolean(settings.customLogo) }, null, 2)));
document.getElementById('reset-appearance').addEventListener('click', () => { for (const key of ['theme','density','accent','rainbow','rainbowSpeed','fontFamily','fontScale','fontWeight','logo','customLogo']) settings[key] = defaults[key]; saveSettings(); addHistory('restored', 'Appearance restored to compiled defaults'); location.reload(); });
renderLogo(); applyAppearance();

document.getElementById('lock-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const target = document.getElementById('lock-target').value; const method = document.getElementById('lock-method').value;
  settings.locks.push({ id: crypto.randomUUID(), target, method, duration: document.getElementById('lock-duration').value, createdAt: new Date().toISOString() }); saveSettings(); addHistory('created', `Toy lock created for ${target}`); renderLocks(); notify('Toy lock created', `The ${target} surface now has its own local ${method} configuration. This is not security.`);
});
function renderLocks() { const list = document.getElementById('lock-list'); list.replaceChildren(); for (const lock of settings.locks) { const li = document.createElement('li'); li.innerHTML = `<span>${lock.target} · ${lock.method} · ${lock.duration}</span><button type="button">Remove lock…</button>`; li.querySelector('button').addEventListener('click', () => { settings.locks = settings.locks.filter((item) => item.id !== lock.id); saveSettings(); addHistory('deleted', `Toy lock removed from ${lock.target}`); renderLocks(); }); list.append(li); } }
renderLocks();

document.getElementById('ticket-form').addEventListener('submit', (event) => { event.preventDefault(); const number = `LOCAL-${Date.now().toString(36).toUpperCase()}`; settings.tickets.unshift({ id: crypto.randomUUID(), number, category: document.getElementById('ticket-category').value, description: document.getElementById('ticket-description').value, status: 'Resolved locally', response: 'Open this site’s storage settings and clear its data to reset every toy lock. Nothing was sent.' }); saveSettings(); addHistory('created', `Local support ticket ${number} created`); renderTickets(); event.target.reset(); });
function renderTickets() { const list = document.getElementById('ticket-list'); list.replaceChildren(); for (const ticket of settings.tickets) { const li = document.createElement('li'); li.innerHTML = `<strong>${ticket.number}</strong><span>${ticket.category} · ${ticket.status}</span><p>${ticket.response}</p><button type="button">Copy reset route</button>`; li.querySelector('button').addEventListener('click', () => navigator.clipboard?.writeText('Open browser site settings for this origin and clear stored data.')); list.append(li); } }
renderTickets();

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const char of value.toUpperCase().replace(/[\s=-]/g, '')) { const at = alphabet.indexOf(char); if (at < 0) throw new Error('Secret is not valid Base32.'); bits += at.toString(2).padStart(5, '0'); }
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out);
}
async function totp(entry, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / entry.period) + offset; const message = new Uint8Array(8); let value = BigInt(counter);
  for (let i = 7; i >= 0; i--) { message[i] = Number(value & 255n); value >>= 8n; }
  const key = await crypto.subtle.importKey('raw', base32Decode(entry.secret), { name: 'HMAC', hash: entry.algorithm }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message)); const at = digest[digest.length - 1] & 15;
  const binary = ((digest[at] & 127) << 24) | (digest[at + 1] << 16) | (digest[at + 2] << 8) | digest[at + 3]; return String(binary % 10 ** entry.digits).padStart(entry.digits, '0');
}
document.getElementById('totp-form').addEventListener('submit', (event) => { event.preventDefault(); try { base32Decode(document.getElementById('totp-secret').value); settings.totpEntries.push({ id: crypto.randomUUID(), issuer: document.getElementById('totp-issuer').value, account: document.getElementById('totp-account').value, secret: document.getElementById('totp-secret').value, digits: Number(document.getElementById('totp-digits').value), period: Number(document.getElementById('totp-period').value), algorithm: document.getElementById('totp-algorithm').value }); saveSettings(); addHistory('created', 'Authenticator entry added; secret omitted from history'); renderTotp(); event.target.reset(); } catch (error) { notify('Authenticator entry rejected', error.message, 'error'); } });
async function renderTotp() { const list = document.getElementById('totp-list'); list.replaceChildren(); for (const entry of settings.totpEntries) { const li = document.createElement('li'); const remaining = entry.period - (Math.floor(Date.now() / 1000) % entry.period); let current = 'Unavailable', next = 'Unavailable'; try { current = await totp(entry); next = await totp(entry, 1); } catch {} li.innerHTML = `<strong>${entry.issuer} · ${entry.account}</strong><output class="totp-code">${current}</output><span>${remaining}s remaining · next ${next}</span><button type="button">Remove…</button>`; li.querySelector('button').addEventListener('click', () => { settings.totpEntries = settings.totpEntries.filter((item) => item.id !== entry.id); saveSettings(); addHistory('deleted', 'Authenticator entry removed; secret omitted from history'); renderTotp(); }); list.append(li); } }
renderTotp(); setInterval(renderTotp, 1000);

function renderHistory() { const list = document.getElementById('history-list'); if (!list) return; list.replaceChildren(); for (const item of settings.history) { const li = document.createElement('li'); li.innerHTML = `<label><input type="checkbox" data-history-id="${item.id}" /> ${new Date(item.at).toLocaleString()} · ${item.action} · ${item.label}</label>`; list.append(li); } }
function selectedHistory() { return [...document.querySelectorAll('[data-history-id]:checked')].map((box) => settings.history.find((item) => item.id === box.dataset.historyId)).filter(Boolean); }
document.getElementById('select-all-history').addEventListener('click', () => document.querySelectorAll('[data-history-id]').forEach((box) => box.checked = true));
document.getElementById('invert-history').addEventListener('click', () => document.querySelectorAll('[data-history-id]').forEach((box) => box.checked = !box.checked));
document.getElementById('export-history').addEventListener('click', () => download('material-cookie-clicker-site-history.json', 'application/json', JSON.stringify({ version: 1, encoding: 'UTF-8', entries: selectedHistory(), omitted: ['personal vocabulary contents and metadata', 'authenticator secrets', 'custom logo bytes'] }, null, 2)));
document.getElementById('delete-history').addEventListener('click', () => { const ids = new Set(selectedHistory().map((item) => item.id)); if (!ids.size) return notify('Nothing selected', 'Select one or more history entries first.'); if (!confirm(`Delete ${ids.size} selected local history entries? This browser confirmation is the static-site equivalent; the installed app uses its full destructive-action control.`)) return; settings.history = settings.history.filter((item) => !ids.has(item.id)); saveSettings(); renderHistory(); });
renderHistory();

const ADAPTERS = [
  ['Documents/PDF', 'PDF inspect, split, merge, extract, reorder, rotate and metadata', false, 'Unavailable: the static site bundles no sandboxed PDF engine.'],
  ['Images', 'PNG/JPEG/WebP preview', true, 'Browser decoder; local preview only.'], ['Audio', 'Audio conversion', false, 'Unavailable: no bundled audio adapter.'],
  ['Video', 'Video conversion', false, 'Unavailable: no bundled video adapter.'], ['Archives', 'ZIP/7z', false, 'Unavailable: no bundled archive engine.'],
  ['Structured Data/Spreadsheets', 'CSV/JSON transform', false, 'Unavailable in this site surface; installed-app adapter required.'],
  ['Code/Text', 'UTF-8 text preview', true, 'Browser File API; local preview only.'], ['Binary Encodings', 'Base64 text', true, 'Browser FileReader; bounded to 4 MiB.'],
];
function renderAdapters() { const input = document.getElementById('adapter-search'); const list = document.getElementById('adapter-list'); list.replaceChildren(); for (const [category,name,enabled,reason] of ADAPTERS.filter((row) => matchesInput(input, row.join(' ')))) { const li = document.createElement('li'); li.innerHTML = `<strong>${category} · ${name}</strong><span class="status-chip ${enabled ? 'status-chip--verified' : 'status-chip--waiting'}">${enabled ? 'Available locally' : 'Disabled'}</span><p>${reason}</p>`; list.append(li); } }
document.getElementById('adapter-search').addEventListener('input', renderAdapters); renderAdapters();
let convertFile;
document.getElementById('convert-file').addEventListener('change', (event) => { convertFile = event.target.files[0]; const status = document.getElementById('convert-status'); if (!convertFile) return; const enabled = convertFile.size <= 4_194_304; document.getElementById('convert-base64').disabled = !enabled; status.textContent = enabled ? `${convertFile.name}: ${convertFile.size.toLocaleString()} bytes. Browser MIME claim: ${convertFile.type || 'unknown'}. Ready for bounded Base64 encoding.` : `${convertFile.name} exceeds the 4 MiB browser-surface bound; no conversion will run.`; });
document.getElementById('convert-base64').addEventListener('click', () => { if (!convertFile) return; const reader = new FileReader(); const cancel = document.getElementById('cancel-conversion'); cancel.disabled = false; cancel.onclick = () => reader.abort(); reader.onprogress = (event) => document.getElementById('convert-status').textContent = `${event.loaded.toLocaleString()} of ${event.total.toLocaleString()} bytes read.`; reader.onload = () => { const base64 = String(reader.result).split(',')[1]; download(`${convertFile.name}.base64.txt`, 'text/plain;charset=utf-8', base64); document.getElementById('convert-status').textContent = `Converted ${convertFile.name} to Base64 text. Source unchanged.`; cancel.disabled = true; addHistory('created', 'Local Base64 conversion completed'); }; reader.onerror = () => { document.getElementById('convert-status').textContent = 'Conversion failed; no output was offered.'; cancel.disabled = true; }; reader.onabort = () => { document.getElementById('convert-status').textContent = 'Conversion cancelled; no output was offered.'; cancel.disabled = true; }; reader.readAsDataURL(convertFile); });

const MODELS = [
  ['Model Store unavailable on this static page', 'The complete official catalogue needs a verified refresh through the installed application.'],
  ['Hardware fit unknown', 'RAM, GPU, VRAM, driver, storage and model metadata are not exposed to this static site. No fit promise is made.'],
  ['Pull cart unavailable', 'The installed application’s local manager can batch pulls without payment. This site cannot call Ollama without explicit cross-origin permission.'],
  ['Saved profile editor', 'Context and temperature controls below are local explanatory values; no process or arbitrary shell command can be launched here.'],
];
function renderModels() { const input = document.getElementById('model-search'); const list = document.getElementById('model-list'); list.replaceChildren(); for (const [title, body] of MODELS.filter((row) => matchesInput(input, row.join(' ')))) { const li = document.createElement('li'); li.innerHTML = `<strong>${title}</strong><p>${body}</p>`; list.append(li); } }
document.getElementById('model-search').addEventListener('input', renderModels); renderModels();

function renderNotifications() { const list = document.getElementById('notification-list'); if (!list) return; list.replaceChildren(); for (const item of settings.notifications) { const li = document.createElement('li'); li.innerHTML = `<strong>${item.title}</strong><span>${new Date(item.at).toLocaleString()}</span><p>${item.body}</p><button type="button">Dismiss</button>`; li.querySelector('button').addEventListener('click', () => { settings.notifications = settings.notifications.filter((entry) => entry.id !== item.id); saveSettings(); renderNotifications(); }); list.append(li); } if (!settings.notifications.length) list.innerHTML = '<li>No saved notifications.</li>'; }
document.getElementById('dismiss-notifications').addEventListener('click', () => { settings.notifications = []; saveSettings(); renderNotifications(); });
document.getElementById('export-notifications').addEventListener('click', () => download('material-cookie-clicker-site-notifications.json', 'application/json', JSON.stringify({ version: 1, notifications: settings.notifications }, null, 2)));
renderNotifications();

const ALL_TABS = [{id:'home',label:'Home',group:'Project'},{id:'features',label:'Feature articles',group:'Project'},{id:'settings',label:'Settings',group:'Control centre'},{id:'status',label:'Status',group:'Control centre'},{id:'tools',label:'Local tools',group:'Control centre'}];
let shellState = readJson(SHELL_KEY, { dock: 'left', pinned: ['home'], closed: [] });
const dock = document.getElementById('dock-edge'); dock.value = shellState.dock; dock.addEventListener('change', () => { shellState.dock = dock.value; localStorage.setItem(SHELL_KEY, JSON.stringify(shellState)); location.reload(); });
for (const id of ['current-strip-search','group-tab-search','group-search','master-tab-search']) document.getElementById(id).addEventListener('input', (event) => { const source = id === 'group-search' ? [...new Set(ALL_TABS.map((tab) => tab.group))] : ALL_TABS.map((tab) => `${tab.label} · ${tab.group} · ${shellState.pinned?.includes(tab.id) ? 'pinned' : 'ordinary'} · ${shellState.closed?.includes(tab.id) ? 'closed' : 'open'}`); const count = source.filter((text) => matchesInput(event.target, text)).length; document.getElementById('tab-search-status').textContent = `${count} ${id.replaceAll('-', ' ')} result${count === 1 ? '' : 's'}.`; });
let preview = [];
document.getElementById('preview-bulk-tabs').addEventListener('click', () => { const input = document.getElementById('bulk-tab-query'); const list = document.getElementById('bulk-tab-preview'); list.replaceChildren(); preview = []; if (!input.value.trim()) { list.innerHTML = '<li>Enter non-empty text before previewing.</li>'; return; } const inverse = document.querySelector('input[name="bulk-mode"]:checked').value === 'not'; const includePinned = document.getElementById('include-pinned').checked; preview = ALL_TABS.filter((tab) => (inverse ? !matchesInput(input, tab.label) : matchesInput(input, tab.label)) && (includePinned || !shellState.pinned?.includes(tab.id))); for (const tab of preview) { const li = document.createElement('li'); li.textContent = `${tab.label} · ${tab.group}${shellState.pinned?.includes(tab.id) ? ' · pinned included explicitly' : ''}`; list.append(li); } document.getElementById('run-bulk-tabs').disabled = !preview.length; });
document.getElementById('run-bulk-tabs').addEventListener('click', () => { shellState.closed = [...new Set([...(shellState.closed || []), ...preview.map((tab) => tab.id)])]; localStorage.setItem(SHELL_KEY, JSON.stringify(shellState)); addHistory('settings changed', `${preview.length} site tabs closed in bulk`); location.reload(); });

document.getElementById('settings-search').addEventListener('input', (event) => { document.querySelectorAll('#settings .setting-card').forEach((card) => card.hidden = !matchesInput(event.target, card.textContent)); });

for (const select of document.querySelectorAll('select')) {
  if (select.dataset.searchEnhanced) continue; select.dataset.searchEnhanced = 'true';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'select-search-button'; button.textContent = 'Search choices…'; button.setAttribute('aria-label', `Search choices for ${select.labels?.[0]?.textContent || select.id}`);
  button.addEventListener('click', () => {
    const dialog = document.createElement('dialog'); dialog.className = 'site-command-palette'; const searchId = `select-search-${select.id}`;
    dialog.innerHTML = `<form method="dialog" class="site-overlay-heading"><strong>Choose ${select.labels?.[0]?.textContent || select.id}</strong><button aria-label="Close choices">×</button></form><div class="site-search-combo"><label for="${searchId}">Search choices</label><input id="${searchId}" type="search" /><button type="button" data-regex-for="${searchId}" aria-label="Open regex builder for choices">.*</button></div><ul class="site-palette-results"></ul>`;
    document.body.append(dialog); const input = dialog.querySelector('input'); const list = dialog.querySelector('ul');
    const render = () => { list.replaceChildren(); for (const option of [...select.options].filter((item) => matchesInput(input, item.textContent))) { const li = document.createElement('li'); const choice = document.createElement('button'); choice.type = 'button'; choice.textContent = option.textContent; choice.disabled = option.disabled; choice.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('change')); dialog.close(); }); li.append(choice); list.append(li); } if (!list.children.length) list.innerHTML = '<li>No choices match.</li>'; };
    input.addEventListener('input', render); dialog.addEventListener('close', () => { dialog.remove(); select.focus(); }); dialog.showModal(); render(); input.focus();
    attachRegexBuilder(dialog.querySelector('[data-regex-for]'));
  });
  select.insertAdjacentElement('afterend', button);
}
applyAppearance();
notify('Control centre ready', 'Settings are stored locally in this browser.');
