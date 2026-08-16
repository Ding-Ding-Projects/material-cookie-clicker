import { useCallback, useState } from 'react';

export interface Selection {
  readonly ids: ReadonlySet<string>;
  readonly has: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly selectAll: (ids: readonly string[]) => void;
  readonly clear: () => void;
}

/** Multi-select bookkeeping shared by every bulk-action list (Generators/Upgrades/Achievements). */
export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds: readonly string[]) => {
    setIds(new Set(allIds));
  }, []);

  const clear = useCallback(() => setIds(new Set()), []);

  const has = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, has, toggle, selectAll, clear };
}
