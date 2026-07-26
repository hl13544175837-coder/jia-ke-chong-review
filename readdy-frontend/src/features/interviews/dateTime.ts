function interviewUtcDate(value: string) {
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasExplicitZone ? value : `${value}Z`);
}

export function formatInterviewDateTime(value: string | null) {
  if (!value) return '时间待安排';
  const date = interviewUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function interviewHasStarted(value: string | null, now = Date.now()) {
  if (!value) return true;
  const scheduled = interviewUtcDate(value).getTime();
  return Number.isNaN(scheduled) || scheduled <= now;
}

export function interviewDateTimeToLocalInput(value: string | null) {
  if (!value) return '';
  const date = interviewUtcDate(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localInterviewInputToUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
