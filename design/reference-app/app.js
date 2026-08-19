const INVENTORY_URL = new URL('../parity/inventory.json', import.meta.url);

const params = new URLSearchParams(location.search);
const rowSelect = document.querySelector('#row-select');
const routeStatus = document.querySelector('#route-status');
const tupleNode = document.querySelector('#tuple');
const canonicalLink = document.querySelector('#canonical-link');
const referencePath = document.querySelector('#reference-path');
const viewportShell = document.querySelector('#viewport-shell');
const frame = document.querySelector('#reference-frame');

const inventory = await fetch(INVENTORY_URL).then((response) => {
  if (!response.ok) throw new Error(`Inventory request failed with ${response.status}`);
  return response.json();
});

for (const row of inventory.rows) {
  const option = document.createElement('option');
  option.value = row.id;
  option.textContent = `${row.id} — ${row.screen}`;
  rowSelect.append(option);
}

const requestedId = params.get('row') ?? inventory.rows[0].id;
const row = inventory.rows.find((candidate) => candidate.id === requestedId);
if (!row) {
  routeStatus.textContent = `Unknown inventory row: ${requestedId}`;
  routeStatus.setAttribute('data-state', 'error');
  throw new Error(`Unknown inventory row: ${requestedId}`);
}

const tupleKeys = ['theme', 'width', 'height', 'scale', 'state', 'locale'];
const canonical = new URL(row.reference.route, location.origin);
const mismatches = tupleKeys.flatMap((key) => {
  const expected = canonical.searchParams.get(key);
  const actual = params.get(key) ?? expected;
  return actual === expected ? [] : [`${key}: expected ${expected}, received ${actual}`];
});

document.body.dataset.capture = String(params.get('capture') === '1');
rowSelect.value = row.id;
rowSelect.addEventListener('change', () => {
  const next = inventory.rows.find((candidate) => candidate.id === rowSelect.value);
  location.assign(next.reference.route);
});

canonicalLink.href = row.reference.route;
referencePath.textContent = row.reference.file;

const tupleEntries = [
  ['Screen', row.tuple.screen],
  ['State', row.tuple.state],
  ['Theme', row.tuple.theme],
  ['Viewport', `${row.tuple.viewport.width} × ${row.tuple.viewport.height} CSS px`],
  ['Scale', String(row.tuple.scale)],
  ['Locale', row.tuple.locale],
  ['Declared states', row.declaredStates.join(', ')],
];
for (const [key, value] of tupleEntries) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = key;
  detail.textContent = value;
  wrapper.append(term, detail);
  tupleNode.append(wrapper);
}

if (mismatches.length > 0) {
  routeStatus.textContent = `Route refused: ${mismatches.join('; ')}`;
  routeStatus.setAttribute('data-state', 'error');
  throw new Error(routeStatus.textContent);
}

if (window.devicePixelRatio !== row.tuple.scale) {
  routeStatus.textContent = `Capture blocked: device scale is ${window.devicePixelRatio}; route requires ${row.tuple.scale}`;
  routeStatus.setAttribute('data-state', 'error');
} else {
  routeStatus.textContent = 'Tuple accepted · evidence still requires capture receipts';
  routeStatus.setAttribute('data-state', 'ready');
}

viewportShell.style.width = `${row.tuple.viewport.width}px`;
viewportShell.style.height = `${row.tuple.viewport.height}px`;
frame.width = String(row.tuple.viewport.width);
frame.height = String(row.tuple.viewport.height);
frame.src = new URL(`../${row.reference.file}`, import.meta.url).href;

frame.addEventListener('load', () => {
  const referenceWindow = frame.contentWindow;
  const referenceDocument = frame.contentDocument;
  if (!referenceWindow || !referenceDocument) throw new Error('Reference frame did not expose a same-origin document');

  referenceDocument.documentElement.lang = row.tuple.locale;
  referenceDocument.body.dataset.scheme = row.tuple.theme;
  referenceDocument.body.dataset.designParityState = row.tuple.state;

  let randomState = row.deterministic.randomSeed >>> 0;
  referenceWindow.Math.random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  const fixedTime = Date.parse(row.deterministic.time);
  const NativeDate = referenceWindow.Date;
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedTime]));
    }
    static now() { return fixedTime; }
  }
  Object.setPrototypeOf(FixedDate, NativeDate);
  referenceWindow.Date = FixedDate;

  const freeze = referenceDocument.createElement('style');
  freeze.id = 'design-parity-determinism';
  freeze.textContent = `
    *, *::before, *::after {
      animation-play-state: paused !important;
      caret-color: transparent !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  `;
  referenceDocument.head.append(freeze);
  referenceWindow.scrollTo(0, 0);
});
