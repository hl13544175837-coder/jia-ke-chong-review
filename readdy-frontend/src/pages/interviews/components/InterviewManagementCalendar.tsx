import { CalendarClock, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { interviewLocalDateKey, rowStatus, statusLabel } from '@/features/interviews/workbench';

interface InterviewManagementCalendarProps {
  rows: InterviewManagementRow[];
  onOpenDetails: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const result: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= total; day += 1) result.push(new Date(month.getFullYear(), month.getMonth(), day));
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

function interviewTime(value: string | null) {
  if (!value) return '';
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const date = new Date(hasExplicitZone ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function taskTone(row: InterviewManagementRow) {
  return {
    unassigned: 'border-amber-200 bg-amber-50 text-amber-800',
    scheduled: 'border-primary-200 bg-primary-50 text-primary-800',
    awaiting_feedback: 'border-violet-200 bg-violet-50 text-violet-800',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[rowStatus(row)];
}

export default function InterviewManagementCalendar({ rows, onOpenDetails, onSchedule }: InterviewManagementCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const days = useMemo(() => calendarDays(month), [month]);
  const unassigned = useMemo(() => rows.filter((row) => !row.scheduled_at && rowStatus(row) === 'unassigned'), [rows]);
  const grouped = useMemo(() => rows.reduce<Record<string, InterviewManagementRow[]>>((result, row) => {
    const key = interviewLocalDateKey(row.scheduled_at);
    if (!key) return result;
    (result[key] ||= []).push(row);
    result[key].sort((left, right) => String(left.scheduled_at).localeCompare(String(right.scheduled_at)));
    return result;
  }, {}), [rows]);
  const todayKey = dateKey(today);

  return (
    <div className="space-y-4">
      {unassigned.length > 0 && (
        <section aria-label="待安排面试" className="flex items-center gap-3 overflow-x-auto rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-amber-800"><CalendarClock size={15} />待安排 {unassigned.length}</span>
          <div className="flex items-center gap-2">
            {unassigned.slice(0, 6).map((row) => (
              <button key={`${row.demand_id}-${row.candidate_id}`} type="button" onClick={() => onSchedule(row)} className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-amber-800 transition hover:border-amber-300 hover:bg-amber-100">{row.name_masked} · 安排</button>
            ))}
            {unassigned.length > 6 && <span className="shrink-0 text-xs text-amber-700">另有 {unassigned.length - 6} 位</span>}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-background-200 bg-white p-4 shadow-[0_8px_24px_rgba(36,55,46,0.04)]">
        <header className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-foreground-900">{month.getFullYear()}年{month.getMonth() + 1}月</h3>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded-lg border border-background-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground-600 hover:bg-background-100">今天</button>
            <button type="button" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100"><ChevronRight size={16} /></button>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-7 border-b border-background-100 pb-2">
          {weekDays.map((label) => <div key={label} className="text-center text-[11px] font-medium text-foreground-400">{label}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-background-100 ring-1 ring-background-100">
          {days.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-[112px] bg-background-50/50" />;
            const key = dateKey(day);
            const tasks = grouped[key] || [];
            return (
              <div key={key} className={`min-h-[112px] bg-white p-2 ${key === todayKey ? 'ring-2 ring-inset ring-primary-300' : ''}`}>
                <div className={`mb-1.5 text-[11px] font-medium ${key === todayKey ? 'text-primary-700' : 'text-foreground-400'}`}>{day.getDate()}</div>
                <div className="space-y-1">
                  {tasks.slice(0, 3).map((row) => (
                    <button key={`${row.demand_id}-${row.candidate_id}-${row.assignment_id}`} type="button" onClick={() => onOpenDetails(row)} title={`${row.name_masked} · ${statusLabel(rowStatus(row))}`} className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] transition hover:brightness-95 ${taskTone(row)}`}>
                      <span className="inline-flex items-center gap-1"><Clock3 size={10} />{interviewTime(row.scheduled_at)}</span> {row.name_masked}
                    </button>
                  ))}
                  {tasks.length > 3 && <button type="button" onClick={() => onOpenDetails(tasks[3])} className="w-full text-center text-[10px] text-primary-600">还有 {tasks.length - 3} 场</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
