import { Tabs } from '@/components/ui';
import type { RetrievalMode } from '@/types/domain';
import { MODE_TABS } from '../mode-meta';

export function ModeTabs({ value, onChange }: { value: RetrievalMode; onChange: (mode: RetrievalMode) => void }) {
  return (
    <Tabs
      items={MODE_TABS.map((item) => ({ value: item.value, label: item.label }))}
      onChange={(next) => onChange(next as RetrievalMode)}
      value={value}
    />
  );
}
