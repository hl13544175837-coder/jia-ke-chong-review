import { useState, useMemo } from 'react';
import { interviewerPool } from '@/mocks/interviews';
import { candidateList } from '@/mocks/candidates';

interface PushTarget {
  candidateId: number;
  candidateName: string;
  position: string;
  source: string;
}

interface PushToReviewerModalProps {
  targets: PushTarget[];
  onClose: () => void;
  onPush: (data: {
    reviewerId: string;
    reviewerName: string;
    reviewerTitle: string;
    deadline: string;
    keyRequirements: string;
  }) => void;
}

export default function PushToReviewerModal({ targets, onClose, onPush }: PushToReviewerModalProps) {
  const [reviewerId, setReviewerId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [keyRequirements, setKeyRequirements] = useState('');
  const [step, setStep] = useState<'selectReviewer' | 'confirm'>('selectReviewer');

  const selectedReviewer = useMemo(
    () => interviewerPool.find((iv) => iv.id === reviewerId) || null,
    [reviewerId]
  );

  const targetCandidateData = useMemo(
    () => targets.map((t) => {
      const c = candidateList.find((cl) => cl.id === t.candidateId);
      return { ...t, stage: c?.stage || '待筛选', tags: c?.tags || [] };
    }),
    [targets]
  );

  const canProceed = reviewerId && deadline && keyRequirements.trim();

  const handlePush = () => {
    if (!canProceed || !selectedReviewer) return;
    onPush({
      reviewerId,
      reviewerName: selectedReviewer.name,
      reviewerTitle: selectedReviewer.role,
      deadline,
      keyRequirements: keyRequirements.trim(),
    });
  };

  // Get tomorrow's date as min
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  // Default deadline: 7 days from now
  const defaultDeadline = new Date(today);
  defaultDeadline.setDate(today.getDate() + 7);
  const defaultDeadlineStr = defaultDeadline.toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[560px] mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-background-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">推送面试官评审</h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              已选择 <strong className="text-foreground-800">{targets.length}</strong> 位候选人
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
          {/* Selected candidates preview */}
          <div>
            <p className="text-xs font-medium text-foreground-500 mb-2">推送候选人</p>
            <div className="space-y-2">
              {targetCandidateData.map((t) => (
                <div
                  key={t.candidateId}
                  className="flex items-center gap-3 px-3 py-2.5 bg-background-50 rounded-lg border border-background-200"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary-600">{t.candidateName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground-900">{t.candidateName}</p>
                    <p className="text-xs text-foreground-500">{t.position} · {t.source}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step indicator */}
          {step === 'selectReviewer' ? (
            <>
              {/* Select interviewer */}
              <div>
                <p className="text-xs font-medium text-foreground-500 mb-2">
                  选择面试官 <span className="text-accent-500">*</span>
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {interviewerPool.map((iv) => (
                    <button
                      key={iv.id}
                      onClick={() => setReviewerId(iv.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        reviewerId === iv.id
                          ? 'border-primary-300 bg-primary-50'
                          : 'border-background-200 hover:border-background-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          reviewerId === iv.id ? 'bg-primary-100' : 'bg-background-100'
                        }`}
                      >
                        <span
                          className={`text-xs font-semibold ${
                            reviewerId === iv.id ? 'text-primary-600' : 'text-foreground-500'
                          }`}
                        >
                          {iv.avatar}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${
                            reviewerId === iv.id ? 'text-primary-700' : 'text-foreground-800'
                          }`}
                        >
                          {iv.name}
                        </p>
                        <p className="text-[11px] text-foreground-400 truncate">
                          {iv.role} · {iv.department}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <p className="text-xs font-medium text-foreground-500 mb-2">
                  评审截止时间 <span className="text-accent-500">*</span>
                </p>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={minDateStr}
                  placeholder={defaultDeadlineStr}
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                />
                {!deadline && (
                  <p className="text-[11px] text-foreground-400 mt-1">
                    默认截止时间为推送后7天（{defaultDeadlineStr}），可手动调整
                  </p>
                )}
              </div>

              {/* Key requirements */}
              <div>
                <p className="text-xs font-medium text-foreground-500 mb-2">
                  重点评审要求 <span className="text-accent-500">*</span>
                </p>
                <textarea
                  value={keyRequirements}
                  onChange={(e) => setKeyRequirements(e.target.value)}
                  placeholder="请说明需要面试官重点关注的方面，如：技术方向、项目经验、软技能等..."
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
                />
                <p className="text-[11px] text-foreground-400 mt-1 text-right">
                  {keyRequirements.length}/500
                </p>
              </div>

              {/* Push info summary */}
              <div className="bg-background-50 rounded-lg p-3 border border-background-200">
                <p className="text-xs font-medium text-foreground-600 mb-2">推送信息摘要</p>
                <div className="space-y-1 text-xs text-foreground-500">
                  <div className="flex items-center gap-2">
                    <i className="ri-user-line text-foreground-400"></i>
                    <span>推送人：{localStorage.getItem('zhipin-current-role') === 'recruiter' ? '李华' : '张敏'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-calendar-line text-foreground-400"></i>
                    <span>推送时间：{new Date().toISOString().split('T')[0]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-group-line text-foreground-400"></i>
                    <span>候选人来源：{targets.map((t) => t.source).filter((v, i, a) => a.indexOf(v) === i).join('、')}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Confirm step */
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <i className="ri-check-line text-emerald-600 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">确认推送信息</p>
                    <p className="text-xs text-emerald-600">推送后候选人状态将更新为「面试官评审中」</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground-500">面试官</span>
                    <span className="font-medium text-foreground-800">{selectedReviewer?.name} · {selectedReviewer?.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground-500">评审截止</span>
                    <span className="font-medium text-foreground-800">{deadline}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground-500">候选人数量</span>
                    <span className="font-medium text-foreground-800">{targets.length} 人</span>
                  </div>
                </div>
              </div>
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
            onClick={handlePush}
            disabled={!canProceed}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              canProceed
                ? 'bg-primary-500 hover:bg-primary-600'
                : 'bg-background-200 text-foreground-400 cursor-not-allowed'
            }`}
          >
            <i className="ri-send-plane-line mr-1.5"></i>
            确认推送
          </button>
        </div>
      </div>
    </div>
  );
}