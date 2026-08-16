/**
 * Tab strip model.
 *
 * Ordering, pinning, grouping, keyboard movement, overflow and bulk close are
 * all pure functions here, so the site and the desktop application present the
 * same behaviour whichever edge the strip is docked to.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type DockEdge = "left" | "top" | "right" | "bottom";

export type TabModel = {
  id: string;
  order: number;
  pinned: boolean;
  groupId: string | null;
  closable: boolean;
};

export type TabGroup = {
  id: string;
  name: string;
  accent: string;
  collapsed: boolean;
};

export type TabsState = {
  tabs: TabModel[];
  groups: TabGroup[];
  activeId: string | null;
};

export type TabsAction =
  | { type: "open"; tab: TabModel }
  | { type: "close"; id: string }
  | { type: "activate"; id: string }
  | { type: "move"; id: string; toIndex: number }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "group"; ids: string[]; group: TabGroup }
  | { type: "ungroup"; ids: string[] }
  | { type: "collapse-group"; groupId: string; collapsed: boolean };

/** Pinned tabs first, then the recorded order. */
export function sortTabs(tabs: readonly TabModel[]): TabModel[] {
  return [...tabs].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return left.order - right.order;
  });
}

function renumber(tabs: readonly TabModel[]): TabModel[] {
  return sortTabs(tabs).map((tab, index) => ({ ...tab, order: index }));
}

/** Moves a tab to an index within its pinned or unpinned section. */
export function moveTab(tabs: readonly TabModel[], id: string, toIndex: number): TabModel[] {
  const ordered = sortTabs(tabs);
  const fromIndex = ordered.findIndex((tab) => tab.id === id);
  if (fromIndex === -1) return renumber(ordered);
  const moving = ordered[fromIndex];
  if (!moving) return renumber(ordered);
  const section = ordered.filter((tab) => tab.pinned === moving.pinned);
  const others = ordered.filter((tab) => tab.pinned !== moving.pinned);
  const sectionIndex = section.findIndex((tab) => tab.id === id);
  section.splice(sectionIndex, 1);
  const target = Math.min(Math.max(toIndex, 0), section.length);
  section.splice(target, 0, moving);
  return renumber(moving.pinned ? [...section, ...others] : [...others, ...section]);
}

/** Pins or unpins a tab and renumbers the strip. */
export function pinTab(tabs: readonly TabModel[], id: string, pinned: boolean): TabModel[] {
  return renumber(tabs.map((tab) => (tab.id === id ? { ...tab, pinned } : tab)));
}

/** Assigns a set of tabs to a group. */
export function groupTabs(state: TabsState, ids: readonly string[], group: TabGroup): TabsState {
  const members = new Set(ids);
  const groups = state.groups.some((existing) => existing.id === group.id)
    ? state.groups.map((existing) => (existing.id === group.id ? group : existing))
    : [...state.groups, group];
  return {
    ...state,
    groups,
    tabs: state.tabs.map((tab) => (members.has(tab.id) ? { ...tab, groupId: group.id } : tab)),
  };
}

/** Pure reducer over the whole strip. */
export function reduceTabs(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open": {
      if (state.tabs.some((tab) => tab.id === action.tab.id)) {
        return { ...state, activeId: action.tab.id };
      }
      return {
        ...state,
        tabs: renumber([...state.tabs, action.tab]),
        activeId: action.tab.id,
      };
    }
    case "close": {
      const target = state.tabs.find((tab) => tab.id === action.id);
      if (!target || !target.closable) return state;
      const remaining = renumber(state.tabs.filter((tab) => tab.id !== action.id));
      const activeId =
        state.activeId === action.id ? (remaining[0]?.id ?? null) : state.activeId;
      return { ...state, tabs: remaining, activeId };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.id) ? { ...state, activeId: action.id } : state;
    case "move":
      return { ...state, tabs: moveTab(state.tabs, action.id, action.toIndex) };
    case "pin":
      return { ...state, tabs: pinTab(state.tabs, action.id, action.pinned) };
    case "group":
      return groupTabs(state, action.ids, action.group);
    case "ungroup": {
      const members = new Set(action.ids);
      return {
        ...state,
        tabs: state.tabs.map((tab) => (members.has(tab.id) ? { ...tab, groupId: null } : tab)),
      };
    }
    case "collapse-group":
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.groupId ? { ...group, collapsed: action.collapsed } : group,
        ),
      };
    default:
      return state;
  }
}

/** A strip docked left or right runs vertically; top or bottom runs across. */
export function isVerticalDock(dock: DockEdge): boolean {
  return dock === "left" || dock === "right";
}

/**
 * Resolves the tab a keyboard move selects. Arrow orientation follows the dock
 * edge, so a vertical strip responds to ArrowUp and ArrowDown.
 */
export function resolveKeyboardMove(
  tabs: readonly TabModel[],
  activeId: string,
  key: string,
  dock: DockEdge,
): string | null {
  const ordered = sortTabs(tabs);
  if (ordered.length === 0) return null;
  const index = ordered.findIndex((tab) => tab.id === activeId);
  if (index === -1) return ordered[0]?.id ?? null;
  const vertical = isVerticalDock(dock);
  const previous = vertical ? "ArrowUp" : "ArrowLeft";
  const next = vertical ? "ArrowDown" : "ArrowRight";
  if (key === "Home") return ordered[0]?.id ?? null;
  if (key === "End") return ordered[ordered.length - 1]?.id ?? null;
  if (key === previous) return ordered[(index - 1 + ordered.length) % ordered.length]?.id ?? null;
  if (key === next) return ordered[(index + 1) % ordered.length]?.id ?? null;
  return null;
}

/**
 * Returns the exact tabs a bulk close would affect, so the confirmation can
 * name them before anything is closed. Pinned and non-closable tabs are
 * excluded.
 */
export function bulkCloseByQuery(
  tabs: readonly TabModel[],
  state: SearchState,
  labelOf: (tab: TabModel) => string = (tab) => tab.id,
): TabModel[] {
  return sortTabs(tabs).filter((tab) => tab.closable && !tab.pinned && matchesSearch(labelOf(tab), state));
}

/** Splits the strip into the visible tabs and the overflow menu contents. */
export function computeOverflow(
  tabs: readonly TabModel[],
  visibleCount: number,
): { visible: TabModel[]; overflow: TabModel[] } {
  const ordered = sortTabs(tabs);
  if (visibleCount >= ordered.length) return { visible: ordered, overflow: [] };
  const limit = Math.max(0, visibleCount);
  return { visible: ordered.slice(0, limit), overflow: ordered.slice(limit) };
}
