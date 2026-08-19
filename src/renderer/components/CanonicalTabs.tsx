import { useMemo, useState, type ReactNode } from 'react';

import {
  createSearchState,
  isVerticalDock,
  matchesSearch,
  resolveKeyboardMove,
  type SearchState,
} from '@material-cookie-clicker/surface-kernel';

import { useAppSettings } from '../game/AppSettingsContext.js';
import { bilingualText } from '../game/copy.js';
import { CanonicalSearch } from './CanonicalSearch.js';

export interface CanonicalPage {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly content: ReactNode;
}

function matchesPage(page: CanonicalPage, search: SearchState): boolean {
  return matchesSearch(`${page.label} ${page.detail}`, search);
}

export function resolveBulkCloseIds(
  pages: readonly CanonicalPage[],
  pinnedIds: readonly string[],
  search: SearchState,
  inverse: boolean,
): string[] {
  const pinned = new Set(pinnedIds);
  return pages
    .filter((page) => !pinned.has(page.id) && (inverse ? !matchesPage(page, search) : matchesPage(page, search)))
    .map((page) => page.id);
}

/** Browser-style persisted application tabs with the four required discovery searches. */
export function CanonicalTabs({ pages }: { readonly pages: readonly CanonicalPage[] }) {
  const { settings, updateSettings } = useAppSettings();
  const [activeId, setActiveId] = useState(() => pages.find((page) => !settings.tabs.closedIds.includes(page.id))?.id ?? pages[0]?.id ?? '');
  const [stripSearch, setStripSearch] = useState(() => createSearchState());
  const [groupNameSearch, setGroupNameSearch] = useState(() => createSearchState());
  const [masterSearch, setMasterSearch] = useState(() => createSearchState());
  const [closeSearch, setCloseSearch] = useState(() => createSearchState());
  const [newGroupName, setNewGroupName] = useState('');

  const visiblePages = pages.filter((page) => !settings.tabs.closedIds.includes(page.id));
  const groups = Object.entries(settings.tabs.groupNames).map(([id, name]) => ({
    id,
    name,
    accent: settings.tabs.groupAccents[id] ?? '#7a4a1d',
    collapsed: settings.tabs.collapsedGroupIds.includes(id),
  }));
  const active = visiblePages.find((page) => page.id === activeId) ?? visiblePages[0] ?? null;

  const saveTabs = (patch: Partial<typeof settings.tabs>) => updateSettings({ tabs: { ...settings.tabs, ...patch } });
  const pin = (id: string) => {
    const current = new Set(settings.tabs.pinnedIds);
    if (current.has(id)) current.delete(id); else current.add(id);
    saveTabs({ pinnedIds: [...current] });
  };
  const close = (ids: readonly string[]) => {
    const next = [...new Set([...settings.tabs.closedIds, ...ids])];
    saveTabs({ closedIds: next });
    if (ids.includes(activeId)) setActiveId(visiblePages.find((page) => !ids.includes(page.id))?.id ?? '');
  };
  const reopen = (id: string) => saveTabs({ closedIds: settings.tabs.closedIds.filter((item) => item !== id) });
  const movePage = (id: string, delta: -1 | 1) => {
    const current = settings.tabs.orderIds.length > 0 ? [...settings.tabs.orderIds] : pages.map((page) => page.id);
    for (const page of pages) if (!current.includes(page.id)) current.push(page.id);
    const index = current.indexOf(id);
    const target = Math.min(current.length - 1, Math.max(0, index + delta));
    if (index < 0 || target === index) return;
    current.splice(index, 1);
    current.splice(target, 0, id);
    saveTabs({ orderIds: current });
  };

  const ordered = useMemo(() => [...visiblePages].sort((left, right) => {
    const leftPinned = settings.tabs.pinnedIds.includes(left.id);
    const rightPinned = settings.tabs.pinnedIds.includes(right.id);
    const leftOrder = settings.tabs.orderIds.indexOf(left.id);
    const rightOrder = settings.tabs.orderIds.indexOf(right.id);
    const leftIndex = leftOrder === -1 ? pages.indexOf(left) + settings.tabs.orderIds.length : leftOrder;
    const rightIndex = rightOrder === -1 ? pages.indexOf(right) + settings.tabs.orderIds.length : rightOrder;
    return leftPinned === rightPinned ? leftIndex - rightIndex : leftPinned ? -1 : 1;
  }), [pages, settings.tabs.orderIds, settings.tabs.pinnedIds, visiblePages]);

  const keyboardTabs = ordered.map((page, order) => ({
    id: page.id,
    order,
    pinned: settings.tabs.pinnedIds.includes(page.id),
    groupId: settings.tabs.groupById[page.id] ?? null,
    closable: true,
  }));

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name || !active) return;
    const id = `group-${Date.now().toString(36)}`;
    saveTabs({
      groupNames: { ...settings.tabs.groupNames, [id]: name.slice(0, 80) },
      groupAccents: { ...settings.tabs.groupAccents, [id]: '#7a4a1d' },
      groupById: { ...settings.tabs.groupById, [active.id]: id },
    });
    setNewGroupName('');
  };

  const bulkIds = closeSearch.query || closeSearch.pattern
    ? resolveBulkCloseIds(visiblePages, settings.tabs.pinnedIds, closeSearch, false)
    : [];
  const inverseBulkIds = closeSearch.query || closeSearch.pattern
    ? resolveBulkCloseIds(visiblePages, settings.tabs.pinnedIds, closeSearch, true)
    : [];

  return (
    <div className={`canonical-tabs canonical-tabs--${settings.tabs.dock}`}>
      <aside className="canonical-tabs__rail">
        <div className="canonical-tabs__dock" role="group" aria-label="Tab strip position">
          {(['left', 'top', 'right', 'bottom'] as const).map((dock) => (
            <button key={dock} type="button" aria-pressed={settings.tabs.dock === dock} onClick={() => saveTabs({ dock })}>{dock}</button>
          ))}
        </div>
        <CanonicalSearch label={bilingualText({ en: 'Search this tab strip', yue: '搜尋呢條分頁列' })} state={stripSearch} onChange={setStripSearch} />
        <div
          className="canonical-tabs__list"
          role="tablist"
          aria-label="Application tools"
          aria-orientation={isVerticalDock(settings.tabs.dock) ? 'vertical' : 'horizontal'}
          onKeyDown={(event) => {
            const next = resolveKeyboardMove(keyboardTabs, active?.id ?? '', event.key, settings.tabs.dock);
            if (next) { event.preventDefault(); setActiveId(next); }
          }}
        >
          {ordered.filter((page) => matchesPage(page, stripSearch)).map((page) => {
            const selected = page.id === active?.id;
            const group = settings.tabs.groupById[page.id];
            if (group && settings.tabs.collapsedGroupIds.includes(group) && !selected) return null;
            return (
              <div className="canonical-tab" key={page.id} data-pinned={settings.tabs.pinnedIds.includes(page.id)}>
                <button
                  type="button"
                  role="tab"
                  id={`canonical-tab-${page.id}`}
                  aria-selected={selected}
                  aria-controls={`canonical-panel-${page.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(page.id)}
                >
                  {page.label}
                </button>
                <button type="button" aria-label={`${settings.tabs.pinnedIds.includes(page.id) ? 'Unpin' : 'Pin'} ${page.label}`} onClick={() => pin(page.id)}>
                  {settings.tabs.pinnedIds.includes(page.id) ? bilingualText({ en: 'Unpin', yue: '解除釘住' }) : bilingualText({ en: 'Pin', yue: '釘住' })}
                </button>
                <button type="button" aria-label={`Move ${page.label} earlier`} onClick={() => movePage(page.id, -1)}>↑</button>
                <button type="button" aria-label={`Move ${page.label} later`} onClick={() => movePage(page.id, 1)}>↓</button>
                {!settings.tabs.pinnedIds.includes(page.id) ? <button type="button" aria-label={`Close ${page.label}`} onClick={() => close([page.id])}>{bilingualText({ en: 'Close', yue: '關閉' })}</button> : null}
              </div>
            );
          })}
        </div>
        {settings.tabs.closedIds.length > 0 ? (
          <details>
            <summary>{bilingualText({ en: `Closed tabs (${settings.tabs.closedIds.length})`, yue: `已關閉分頁（${settings.tabs.closedIds.length}）` })}</summary>
            {settings.tabs.closedIds.map((id) => <button key={id} type="button" onClick={() => reopen(id)}>Reopen {pages.find((page) => page.id === id)?.label ?? id}</button>)}
          </details>
        ) : null}
        <details>
          <summary>{bilingualText({ en: `All open tabs (${ordered.length})`, yue: `所有開啟分頁（${ordered.length}）` })}</summary>
          {ordered.map((page) => <button key={page.id} type="button" onClick={() => setActiveId(page.id)}>{page.label}</button>)}
        </details>
      </aside>

      <section className="canonical-tabs__panel" role="tabpanel" id={`canonical-panel-${active?.id ?? 'empty'}`} aria-labelledby={`canonical-tab-${active?.id ?? 'empty'}`}>
        {active?.content ?? <p>No application tab is open.</p>}
      </section>

      <aside className="canonical-tabs__discovery" aria-label="Tab discovery and management">
        <details>
          <summary>{bilingualText({ en: 'Tab groups', yue: '分頁群組' })}</summary>
          <CanonicalSearch label={bilingualText({ en: 'Search tab groups', yue: '搜尋分頁群組' })} state={groupNameSearch} onChange={setGroupNameSearch} />
          <label>New group name<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} /></label>
          <button type="button" disabled={!newGroupName.trim() || !active} onClick={createGroup}>{bilingualText({ en: 'Create group with active tab', yue: '用目前分頁建立群組' })}</button>
          {groups.filter((group) => matchesSearch(`${group.name} ${group.id}`, groupNameSearch)).map((group) => (
            <div key={group.id} className="canonical-group" style={{ borderColor: group.accent }}>
              <input
                aria-label={`Rename ${group.name}`}
                value={group.name}
                onChange={(event) => saveTabs({ groupNames: { ...settings.tabs.groupNames, [group.id]: event.target.value.slice(0, 80) } })}
              />
              <input
                type="color"
                aria-label={`Colour for ${group.name}`}
                value={group.accent}
                onChange={(event) => saveTabs({ groupAccents: { ...settings.tabs.groupAccents, [group.id]: event.target.value } })}
              />
              <button type="button" aria-expanded={!group.collapsed} onClick={() => saveTabs({ collapsedGroupIds: group.collapsed
                ? settings.tabs.collapsedGroupIds.filter((id) => id !== group.id)
                : [...settings.tabs.collapsedGroupIds, group.id] })}>{group.collapsed ? 'Expand' : 'Collapse'}</button>
              <button type="button" disabled={!active} onClick={() => active && saveTabs({ groupById: { ...settings.tabs.groupById, [active.id]: group.id } })}>
                Move active tab into this group
              </button>
              <button type="button" onClick={() => {
                const groupById = Object.fromEntries(Object.entries(settings.tabs.groupById).filter(([, value]) => value !== group.id));
                const groupNames = { ...settings.tabs.groupNames }; delete groupNames[group.id];
                const groupAccents = { ...settings.tabs.groupAccents }; delete groupAccents[group.id];
                saveTabs({ groupById, groupNames, groupAccents, collapsedGroupIds: settings.tabs.collapsedGroupIds.filter((id) => id !== group.id) });
              }}>Remove group, keep tabs</button>
              <CanonicalGroupSearch
                groupId={group.id}
                groupName={group.name}
                pages={pages.filter((page) => settings.tabs.groupById[page.id] === group.id)}
                onActivate={setActiveId}
              />
            </div>
          ))}
        </details>

        <details>
          <summary>{bilingualText({ en: 'Master tab search', yue: '總分頁搜尋' })}</summary>
          <CanonicalSearch label={bilingualText({ en: 'Search every application tab', yue: '搜尋所有應用程式分頁' })} state={masterSearch} onChange={setMasterSearch} />
          {pages.filter((page) => matchesPage(page, masterSearch)).map((page) => (
            <button key={page.id} type="button" onClick={() => { reopen(page.id); setActiveId(page.id); }}>
              {page.label} · {settings.tabs.groupById[page.id] ? settings.tabs.groupNames[settings.tabs.groupById[page.id]!] : 'Ungrouped'} · {settings.tabs.pinnedIds.includes(page.id) ? 'Pinned' : 'Unpinned'}
            </button>
          ))}
        </details>

        <details>
          <summary>{bilingualText({ en: 'Bulk close tabs', yue: '批量關閉分頁' })}</summary>
          <CanonicalSearch label={bilingualText({ en: 'Match visible tab labels', yue: '配對可見分頁標籤' })} state={closeSearch} onChange={setCloseSearch} />
          <p>{bulkIds.length} containing · {inverseBulkIds.length} not containing · pinned tabs excluded.</p>
          <button type="button" disabled={bulkIds.length === 0} onClick={() => close(bulkIds)}>{bilingualText({ en: 'Close tabs containing text', yue: '關閉包含文字嘅分頁' })}</button>
          <button type="button" disabled={inverseBulkIds.length === 0} onClick={() => close(inverseBulkIds)}>{bilingualText({ en: 'Close tabs not containing text', yue: '關閉唔包含文字嘅分頁' })}</button>
        </details>
      </aside>
    </div>
  );
}

function CanonicalGroupSearch({ groupId, groupName, pages, onActivate }: {
  readonly groupId: string;
  readonly groupName: string;
  readonly pages: readonly CanonicalPage[];
  readonly onActivate: (id: string) => void;
}) {
  const [search, setSearch] = useState(() => createSearchState());
  return (
    <div data-group-search={groupId}>
      <CanonicalSearch label={bilingualText({ en: `Search inside ${groupName}`, yue: `喺 ${groupName} 入面搜尋` })} state={search} onChange={setSearch} />
      {pages.filter((page) => matchesPage(page, search)).map((page) => (
        <button key={page.id} type="button" onClick={() => onActivate(page.id)}>{page.label}</button>
      ))}
    </div>
  );
}
