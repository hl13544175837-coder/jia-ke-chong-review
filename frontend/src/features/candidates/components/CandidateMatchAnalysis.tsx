import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Badge, Button, ErrorState, Spinner } from '../../../components/ui';
import { useAsync } from '../../../lib/useAsync';
import { candidatesApi } from '../api';

interface CandidateMatchAnalysisProps {
  candidateId: number;
  jobId: number | null;
  jobTitle?: string | null;
  children: ReactNode;
}

export function CandidateMatchAnalysis({
  candidateId,
  jobId,
  jobTitle,
  children,
}: CandidateMatchAnalysisProps) {
  const [expanded, setExpanded] = useState(true);
  const matchAsync = useAsync(
    () => jobId
      ? candidatesApi.previewJobMatch(jobId, [candidateId])
      : Promise.resolve(null),
    [candidateId, jobId],
  );
  const match = matchAsync.data?.results.find((item) => item.candidate_id === candidateId) ?? null;

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
      <header className="flex items-center justify-between gap-4 border-b border-hairline-soft px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft">
            <Sparkles className="h-4 w-4 text-ink" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">匹配分析</h2>
            <p className="mt-0.5 truncate text-xs text-muted-soft">
              {jobTitle ? `目标岗位：${jobTitle}` : '选择候选人所在流程后查看岗位匹配'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? '收起 AI 面板' : '展开 AI 面板'}
        </Button>
      </header>

      {expanded && (
        <div className="space-y-5 p-5">
          <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm leading-6 text-warning-700">
            AI 匹配结果仅供辅助，不作为淘汰、推进或 Offer 决定。
          </div>

          {!jobId ? (
            <div className="rounded-lg border border-dashed border-hairline px-4 py-8 text-center">
              <p className="text-sm font-semibold text-ink">暂无目标岗位</p>
              <p className="mt-2 text-sm text-muted">可在「招聘操作」中选择当前流程岗位。</p>
            </div>
          ) : matchAsync.loading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : matchAsync.error ? (
            <ErrorState message={matchAsync.error.message} onRetry={matchAsync.reload} />
          ) : match ? (
            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="flex flex-col justify-between rounded-lg bg-ink px-5 py-5 text-white">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Match score</span>
                <strong className="mt-6 text-4xl font-semibold tabular-nums">{Math.round(match.score)}</strong>
                <span className="mt-1 text-xs text-white/60">100 分制辅助参考</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-hairline px-4 py-4">
                  <p className="text-xs font-semibold text-muted">已匹配证据</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.matched_tags.length > 0
                      ? match.matched_tags.map((tag) => <Badge key={tag} tone="success">{tag}</Badge>)
                      : <span className="text-sm text-muted-soft">暂无明确命中标签</span>}
                  </div>
                </div>
                <div className="rounded-lg border border-hairline px-4 py-4">
                  <p className="text-xs font-semibold text-muted">待人工确认</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.missing_tags.length > 0
                      ? match.missing_tags.map((tag) => <Badge key={tag} tone="warning">{tag}</Badge>)
                      : <span className="text-sm text-muted-soft">未发现明显缺口标签</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-sm text-muted">
              当前岗位暂无可用匹配结果。
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-2">{children}</div>
        </div>
      )}
    </section>
  );
}
