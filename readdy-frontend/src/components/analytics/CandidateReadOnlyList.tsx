import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { AnalyticsCandidateRow } from '@/features/analytics/types';

function displayTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function nextResponsibility(candidate: AnalyticsCandidateRow) {
  if (candidate.stage === 'pending' || candidate.stage === 'ai_screen') return '招聘专员完成筛选并推进下一阶段';
  if (candidate.stage === 'business_review') return '业务面试官完成判断，招聘专员负责催办';
  if (candidate.stage === 'interview') return '面试官提交反馈，招聘专员跟进结果';
  if (candidate.stage === 'offer') return '招聘主管确认 Offer，招聘专员跟进候选人回复';
  if (candidate.stage === 'onboarded') return '招聘专员确认入职资料并完成归档';
  if (candidate.stage === 'rejected') return '流程已结束；如需继续使用，由招聘专员重新激活';
  if (candidate.stage === 'transferred') return '已转至其他岗位，由新岗位负责人继续跟进';
  return '由招聘主管确认当前责任人和下一步';
}

export default function CandidateReadOnlyList({
  candidates,
  emptyText = '当前岗位下没有符合本次统计口径的候选人记录。',
}: {
  candidates: AnalyticsCandidateRow[];
  emptyText?: string;
}) {
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(null);

  if (!candidates.length) {
    return <p className="rounded-lg bg-background-50 px-3 py-5 text-center text-xs text-foreground-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {candidates.map((candidate) => {
        const expanded = expandedCandidateId === candidate.candidate_id;
        return (
          <div key={candidate.candidate_id} className="overflow-hidden rounded-lg border border-background-200 bg-white">
            <button
              type="button"
              data-ui="analytics-candidate-detail"
              aria-expanded={expanded}
              onClick={() => setExpandedCandidateId(expanded ? null : candidate.candidate_id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-background-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-200"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground-900">{candidate.candidate_name}</span>
                <span className="mt-0.5 block text-xs text-foreground-500">当前阶段：{candidate.stage_label} · 已停留 {candidate.age_days} 天</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-700">
                {expanded ? '收起' : '查看责任'}<ChevronRight size={13} className={expanded ? 'rotate-90' : ''} />
              </span>
            </button>
            {expanded && (
              <div className="border-t border-background-100 bg-background-50/60 px-3 py-3 text-xs leading-5 text-foreground-600">
                <p>最后处理人：<span className="font-medium text-foreground-900">{candidate.last_actor_name || '未记录'}</span></p>
                <p>最近更新：<span className="font-medium text-foreground-900">{displayTime(candidate.updated_at)}</span></p>
                <p className="mt-2 rounded-md bg-primary-50 px-3 py-2 text-primary-800">下一步责任：{nextResponsibility(candidate)}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
