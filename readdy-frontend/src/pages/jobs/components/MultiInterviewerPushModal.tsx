import { useState, useMemo } from 'react';
import { interviewerPool } from '@/mocks/interviews';

interface PushTarget {
  candidateId: string;
  candidateName: string;
  position: string;
  source: string;
}

export interface PushReviewData {
  reviewerIds: string[];
  reviewerNames: string[];
  reviewerTitles: string[];
  deadline: string;
  keyRequirements: string;
}

interface MultiInterviewerPushModalProps {
  targets: PushTarget[];
  onClose: () => void;
  onPush: (data: PushReviewData) => void;
}

export default function MultiInterviewerPushModal({ targets, onClose, onPush }: MultiInterviewerPushModalProps) {
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [keyRequirements, setKeyRequirements] = useState('');

  const selectedReviewers = useMemo(
    () => interviewerPool.filter((iv) => reviewerIds.includes(iv.id)),
    [reviewerIds]
  );

  const toggleReviewer = (id: string) => {
    setReviewerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canProceed = reviewerIds.length > 0 && deadline && keyRequirements.trim();

  const handlePush = () => {
    if (!canProceed) return;
    onPush({
      reviewerIds,
      reviewerNames: selectedReviewers.map((r) => r.name),
      reviewerTitles: selectedReviewers.map((r) => r.role),
      deadline,
      keyRequirements: keyRequirements.trim(),
    });
  };

  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const defaultDeadline = new Date(today);
  defaultDeadline.setDate(today.getDate() + 7);
  const defaultDeadlineStr = defaultDeadline.toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[600px] mx-4 max-h-[85vh] overflow-y-auto"
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
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {targets.map((t, i) => (
                <div
                  key={t.candidateId}
                  className="flex items-center gap-3 px-3 py-2.5 bg-background-50 rounded-lg border border-background-200"
                >
                  <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary-600">{t.candidateName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground-900">{t.candidateName}</p>
                    <p className="text-xs text-foreground-500">{t.position} · {t.source}</p>
                  </div>
                  <span className="text-[11px] text-foreground-400">#{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Select interviewers (multi) */}
          <div>
            <p className="text-xs font-medium text-foreground-500 mb-2">
              选择面试官（可多选） <span className="text-accent-500">*</span>
              {reviewerIds.length > 0 && (
                <span className="ml-1 text-primary-600 font-semibold">已选 {reviewerIds.length} 人</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto">
              {interviewerPool.map((iv) => {
                const isSelected = reviewerIds.includes(iv.id);
                return (
                  <button
                    key={iv.id}
                    onClick={() => toggleReviewer(iv.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-background-200 hover:border-background-300 bg-white'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-primary-100' : 'bg-background-100'
                        }`}
                      >
                        <span
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-primary-600' : 'text-foreground-500'
                          }`}
                        >
                          {iv.avatar}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                          <i className="ri-check-line text-white text-[10px]"></i>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          isSelected ? 'text-primary-700' : 'text-foreground-800'
                        }`}
                      >
                        {iv.name}
                      </p>
                      <p className="text-[11px] text-foreground-400 truncate">
                        {iv.role} · {iv.department}
                      </p>
                    </div>
                  </button>
                );
              })}
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
                <span>推送人：{localStorage.getItem('zhipin-current-role') === 'recruiter_lead' ? '张敏' : '李华'}</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-calendar-line text-foreground-400"></i>
                <span>推送时间：{today.toISOString().split('T')[0]}</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-group-line text-foreground-400"></i>
                <span>候选人来源：{[...new Set(targets.map((t) => t.source))].join('、')}</span>
              </div>
              {reviewerIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <i className="ri-user-star-line text-foreground-400"></i>
                  <span>评审人：{selectedReviewers.map((r) => r.name).join('、')}</span>
                </div>
              )}
            </div>
          </div>
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