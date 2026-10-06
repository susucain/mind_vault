import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { Dataset } from '@/types/domain';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/shadcn/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/ui/popover';

const TRIGGER_CLASS =
  'h-9 min-w-44 justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50';

interface DatasetMultiSelectProps {
  datasets: Dataset[];
  value: string[];
  onChange: (value: string[]) => void;
}

/** 检索支持跨资料集，因此这里用多选形态；留空表示全量检索。 */
export function DatasetMultiSelect({ datasets, value, onChange }: DatasetMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          aria-label="选择资料集"
          className={cn(TRIGGER_CLASS, 'flex items-center')}
          role="combobox"
          type="button"
        >
          <span className={cn('truncate', !value.length && 'text-muted-foreground')}>
            {value.length ? `已选 ${value.length} 个资料集` : '全部资料集'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="搜索资料集…" />
          <CommandList>
            <CommandEmpty>没有匹配的资料集</CommandEmpty>
            <CommandItem onSelect={() => onChange([])} value="__all__">
              <Check className={cn('size-4', value.length ? 'opacity-0' : 'opacity-100')} />
              <span>全部资料集</span>
            </CommandItem>
            {datasets.map((dataset) => (
              <CommandItem
                key={dataset.id}
                keywords={[dataset.name]}
                onSelect={() => toggle(dataset.id)}
                value={dataset.id}
              >
                <Check className={cn('size-4', selected.has(dataset.id) ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{dataset.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {dataset.documentCount ?? 0} 份
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
