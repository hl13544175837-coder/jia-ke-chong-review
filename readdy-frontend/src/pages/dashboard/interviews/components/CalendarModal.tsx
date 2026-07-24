import { useState, useMemo } from 'react';
import { interviewerPool } from '@/mocks/interviews';
import type { Interview } from '@/mocks/interviews';

interface CalendarModalProps {
  interview: Interview;
  onClose: () => void;
  onSave: (data: { date: string; time: string; duration: string }) => void;
}

// Generate mock busy slots for each interviewer (simulating 企业微信 calendar)
function generateMockBusySlots(interviewerId: string): { date: string; start: string; end: string; title: string }[] {
  const today = new Date();
  const slots: { date: string; start: string; end: string; title: string }[] = [];

  // Deterministic seed based on interviewer ID
  const seed = interviewerId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);

  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    // Skip weekends
    const day = date.getDay();
    if (day === 0 || day === 6) continue;

    // Generate 2-4 busy blocks based on seed
    const blockCount = 2 + ((seed + d) % 3);
    const busyHours = [9, 10, 11, 14, 15, 16, 17];
    const picked: number[] = [];

    for (let b = 0; b < blockCount; b++) {
      const idx = (seed * (b + 1) + d * 7) % busyHours.length;
      if (!picked.includes(idx)) {
        picked.push(idx);
        const startH = busyHours[idx];
        const duration = (seed % 2 === 0) ? 1 : 0.5;
        const endH = startH + duration;

        const titles = ['周会', '项目评审', '1on1沟通', '需求对齐', '团队站会', '外部会议', '培训', '面试'];
        slots.push({
          date: dateStr,
          start: `${String(startH).padStart(2, '0')}:${(seed + d) % 2 === 0 ? '00' : '30'}`,
          end: `${String(Math.floor(endH)).padStart(2, '0')}:${endH % 1 === 0.5 ? '30' : '00'}`,
          title: titles[(seed + d + b) % titles.length],
        });
      }
    }
  }
  return slots;
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}/${d.getDate()} ${days[d.getDay()]}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export default function CalendarModal({ interview, onClose, onSave }: CalendarModalProps) {
  const interviewer = interviewerPool.find(iv => iv.id === interview.interviewerId) || null;
  const busySlots = useMemo(
    () => generateMockBusySlots(interview.interviewerId || 'default'),
    [interview.interviewerId]
  );

  const today = useMemo(() => new Date(), []);
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  // Default to the current scheduled date or today
  const defaultDate = interview.scheduledAt
    ? interview.scheduledAt.split(' ')[0]
    : next7Days.find(d => {
        const day = new Date(d + 'T00:00:00').getDay();
        return day !== 0 && day !== 6;
      }) || next7Days[0];

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [selectedTime, setSelectedTime] = useState(
    interview.scheduledAt ? interview.scheduledAt.split(' ')[1]?.slice(0, 5) || '' : ''
  );
  const [duration, setDuration] = useState('60');

  // Build time slots for selected date (9:00 - 18:00, 30-min intervals)
  const timeSlots = useMemo(() => {
    const slots: { time: string; busy: boolean; busyTitle?: string; isPast: boolean }[] = [];
    const now = new Date();
    const isTodayDate = selectedDate === today.toISOString().split('T')[0];

    for (let h = 9; h < 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        // Check if this slot is in the past
        let isPast = false;
        if (isTodayDate) {
          const slotTime = new Date(selectedDate + `T${timeStr}:00`);
          isPast = slotTime < now;
        }

        // Check if this slot overlaps with any busy slot
        const busySlot = busySlots.find(bs => {
          if (bs.date !== selectedDate) return false;
          const slotStart = h * 60 + m;
          const [bsH, bsM] = bs.start.split(':').map(Number);
          const [beH, beM] = bs.end.split(':').map(Number);
          const busyStart = bsH * 60 + bsM;
          const busyEnd = beH * 60 + beM;
          return slotStart >= busyStart && slotStart < busyEnd;
        });

        slots.push({
          time: timeStr,
          busy: !!busySlot || isPast,
          busyTitle: busySlot?.title,
          isPast,
        });
      }
    }
    return slots;
  }, [selectedDate, busySlots, today]);

  const handleConfirm = () => {
    if (!selectedTime) return;
    onSave({
      date: selectedDate,
      time: selectedTime,
      duration,
    });
  };

  const isWeekend = (dateStr: string) => {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[680px] max-h-[90vh] overflow-hidden mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-background-200 flex-shrink-0">
          <div>
            <h3 className="text-lg font-heading font-bold text-foreground-900">
              {interviewer?.name || '面试官'} · 工作日历
            </h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              {interview.candidateName} · {interview.position} · {interview.stage}
              {interviewer && (
                <span className="ml-2 text-foreground-400">
                  面试官：{interviewer.name} · {interviewer.role}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 cursor-pointer flex-shrink-0">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Interviewer Info Bar */}
        {interviewer && (
          <div className="px-6 py-3 bg-secondary-50 border-b border-secondary-100 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary-600">{interviewer.avatar}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground-900">{interviewer.name}</p>
              <p className="text-xs text-foreground-500">{interviewer.role} · {interviewer.department}</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-white border-2 border-primary-400"></span>
                <span className="text-foreground-500">空闲</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-background-200"></span>
                <span className="text-foreground-500">忙碌</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-primary-500"></span>
                <span className="text-foreground-500">已选</span>
              </span>
            </div>
          </div>
        )}

        {/* Day Selector */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {next7Days.map(dateStr => {
              const weekend = isWeekend(dateStr);
              const isSelected = selectedDate === dateStr;
              const todayLabel = isToday(dateStr);

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!weekend) {
                      setSelectedDate(dateStr);
                      setSelectedTime('');
                    }
                  }}
                  disabled={weekend}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-center cursor-pointer transition-all min-w-[72px] ${
                    weekend
                      ? 'border-background-100 bg-background-50 text-foreground-300 cursor-not-allowed'
                      : isSelected
                      ? 'border-primary-300 bg-white shadow-sm ring-1 ring-primary-200'
                      : 'border-background-200 bg-white hover:border-background-300'
                  }`}
                >
                  <p className={`text-xs font-medium ${weekend ? 'text-foreground-300' : isSelected ? 'text-primary-600' : 'text-foreground-500'}`}>
                    {formatDateCN(dateStr)}
                  </p>
                  {todayLabel && !weekend && (
                    <span className={`text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-primary-100 text-primary-600' : 'bg-secondary-100 text-secondary-600'
                    }`}>
                      今天
                    </span>
                  )}
                  {weekend && (
                    <span className="text-[10px] mt-0.5 inline-block text-foreground-300">休息</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <p className="text-sm font-medium text-foreground-700 mb-3">
            {formatDateCN(selectedDate)} · 工作时间 9:00 - 18:00
          </p>

          {/* Time Slots */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {timeSlots.map(slot => {
              const isSelected = selectedTime === slot.time;
              let slotClass = 'border-2 border-primary-300 bg-white hover:border-primary-400 cursor-pointer';
              if (slot.busy) {
                slotClass = 'border border-background-200 bg-background-100/70 cursor-not-allowed opacity-60';
              }
              if (isSelected) {
                slotClass = 'border-2 border-primary-500 bg-primary-500 text-white cursor-pointer';
              }

              return (
                <button
                  key={slot.time}
                  onClick={() => {
                    if (!slot.busy) setSelectedTime(slot.time);
                  }}
                  disabled={slot.busy}
                  className={`px-3 py-2.5 rounded-lg text-center transition-all ${slotClass}`}
                  title={slot.busyTitle || (slot.isPast ? '已过期' : '')}
                >
                  <p className={`text-sm font-medium ${isSelected ? 'text-white' : slot.busy ? 'text-foreground-400' : 'text-foreground-700'}`}>
                    {slot.time}
                  </p>
                  {slot.busyTitle && (
                    <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-white/80' : 'text-foreground-400'}`}>
                      {slot.busyTitle}
                    </p>
                  )}
                  {slot.isPast && !slot.busyTitle && (
                    <p className="text-[10px] mt-0.5 text-foreground-400">已过期</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Duration selector */}
          {selectedTime && (
            <div className="mt-5 p-4 bg-primary-50 rounded-xl border border-primary-100">
              <p className="text-sm font-medium text-primary-700 mb-3">
                已选择：{selectedDate} {selectedTime}
              </p>
              <label className="block text-sm font-medium text-foreground-700 mb-2">预计时长</label>
              <div className="flex gap-2">
                {['30', '45', '60', '90', '120'].map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                      duration === d
                        ? 'bg-primary-500 text-white'
                        : 'bg-white text-foreground-600 border border-background-200 hover:bg-background-50'
                    }`}
                  >
                    {d} 分钟
                  </button>
                ))}
              </div>

              {/* End time preview */}
              {(() => {
                const [h, m] = selectedTime.split(':').map(Number);
                const endTotal = h * 60 + m + parseInt(duration, 10);
                const endH = Math.floor(endTotal / 60);
                const endM = endTotal % 60;
                const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                return (
                  <p className="text-xs text-foreground-500 mt-2">
                    <i className="ri-time-line mr-1"></i>
                    预计 {selectedTime} - {endTime}
                  </p>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-background-200 bg-background-50 rounded-b-2xl flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-foreground-400">
            <i className="ri-wechat-line text-base"></i>
            <span>数据来自企业微信工作日历</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-800 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedTime}
              className="px-5 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-2"
            >
              <i className="ri-calendar-check-line"></i>
              锁定面试时间
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
