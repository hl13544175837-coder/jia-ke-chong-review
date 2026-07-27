import { CheckCircle2, Clock3, MoreHorizontal, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { formatInterviewDateTime, interviewHasStarted } from '@/features/interviews/dateTime';
import { rowStatus, statusLabel } from '../workbench';

interface InterviewManagementTableProps {
  rows: InterviewManagementRow[];
  actionRowId: number | null;
  onOpenDetails: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
  onConfirmConducted: (row: InterviewManagementRow) => void;
  onRemind: (row: InterviewManagementRow) => void;
}

type ActionProps = Omit<InterviewManagementTableProps, 'rows'> & { row: InterviewManagementRow };

function rowKey(row: InterviewManagementRow) {
  return `${row.demand_id}-${row.candidate_id}-${row.assignment_id || 'new'}`;
}

function roundLabel(row: InterviewManagementRow) {
  return row.round_sequence ? `第 ${row.round_sequence} 轮` : '轮次待定';
}

function statusTone(row: InterviewManagementRow) {
  const status = rowStatus(row);
  return {
    unassigned: 'bg-amber-50 text-amber-700 ring-amber-200',
    scheduled: 'bg-primary-50 text-primary-700 ring-primary-200',
    awaiting_feedback: 'bg-violet-50 text-violet-700 ring-violet-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }[status];
}

const primaryActionClass = 'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-primary-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryActionClass = 'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50';

function RowActions({ row, actionRowId, onOpenDetails, onSchedule, onConfirmConducted, onRemind }: ActionProps) {
  const status = rowStatus(row);
  const busy = actionRowId === row.assignment_id;
  if (status === 'unassigned') {
    return <button type="button" onClick={() => onSchedule(row)} className={primaryActionClass}>安排面试</button>;
  }
  if (status === 'awaiting_feedback') {
    return <button type="button" onClick={() => onRemind(row)} disabled={busy} className={primaryActionClass}>催反馈</button>;
  }
  if (status === 'completed') {
    return <button type="button" onClick={() => onOpenDetails(row)} className={secondaryActionClass}>查看反馈</button>;
  }
  if (interviewHasStarted(row.scheduled_at)) {
    return (
      <>
        <button type="button" onClick={() => onSchedule(row)} className={secondaryActionClass}>调整</button>
        <button type="button" onClick={() => onConfirmConducted(row)} disabled={busy} className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground-900 px-3 text-xs font-semibold text-white transition hover:bg-foreground-800 disabled:opacity-50"><CheckCircle2 size={13} />确认已面试</button>
      </>
    );
  }
  return <button type="button" onClick={() => onSchedule(row)} className={secondaryActionClass}>调整安排</button>;
}

export default function InterviewManagementTable({
  rows,
  actionRowId,
  onOpenDetails,
  onSchedule,
  onConfirmConducted,
  onRemind,
}: InterviewManagementTableProps) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuKey) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuKey(null);
    };
    const closeOnOutside = (event: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(event.target as Node)) setOpenMenuKey(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOnOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('mousedown', closeOnOutside);
    };
  }, [openMenuKey]);

  return (
    <div className="overflow-x-auto rounded-xl border border-background-200 bg-white shadow-[0_8px_24px_rgba(36,55,46,0.04)]">
      <table className="w-full min-w-[980px] table-fixed">
        <thead className="bg-background-50/80">
          <tr className="border-b border-background-200 text-left text-[11px] font-medium text-foreground-400">
            <th className="w-[29%] px-4 py-3">候选人 / 应聘岗位</th>
            <th className="w-[10%] px-3 py-3">轮次</th>
            <th className="w-[17%] px-3 py-3">面试安排</th>
            <th className="w-[14%] px-3 py-3">面试官</th>
            <th className="w-[10%] px-3 py-3">状态</th>
            <th className="w-[20%] px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-100">
          {rows.map((row) => {
            const status = rowStatus(row);
            const key = rowKey(row);
            const menuOpen = openMenuKey === key;
            return (
              <tr key={key} className="group h-[66px] transition hover:bg-primary-50/25">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpenDetails(row)} className="flex w-full items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-700 ring-1 ring-primary-100">{row.name_masked.slice(0, 1)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground-900">{row.name_masked}</span><span className="mt-0.5 block truncate text-xs text-foreground-400">{row.job_title} · {row.job_department || '部门未填写'}</span></span>
                  </button>
                </td>
                <td className="px-3 py-3 text-xs text-foreground-600">{roundLabel(row)}</td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-foreground-600"><Clock3 size={13} className="text-foreground-400" />{formatInterviewDateTime(row.scheduled_at)}</span></td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-foreground-600"><UserRound size={13} className="text-foreground-400" />{row.interviewer_name || '面试官待安排'}</span></td>
                <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${statusTone(row)}`}>{statusLabel(status)}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <RowActions row={row} actionRowId={actionRowId} onOpenDetails={onOpenDetails} onSchedule={onSchedule} onConfirmConducted={onConfirmConducted} onRemind={onRemind} />
                    <div ref={menuOpen ? menuRootRef : undefined} className="relative">
                      <button type="button" aria-label={`${row.name_masked}更多操作`} aria-expanded={menuOpen} onClick={() => setOpenMenuKey(menuOpen ? null : key)} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 transition hover:bg-background-100 hover:text-foreground-700"><MoreHorizontal size={16} /></button>
                      {menuOpen && (
                        <div role="menu" className="absolute right-0 top-9 z-20 w-32 rounded-lg border border-background-200 bg-white p-1 shadow-xl">
                          <button type="button" role="menuitem" onClick={() => { setOpenMenuKey(null); onOpenDetails(row); }} className="w-full rounded-md px-3 py-2 text-left text-xs text-foreground-700 hover:bg-background-100">查看详情</button>
                          {status === 'scheduled' && <button type="button" role="menuitem" onClick={() => { setOpenMenuKey(null); onSchedule(row); }} className="w-full rounded-md px-3 py-2 text-left text-xs text-foreground-700 hover:bg-background-100">调整或取消</button>}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
