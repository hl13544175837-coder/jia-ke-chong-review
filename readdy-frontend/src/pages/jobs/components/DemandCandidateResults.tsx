import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  UserPlus,
} from 'lucide-react';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidateMatchResult,
} from '@/features/candidates/types';

interface CandidateStatusView {
  label: string;
  selectable: boolean;
  tone: string;
}

interface DemandCandidateResultsProps {
  matchConfigured: boolean | null;
  requiredSkills: string[];
  loading: boolean;
  loadError: string;
  onReload: () => void;
  candidates: CandidateListItem[];
  matches: Map<number, CandidateMatchResult>;
  selectedIds: Set<number>;
  getStatus: (candidate: CandidateListItem) => CandidateStatusView;
  onToggle: (candidate: CandidateListItem) => void;
  onOpenResume: (candidate: CandidateListItem) => void;
  response: CandidateListResponse;
  page: number;
  onPageChange: (page: number) => void;
}

export default function DemandCandidateResults({
  matchConfigured,
  requiredSkills,
  loading,
  loadError,
  onReload,
  candidates,
  matches,
  selectedIds,
  getStatus,
  onToggle,
  onOpenResume,
  response,
  page,
  onPageChange,
}: DemandCandidateResultsProps) {
  return (
    <>
      {matchConfigured === false && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          <strong>岗位技能尚未配置。</strong> 当前不能计算真实匹配度，请先在需求/JD 中补充技能关键词；候选人仍可按简历条件筛选和查看。
        </div>
      )}
      {matchConfigured && requiredSkills.length > 0 && (
        <div className="border-b border-primary-100 bg-primary-50/40 px-5 py-2 text-xs text-primary-700">
          岗位必备技能：{requiredSkills.join('、')}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-foreground-500">
            <LoaderCircle className="mr-2 animate-spin" size={18} />
            正在读取候选人与岗位信息...
          </div>
        ) : loadError ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <AlertCircle size={24} className="text-red-600" />
            <p className="mt-3 text-sm text-red-700">{loadError}</p>
            <button type="button" onClick={onReload} className="mt-3 rounded-lg border px-3 py-2 text-sm">重试</button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center text-sm text-foreground-500">
            <UserPlus size={26} className="mb-3 text-foreground-300" />
            没有符合条件的候选人，可调整筛选或在右侧直接导入简历。
          </div>
        ) : (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const match = matches.get(candidate.id);
              const status = getStatus(candidate);
              const selected = selectedIds.has(candidate.id);
              return (
                <article
                  key={candidate.id}
                  className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 ${selected ? 'border-primary-400 bg-primary-50' : 'border-background-200 bg-white'}`}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(candidate)}
                    disabled={!status.selectable}
                    aria-label={`${selected ? '取消选择' : '选择'} ${candidate.name_masked}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-primary-500 text-white' : status.selectable ? 'bg-background-100 text-foreground-600 hover:bg-primary-100' : 'cursor-not-allowed bg-background-100 text-foreground-300'}`}
                  >
                    {selected ? '✓' : candidate.name_masked.slice(0, 1) || '候'}
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground-900">{candidate.name_masked}</span>
                      <span className={`rounded px-2 py-0.5 text-[11px] ${status.tone}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-foreground-500">
                      {candidate.education_summary || '学历信息待补充'} · {candidate.intent_city || '城市待补充'} · {candidate.top_tags?.slice(0, 3).map((item) => item.tag).join('、') || '技能待补充'}
                    </p>
                    {match?.matched_tags.length ? (
                      <p className="mt-1 truncate text-[11px] text-primary-600">
                        命中：{match.matched_tags.slice(0, 4).join('、')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenResume(candidate)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 text-xs font-medium text-foreground-700 hover:bg-background-50"
                    >
                      <Eye size={14} />查看简历
                    </button>
                    <span className="min-w-16 text-right">
                      {matchConfigured === false ? (
                        <><span className="block text-xs font-semibold text-amber-700">未配置</span><span className="text-[10px] text-foreground-400">匹配度</span></>
                      ) : (
                        <><span className="block text-lg font-bold text-primary-700">{Math.round(match?.score ?? 0)}</span><span className="text-[10px] text-foreground-400">岗位匹配度</span></>
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-background-100 px-5 py-2.5">
        <p className="text-xs text-foreground-500">
          第 {response.page} / {response.pages} 页 · 每页 {response.per_page} 位
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 px-2.5 text-xs disabled:opacity-40"
          >
            <ChevronLeft size={14} />上一页
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(response.pages, page + 1))}
            disabled={loading || page >= response.pages}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 px-2.5 text-xs disabled:opacity-40"
          >
            下一页<ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
