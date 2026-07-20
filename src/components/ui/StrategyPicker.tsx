'use client';

import { useMemo, useState } from 'react';
import {
  GroupedAccordionSection,
  GroupedOnOffRow,
  GroupedProListFrame,
  GroupedSelectRow,
  GROUPED_LIST_COMPACT_SCROLL,
  GROUPED_LIST_SCROLL,
} from '@/components/ui/GroupedProList';
import {
  strategiesGroupedForPicker,
  strategyIdsByGroup,
  type CatalogStrategyId,
} from '@/lib/strategy-catalog';

const selectClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export const DEFAULT_STRATEGY_PICK = 'price_action_hhll' as CatalogStrategyId;

/** Turn strategies OFF — always removes requested ids; keeps global min outside that set */
export function applyStrategyOff(
  selected: CatalogStrategyId[],
  idsToRemove: CatalogStrategyId[],
  allCatalogIds: CatalogStrategyId[],
  globalMin = 1
): CatalogStrategyId[] {
  const remove = new Set(idsToRemove);
  const next = selected.filter((id) => !remove.has(id));
  if (next.length >= globalMin) return next;
  if (globalMin <= 0) return next;

  const outside = allCatalogIds.filter((id) => !remove.has(id));
  if (!outside.length) {
    return [allCatalogIds[0] ?? DEFAULT_STRATEGY_PICK];
  }
  const keep = outside.find((id) => selected.includes(id)) ?? outside[0];
  return [keep];
}

/** Batch ON/OFF — one state update for whole group or catalog */
export function applyStrategySelectionBatch(
  selected: CatalogStrategyId[],
  ids: CatalogStrategyId[],
  active: boolean,
  minSelected = 1,
  allCatalogIds?: CatalogStrategyId[]
): CatalogStrategyId[] | null {
  if (active) {
    return [...new Set([...selected, ...ids])];
  }
  const catalog = allCatalogIds?.length ? allCatalogIds : selected;
  return applyStrategyOff(selected, ids, catalog, minSelected);
}

type SelectProps = {
  value: string;
  onChange: (id: CatalogStrategyId | string) => void;
  className?: string;
  nejoicOnly?: boolean;
  executableOnly?: boolean;
  valueField?: 'id' | 'name';
  includeJournalExtras?: boolean;
  extraOptgroups?: { label: string; options: { id: string; name: string }[] }[];
};

export function StrategyGroupedSelect({
  value,
  onChange,
  className = selectClass,
  nejoicOnly = true,
  executableOnly = false,
  valueField = 'id',
  includeJournalExtras = false,
  extraOptgroups = [],
}: SelectProps) {
  const groups = strategiesGroupedForPicker({ nejoicOnly, executableOnly });
  const journalExtras = includeJournalExtras
    ? [{ label: 'Other', options: [{ id: 'Options Premium', name: 'Options Premium' }, { id: 'Other', name: 'Other' }] }]
    : [];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.title}>
          {g.items.map((s) => (
            <option key={s.id} value={valueField === 'name' ? s.name : s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
      {[...journalExtras, ...extraOptgroups].map((og) => (
        <optgroup key={og.label} label={og.label}>
          {og.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

type MultiOnOffProps = {
  selected: CatalogStrategyId[];
  onChangeSelected: (ids: CatalogStrategyId[]) => void;
  onBlocked?: (message: string) => void;
  scrollClassName?: string;
  nejoicOnly?: boolean;
  executableOnly?: boolean;
  showHint?: boolean;
  minSelected?: number;
};

function useAccordionState(groupIds: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return {
    expanded,
    toggle,
    expandAll: () => setExpanded(new Set(groupIds)),
    collapseAll: () => setExpanded(new Set()),
  };
}

function BatchToolbar({
  label,
  onExpandAll,
  onCollapseAll,
  onAllOn,
  onAllOff,
  allOnActive = false,
  allOffActive = false,
}: {
  label: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onAllOn?: () => void;
  onAllOff?: () => void;
  allOnActive?: boolean;
  allOffActive?: boolean;
}) {
  return (
    <>
      <span className="text-[11px] font-medium text-sky-ink/55">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {onAllOn ? (
          <button
            type="button"
            onClick={onAllOn}
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
              allOnActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            All ON
          </button>
        ) : null}
        {onAllOff ? (
          <button
            type="button"
            onClick={onAllOff}
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
              allOffActive
                ? 'bg-slate-500 text-white hover:bg-slate-600'
                : 'border border-[#cfe0ee] bg-white text-sky-ink/60 hover:bg-sky-soft'
            }`}
          >
            All OFF
          </button>
        ) : null}
        <button type="button" onClick={onExpandAll} className="text-[11px] font-semibold text-sky-deep hover:underline">
          Expand all
        </button>
        <button type="button" onClick={onCollapseAll} className="text-[11px] font-semibold text-sky-ink/50 hover:underline">
          Collapse all
        </button>
      </div>
    </>
  );
}

/** Paper / Nejoic / Telegram — collapsible + ON/OFF + batch All ON/OFF per group */
export function StrategyGroupedMulti({
  selected,
  onChangeSelected,
  onBlocked,
  scrollClassName = GROUPED_LIST_SCROLL,
  nejoicOnly = true,
  executableOnly = false,
  showHint = true,
  minSelected = 1,
}: MultiOnOffProps) {
  const groups = strategiesGroupedForPicker({ nejoicOnly, executableOnly });
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const allIds = useMemo(
    () => groups.flatMap((g) => g.items.map((s) => s.id)),
    [groups]
  );
  const { expanded, toggle, expandAll, collapseAll } = useAccordionState(groupIds);
  const total = allIds.length;

  function applyBatch(ids: CatalogStrategyId[], active: boolean) {
    const next = applyStrategySelectionBatch(selected, ids, active, minSelected, allIds);
    if (!next) {
      onBlocked?.('Keep at least one strategy ON');
      return;
    }
    onChangeSelected(next);
  }

  return (
    <GroupedProListFrame
      scrollClassName={scrollClassName}
      toolbar={
        <BatchToolbar
          label={`${selected.length} ON · ${groups.length} groups · ${total} strategies`}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onAllOn={() => onChangeSelected(allIds)}
          onAllOff={() => applyBatch(allIds, false)}
          allOnActive={selected.length === total}
          allOffActive={minSelected <= 0 ? selected.length === 0 : selected.length <= minSelected}
        />
      }
    >
      {groups.map((g) => {
        const ids = g.items.map((s) => s.id);
        const onCount = g.items.filter((s) => selected.includes(s.id)).length;
        return (
          <GroupedAccordionSection
            key={g.id}
            title={g.title}
            hint={showHint ? g.hint : undefined}
            count={g.items.length}
            selectedCount={onCount}
            expanded={expanded.has(g.id)}
            onToggleExpand={() => toggle(g.id)}
            onAllOn={() => applyBatch(ids, true)}
            onAllOff={() => applyBatch(ids, false)}
            allOnActive={onCount === g.items.length}
            allOffActive={onCount === 0}
          >
            {g.items.map((s) => (
              <GroupedOnOffRow
                key={s.id}
                name={s.name}
                active={selected.includes(s.id)}
                onTurnOn={() => applyBatch([s.id], true)}
                onTurnOff={() => applyBatch([s.id], false)}
              />
            ))}
          </GroupedAccordionSection>
        );
      })}
    </GroupedProListFrame>
  );
}

/** Backtesting multi — full catalog like Strategy Builder + batch group select */
export function StrategyGroupedMultiCompact({
  selected,
  onChangeSelected,
  nejoicOnly = false,
  executableOnly = true,
  minSelected = 1,
}: {
  selected: string[];
  onChangeSelected: (ids: string[]) => void;
  nejoicOnly?: boolean;
  executableOnly?: boolean;
  minSelected?: number;
}) {
  const groups = strategiesGroupedForPicker({ nejoicOnly, executableOnly });
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const allIds = useMemo(
    () => groups.flatMap((g) => g.items.map((s) => s.id)),
    [groups]
  );
  const { expanded, toggle, expandAll, collapseAll } = useAccordionState(groupIds);

  function applyBatch(ids: string[], active: boolean) {
    const next = applyStrategySelectionBatch(
      selected as CatalogStrategyId[],
      ids as CatalogStrategyId[],
      active,
      minSelected,
      allIds as CatalogStrategyId[]
    );
    if (!next) return;
    onChangeSelected(next);
  }

  function toggleOne(id: string) {
    applyBatch([id], !selected.includes(id));
  }

  return (
    <GroupedProListFrame
      scrollClassName={GROUPED_LIST_COMPACT_SCROLL}
      toolbar={
        <BatchToolbar
          label={`${selected.length} selected`}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onAllOn={() => onChangeSelected(allIds)}
          onAllOff={() => applyBatch(allIds, false)}
          allOnActive={selected.length === allIds.length}
          allOffActive={
            minSelected <= 0 ? selected.length === 0 : selected.length <= minSelected
          }
        />
      }
    >
      {groups.map((g) => {
        const ids = g.items.map((s) => s.id);
        const onCount = g.items.filter((s) => selected.includes(s.id)).length;
        return (
          <GroupedAccordionSection
            key={g.id}
            title={g.title}
            hint={g.hint}
            count={g.items.length}
            selectedCount={onCount}
            expanded={expanded.has(g.id)}
            onToggleExpand={() => toggle(g.id)}
            onAllOn={() => applyBatch(ids, true)}
            onAllOff={() => applyBatch(ids, false)}
            allOnActive={onCount === g.items.length}
            allOffActive={onCount === 0}
          >
            {g.items.map((s) => (
              <GroupedSelectRow
                key={s.id}
                name={s.name}
                selected={selected.includes(s.id)}
                onClick={() => toggleOne(s.id)}
              />
            ))}
          </GroupedAccordionSection>
        );
      })}
    </GroupedProListFrame>
  );
}

export const STRATEGY_QUICK_PRESETS = {
  priceAction: { label: 'Price Action only', ids: strategyIdsByGroup('price_action') },
  candlestick: { label: 'Candlestick only', ids: strategyIdsByGroup('candlestick_patterns') },
  smc: { label: 'SMC only', ids: strategyIdsByGroup('smc') },
  longPa: { label: 'Long PA only', ids: ['price_action_hhll'] as CatalogStrategyId[] },
} as const;

export const STRATEGY_CATALOG_PRESETS = {
  priceAction: { label: 'Price Action', ids: strategyIdsByGroup('price_action', { nejoicOnly: false }) },
  candlestick: { label: 'Candlestick', ids: strategyIdsByGroup('candlestick_patterns', { nejoicOnly: false }) },
  smc: { label: 'SMC', ids: strategyIdsByGroup('smc', { nejoicOnly: false }) },
} as const;

/** Strategy Builder — single: dropdown like backtesting; multi: ON/OFF + batch */
export function StrategyGroupedTemplateList({
  pickMode,
  pickedIds,
  onSinglePick,
  onChangePicked,
  scrollClassName = GROUPED_LIST_SCROLL,
}: {
  pickMode: 'single' | 'multi';
  pickedIds: string[];
  onSinglePick: (catalogId: CatalogStrategyId) => void;
  onChangePicked: (ids: CatalogStrategyId[]) => void;
  scrollClassName?: string;
}) {
  const groups = strategiesGroupedForPicker({ nejoicOnly: false });
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const allIds = useMemo(
    () => groups.flatMap((g) => g.items.map((s) => s.id)),
    [groups]
  );
  const { expanded, toggle, expandAll, collapseAll } = useAccordionState(groupIds);

  function applyBatch(ids: CatalogStrategyId[], active: boolean) {
    const next = applyStrategySelectionBatch(
      pickedIds as CatalogStrategyId[],
      ids,
      active,
      0,
      allIds
    );
    if (next) onChangePicked(next);
  }

  if (pickMode === 'single') {
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
          Strategy template
        </span>
        <StrategyGroupedSelect
          value={pickedIds[0] || DEFAULT_STRATEGY_PICK}
          nejoicOnly={false}
          executableOnly={false}
          onChange={(id) => {
            const t = id as CatalogStrategyId;
            onChangePicked([t]);
            onSinglePick(t);
          }}
        />
      </label>
    );
  }

  return (
    <GroupedProListFrame
      scrollClassName={scrollClassName}
      toolbar={
        <BatchToolbar
          label={`${pickedIds.length} selected · full catalog (same as Backtesting)`}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onAllOn={() => onChangePicked(allIds)}
          onAllOff={() => onChangePicked([])}
          allOnActive={pickedIds.length === allIds.length}
          allOffActive={pickedIds.length === 0}
        />
      }
    >
      {groups.map((g) => {
        const ids = g.items.map((s) => s.id);
        const onCount = g.items.filter((s) => pickedIds.includes(s.id)).length;
        return (
          <GroupedAccordionSection
            key={g.id}
            title={g.title}
            hint={g.hint}
            count={g.items.length}
            selectedCount={onCount}
            expanded={expanded.has(g.id)}
            onToggleExpand={() => toggle(g.id)}
            onAllOn={() => applyBatch(ids, true)}
            onAllOff={() => applyBatch(ids, false)}
            allOnActive={onCount === g.items.length}
            allOffActive={onCount === 0}
          >
            {g.items.map((s) => (
              <GroupedOnOffRow
                key={s.id}
                name={s.name}
                active={pickedIds.includes(s.id)}
                onTurnOn={() => applyBatch([s.id], true)}
                onTurnOff={() => applyBatch([s.id], false)}
              />
            ))}
          </GroupedAccordionSection>
        );
      })}
    </GroupedProListFrame>
  );
}
