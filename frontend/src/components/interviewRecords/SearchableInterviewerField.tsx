import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { InterviewerOption, Role } from '../../types';

const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员',
  interviewer: '面试官',
  manager: '经理',
  admin: '管理员',
};

interface SearchableInterviewerFieldProps {
  label: string;
  options: InterviewerOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  helperText?: ReactNode;
  error?: string;
  disabled?: boolean;
}

function optionLabel(option: InterviewerOption) {
  return [option.name, option.email].filter(Boolean).join(' · ');
}

export function SearchableInterviewerField({
  label,
  options,
  value,
  onChange,
  placeholder = '搜索姓名或邮箱，例如：王杰',
  helperText,
  error,
  disabled = false,
}: SearchableInterviewerFieldProps) {
  const listboxId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = options.find((option) => option.id === value) ?? null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const searchableText = `${option.name} ${option.email}`.toLocaleLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [options, query]);
  const visibleOptions = filteredOptions.slice(0, 8);

  function selectOption(option: InterviewerOption) {
    onChange(option.id);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function clearSelection() {
    onChange(null);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleOptions.length === 0) return;
      setOpen(true);
      setActiveIndex((current) => current < 0
        ? 0
        : Math.min(current + 1, visibleOptions.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleOptions.length === 0) return;
      setOpen(true);
      setActiveIndex((current) => current < 0
        ? visibleOptions.length - 1
        : Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  }

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={open && visibleOptions[activeIndex]
              ? `${listboxId}-option-${visibleOptions[activeIndex].id}`
              : undefined}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error || helperText ? descriptionId : undefined}
            value={query}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => {
              setOpen(true);
              setActiveIndex(-1);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className="h-10 w-full rounded-md border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:bg-surface-soft disabled:text-muted-soft"
          />
        </div>
      </label>

      {selected && (
        <div aria-live="polite" className="mt-2 flex items-center justify-between gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-xs text-success-800">
          <span className="min-w-0 truncate">
            <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            已选择：{optionLabel(selected)}
          </span>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline disabled:opacity-60"
            disabled={disabled}
            title={disabled ? '当前正在处理，暂不能清空面试官' : '清空已选面试官'}
            onClick={clearSelection}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            清空
          </button>
        </div>
      )}

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-hairline bg-canvas p-1 shadow-apple-md"
        >
          {visibleOptions.length === 0 ? (
            <p role="status" aria-live="polite" className="px-3 py-3 text-sm text-muted">没有匹配的面试官账号</p>
          ) : visibleOptions.map((option, index) => (
            <button
              key={option.id}
              id={`${listboxId}-option-${option.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={option.id === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-start justify-between gap-3 rounded px-3 py-2 text-left text-sm ${
                index === activeIndex ? 'bg-surface-soft' : 'hover:bg-surface-soft'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{option.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-soft">{option.email || '未记录邮箱'}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{ROLE_LABEL[option.role] ?? option.role}</span>
            </button>
          ))}
        </div>
      )}

      {error
        ? <p id={descriptionId} role="alert" className="mt-1 text-xs text-danger-600">{error}</p>
        : helperText && <div id={descriptionId} className="mt-1 text-xs text-muted-soft">{helperText}</div>}
    </div>
  );
}
