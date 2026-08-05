import { CheckCircle2, Clock3, UserRound } from 'lucide-react';
import ActionButton from '@/components/ui/ActionButton';
import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { interviewStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import {
  rowStatus,
  statusLabelForRow,
  type InterviewFilterOptions,
  type InterviewFilters,
  type InterviewStatusTab,
} from '@/features/interviews/workbench';
import { buildInterviewRowActions } from '../rowActions';

interface InterviewManagementTableProps {
  rows: InterviewManagementRow[];
  actionRowId: number | null;
  onOpenDetails: (row: InterviewManagementRow) => void;
  onOpenResume: (row: InterviewManagementRow) => void;
  onOpenHistory: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
  onConfirmConducted: (row: InterviewManagementRow) => void;
  onRemind: (row: InterviewManagementRow) => void;
  filters: InterviewFilters;
  filterOptions: InterviewFilterOptions;
  activeTab: InterviewStatusTab;
  onFiltersChange: (filters: InterviewFilters) => void;
  onStatusChange: (status: InterviewStatusTab) => void;
}

type ActionProps = Pick<InterviewManagementTableProps, 'actionRowId' | 'onOpenDetails' | 'onOpenResume' | 'onOpenHistory' | 'onSchedule' | 'onConfirmConducted' | 'onRemind'> & { row: InterviewManagementRow };

function rowKey(row: InterviewManagementRow) {
  return `${row.demand_id}-${row.candidate_id}-${row.assignment_id || 'new'}`;
}

function roundLabel(row: InterviewManagementRow) {
  return row.round_sequence ? `第 ${row.round_sequence} 轮` : '轮次待定';
}

function RowActions({ row, actionRowId, onOpenDetails, onOpenResume, onOpenHistory, onSchedule, onConfirmConducted, onRemind }: ActionProps) {
  const actions = buildInterviewRowActions(row);
  const busy = actionRowId === row.assignment_id;
  const menuConfig: Record<(typeof actions.menu)[number], Omit<RowActionItem, 'key'>> = {
    view_details: { label: '查看面试详情', icon: <i className="ri-eye-line" />, onSelect: () => onOpenDetails(row) },
    view_resume: { label: '查看候选人简历', icon: <i className="ri-file-user-line" />, onSelect: () => onOpenResume(row) },
    view_history: { label: '查看面试记录', icon: <i className="ri-history-line" />, onSelect: () => onOpenHistory(row) },
    adjust_schedule: { label: '调整面试安排', icon: <i className="ri-calendar-event-line" />, dividerBefore: true, onSelect: () => onSchedule(row) },
    cancel_schedule: { label: '取消面试', icon: <i className="ri-calendar-close-line" />, tone: 'danger', onSelect: () => onSchedule(row) },
  };
  const menuItems = actions.menu.map((action) => ({ key: action, ...menuConfig[action] }));
  const primary = {
    process_reschedule: <ActionButton size="sm" tone="primary" onClick={() => onOpenDetails(row)}>处理改约</ActionButton>,
    schedule: <ActionButton size="sm" tone="primary" onClick={() => onSchedule(row)}>{row.reschedule_request?.status === 'waiting_reassignment' ? '重新安排' : '安排面试'}</ActionButton>,
    remind_feedback: <ActionButton size="sm" tone="primary" onClick={() => onRemind(row)} disabled={busy}>催反馈</ActionButton>,
    view_feedback: <ActionButton size="sm" tone="secondary" onClick={() => onOpenDetails(row)}>查看反馈</ActionButton>,
    confirm_conducted: <ActionButton size="sm" tone="primary" onClick={() => onConfirmConducted(row)} disabled={busy} icon={<CheckCircle2 size={13} />}>确认已面试</ActionButton>,
    adjust_schedule: <ActionButton size="sm" tone="secondary" onClick={() => onSchedule(row)}>调整安排</ActionButton>,
  }[actions.primary];

  return <>{primary}<RowActionMenu ariaLabel={`打开${row.name_masked}的面试操作`} items={menuItems} /></>;
}

export default function InterviewManagementTable({
  rows,
  actionRowId,
  onOpenDetails,
  onOpenResume,
  onOpenHistory,
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
                    <RowActions row={row} actionRowId={actionRowId} onOpenDetails={onOpenDetails} onOpenResume={onOpenResume} onOpenHistory={onOpenHistory} onSchedule={onSchedule} onConfirmConducted={onConfirmConducted} onRemind={onRemind} />
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
