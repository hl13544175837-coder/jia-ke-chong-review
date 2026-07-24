import { useState } from 'react';
import type { Offer } from '@/mocks/offers';

interface Props {
  offer: Offer;
  userRole: string;
  onClose: () => void;
  onApprove: (id: number, action: '通过' | '拒绝') => void;
  onSend: (id: number) => void;
  onAccept: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onOnboard: (id: number) => void;
  onRetract: (id: number) => void;
  onSubmitApproval: (id: number) => void;
  onFollowUp: (id: number) => void;
}

const statusLabelMap: Record<string, string> = {
  '草稿': '待提交',
  '待审批': '审批中',
  '已通过': '待发放',
  '待发放': '待发放',
  '已发放': '待回复',
  '已接受': '待入职',
  '已拒绝': '已结束',
  '已撤回': '已结束',
  '已过期': '已结束',
  '已入职': '已结束',
};

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-background-200 text-foreground-500 border border-background-300',
  '待审批': 'bg-amber-50 text-amber-700 border border-amber-200',
  '已通过': 'bg-primary-50 text-primary-700 border border-primary-200',
  '待发放': 'bg-primary-50 text-primary-700 border border-primary-200',
  '已发放': 'bg-accent-50 text-accent-700 border border-accent-200',
  '已接受': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  '已拒绝': 'bg-red-50 text-red-700 border border-red-200',
  '已撤回': 'bg-background-200 text-foreground-500 border border-background-300',
  '已过期': 'bg-amber-50 text-amber-700 border border-amber-200',
  '已入职': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

export default function OfferDetailDrawer({ offer, userRole, onClose, onApprove, onSend, onAccept, onReject, onOnboard, onRetract, onSubmitApproval, onFollowUp }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'salary' | 'history'>('info');

  const isEnded = ['已拒绝', '已撤回', '已过期', '已入职'].includes(offer.status);
  const isApprover = (userRole === 'hr_director' && offer.approverRole === 'hr_director') || (userRole === 'manager' && offer.approverRole === 'manager');
  const canSend = userRole === 'manager' || userRole === 'recruiter';

  const getWorkflowSteps = () => {
    const steps = [
      { label: '发起', time: offer.createdAt || offer.submittedAt, done: true, current: false },
      { label: '审批', time: offer.approvedAt, done: !!offer.approvedAt, current: offer.status === '待审批' },
      { label: '发放', time: offer.sentAt, done: !!offer.sentAt, current: offer.status === '待发放' },
      { label: '回复', time: offer.respondedAt, done: !!offer.respondedAt, current: offer.status === '已发放' },
      { label: '入职', time: offer.onboardedAt, done: offer.status === '已入职', current: offer.status === '已接受' },
    ];

    if (offer.status === '已撤回') {
      steps[2] = { ...steps[2], done: false, current: false };
      steps[3] = { ...steps[3], done: false, current: false };
      steps[4] = { ...steps[4], done: false, current: false };
    }
    if (offer.status === '已拒绝') {
      steps[3] = { ...steps[3], current: false };
      steps[4] = { ...steps[4], current: false };
    }
    if (offer.status === '已过期') {
      steps[3] = { ...steps[3], current: false };
      steps[4] = { ...steps[4], current: false };
    }
    return steps;
  };

  const renderActions = () => {
    if (offer.status === '草稿') {
      return (
        <button onClick={() => onSubmitApproval(offer.id)} className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
          <i className="ri-send-plane-line mr-1.5"></i>编辑并提交审批
        </button>
      );
    }
    if (offer.status === '待审批') {
      if (isApprover) {
        return (
          <div className="flex gap-2">
            <button onClick={() => onApprove(offer.id, '拒绝')} className="flex-1 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap">
              拒绝
            </button>
            <button onClick={() => onApprove(offer.id, '通过')} className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
              审批通过
            </button>
          </div>
        );
      }
      return null;
    }
    if (offer.status === '待发放') {
      if (canSend) {
        return (
          <button onClick={() => onSend(offer.id)} className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-send-plane-line mr-1.5"></i>发放Offer
          </button>
        );
      }
      return null;
    }
    if (offer.status === '已发放') {
      return (
        <div className="flex gap-2">
          <button onClick={() => onReject(offer.id, '候选人未回复，手动标记超时')} className="flex-1 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap">
            标记超时
          </button>
          <button onClick={() => onFollowUp(offer.id)} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-phone-line mr-1.5"></i>跟进回复
          </button>
          <button onClick={() => onAccept(offer.id)} className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
            标记已接受
          </button>
        </div>
      );
    }
    if (offer.status === '已接受') {
      return (
        <button onClick={() => onOnboard(offer.id)} className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
          <i className="ri-check-double-line mr-1.5"></i>确认入职
        </button>
      );
    }
    return null;
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/30 z-40" onClick={onClose}></div>
      <div className="fixed right-0 top-0 bottom-0 w-[520px] bg-white z-50 shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-foreground-900">Offer 详情</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColorMap[offer.status]}`}>
              {statusLabelMap[offer.status]}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Candidate Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-semibold text-primary-600">{offer.candidateAvatar}</span>
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground-900">{offer.candidateName}</p>
              <p className="text-sm text-foreground-500">{offer.position} · {offer.department}</p>
              {offer.reqName && (
                <p className="text-xs text-foreground-400 mt-0.5">需求：{offer.reqName}（{offer.reqId}）</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-background-100 rounded-full p-1">
            {(['info', 'salary', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tab ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                }`}
              >
                {tab === 'info' ? 'Offer概览' : tab === 'salary' ? '薪酬结构' : '操作记录'}
              </button>
            ))}
          </div>

          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Workflow Steps */}
              <div>
                <p className="text-xs font-medium text-foreground-500 mb-3">Offer 流程</p>
                <div className="flex items-center gap-1">
                  {getWorkflowSteps().map((step, idx) => (
                    <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`flex flex-col items-center gap-1 min-w-[52px] ${!step.done && !step.current ? 'opacity-40' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          step.done ? 'bg-emerald-500 text-white' : step.current ? 'bg-primary-500 text-white ring-2 ring-primary-100' : 'bg-background-200 text-foreground-400'
                        }`}>
                          {step.done ? <i className="ri-check-line text-xs"></i> : idx + 1}
                        </div>
                        <span className={`text-[10px] font-medium whitespace-nowrap ${
                          step.done ? 'text-emerald-600' : step.current ? 'text-primary-600' : 'text-foreground-400'
                        }`}>{step.label}</span>
                        {step.time && (step.done || step.current) && (
                          <span className="text-[9px] text-foreground-400 whitespace-nowrap">{step.time.split(' ')[0]}</span>
                        )}
                      </div>
                      {idx < 4 && (
                        <div className={`w-3 h-0.5 rounded-full flex-shrink-0 ${
                          getWorkflowSteps()[idx + 1]?.done ? 'bg-emerald-300' : getWorkflowSteps()[idx + 1]?.current ? 'bg-primary-200' : 'bg-background-200'
                        }`}></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Current Status Banner */}
              {offer.status === '待审批' && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm font-medium text-amber-700">等待审批</p>
                  <p className="text-xs text-amber-600 mt-0.5">审批人：{offer.approver}，请等待审批完成后发放Offer</p>
                </div>
              )}
              {offer.status === '已发放' && (
                <div className="p-3 bg-accent-50 rounded-lg border border-accent-200">
                  <p className="text-sm font-medium text-accent-700">等待候选人回复</p>
                  <p className="text-xs text-accent-600 mt-0.5">有效期至：{offer.expiresAt || '—'}，建议跟进候选人回复进度</p>
                </div>
              )}
              {offer.status === '已接受' && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-sm font-medium text-emerald-700">候选人已接受</p>
                  <p className="text-xs text-emerald-600 mt-0.5">预计入职：{offer.startDate}，请跟进入职准备</p>
                </div>
              )}
              {offer.status === '已拒绝' && offer.rejectionReason && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-medium text-red-600">拒绝原因</p>
                  <p className="text-xs text-red-700 mt-0.5">{offer.rejectionReason}</p>
                </div>
              )}
              {offer.status === '已过期' && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm font-medium text-amber-700">Offer已过期</p>
                  <p className="text-xs text-amber-600 mt-0.5">过期时间：{offer.expiredAt}，可考虑重新发起Offer</p>
                </div>
              )}
              {offer.status === '已撤回' && (
                <div className="p-3 bg-background-100 rounded-lg border border-background-200">
                  <p className="text-sm font-medium text-foreground-700">Offer已撤回</p>
                  <p className="text-xs text-foreground-500 mt-0.5">撤回时间：{offer.retractedAt}，原因：{offer.rejectionReason}</p>
                </div>
              )}

              {/* Key Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">税前月薪</p>
                  <p className="text-lg font-bold text-foreground-900">¥{Number(offer.salary).toLocaleString()}</p>
                </div>
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">预计入职</p>
                  <p className="text-lg font-bold text-foreground-900">{offer.startDate || '待定'}</p>
                </div>
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">审批人</p>
                  <p className="text-sm font-medium text-foreground-900">{offer.approver}</p>
                </div>
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">招聘专员</p>
                  <p className="text-sm font-medium text-foreground-900">{offer.recruiter}</p>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-background-50 rounded-lg p-3">
                <p className="text-xs font-medium text-foreground-500 mb-1">审批备注</p>
                <p className="text-sm text-foreground-700">{offer.notes || '暂无备注'}</p>
              </div>

              {/* Offer Versions */}
              {offer.offerVersions && offer.offerVersions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-500 mb-2">Offer 版本</p>
                  <div className="space-y-2">
                    {offer.offerVersions.map((v) => (
                      <div key={v.version} className="flex items-start gap-2 text-sm">
                        <span className="w-6 h-6 rounded-full bg-background-200 flex items-center justify-center text-xs font-medium text-foreground-500 flex-shrink-0">{v.version}</span>
                        <div>
                          <p className="text-foreground-700">{v.changes}</p>
                          <p className="text-xs text-foreground-400">{v.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send Records */}
              {offer.sendRecords && offer.sendRecords.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-500 mb-2">发送记录</p>
                  <div className="space-y-1.5">
                    {offer.sendRecords.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-background-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <i className={`${r.channel === '邮件' ? 'ri-mail-line' : r.channel === '电子签' ? 'ri-file-text-line' : 'ri-wechat-line'} text-foreground-400`}></i>
                          <span className="text-foreground-700">{r.channel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground-400">{r.sentAt}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            r.status === '已送达' || r.status === '已签署' || r.status === '已读' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>{r.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Reply */}
              {offer.candidateReply && (
                <div className={`p-3 rounded-lg border ${
                  offer.candidateReply.answer === '接受' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${offer.candidateReply.answer === '接受' ? 'text-emerald-700' : 'text-red-700'}`}>
                    候选人{offer.candidateReply.answer}
                  </p>
                  <p className="text-xs text-foreground-600 mt-0.5">{offer.candidateReply.repliedAt} · {offer.candidateReply.note}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'salary' && (
            <div className="space-y-4">
              <div className="bg-background-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-foreground-500">薪酬结构（税前月薪）</p>
                  <p className="text-lg font-bold text-foreground-900">¥{Number(offer.salary).toLocaleString()}</p>
                </div>
                {offer.salaryBreakdown && offer.salaryBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {offer.salaryBreakdown.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1.5 border-b border-background-200 last:border-0">
                        <span className="text-sm text-foreground-600">{item.item}</span>
                        <span className="text-sm font-medium text-foreground-900">¥{Number(item.amount.replace(/,/g, '')).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-1.5 pt-2 border-t border-background-300">
                      <span className="text-sm font-medium text-foreground-900">合计</span>
                      <span className="text-sm font-bold text-foreground-900">¥{Number(offer.salary).toLocaleString()}/月</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground-400">暂无详细薪酬结构</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">年包估算（12薪）</p>
                  <p className="text-base font-bold text-foreground-900">¥{(Number(offer.salary) * 12).toLocaleString()}</p>
                </div>
                <div className="bg-background-50 rounded-lg p-3">
                  <p className="text-[11px] text-foreground-400">预计入职</p>
                  <p className="text-base font-bold text-foreground-900">{offer.startDate || '待定'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {offer.approvalHistory && offer.approvalHistory.length > 0 ? (
                <div className="relative pl-5 border-l-2 border-background-200 space-y-4">
                  {offer.approvalHistory.map((h, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-primary-500 border-2 border-white"></div>
                      <p className="text-sm font-medium text-foreground-900">{h.action}</p>
                      <p className="text-xs text-foreground-500">{h.approver} · {h.date}</p>
                      {h.comment && <p className="text-xs text-foreground-400 mt-0.5">{h.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-400 text-center py-6">暂无操作记录</p>
              )}

              {/* Full timeline */}
              <div className="mt-4 pt-4 border-t border-background-200">
                <p className="text-xs font-medium text-foreground-500 mb-3">完整时间线</p>
                <div className="space-y-2 text-xs text-foreground-500">
                  {offer.createdAt && <p>· {offer.createdAt} 草稿创建</p>}
                  {offer.submittedAt && <p>· {offer.submittedAt} 提交审批</p>}
                  {offer.approvedAt && <p>· {offer.approvedAt} 审批通过</p>}
                  {offer.sentAt && <p>· {offer.sentAt} Offer已发放</p>}
                  {offer.respondedAt && <p>· {offer.respondedAt} 候选人回复</p>}
                  {offer.retractedAt && <p>· {offer.retractedAt} 已撤回</p>}
                  {offer.expiredAt && <p>· {offer.expiredAt} 已过期</p>}
                  {offer.onboardedAt && <p>· {offer.onboardedAt} 已入职</p>}
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-background-200 flex gap-2">
            {isEnded ? (
              <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">
                关闭
              </button>
            ) : (
              <>
                {renderActions()}
                {offer.status === '草稿' && (
                  <button onClick={() => { onClose(); }} className="px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">
                    取消
                  </button>
                )}
                {offer.status === '待审批' && !isApprover && (
                  <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">
                    关闭
                  </button>
                )}
                {offer.status === '待发放' && !canSend && (
                  <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">
                    关闭
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}