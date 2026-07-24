import { useState, useMemo } from 'react';
import type { Interview } from '@/mocks/interviews';

interface InterviewCalendarViewProps {
  interviews: Interview[];
  onInterviewClick: (interview: Interview) => void;
}

const statusBadgeStyles: Record<string, string> = {
  '待安排': 'bg-amber-50 text-amber-700 border border-amber-200',
  '待面试': 'bg-primary-50 text-primary-700 border border-primary-200',
  '待面试反馈': 'bg-accent-50 text-accent-700 border border-accent-200',
  '待处理结果': 'bg-primary-50 text-primary-700 border border-primary-200',
  '已处理': 'bg-background-100 text-foreground-500 border border-background-200',
};

const statusLabelMap: Record<string, string> = {
  '待安排': '待安排',
  '待面试': '待面试',
  '待面试反馈': '待反馈',
  '待处理结果': '待处理',
  '已处理': '已处理',
};

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

function getDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split(' ');
  return parts[0] || '';
}

function getTimeLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split(' ');
  return parts[1] || '';
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }
  if (days.length < 42) {
    const trailing = 42 - days.length;
    for (let i = 0; i < trailing; i++) {
      days.push(null);
    }
  }
  return days;
}

export default function InterviewCalendarView({ interviews, onInterviewClick }: InterviewCalendarViewProps) {
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const calendarDays = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Group interviews by date
  const grouped = useMemo(() => {
    const map: Record<string, Interview[]> = {};
    interviews.forEach(iv => {
      const dateKey = iv.scheduledAt ? getDateLabel(iv.scheduledAt) : '待安排';
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(iv);
    });
    return map;
  }, [interviews]);

  const sortedKeys = useMemo(() => Object.keys(grouped).sort((a, b) => {
    if (a === '待安排') return 1;
    if (b === '待安排') return -1;
    return a.localeCompare(b);
  }), [grouped]);

  const todayStr = today.toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-heading font-bold text-foreground-900">
            {currentYear}年{currentMonth + 1}月
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-s-line"></i>
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-medium rounded-full border border-background-200 hover:bg-background-100 text-foreground-600 cursor-pointer whitespace-nowrap transition-colors"
          >
            今天
          </button>
          <button
            onClick={goToNextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-right-s-line"></i>
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 px-1">
        {weekDays.map(day => (
          <div key={day} className="text-center text-[11px] font-medium text-foreground-400 py-1">{day}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 px-1">
        {calendarDays.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="min-h-[90px] border border-transparent rounded-lg" />;
          }
          const dateStr = day.toISOString().split('T')[0];
          const dayInterviews = grouped[dateStr] || [];
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const isCurrentMonth = day.getMonth() === currentMonth;

          if (!isCurrentMonth) {
            return (
              <div key={i} className="min-h-[90px] border border-background-100/50 rounded-lg p-1.5 bg-background-50/30">
                <div className="text-[11px] font-medium text-foreground-300 mb-1">{day.getDate()}</div>
                {dayInterviews.length > 0 && (
                  <p className="text-[10px] text-foreground-300 px-1.5">{dayInterviews.length} 场面试</p>
                )}
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`min-h-[90px] border rounded-lg p-1.5 transition-colors ${
                isToday ? 'border-primary-300 bg-primary-50/30' :
                isPast ? 'border-background-100 bg-background-50/50' :
                'border-background-100 bg-white'
              }`}
            >
              <div className={`text-[11px] font-medium mb-1 ${isToday ? 'text-primary-600' : 'text-foreground-400'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayInterviews.slice(0, 2).map(iv => (
                  <button
                    key={iv.id}
                    onClick={() => onInterviewClick(iv)}
                    className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight cursor-pointer transition-colors truncate ${
                      iv.status === '待面试' ? 'bg-primary-100 text-primary-700 hover:bg-primary-200' :
                      iv.status === '待面试反馈' ? 'bg-accent-100 text-accent-700 hover:bg-accent-200' :
                      iv.status === '待处理结果' ? 'bg-primary-100 text-primary-700 hover:bg-primary-200' :
                      iv.status === '已处理' ? 'bg-background-100 text-foreground-500 hover:bg-background-200' :
                      'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                  >
                    {getTimeLabel(iv.scheduledAt)?.substring(0, 5)} {iv.candidateName}
                  </button>
                ))}
                {dayInterviews.length > 2 && (
                  <p className="text-[10px] text-foreground-400 px-1.5">+{dayInterviews.length - 2} 场</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interview list below calendar */}
      <div className="mt-6 space-y-4">
        {sortedKeys.map(dateKey => {
          const dayInterviews = grouped[dateKey];
          const isUnscheduled = dateKey === '待安排';
          const isToday = dateKey === todayStr;

          return (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className={`text-sm font-semibold ${isUnscheduled ? 'text-amber-600' : isToday ? 'text-primary-600' : 'text-foreground-700'}`}>
                  {isUnscheduled ? '待安排' : dateKey}
                </h4>
                {isToday && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 font-medium">今天</span>
                )}
                <span className="text-xs text-foreground-400">({dayInterviews.length})</span>
              </div>
              <div className="space-y-1.5">
                {dayInterviews.map(iv => (
                  <button
                    key={iv.id}
                    onClick={() => onInterviewClick(iv)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-background-200 rounded-lg hover:border-background-300 transition-colors cursor-pointer text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-semibold text-primary-600">{iv.candidateAvatar}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground-800">{iv.candidateName}</span>
                        <span className="text-xs text-foreground-400">·</span>
                        <span className="text-xs text-foreground-500">{iv.position}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {iv.scheduledAt && (
                          <span className="text-xs text-foreground-400 flex items-center gap-1">
                            <i className="ri-time-line text-[10px]"></i>
                            {getTimeLabel(iv.scheduledAt)?.substring(0, 5)}
                            {iv.scheduledEndAt && ` - ${getTimeLabel(iv.scheduledEndAt)?.substring(0, 5)}`}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-600 font-medium">{iv.stage}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadgeStyles[iv.status]}`}>
                      {statusLabelMap[iv.status]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}