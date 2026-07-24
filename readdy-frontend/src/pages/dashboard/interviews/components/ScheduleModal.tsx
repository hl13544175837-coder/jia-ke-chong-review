import { useState, useRef, useEffect } from 'react';
import { interviewerPool } from '@/mocks/interviews';
import type { Interview } from '@/mocks/interviews';

interface ScheduleModalProps {
  interview: Interview;
  onClose: () => void;
  onSave: (data: {
    interviewerId: string;
    interviewerName: string;
    interviewerRole: string;
    date: string;
    time: string;
    duration: string;
    type: string;
    location: string;
    wecomSync: boolean;
    notifyCandidate: boolean;
    notifyInterviewer: boolean;
  }) => void;
  mode?: 'create' | 'adjust';
  onCancelInterview?: (interview: Interview) => void;
  onRestoreInterview?: (interview: Interview) => void;
}

const meetingTypes = ['线下面试', '视频面试', '企业微信会议'];

export default function ScheduleModal({ interview, onClose, onSave, mode = 'create', onCancelInterview, onRestoreInterview }: ScheduleModalProps) {
  const [selectedInterviewer, setSelectedInterviewer] = useState(
    interview.interviewerId
      ? interviewerPool.find(iv => iv.id === interview.interviewerId) || null
      : null
  );
  const [interviewerDropdownOpen, setInterviewerDropdownOpen] = useState(false);
  const [interviewerSearch, setInterviewerSearch] = useState('');
  const [date, setDate] = useState(interview.scheduledAt ? interview.scheduledAt.split(' ')[0] : '');
  const [time, setTime] = useState(interview.scheduledAt ? interview.scheduledAt.split(' ')[1]?.slice(0, 5) || '' : '');
  const [duration, setDuration] = useState('60');
  const [meetingType, setMeetingType] = useState(interview.type || '线下面试');
  const [location, setLocation] = useState(interview.location || '');
  const [wecomSync, setWecomSync] = useState(true);
  const [notifyCandidate, setNotifyCandidate] = useState(true);
  const [notifyInterviewer, setNotifyInterviewer] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setInterviewerDropdownOpen(false);
        setInterviewerSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredInterviewers = interviewerPool.filter(iv =>
    !interviewerSearch || iv.name.includes(interviewerSearch) || iv.role.includes(interviewerSearch) || iv.department.includes(interviewerSearch)
  );

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!selectedInterviewer) newErrors.interviewer = '请选择面试官';
    if (!date) newErrors.date = '请选择日期';
    if (!time) newErrors.time = '请选择时间';
    if (meetingType === '线下面试' && !location.trim()) newErrors.location = '请填写面试地点';
    if ((meetingType === '视频面试' || meetingType === '企业微信会议') && !location.trim()) newErrors.location = '请填写会议链接';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      interviewerId: selectedInterviewer!.id,
      interviewerName: selectedInterviewer!.name,
      interviewerRole: selectedInterviewer!.role,
      date,
      time,
      duration,
      type: meetingType,
      location: location.trim(),
      wecomSync,
      notifyCandidate,
      notifyInterviewer,
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-lg w-full max-w-[520px] max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-background-200">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">
              {mode === 'adjust' ? '调整面试' : '安排面试'}
            </h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              {interview.candidateName} · {interview.position} · {interview.stage}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Interviewer */}
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-2">面试官 <span className="text-red-500">*</span></label>
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setInterviewerDropdownOpen(!interviewerDropdownOpen)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                  errors.interviewer ? 'border-red-400 bg-red-50' : 'border-background-300 bg-white hover:border-background-400'
                }`}
              >
                {selectedInterviewer ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-600">{selectedInterviewer.avatar}</span>
                    </div>
                    <span className="text-foreground-900 font-medium">{selectedInterviewer.name}</span>
                    <span className="text-foreground-400 text-xs">· {selectedInterviewer.role} · {selectedInterviewer.department}</span>
                  </div>
                ) : (
                  <span className="text-foreground-400">选择面试官</span>
                )}
                <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${interviewerDropdownOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {errors.interviewer && <p className="text-xs text-red-500 mt-1">{errors.interviewer}</p>}
              {interviewerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-10 max-h-[260px] overflow-hidden">
                  <div className="p-2 border-b border-background-100">
                    <div className="relative">
                      <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
                      <input
                        type="text"
                        value={interviewerSearch}
                        onChange={e => setInterviewerSearch(e.target.value)}
                        placeholder="搜索面试官..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-background-200 rounded-lg focus:outline-none focus:border-primary-400 bg-background-50"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[200px]">
                    {filteredInterviewers.map(iv => (
                      <button
                        key={iv.id}
                        onClick={() => {
                          setSelectedInterviewer(iv);
                          setInterviewerDropdownOpen(false);
                          setInterviewerSearch('');
                          setErrors(prev => ({ ...prev, interviewer: '' }));
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-background-50 transition-colors cursor-pointer ${
                          selectedInterviewer?.id === iv.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{iv.avatar}</span>
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-foreground-900">{iv.name}</div>
                          <div className="text-xs text-foreground-400">{iv.role} · {iv.department}</div>
                        </div>
                      </button>
                    ))}
                    {filteredInterviewers.length === 0 && (
                      <p className="text-sm text-foreground-400 text-center py-6">无匹配面试官</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-2">面试日期 <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={e => { setDate(e.target.value); setErrors(prev => ({ ...prev, date: '' })); }}
                className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:border-primary-400 transition-colors ${
                  errors.date ? 'border-red-400 bg-red-50' : 'border-background-300 bg-white'
                }`}
              />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-2">开始时间 <span className="text-red-500">*</span></label>
              <input
                type="time"
                value={time}
                onChange={e => { setTime(e.target.value); setErrors(prev => ({ ...prev, time: '' })); }}
                className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:border-primary-400 transition-colors ${
                  errors.time ? 'border-red-400 bg-red-50' : 'border-background-300 bg-white'
                }`}
              />
              {errors.time && <p className="text-xs text-red-500 mt-1">{errors.time}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-2">预计时长</label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-background-300 bg-white text-sm focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              <option value="30">30 分钟</option>
              <option value="45">45 分钟</option>
              <option value="60">60 分钟</option>
              <option value="90">90 分钟</option>
              <option value="120">120 分钟</option>
            </select>
          </div>

          {/* Meeting type */}
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-2">面试方式</label>
            <div className="flex gap-2">
              {meetingTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setMeetingType(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                    meetingType === t
                      ? 'bg-primary-500 text-white'
                      : 'bg-background-100 text-foreground-600 hover:bg-background-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Location / Link */}
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-2">
              {meetingType === '线下面试' ? '会议室' : '会议链接'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={e => { setLocation(e.target.value); setErrors(prev => ({ ...prev, location: '' })); }}
              placeholder={meetingType === '线下面试' ? '如：总部3楼会议室A' : '如：腾讯会议链接或企业微信会议号'}
              className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:border-primary-400 transition-colors ${
                errors.location ? 'border-red-400 bg-red-50' : 'border-background-300 bg-white'
              }`}
            />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
          </div>

          {/* Notification options */}
          <div className="bg-background-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-foreground-700 mb-2">通知与同步</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wecomSync}
                onChange={e => setWecomSync(e.target.checked)}
                className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
              />
              <div>
                <span className="text-sm text-foreground-800">同步企业微信日程</span>
                <p className="text-xs text-foreground-400 mt-0.5">自动在双方面试官和候选人的企业微信中创建会议日程</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyCandidate}
                onChange={e => setNotifyCandidate(e.target.checked)}
                className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
              />
              <span className="text-sm text-foreground-800">通知候选人</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyInterviewer}
                onChange={e => setNotifyInterviewer(e.target.checked)}
                className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
              />
              <span className="text-sm text-foreground-800">通知面试官</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-background-200 bg-background-50 rounded-b-2xl">
          <div className="flex items-center gap-3">
            {mode === 'adjust' && interview.status === '待面试' && onCancelInterview && (
              <button
                onClick={() => onCancelInterview(interview)}
                className="px-5 py-2.5 text-sm font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-2"
              >
                <i className="ri-close-circle-line"></i>
                取消面试
              </button>
            )}
            {mode === 'adjust' && interview.status === '已取消' && onRestoreInterview && (
              <button
                onClick={() => onRestoreInterview(interview)}
                className="px-5 py-2.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-white border border-emerald-200 hover:border-emerald-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-2"
              >
                <i className="ri-refresh-line"></i>
                恢复面试
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-800 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="px-5 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-2"
            >
              <i className="ri-calendar-check-line"></i>
              {mode === 'adjust' ? '确认调整' : '确认安排'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}