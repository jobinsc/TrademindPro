'use client';

import { useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  GroupedAccordionSection,
  GroupedProListFrame,
  GROUPED_LIST_SCROLL,
} from '@/components/ui/GroupedProList';
import { scanTemplatesGroupedForList, type ScanTemplate } from '@/lib/scanner';
import { settingsSummary, readScanSettings, type ScanSettings } from '@/lib/scan-settings';

export function ScanTemplateGroupedList({
  templates,
  selectedId,
  onSelect,
  onOpenSettings,
  getSettings,
  scrollClassName = GROUPED_LIST_SCROLL,
}: {
  templates: ScanTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenSettings: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  getSettings: (templateId: string) => ScanSettings;
  scrollClassName?: string;
}) {
  const groups = scanTemplatesGroupedForList(templates);
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <GroupedProListFrame
      scrollClassName={scrollClassName}
      toolbar={
        <>
          <span className="text-[11px] font-medium text-sky-ink/55">
            {groups.length} groups · click a group to expand
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(new Set(groupIds))}
              className="text-[11px] font-semibold text-sky-deep hover:underline"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="text-[11px] font-semibold text-sky-ink/50 hover:underline"
            >
              Collapse all
            </button>
          </div>
        </>
      }
    >
      {groups.map((g) => (
        <GroupedAccordionSection
          key={g.id}
          title={g.title}
          hint={g.hint}
          count={g.items.length}
          selectedCount={g.items.filter((t) => t.id === selectedId).length}
          expanded={expanded.has(g.id)}
          onToggleExpand={() => toggle(g.id)}
        >
          {g.items.map((t) => {
            const on = selectedId === t.id;
            const summary = settingsSummary(t.id, getSettings(t.id));
            return (
              <li key={t.id} className="flex items-center gap-1 px-2 py-0.5 pl-9">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`min-w-0 flex-1 truncate rounded-md py-1.5 pl-2 pr-2 text-left text-sm transition ${
                    on
                      ? 'bg-[#2563eb] font-medium text-white'
                      : 'text-sky-ink hover:bg-[#2563eb] hover:text-white'
                  }`}
                >
                  {t.name}
                  {summary ? (
                    <span className={`ml-1 text-[11px] ${on ? 'text-white/85' : 'text-sky-deep'}`}>
                      · {summary}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  title={`Settings · ${t.name}`}
                  onClick={(e) => onOpenSettings(t.id, e)}
                  className="shrink-0 rounded-md p-1.5 text-sky-deep hover:bg-sky-soft"
                >
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </GroupedAccordionSection>
      ))}
    </GroupedProListFrame>
  );
}

export function scanSettingsForTemplate(
  templateId: string,
  selectedId: string,
  liveSettings: ScanSettings
): ScanSettings {
  return templateId === selectedId ? liveSettings : readScanSettings(templateId);
}
