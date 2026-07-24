import { useState } from 'react';
import type { InterviewerInterview } from '@/mocks/interviewer';

interface RescheduleModalProps {
  interview: InterviewerInterview;
  onClose: () => void;
  onConfirm: (newDate: string, newStartTime: string, newEndTime: string, reason: string) => void;
}

export default function RescheduleModal({ interview, onClose, onConfirm }: RescheduleModalProps) {
  const [newDate, setNewDate] = useState(interview.scheduledAt.slice(0, 10) || '');
  const [newStart, setNewStart] = useState(interview.scheduledAt.slice(11, 16) || '10:00');
  const [newEnd, setNewEnd] = useState(interview.scheduledEndAt.slice(11, 16) || '11:00');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!newDate || !newStart || !newEnd) return;
    onConfirm(newDate, newStart, newEnd, reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[440px] mx-4 p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-heading font-bold text-foreground-900">申请改约</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-foreground-500"></i>
          </button>
        </div>

        {/* Current schedule info */}
        <div className="bg-background-50 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary-600">{interview.candidateAvatar}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground-800">{interview.candidateName}</p>
              <p className="text-xs text-foreground-500">{interview.position} · {interview.stage}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-foreground-500 pt-1 border-t border-background-200/70">
            <span className="flex items-center gap-1">
              <i className="ri-calendar-line text-[11px]"></i>
              原定：{interview.scheduledAt.slice(0, 10)} {interview.scheduledAt.slice(11, 16)}-{interview.scheduledEndAt.slice(11, 16)}
            </span>
          </div>
        </div>

        {/* New date */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1.5">新面试日期</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white text-foreground-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">开始时间</label>
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white text-foreground-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">结束时间</label>
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white text-foreground-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1.5">改约原因</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="请输入改约原因，便于HR协调安排..."
              className="w-full px-3 py-2.5 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white text-foreground-800 resize-none"
            ></textarea>
            <p className="text-[11px] text-foreground-400 text-right mt-1">{reason.length}/500</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium bg-background-100 hover:bg-background-200 text-foreground-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newDate || !newStart || !newEnd}
            className="px-4 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认改约
          </button>
        </div>
      </div>
    </div>
  );
}