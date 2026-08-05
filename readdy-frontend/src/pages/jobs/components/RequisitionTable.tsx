import { useState } from 'react';
import type { ProductRole } from '@/auth/productRoleModel';
import ActionButton from '@/components/ui/ActionButton';
import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { demandStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import type {
  DemandOwnerOption,
  DemandPriority,
  DemandStatus,
  RequisitionRow,
} from '@/features/demands/types';
import {
  demandStatusLabel,
  type DemandSortField,
} from '../workbench';
import { canOpenDemandStage, type DemandStageDrilldown } from '../stageDrilldown';
import { buildDemandRowActions, type DemandMenuAction } from '../rowActions';
import RequisitionActionDialog, { type RequisitionPendingAction } from './RequisitionActionDialog';

interface RequisitionTableProps {
  data: RequisitionRow[];
  role: ProductRole | null;
  owners: DemandOwnerOption[];
  onRowClick: (req: RequisitionTableProps['data'][0]) => void;
  onEditDemand: (req: RequisitionTableProps['data'][0]) => void;
  onStatusChange: (id: string, newStatusCode: DemandStatus, reason: string) => Promise<void>;
  onAdjustPriority: (id: number, priority: DemandPriority, reason: string) => Promise<void>;
  onReassignOwner: (id: number, ownerId: number, reason: string) => Promise<void>;
  onSelectCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onViewCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onStageCountClick: (req: RequisitionTableProps['data'][0], stage: DemandStageDrilldown) => void;
  sortField: DemandSortField;
}

// priority display config
const priorityConfig: Record<string, { label: string; className: string }> = {
  '紧急': { label: '紧急', className: 'bg-accent-100 text-accent-700' },
  '高': { label: '高', className: 'bg-primary-100 text-primary-700' },
  '普通': { label: '普通', className: 'bg-secondary-100 text-secondary-700' },
};

export default function RequisitionTable({
  data,
  role,
  owners,
  onRowClick,
  onEditDemand,
  onStatusChange,
  onAdjustPriority,
  onReassignOwner,
  onSelectCandidates,
  onViewCandidates,
  onStageCountClick,
  sortField,
}: RequisitionTableProps) {
  const [pendingAction, setPendingAction] = useState<RequisitionPendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
        {/* Table */}
        {data.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-line text-2xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500">暂无符合条件的招聘需求</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-200">
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">需求 / 职位</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">部门 / 城市</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">负责人</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">HC / 截止日期</th>
                  <th className="whitespace-nowrap px-5 py-3 text-center text-xs font-medium text-foreground-500">阶段进度</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-medium text-foreground-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {data.map((req) => {
                  const actions = buildDemandRowActions(req, role);
                  const prio = priorityConfig[req.priority] || priorityConfig['普通'];

                  const openStatusAction = (status: DemandStatus, label: string) => {
                    setActionError('');
                    setPendingAction({ kind: 'status', row: req, status, label });
                  };

                  const menuActionConfig: Record<DemandMenuAction, Omit<RowActionItem, 'key'>> = {
                    view: {
                      label: '查看需求详情',
                      icon: <i className="ri-eye-line" />,
                      onSelect: () => onRowClick(req),
                    },
                    edit: {
                      label: '编辑需求',
                      icon: <i className="ri-edit-line" />,
                      onSelect: () => onEditDemand(req),
                    },
                    view_candidates: {
                      label: '查看候选人',
                      icon: <i className="ri-team-line" />,
                      onSelect: () => onViewCandidates(req),
                    },
                    adjust_priority: {
                      label: '调整优先级',
                      icon: <i className="ri-flag-line" />,
                      dividerBefore: true,
                      onSelect: () => {
                        setActionError('');
                        setPendingAction({ kind: 'priority', row: req });
                      },
                    },
                    reassign_owner: {
                      label: '转派负责人',
                      icon: <i className="ri-user-settings-line" />,
                      onSelect: () => {
                        setActionError('');
                        setPendingAction({ kind: 'owner', row: req });
                      },
                    },
                    pause: {
                      label: '暂停招聘',
                      icon: <i className="ri-pause-circle-line" />,
                      tone: 'danger',
                      dividerBefore: true,
                      onSelect: () => openStatusAction('paused', '暂停招聘'),
                    },
                    mark_filled: {
                      label: '标记招聘完成',
                      icon: <i className="ri-checkbox-circle-line" />,
                      dividerBefore: !actions.menu.includes('pause'),
                      onSelect: () => openStatusAction('filled', '招聘完成'),
                    },
                    cancel: {
                      label: '取消需求',
                      icon: <i className="ri-close-circle-line" />,
                      tone: 'danger',
                      dividerBefore: !actions.menu.includes('pause') && !actions.menu.includes('mark_filled'),
                      onSelect: () => openStatusAction('cancelled', '取消需求'),
                    },
                    close: {
                      label: '提前关闭需求',
                      icon: <i className="ri-shut-down-line" />,
                      tone: 'danger',
                      onSelect: () => openStatusAction('closed', '关闭需求'),
                    },
                    restore: {
                      label: '恢复招聘',
                      icon: <i className="ri-restart-line" />,
                      dividerBefore: true,
                      onSelect: () => openStatusAction('active', '恢复招聘'),
                    },
                  };
                  const menuItems = actions.menu.map((action) => ({
                    key: action,
                    ...menuActionConfig[action],
                  }));

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-background-50/50 transition-colors"
                    >
                      <td className="px-5 py-4 cursor-pointer" onClick={() => onRowClick(req)}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground-900 hover:text-primary-600 transition-colors">{req.name}</p>
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${prio.className} whitespace-nowrap`}>
                            {prio.label}
                          </span>
                        </div>
                        {sortField === 'newest' && req.createdAt && (
                          <p className="text-xs text-foreground-400 mt-0.5">{req.createdAt} 发布</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground-600 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        <p>{req.department}</p>
                        <p className="text-xs text-foreground-400 mt-0.5">{req.city}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground-700 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        {req.owner}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        <p className="text-sm text-foreground-800">
                          已入职 {req.filled} / {req.headcount}
                        </p>
                        {req.acceptedOffers > 0 && (
                          <p className="mt-0.5 text-xs text-amber-600">Offer 已接受锁定 {req.acceptedOffers}</p>
                        )}
                        <p className="text-xs text-foreground-400 mt-0.5">
                          {req.deadline || '未记录日期'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 justify-center text-xs">
                          <button
                            type="button"
                            disabled={!canOpenDemandStage(req.stageFeedback)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'feedback');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap disabled:cursor-default disabled:text-foreground-400 disabled:hover:bg-background-100"
                            title={`查看${req.name}的业务筛选候选人`}
                          >
                            <span className={`font-semibold ${canOpenDemandStage(req.stageFeedback) ? 'text-accent-600' : 'text-foreground-300'}`}>{req.stageFeedback}</span>
                            <span className="text-xs">业务筛选中</span>
                          </button>
                          <button
                            type="button"
                            disabled={!canOpenDemandStage(req.stageInterview)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'interview');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap disabled:cursor-default disabled:text-foreground-400 disabled:hover:bg-background-100"
                            title={`查看${req.name}的面试中候选人`}
                          >
                            <span className={`font-semibold ${canOpenDemandStage(req.stageInterview) ? 'text-primary-600' : 'text-foreground-300'}`}>{req.stageInterview}</span>
                            <span className="text-xs">面试中</span>
                          </button>
                          <button
                            type="button"
                            disabled={!canOpenDemandStage(req.stageOffer)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'offer');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap disabled:cursor-default disabled:text-foreground-400 disabled:hover:bg-background-100"
                            title={`查看${req.name}的Offer中候选人`}
                          >
                            <span className={`font-semibold ${canOpenDemandStage(req.stageOffer) ? 'text-primary-700' : 'text-foreground-300'}`}>{req.stageOffer}</span>
                            <span className="text-xs">Offer中</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 cursor-pointer" onClick={() => onRowClick(req)}>
                        <SemanticStatusBadge tone={statusPresentation(demandStatusPresentation, req.statusCode).tone}>
                          {demandStatusLabel(req)}
                        </SemanticStatusBadge>
                        {req.statusNote && (
                          <p className="text-xs text-foreground-400 mt-1">{req.statusNote}</p>
                        )}
                      </td>
                      <td className="px-3 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {actions.primary === 'review' && (
                            <ActionButton size="sm" tone="primary" onClick={(event) => { event.stopPropagation(); onRowClick(req); }}>
                              <i className="ri-shield-check-line text-sm" />
                              审核需求
                            </ActionButton>
                          )}
                          {actions.primary === 'select_candidates' && (
                            <ActionButton
                              size="sm"
                              tone="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCandidates(req);
                              }}
                            >
                              <i className="ri-user-add-line text-sm"></i>
                              选候选人
                            </ActionButton>
                          )}
                          {actions.primary === 'mark_filled' && (
                            <ActionButton size="sm" tone="primary" onClick={(event) => { event.stopPropagation(); openStatusAction('filled', '招聘完成'); }}>
                              <i className="ri-checkbox-circle-line text-sm" />
                              标记完成
                            </ActionButton>
                          )}
                          {actions.primary === 'restore' && (
                            <ActionButton size="sm" tone="primary" onClick={(event) => { event.stopPropagation(); openStatusAction('active', '恢复招聘'); }}>
                              <i className="ri-restart-line text-sm" />
                              恢复招聘
                            </ActionButton>
                          )}
                          {actions.primary === 'view_candidates' && (
                            <ActionButton size="sm" tone="secondary" onClick={(event) => { event.stopPropagation(); onViewCandidates(req); }}>
                              <i className="ri-team-line text-sm" />
                              查看候选人
                            </ActionButton>
                          )}
                          <RowActionMenu ariaLabel={`打开${req.name}的更多操作`} items={menuItems} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RequisitionActionDialog
        action={pendingAction}
        owners={owners}
        busy={actionBusy}
        error={actionError}
        onClose={() => {
          if (!actionBusy) {
            setPendingAction(null);
            setActionError('');
          }
        }}
        onSubmit={async ({ reason, priority, ownerId }) => {
          if (!pendingAction) return;
          setActionBusy(true);
          setActionError('');
          try {
            if (pendingAction.kind === 'status') {
              await onStatusChange(pendingAction.row.id, pendingAction.status, reason);
            } else if (pendingAction.kind === 'priority' && priority) {
              await onAdjustPriority(Number(pendingAction.row.id), priority, reason);
            } else if (pendingAction.kind === 'owner' && ownerId) {
              await onReassignOwner(Number(pendingAction.row.id), ownerId, reason);
            }
            setPendingAction(null);
          } catch (error) {
            setActionError(error instanceof Error ? error.message : '操作失败，请稍后重试');
          } finally {
            setActionBusy(false);
          }
        }}
      />
    </>
  );
}
