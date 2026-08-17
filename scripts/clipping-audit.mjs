/**
 * CLIPPING AUDIT HARNESS, not a test and not part of the application.
 *
 * Drives the BUILT `dist/` renderer over the Chrome DevTools Protocol and walks every visible
 * element looking for the five shapes of clipping that a screenshot only shows you by luck:
 *
 *   overflow-x   an element whose content is wider than its own box and which does not scroll
 *   clipped-text a text run cut by `overflow: hidden` with no ellipsis to admit it
 *   escapes      a border box outside the viewport, or outside its nearest clipping ancestor
 *   overlap      two siblings whose rects intersect and which are not a declared overlay
 *   flush-label  a text run whose rect touches its own padding box (< 2px inset)
 *
 * It runs each of three seeded saves at each of three viewports, with every dialog opened, and
 * prints one structured JSON report. Intentional overlays are excluded BY NAME in EXCLUDED
 * below, each with the reason written next to it, so an exclusion is a decision on the record
 * rather than a filter that quietly swallows a real defect.
 *
 * Usage: node scripts/clipping-audit.mjs <port> [outfile]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = process.argv[2] ?? '9741';
const outfile = process.argv[3] ?? 'captures/tmp/clipping/report.json';

/* ----------------------------------------------------------------- CDP plumbing */

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
if (!page.url.includes('material-cookie-clicker-clip')) {
  throw new Error(`wrong worktree on this port: ${page.url}`);
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});
function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
await new Promise((resolve) => socket.addEventListener('open', resolve));

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result?.exceptionDetails) {
    throw new Error(JSON.stringify(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails));
  }
  return res.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(400);
}

async function seed(savePath) {
  const payload = readFileSync(savePath, 'utf8');
  await evaluate(
    `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(payload)}); 'seeded'`,
  );
  await send('Page.reload', { ignoreCache: false });
  await sleep(2200);
}

async function screenshot(path) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(res.result.result.data, 'base64'));
}

/* ------------------------------------------------------------- the in-page audit */

const AUDIT = String.raw`
(() => {
  /* Intentional overlays and deliberate design choices. Each is a decision on the record. */
  const EXCLUDED = [
    ['.toast-stack, .toast-stack *', 'toast stack: a declared overlay layer, by design over the surface'],
    ['.fx-layer, .fx-layer *', 'purchase FX layer: a pointer-events-none decorative overlay'],
    ['.event-stage, .event-stage *', 'random-event stage: a declared overlay the player clicks through'],
    ['.golden-cookie, .golden-cookie *', 'the golden cookie is an overlay on the hero by design'],
    ['.panel-backdrop, .dialog-backdrop', 'modal scrim: covers the surface on purpose'],
    ['.milk-tide, .milk-tide *', 'the milk tide is a decorative band drawn behind the hero'],
    ['.purchase-fx, .purchase-fx *', 'purchase FX: a decorative burst that deliberately flies past the card it came from'],
    ['.cookie-embers, .golden-rays, .cookie-sparkle', 'hero decoration drawn to spill past the cookie on purpose'],
    ['.golden-overlay-wrap, .golden-overlay-wrap *', 'the golden cookie deliberately overlays the hero'],
    ['[data-audit-overlay]', 'explicitly declared overlay'],
  ];
  function excusedBy(el) {
    for (const [sel, why] of EXCLUDED) {
      try { if (el.matches(sel) || el.closest(sel)) return why; } catch (e) { /* bad selector */ }
    }
    return null;
  }

  function describe(el) {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return el.tagName.toLowerCase() + id + cls + (text ? ' «' + text + '»' : '');
  }

  const findings = [];
  function report(kind, el, detail) {
    const why = excusedBy(el);
    findings.push({ kind, el: describe(el), detail, excluded: why });
  }

  /* SVG is drawn geometry: overlapping paths and a viewBox wider than the element are what
     drawing IS, so the whole namespace is out of scope for a layout audit. */
  const all = Array.from(document.querySelectorAll('body *')).filter(
    (el) => el.namespaceURI === 'http://www.w3.org/1999/xhtml',
  );
  const visible = all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  /* Nearest ancestor that actually clips. A position:fixed element is not clipped by an
     ordinary ancestor's overflow at all, so the walk stops the moment it crosses one — treating
     the scrim or a fixed panel as "escaping" its DOM parent is an artefact of the walk, not a
     defect on the screen. */
  function clipper(el) {
    if (getComputedStyle(el).position === 'fixed') return null;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed') return null;
      if (/hidden|clip|scroll|auto/.test(cs.overflowX + cs.overflowY)) return p;
      p = p.parentElement;
    }
    return null;
  }

  for (const el of visible) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    /* (a) horizontal overflow on a box that does not scroll.
     *
     * Measured from the REAL CHILDREN, not from scrollWidth. This cabinet decorates almost
     * everything with a drifting ::after sheen inset -60% past its own box, and a pseudo-element
     * counts towards scrollWidth — so scrollWidth reports every lit control in the game as
     * overflowing by a couple of hundred pixels, at a different amount every frame. Children and
     * text runs are what the player can actually see cut. */
    /* text-overflow:ellipsis is the element declaring, in the stylesheet, that it truncates
       and shows the reader that it truncated. That is handled clipping, not silent clipping, and
       the audit's job is the silent kind. */
    if (!/auto|scroll/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.clientWidth > 0) {
      const contentLeft = rect.left + parseFloat(cs.borderLeftWidth);
      const contentRight = rect.right - parseFloat(cs.borderRightWidth);
      let over = 0;
      for (const kid of el.children) {
        if (kid.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
        const kcs = getComputedStyle(kid);
        if (kcs.position === 'absolute' || kcs.position === 'fixed') continue;
        const kr = kid.getBoundingClientRect();
        if (kr.width === 0) continue;
        over = Math.max(over, kr.right - contentRight, contentLeft - kr.left);
      }
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNode(node);
        const trr = range.getBoundingClientRect();
        if (trr.width === 0) continue;
        over = Math.max(over, trr.right - contentRight, contentLeft - trr.left);
      }
      if (over > 2) {
        report('overflow-x', el, 'content runs ' + over.toFixed(1) + 'px past a ' + Math.round(rect.width) + 'px box');
      }
    }

    /* (b) text cut by hidden overflow with no ellipsis to own up to it */
    const ownsText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownsText && /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      report('clipped-text', el, 'text cut at ' + el.clientWidth + 'px, no ellipsis');
    }

    /* (c) border box escapes the viewport or its clipping ancestor */
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (rect.left < -1 || rect.right > vw + 1 || rect.top < -1 || rect.bottom > vh + 1) {
      /* only complain about the OUTERMOST escaper — a child of an escaping box is noise */
      const pr = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
      const parentEscapes = pr && (pr.left < -1 || pr.right > vw + 1 || pr.top < -1 || pr.bottom > vh + 1);
      const scrolls = (() => { let p = el.parentElement; while (p) { const c = getComputedStyle(p); if (/auto|scroll/.test(c.overflowY + c.overflowX)) return true; p = p.parentElement; } return false; })();
      if (!parentEscapes && !scrolls) {
        report('escapes-viewport', el, JSON.stringify({ l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom), vw, vh }));
      }
    }
    const cl = clipper(el);
    if (cl && cl !== el) {
      const cr = cl.getBoundingClientRect();
      const cs2 = getComputedStyle(cl);
      const scrolls = /auto|scroll/.test(cs2.overflowX + cs2.overflowY);
      if (!scrolls && (rect.right > cr.right + 1 || rect.bottom > cr.bottom + 1 || rect.left < cr.left - 1 || rect.top < cr.top - 1)) {
        report('escapes-clipper', el, 'clipped by ' + describe(cl));
      }
      /* A scrolling clipper that cuts a card MID-ROW is still a defect: the visible area must
         end on a row boundary, not through the middle of a control. */
      /* Only a CARD counts: something that starts inside the visible area and is small enough
         relative to the scroller to be one row of content. The scroller's own content wrapper
         always hangs past the bottom edge — that is what scrolling is — and reporting it would
         bury the real finding. */
      const isCard = rect.top >= cr.top - 1 && rect.height <= cr.height * 0.9;
      if (scrolls && isCard && rect.bottom > cr.bottom + 1 && rect.height > 24) {
        const cut = Math.round(rect.bottom - cr.bottom);
        /* A card hanging below a scroller that has PLENTY more to scroll is not a defect: that
         * is a list, and you scroll it. The defect is the NEAR MISS — a container whose whole
         * remaining scroll is less than the card it is slicing, which means the layout came
         * within one row of showing whole rows and stopped mid-card instead. That is what the
         * owner is looking at when a ticket's price is sliced off by the shelf's bottom edge. */
        const slack = cl.scrollHeight - cl.clientHeight - cl.scrollTop;
        if (cut > 2 && cut < rect.height - 2 && slack < rect.height) {
          report('cut-mid-row', el, 'card cut ' + cut + 'px with only ' + Math.round(slack) + 'px of scroll left');
        }
      }
    }
  }

  /* (e) FLUSH LABELS — the DIESEL FACTORY smell.
   *
   * The naive rule ("text rect within 2px of the padding box") fires on every padding-less inline
   * span in the document, which is not a defect: an inline span IS its text, and a text run
   * touching the edge of its own zero-padding box is what inline layout means. What is a defect
   * is a text run with no breathing room inside a control that DRAWS A BOX around it — a cap, a
   * plate, a badge, a button — because there the edge is a visible border the letters are
   * crowding.
   *
   * So the rule is narrowed to boxes that are visually bounded (a button, or an element with a
   * real border or its own background) and that CONSTRAIN their text (nowrap, or hidden
   * overflow). Inside one of those, the text is flush when it fills the content box to within
   * 2px on either side — which also catches the case where it is wider and being cut. */
  for (const el of visible) {
    const cs = getComputedStyle(el);
    const constrains = cs.whiteSpace === 'nowrap' || /hidden|clip/.test(cs.overflowX);
    if (!constrains) continue;
    const bordered =
      parseFloat(cs.borderLeftWidth) > 0 ||
      parseFloat(cs.borderRightWidth) > 0 ||
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
      cs.backgroundImage !== 'none';
    const isControl = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
    if (!bordered && !isControl) continue;
    if (!(el.textContent || '').trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    if (tr.width === 0) continue;
    /* Only a SINGLE-LINE run. A wrapped paragraph's range spans the full content width by
       definition, which is not a label crowding its own edge. */
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    if (tr.height > lh * 1.6) continue;
    const r = el.getBoundingClientRect();
    const padLeft = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const padRight = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const insetL = tr.left - padLeft;
    const insetR = padRight - tr.right;
    /* BOTH sides, or neither. A left-aligned run sitting on its own left padding edge with 400px
       of room to its right is alignment, not crowding; a run pressed against both edges has
       nowhere left to go and is the DIESEL FACTORY shape. */
    if (insetL < 2 && insetR < 2) {
      report('flush-label', el, 'text inset L ' + insetL.toFixed(1) + ' R ' + insetR.toFixed(1) + 'px in a ' + Math.round(r.width) + 'px box');
    }
  }

  /* (d) overlapping siblings */
  const seen = new Set();
  for (const el of visible) {
    const kids = Array.from(el.children).filter((k) => visible.includes(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 4 && oy > 4) {
          const key = describe(kids[i]) + '|' + describe(kids[j]);
          if (seen.has(key)) continue;
          seen.add(key);
          const why = excusedBy(kids[i]) || excusedBy(kids[j]);
          findings.push({ kind: 'overlap', el: key, detail: Math.round(ox) + 'x' + Math.round(oy) + 'px', excluded: why });
        }
      }
    }
  }

  return findings;
})()
`;

/* ------------------------------------------------------------------ the run plan */

const STATES = [
  ['plain', 'captures/tmp/clipping/plain.json'],
  ['mid', 'captures/tmp/clipping/mid.json'],
  ['late', 'captures/tmp/clipping/late.json'],
];
// The two the owner asked for, plus the 1232px width the third screenshot was taken at.
const SIZES = [
  [1440, 900],
  [1232, 860],
  [1000, 720],
];
const DIALOGS = ['factory', 'home', 'achievements', 'tools', 'statistics', 'prestige', 'catalogue', 'settings'];

async function openPanel(id) {
  return evaluate(`(() => {
    const b = document.getElementById('console-${id}');
    if (b) { b.click(); return 'clicked'; }
    return 'not-found';
  })()`);
}
async function closePanel() {
  await evaluate(`(() => { const b = document.querySelector('.anchored-panel__close'); if (b) b.click(); return 1; })()`);
  await sleep(300);
}

const report = [];
for (const [stateName, savePath] of STATES) {
  await seed(savePath);
  for (const [w, h] of SIZES) {
    await setViewport(w, h);
    await sleep(500);
    const base = await evaluate(AUDIT);
    report.push({ state: stateName, size: `${w}x${h}`, view: 'surface', findings: base });
    if (stateName === 'mid') {
      for (const d of DIALOGS) {
        const opened = await openPanel(d);
        await sleep(600);
        if (opened === 'not-found') {
          report.push({ state: stateName, size: `${w}x${h}`, view: `dialog:${d}`, findings: [], note: 'button not present in this state' });
        } else {
          const f = await evaluate(AUDIT);
          report.push({ state: stateName, size: `${w}x${h}`, view: `dialog:${d}`, findings: f });
        }
        await closePanel();
      }
    }
  }
}

/* The narrow shop rail the owner's second screenshot shows: the rail squeezed to a drawer
   width, where the row must still carry its own Buy button. */
await seed('captures/tmp/clipping/mid.json');
for (const railWidth of [400, 360]) {
  await setViewport(1000, 720);
  await evaluate(`(() => { const r = document.querySelector('.shop-rail'); if (!r) return 'no rail'; r.style.width = '${railWidth}px'; r.style.flex = '0 0 ${railWidth}px'; return 'narrowed'; })()`);
  await sleep(400);
  const f = await evaluate(AUDIT);
  const buy = await evaluate(`(() => {
    const row = document.querySelector('.shop-row:not(.shop-row--mystery)');
    if (!row) return { row: false };
    const rr = row.getBoundingClientRect();
    const b = row.querySelector('.buy-btn');
    if (!b) return { row: true, buy: false };
    const br = b.getBoundingClientRect();
    return { row: true, buy: true, inside: br.bottom <= rr.bottom + 1 && br.right <= rr.right + 1, rowH: Math.round(rr.height), buyBottom: Math.round(br.bottom), rowBottom: Math.round(rr.bottom) };
  })()`);
  report.push({ state: 'mid', size: `1000x720 rail@${railWidth}`, view: 'narrow-rail', findings: f, buyButton: buy });
}

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, JSON.stringify(report, null, 2));

const totals = { fired: 0, excluded: 0 };
const byKind = {};
for (const block of report) {
  for (const f of block.findings) {
    if (f.excluded) totals.excluded += 1;
    else {
      totals.fired += 1;
      byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    }
  }
}
console.log(JSON.stringify({ totals, byKind, blocks: report.length }, null, 2));
socket.close();
