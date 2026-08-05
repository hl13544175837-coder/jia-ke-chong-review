import { useState, useRef, useEffect } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { demandStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import type { RequisitionRow } from '@/features/demands/types';
import {
  demandStatusLabel,
  type DemandSortField,
} from '../workbench';
import { canOpenDemandStage, type DemandStageDrilldown } from '../stageDrilldown';

interface RequisitionTableProps {
  data: RequisitionRow[];
  onRowClick: (req: RequisitionTableProps['data'][0]) => void;
  onStatusChange: (id: string, newStatusCode: string, reason: string) => Promise<void>;
  statusTransitions: Record<string, { advance: { to: string; label: string } | null; rollback: { to: string; label: string } | null }>;
  statusExtraActions: Record<string, { to: string; label: string; icon: string }[]>;
  onSelectCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onViewCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onStageCountClick: (req: RequisitionTableProps['data'][0], stage: DemandStageDrilldown) => void;
  sortField: DemandSortField;
}

const statusLabelMap: Record<string, string> = {
  active: '招聘中',
  pending: '需求待确认',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

// priority display config
const priorityConfig: Record<string, { label: string; className: string }> = {
  '紧急': { label: '紧急', className: 'bg-accent-100 text-accent-700' },
  '高': { label: '高', className: 'bg-primary-100 text-primary-700' },
  '普通': { label: '普通', className: 'bg-secondary-100 text-secondary-700' },
};

export default function RequisitionTable({
  data,
  onRowClick,
  onStatusChange,
  statusTransitions,
  statusExtraActions,
  onSelectCandidates,
  onViewCandidates,
  onStageCountClick,
  sortField,
}: RequisitionTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; to: string; label: string } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

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
                  const transitions = statusTransitions[req.statusCode];
                  const extras = statusExtraActions[req.statusCode] || [];
                  const canSelectCandidates = req.statusCode === 'active' && req.source.approval_status === 'approved' && req.remainingHeadcount > 0;
                  const headcountReached = req.statusCode === 'active' && req.source.approval_status === 'approved' && req.remainingHeadcount <= 0;
                  const isClosedOrCompleted = ['filled', 'cancelled', 'closed'].includes(req.statusCode);
                  const hasActions = transitions && (transitions.advance || transitions.rollback || extras.length > 0);
                  const prio = priorityConfig[req.priority] || priorityConfig['普通'];

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
                          {canSelectCandidates && (
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
                          {headcountReached && (
                            <span
                              title="该需求 HC 已满，请确认完成需求或在需求详情调整 HC"
                              className="flex cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-md bg-background-100 px-2.5 py-1.5 text-xs font-medium text-foreground-400"
                            >
                              <i className="ri-user-add-line text-sm"></i>
                              HC已满
                            </span>
                          )}
                          {isClosedOrCompleted && (
                            <ActionButton
                              size="sm"
                              tone="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewCandidates(req);
                              }}
                            >
                              <i className="ri-team-line text-sm"></i>
                              查看候选人
                            </ActionButton>
                          )}
                          {hasActions ? (
                            <div className="relative inline-block" ref={openMenuId === req.id ? menuRef : undefined}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === req.id ? null : req.id);
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-background-200 text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer"
                              >
                                <i className="ri-more-fill text-base"></i>
                              </button>
                              {openMenuId === req.id && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1">
                                  {transitions.advance && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: transitions.advance!.to, label: transitions.advance!.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className="ri-arrow-right-line text-primary-500"></i>
                                      {transitions.advance.label}
                                    </button>
                                  )}
                                  {extras.map((action) => (
                                    <button
                                      key={action.to}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: action.to, label: action.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-secondary-50 hover:text-secondary-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className={`${action.icon} text-secondary-500`}></i>
                                      {action.label}
                                    </button>
                                  ))}
                                  {transitions.rollback && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: transitions.rollback!.to, label: transitions.rollback!.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-accent-50 hover:text-accent-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className="ri-arrow-go-back-line text-accent-500"></i>
                                      {transitions.rollback.label}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            !isClosedOrCompleted && <span className="text-xs text-foreground-300">—</span>
                          )}
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

      {/* Confirm modal */}
      {confirmAction && (
        <>
          <div
            className="fixed inset-0 bg-foreground-900/30 z-40"
            onClick={() => { if (!actionBusy) setConfirmAction(null); }}
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden">
              <div className="px-5 py-4 border-b border-background-200">
                <h3 className="text-base font-bold text-foreground-900">确认状态变更</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-foreground-600">
                  确定将该需求的状态从 <span className="font-semibold text-foreground-800">{statusLabelMap[data.find(r => r.id === confirmAction.id)?.statusCode || '']}</span> 变更为 <span className="font-semibold text-foreground-800">{statusLabelMap[confirmAction.to]}</span>？
                </p>
                <label className="block text-sm font-medium text-foreground-700">
                  {confirmAction.to === 'active' ? '恢复原因' : '关闭原因'}
                  <textarea
                    value={confirmReason}
                    onChange={(event) => { setConfirmReason(event.target.value); setActionError(''); }}
                    rows={3}
                    placeholder="请填写本次操作原因"
                    className="mt-2 w-full resize-none rounded-lg border border-background-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
                  />
                </label>
                {actionError && <p className="text-sm text-red-500" role="alert">{actionError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-background-200 flex items-center justify-end gap-3">
                <button
                  disabled={actionBusy}
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  取消
                </button>
                <button
                  disabled={actionBusy}
                  onClick={async () => {
                    const reason = confirmReason.trim();
                    if (!reason) {
                      setActionError('请填写操作原因');
                      return;
                    }
                    setActionBusy(true);
                    try {
                      await onStatusChange(confirmAction.id, confirmAction.to, reason);
                      setConfirmAction(null);
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : '状态更新失败');
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {actionBusy ? '正在提交...' : '确认'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
