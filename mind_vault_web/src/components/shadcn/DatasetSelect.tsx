import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { Dataset } from '@/types/domain';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/shadcn/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/ui/select';

/** 触发器与既有 `.input` / `select` 对齐：36px 高、6px 圆角、白底、强调色焦点环。 */
const TRIGGER_CLASS =
  'h-9 w-full justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50';

export interface DatasetSelectProps {
  datasets: Dataset[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 资料集较多时启用：切换为可输入筛选的 Popover + Command 形态 */
  searchable?: boolean;
  /** 供外部 <label htmlFor> 关联与测试定位 */
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/** 文件数量作为次要信息弱化展示，与资料集名称形成层次。 */
function DatasetCount({ dataset }: { dataset: Dataset }) {
  return (
    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
      · {dataset.documentCount ?? 0} 份资料
    </span>
  );
}

export function DatasetSelect({
  datasets,
  value,
  onChange,
  placeholder = '请选择资料集',
  searchable = false,
  id,
  className,
  'aria-label': ariaLabel,
}: DatasetSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = datasets.find((dataset) => dataset.id === value);

  if (!searchable) {
    return (
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger aria-label={ariaLabel} className={cn(TRIGGER_CLASS, className)} id={id}>
          {/* 显式提供子节点，避免把「· N 份资料」一并回显到触发器上 */}
          <SelectValue placeholder={placeholder}>{selected?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {datasets.map((dataset) => (
            <SelectItem key={dataset.id} value={dataset.id}>
              <span className="truncate">{dataset.name}</span>
              <DatasetCount dataset={dataset} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button aria-expanded={open} aria-label={ariaLabel} className={cn(TRIGGER_CLASS, 'flex items-center', className)} id={id} role="combobox" type="button">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="搜索资料集…" />
          <CommandList>
            <CommandEmpty>没有匹配的资料集</CommandEmpty>
            {datasets.map((dataset) => (
              <CommandItem
                key={dataset.id}
                keywords={[dataset.name]}
                onSelect={() => {
                  onChange(dataset.id);
                  setOpen(false);
                }}
                value={dataset.id}
              >
                <Check className={cn('size-4', dataset.id === value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{dataset.name}</span>
                <DatasetCount dataset={dataset} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}