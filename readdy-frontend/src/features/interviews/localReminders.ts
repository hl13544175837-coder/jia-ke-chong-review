import type { InterviewAssignment } from './types';

export type LocalInterviewReminderKind =
  | 'starting_soon'
  | 'needs_confirmation'
  | 'needs_feedback';

function interviewTime(value: string) {
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasExplicitZone ? value : `${value}Z`).getTime();
}

export function localReminderKind(
  item: InterviewAssignment,
  now = new Date(),
): LocalInterviewReminderKind | null {
  if (item.feedback_submitted) return null;
  if (item.status === 'awaiting_feedback') return 'needs_feedback';
  if (!item.scheduled_at || item.status !== 'scheduled') return null;

  const minutesUntilStart = (interviewTime(item.scheduled_at) - now.getTime()) / 60_000;
  if (Number.isNaN(minutesUntilStart)) return null;
  if (minutesUntilStart < 0) return 'needs_confirmation';
  if (minutesUntilStart <= 120) return 'starting_soon';
  return null;
}
