import { useState } from 'react';
import type { ResumePushRecord } from '@/mocks/resumePush';

interface ReviewActionModalProps {
  record: ResumePushRecord;
  onClose: () => void;
  onSubmit: (action: 'approved' | 'rejected' | 'needMoreInfo', comment: string) => void;
}

export default function ReviewActionModal({ record, onClose, onSubmit }: ReviewActionModalProps) {
  const [action, setAction] = useState<'approved' | 'rejected' | 'needMoreInfo'>('approved');
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (!comment.trim() && action !== 'approved') return;
    onSubmit(action, comment.trim());
  };

  const actionConfig = {
    approved: {
      label: '同意面试',
      color: 'bg-emerald-500 hover:bg-emerald-600',
      icon: 'ri-check-line',
      desc: '简历符合岗位要求，建议安排面试',
    },
    rejected: {
      label: '不合适',
      color: 'bg-accent-500 hover:bg-accent-600',
      icon: 'ri-close-line',
      desc: '简历与岗位要求不匹配，暂不安排面试',
    },
    needMoreInfo: {
      label: '需要补充信息',
      color: 'bg-amber-500 hover:bg-amber-600',
      icon: 'ri-information-line',
      desc: '简历信息不足，需要候选人补充材料后再评估',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[520px] mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-background-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">简历评审</h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              {record.candidateName} · {record.position}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-background-100 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Candidate & push info */}
          <div className="bg-background-50 rounded-xl p-4 border border-background-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary-600">{record.candidateName.charAt(0)}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-900">{record.candidateName}</p>
                <p className="text-xs text-foreground-500">{record.position} · {record.source}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-foreground-400 w-16 flex-shrink-0">推送人</span>
                <span className="text-foreground-700">{record.pusher}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-foreground-400 w-16 flex-shrink-0">推送时间</span>
                <span className="text-foreground-700">{record.pushTime.slice(0, 10)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-foreground-400 w-16 flex-shrink-0">截止时间</span>
                <span className="text-foreground-700 font-medium">{record.deadline}</span>
              </div>
            </div>
          </div>

          {/* Key requirements */}
          <div>
            <p className="text-xs font-medium text-foreground-500 mb-2">重点评审要求</p>
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 text-sm text-foreground-700 leading-relaxed">
              {record.keyRequirements}
            </div>
          </div>

          {/* Action selection */}
          <div>
            <p className="text-xs font-medium text-foreground-500 mb-2">评审决定</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(actionConfig) as Array<keyof typeof actionConfig>).map((key) => {
                const cfg = actionConfig[key];
                const isActive = action === key;
                return (
                  <button
                    key={key}
                    onClick={() => setAction(key)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                      isActive
                        ? key === 'approved'
                          ? 'border-emerald-300 bg-emerald-50'
                          : key === 'rejected'
                          ? 'border-accent-300 bg-accent-50'
                          : 'border-amber-300 bg-amber-50'
                        : 'border-background-200 bg-white hover:border-background-300'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        isActive
                          ? key === 'approved'
                            ? 'bg-emerald-100 text-emerald-600'
                            : key === 'rejected'
                            ? 'bg-accent-100 text-accent-600'
                            : 'bg-amber-100 text-amber-600'
                          : 'bg-background-100 text-foreground-400'
                      }`}
                    >
                      <i className={`${cfg.icon} text-base`}></i>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        isActive ? 'text-foreground-800' : 'text-foreground-500'
                      }`}
                    >
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          {action !== 'approved' && (
            <div>
              <p className="text-xs font-medium text-foreground-500 mb-2">
                {action === 'rejected' ? '不合适原因' : '需要补充的信息'} <span className="text-accent-500">*</span>
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={action === 'rejected' ? '请说明候选人不合适的具体原因...' : '请说明需要候选人补充哪些信息...'}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
              />
              <p className="text-[11px] text-foreground-400 mt-1 text-right">{comment.length}/500</p>
            </div>
          )}

          {/* Comment for approved (optional) */}
          {action === 'approved' && (
            <div>
              <p className="text-xs font-medium text-foreground-500 mb-2">评审意见（选填）</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="可填写对候选人的简要评价或面试建议..."
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
              />
              <p className="text-[11px] text-foreground-400 mt-1 text-right">{comment.length}/500</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground-600 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors hover:bg-background-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={action !== 'approved' && !comment.trim()}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              action !== 'approved' && !comment.trim()
                ? 'bg-background-200 text-foreground-400 cursor-not-allowed'
                : actionConfig[action].color
            }`}
          >
            <i className={`${actionConfig[action].icon} mr-1.5`}></i>
            {actionConfig[action].label}
          </button>
        </div>
      </div>
    </div>
  );
}