import { CheckCircle2, Clock3, UserRound } from 'lucide-react';
import ActionButton from '@/components/ui/ActionButton';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { interviewStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { formatInterviewDateTime, interviewHasStarted } from '@/features/interviews/dateTime';
import {
  rowStatus,
  statusLabelForRow,
  type InterviewFilterOptions,
  type InterviewFilters,
  type InterviewStatusTab,
} from '@/features/interviews/workbench';

interface InterviewManagementTableProps {
  rows: InterviewManagementRow[];
  actionRowId: number | null;
  onOpenDetails: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
  onConfirmConducted: (row: InterviewManagementRow) => void;
  onRemind: (row: InterviewManagementRow) => void;
  filters: InterviewFilters;
  filterOptions: InterviewFilterOptions;
  activeTab: InterviewStatusTab;
  onFiltersChange: (filters: InterviewFilters) => void;
  onStatusChange: (status: InterviewStatusTab) => void;
}

type ActionProps = Pick<InterviewManagementTableProps, 'actionRowId' | 'onOpenDetails' | 'onSchedule' | 'onConfirmConducted' | 'onRemind'> & { row: InterviewManagementRow };

function rowKey(row: InterviewManagementRow) {
  return `${row.demand_id}-${row.candidate_id}-${row.assignment_id || 'new'}`;
}

function roundLabel(row: InterviewManagementRow) {
  return row.round_sequence ? `第 ${row.round_sequence} 轮` : '轮次待定';
}

function RowActions({ row, actionRowId, onOpenDetails, onSchedule, onConfirmConducted, onRemind }: ActionProps) {
  const status = rowStatus(row);
  const busy = actionRowId === row.assignment_id;
  if (row.reschedule_request?.status === 'pending') {
    return <ActionButton size="sm" tone="primary" onClick={() => onOpenDetails(row)}>处理改约</ActionButton>;
  }
  if (status === 'unassigned') {
    return <ActionButton size="sm" tone="primary" onClick={() => onSchedule(row)}>{row.reschedule_request?.status === 'waiting_reassignment' ? '重新安排' : '安排面试'}</ActionButton>;
  }
  if (status === 'awaiting_feedback') {
    return <ActionButton size="sm" tone="primary" onClick={() => onRemind(row)} disabled={busy}>催反馈</ActionButton>;
  }
  if (status === 'completed') {
    return <ActionButton size="sm" tone="secondary" onClick={() => onOpenDetails(row)}>查看反馈</ActionButton>;
  }
  if (interviewHasStarted(row.scheduled_at)) {
    return (
      <>
        <ActionButton size="sm" tone="secondary" onClick={() => onSchedule(row)}>调整</ActionButton>
        <ActionButton size="sm" tone="primary" onClick={() => onConfirmConducted(row)} disabled={busy} icon={<CheckCircle2 size={13} />}>确认已面试</ActionButton>
      </>
    );
  }
  return <ActionButton size="sm" tone="secondary" onClick={() => onSchedule(row)}>调整安排</ActionButton>;
}

export default function InterviewManagementTable({
  rows,
  actionRowId,
  onOpenDetails,
  onSchedule,
  onConfirmConducted,
  onRemind,
}: InterviewManagementTableProps) {
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
            return (
              <tr key={key} tabIndex={0} onClick={() => onOpenDetails(row)} onKeyDown={(event) => { if (event.key === 'Enter') onOpenDetails(row); }} className="group h-[66px] cursor-pointer transition hover:bg-primary-50/25 focus-visible:bg-primary-50">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpenDetails(row)} className="flex w-full items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-700 ring-1 ring-primary-100">{row.name_masked.slice(0, 1)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground-900">{row.name_masked}</span><span className="mt-0.5 block truncate text-xs text-foreground-400">{row.job_title} · {row.job_department || '部门未填写'}</span></span>
                  </button>
                </td>
                <td className="px-3 py-3 text-xs text-foreground-600">{roundLabel(row)}</td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-foreground-600"><Clock3 size={13} className="text-foreground-400" />{formatInterviewDateTime(row.scheduled_at)}</span></td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-foreground-600"><UserRound size={13} className="text-foreground-400" />{row.interviewer_name || '面试官待安排'}</span></td>
                <td className="px-3 py-3"><SemanticStatusBadge tone={statusPresentation(interviewStatusPresentation, status, statusLabelForRow(row)).tone}>{statusLabelForRow(row)}</SemanticStatusBadge></td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <RowActions row={row} actionRowId={actionRowId} onOpenDetails={onOpenDetails} onSchedule={onSchedule} onConfirmConducted={onConfirmConducted} onRemind={onRemind} />
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
