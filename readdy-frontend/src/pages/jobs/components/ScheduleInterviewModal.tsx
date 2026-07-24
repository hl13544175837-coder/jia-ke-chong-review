import { useState, useMemo } from 'react';
import { interviewerPool } from '@/mocks/interviews';

interface ScheduleInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateName: string;
  position: string;
  onSchedule: (data: {
    round: string;
    interviewer: string;
    interviewerId: string;
    date: string;
    time: string;
    type: string;
    location: string;
  }) => void;
}

const interviewRounds = ['一面', '二面', '终面'];
const interviewTypes = ['线下面试', '视频面试', '电话面试'];

export default function ScheduleInterviewModal({
  isOpen,
  onClose,
  candidateName,
  position,
  onSchedule,
}: ScheduleInterviewModalProps) {
  const [round, setRound] = useState('一面');
  const [interviewerId, setInterviewerId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('线下面试');
  const [location, setLocation] = useState('');

  const selectedInterviewer = useMemo(
    () => interviewerPool.find((iv) => iv.id === interviewerId),
    [interviewerId]
  );

  const isValid = interviewerId && date && time && (type !== '线下面试' || location.trim());

  const handleSubmit = () => {
    if (!isValid || !selectedInterviewer) return;
    onSchedule({
      round,
      interviewer: selectedInterviewer.name,
      interviewerId,
      date,
      time,
      type,
      location: type === '线下面试' ? location : (type === '视频面试' ? '腾讯会议' : '电话沟通'),
    });
    // Reset form
    setRound('一面');
    setInterviewerId('');
    setDate('');
    setTime('');
    setType('线下面试');
    setLocation('');
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-foreground-900/40 z-[80]"
        onClick={onClose}
      ></div>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col pointer-events-auto animate-modal-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h3 className="text-base font-bold text-foreground-900">安排面试</h3>
              <p className="text-xs text-foreground-400 mt-0.5">
                {candidateName} · {position}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4 overflow-y-auto max-h-[500px]">
            {/* Round */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试轮次</label>
              <div className="flex gap-2">
                {interviewRounds.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRound(r)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      round === r
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-foreground-600 border-background-200 hover:border-primary-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Interviewer */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试官</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto">
                {interviewerPool.map((iv) => (
                  <button
                    key={iv.id}
                    onClick={() => setInterviewerId(iv.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer border ${
                      interviewerId === iv.id
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-background-200 bg-white hover:bg-background-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      interviewerId === iv.id ? 'bg-primary-500 text-white' : 'bg-background-200 text-foreground-600'
                    }`}>
                      {iv.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-900 truncate">{iv.name}</p>
                      <p className="text-xs text-foreground-400 truncate">{iv.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试时间</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试方式</label>
              <div className="flex gap-2">
                {interviewTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      type === t
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-foreground-600 border-background-200 hover:border-primary-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            {type === '线下面试' && (
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">面试地址</label>
                <input
                  type="text"
                  placeholder="例：总部3楼会议室A"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-background-100">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white border border-background-200 hover:bg-background-50 text-foreground-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isValid
                  ? 'bg-primary-500 hover:bg-primary-600 text-white'
                  : 'bg-background-200 text-foreground-400 cursor-not-allowed'
              }`}
            >
              <i className="ri-calendar-check-line mr-1.5"></i>
              确认安排
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modalIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}