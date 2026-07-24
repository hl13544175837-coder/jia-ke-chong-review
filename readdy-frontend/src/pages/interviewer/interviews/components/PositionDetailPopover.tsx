import { useState, useEffect, useRef } from 'react';
import type { InterviewerInterview, InterviewerPosition } from '@/mocks/interviewer';
import { myInterviews } from '@/mocks/interviewer';
import { positionJDs } from '@/mocks/interviews';
import { candidateList } from '@/mocks/candidates';

interface PositionDetailPopoverProps {
  interview: InterviewerInterview;
  position: InterviewerPosition | undefined;
  anchorRect: DOMRect;
  onClose: () => void;
  onViewFullDetail: () => void;
}

export default function PositionDetailPopover({
  interview,
  position,
  anchorRect,
  onClose,
  onViewFullDetail,
}: PositionDetailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>();

  const jdText = position?.jd || positionJDs[interview.position] || '暂无岗位描述';

  // Find all interviews for this candidate + position combo
  const candidateInterviews = myInterviews.filter(
    (iv) => iv.candidateName === interview.candidateName && iv.position === interview.position
  ).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // Find candidate from candidateList for more data
  const candidate = candidateList.find((c) => c.name === interview.candidateName);

  // Get position interview rounds (all rounds for this candidate across system)
  const relatedInterviews = myInterviews.filter(
    (iv) => iv.candidateName === interview.candidateName
  ).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  useEffect(() => {
    if (!anchorRect) return;

    const popoverWidth = 420;
    const popoverMaxHeight = 500;

    let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    let top = anchorRect.bottom + 8;

    // Keep within viewport
    if (left < 16) left = 16;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }

    // If too close to bottom, show above
    if (top + popoverMaxHeight > window.innerHeight - 16) {
      top = anchorRect.top - popoverMaxHeight - 8;
    }

    setPopoverStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${popoverWidth}px`,
      maxHeight: `${popoverMaxHeight}px`,
      zIndex: 60,
    });
  }, [anchorRect]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '已完成': return 'bg-primary-50 text-primary-700 border border-primary-200';
      case '待面试': return 'bg-accent-100 text-accent-700';
      case '待确认': return 'bg-accent-50 text-accent-600';
      case '待反馈': return 'bg-primary-100 text-primary-700';
      default: return 'bg-background-100 text-foreground-500';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose}></div>

      {/* Popover */}
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="bg-white rounded-xl shadow-lg border border-background-200 overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-briefcase-line text-sm text-accent-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-900">{interview.position}</p>
              <p className="text-xs text-foreground-500">{position?.department || '技术研发部'} · {position?.city || '上海'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {position && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                position.priority === '高' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-background-100 text-foreground-500'
              }`}>
                {position.priority}优先级
              </span>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-background-100 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-foreground-400 text-sm"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(500px - 110px)' }}>
          {/* JD Summary */}
          <div className="p-4 space-y-2 border-b border-background-100">
            <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
              <i className="ri-file-text-line text-[11px]"></i> 岗位描述
            </h4>
            <div className="text-xs text-foreground-700 leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto bg-background-50 rounded-lg p-3">
              {jdText.slice(0, 300)}{jdText.length > 300 ? '...' : ''}
            </div>
          </div>

          {/* Interview Rounds History */}
          <div className="p-4 space-y-2">
            <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
              <i className="ri-git-branch-line text-[11px]"></i>
              候选人「{interview.candidateName}」的面试轮次
            </h4>

            {relatedInterviews.length > 0 ? (
              <div className="relative pl-5 border-l-2 border-background-200 space-y-3">
                {relatedInterviews.map((iv, idx) => {
                  const isCurrent = iv.id === interview.id;
                  return (
                    <div key={iv.id} className="relative">
                      <div className={`absolute -left-[25px] w-2.5 h-2.5 rounded-full border-2 border-white ${
                        isCurrent ? 'bg-primary-500 ring-2 ring-primary-200' :
                        iv.status === '已完成' ? 'bg-primary-400' :
                        iv.status === '待反馈' ? 'bg-accent-400' :
                        'bg-background-300'
                      }`}></div>
                      <div className={`rounded-lg p-2.5 ${isCurrent ? 'bg-primary-50/50 border border-primary-100' : 'bg-background-50'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-foreground-800">{iv.stage}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeClass(iv.status)}`}>
                            {iv.status === '待确认' ? '待确认' : iv.status === '待面试' ? '待面试' : iv.status === '待反馈' ? '待反馈' : '已结束'}
                          </span>
                        </div>
                        <div className="text-[11px] text-foreground-500 space-y-0.5">
                          <p className="flex items-center gap-1">
                            <i className="ri-calendar-line text-[10px]"></i>
                            {iv.scheduledAt.slice(0, 16)}
                          </p>
                          <p className="flex items-center gap-1">
                            <i className="ri-map-pin-line text-[10px]"></i>
                            {iv.type} · {iv.location}
                          </p>
                          {iv.overall && (
                            <p className={`text-[10px] font-medium ${iv.overall === '通过' ? 'text-primary-600' : 'text-red-600'}`}>
                              {iv.overall === '通过' ? '✓ 通过' : '✗ 不通过'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-foreground-400">暂无该候选人的面试记录</p>
            )}
          </div>

          {/* Candidate quick info */}
          {candidate && (
            <div className="p-4 border-t border-background-100 space-y-2">
              <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-user-line text-[11px]"></i> 候选人概况
              </h4>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-2 py-1 rounded-md bg-background-50 text-foreground-600 border border-background-200">
                  {candidate.experienceYears}
                </span>
                <span className="text-xs px-2 py-1 rounded-md bg-background-50 text-foreground-600 border border-background-200">
                  {candidate.education}
                </span>
                {candidate.skills.slice(0, 3).map((s) => (
                  <span key={s} className="text-xs px-2 py-1 rounded-md bg-accent-50 text-accent-700 border border-accent-100">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-background-200 flex items-center justify-end gap-2">
          <button
            onClick={onViewFullDetail}
            className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
          >
            <i className="ri-eye-line text-xs"></i>
            查看完整详情
          </button>
        </div>
      </div>
    </>
  );
}