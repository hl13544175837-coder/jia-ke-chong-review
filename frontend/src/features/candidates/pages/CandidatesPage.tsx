// 简历库页面 — 展示上传后由 AI 解析出的候选人简历摘要、技能标签与筛选结果。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RotateCcw, Target, Upload, UserPlus, Users, X } from 'lucide-react';
import { candidatesApi as api } from '../api';
import { formatDate } from '../../../lib/formatDate';
import { useDebounce } from '../../../lib/useDebounce';
import { useAsync } from '../../../lib/useAsync';
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../../../lib/sourceChannels';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
} from '../../../components/ui';
import {
  EnterpriseEmptyState,
  EnterpriseHero,
  EnterpriseMetric,
  EnterprisePage,
  EnterpriseSearchPanel,
  EnterpriseTableCard,
} from '../../../components/enterprise';
import { Reveal, AnimatedNumber } from '../../../components/motion';
import type { CandidateListItem, CandidateTag, MatchResultItem, ParseStatus } from '../types';

const TAG_TONES = ['accent', 'purple', 'teal', 'info', 'neutral'] as const;
const COMMON_SOURCE_OPTIONS = RESUME_SOURCE_CHANNEL_OPTIONS.filter((channel) => channel !== '其他');
const COMMON_CITY_OPTIONS = [
  '北京',
  '上海',
  '深圳',
  '广州',
  '杭州',
  '成都',
  '武汉',
  '南京',
  '苏州',
  '西安',
  '长沙',
  '重庆',
  '天津',
  '厦门',
  '合肥',
  '郑州',
  '青岛',
  '宁波',
  '佛山',
  '东莞',
  '远程',
] as const;
const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '待解析',
  processing: '解析中',
  ok: '解析成功',
  failed: '解析失败',
};

function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function scoreTone(score: number) {
  if (score >= 5) return 'success';
  if (score >= 4) return 'accent';
  if (score >= 3) return 'warning';
  return 'neutral';
}

function ScorePill({ score }: { score: number }) {
  if (!score) return <span className="text-muted-soft">—</span>;
  return <Badge tone={scoreTone(score)}>{score} 分</Badge>;
}

function ParseStatusPill({ status }: { status?: ParseStatus }) {
  if (!status) return null;
  const tone = status === 'failed' ? 'danger' : status === 'ok' ? 'success' : 'warning';
  return <Badge tone={tone}>{PARSE_STATUS_LABELS[status]}</Badge>;
}

function ResumeSummary({ candidate }: { candidate: CandidateListItem }) {
  const exp = candidate.latest_experience;
  return (
    <div className="min-w-[220px] space-y-1">
      {exp?.company || exp?.position ? (
        <p className="font-medium text-ink">
          {[exp.position, exp.company].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <p className="text-muted-soft">暂无工作经历</p>
      )}
      {exp?.duration && <p className="text-xs text-muted-soft">{exp.duration}</p>}
      {candidate.intent_city && (
        <p className="text-xs text-muted">意向城市：{candidate.intent_city}</p>
      )}
      {candidate.education_summary && (
        <p className="text-xs text-muted">{candidate.education_summary}</p>
      )}
    </div>
  );
}

function SkillBadges({ candidate }: { candidate: CandidateListItem }) {
  const tags = candidateTags(candidate);
  if (tags.length === 0) return <span className="text-muted-soft">暂无标签</span>;
  const visibleTags = tags.slice(0, 3);
  const hiddenCount = Math.max((candidate.tag_count ?? tags.length) - visibleTags.length, 0);
  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {visibleTags.map((skill, index) => (
        <Badge key={`${skill.tag}-${skill.score}`} tone={TAG_TONES[index % TAG_TONES.length]}>
          {skill.tag} · {skill.score}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge tone="neutral">+{hiddenCount}</Badge>
      )}
    </div>
  );
}

function JobFitSummary({
  candidate,
  jobFit,
  hasTargetJob,
  loading,
  error,
}: {
  candidate: CandidateListItem;
  jobFit: MatchResultItem | null;
  hasTargetJob: boolean;
  loading: boolean;
  error: boolean;
}) {
  if (!hasTargetJob) {
    return <SkillBadges candidate={candidate} />;
  }

  if (loading) {
    return <span className="text-xs text-muted-soft">正在计算岗位匹配…</span>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-danger-600">岗位匹配预览失败</span>
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  if (!jobFit) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-muted-soft">暂无岗位匹配结果</span>
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  const matched = Array.isArray(jobFit.matched_tags) ? jobFit.matched_tags : [];
  const missing = Array.isArray(jobFit.missing_tags) ? jobFit.missing_tags : [];

  return (
    <div className="max-w-[460px] space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">后端匹配 {jobFit.score}%</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {matched.length > 0 ? (
          matched.slice(0, 3).map((tag) => (
            <Badge key={`matched-${tag}`} tone="success">
              命中要求 · {tag}
            </Badge>
          ))
        ) : (
          <Badge tone="neutral">命中要求 · 暂无</Badge>
        )}
        {missing.slice(0, 2).map((tag) => (
          <Badge key={`missing-${tag}`} tone="warning">
            欠缺 · {tag}
          </Badge>
        ))}
        {missing.length > 2 && <Badge tone="neutral">欠缺 +{missing.length - 2}</Badge>}
      </div>
    </div>
  );
}

function SourceSummary({ candidate }: { candidate: CandidateListItem }) {
  const source = candidate.source;
  if (!source) {
    return (
      <div className="space-y-2">
        <span className="text-muted-soft">未记录来源</span>
        <div>
          <ParseStatusPill status={candidate.parse_status} />
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-[160px] space-y-1 text-xs">
      <p className="font-medium text-ink">
        来源渠道：{source.channel || '未填写'}
      </p>
      <p className="text-muted">
        目标岗位：{source.target_job_title || '未关联'}
      </p>
      {(source.target_job_city || source.target_job_department) && (
        <p className="text-muted-soft">
          岗位归属：{source.target_job_city || '未设置'} / {source.target_job_department || '未设置'}
        </p>
      )}
      {source.referrer && <p className="text-muted-soft">推荐人：{source.referrer}</p>}
      <div className="pt-1">
        <ParseStatusPill status={candidate.parse_status} />
      </div>
    </div>
  );
}

interface CandidateRowProps {
  candidate: CandidateListItem;
  selected: boolean;
  targetDemandId: string;
  jobFit: MatchResultItem | null;
  jobFitLoading: boolean;
  jobFitError: boolean;
  addingCandidateId: number | null;
  onSelect: (candidateId: number, selected: boolean) => void;
  onPreview: (candidate: CandidateListItem) => void;
  onAddToDemand: (candidateId: number) => void;
}

function CandidateRow({
  candidate,
  selected,
  targetDemandId,
  jobFit,
  jobFitLoading,
  jobFitError,
  addingCandidateId,
  onSelect,
  onPreview,
  onAddToDemand,
}: CandidateRowProps) {
  const isAdding = addingCandidateId === candidate.id;
  return (
    <tr className="border-b border-hairline-soft transition-colors hover:bg-surface-soft last:border-0">
      <td className="px-4 py-4 text-center">
        <input
          type="checkbox"
          aria-label={`选择 ${candidate.name_masked || `候选人 #${candidate.id}`}`}
          checked={selected}
          onChange={(event) => onSelect(candidate.id, event.target.checked)}
          className="h-4 w-4 rounded border-[#d9d5d0] text-[#379f70] focus:ring-[#379f70]"
        />
      </td>
      <td className="px-5 py-4">
        <div className="min-w-[180px]">
          <Link
            to={`/candidates/${candidate.id}`}
            className="font-medium text-ink hover:underline"
          >
            {candidate.name_masked || `候选人 #${candidate.id}`}
          </Link>
          <div className="mt-1 space-y-0.5 text-xs text-muted-soft">
            {candidate.email_masked && <p>{candidate.email_masked}</p>}
            {candidate.phone_masked && <p>{candidate.phone_masked}</p>}
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-sm">
        <ResumeSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <JobFitSummary
          candidate={candidate}
          jobFit={jobFit}
          hasTargetJob={Boolean(targetDemandId)}
          loading={jobFitLoading}
          error={jobFitError}
        />
      </td>
      <td className="px-5 py-4">
        <SourceSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <ScorePill score={candidate.max_score ?? 0} />
      </td>
      <td className="px-5 py-4 text-sm text-muted">{formatDate(candidate.created_at)}</td>
      <td className="px-5 py-4 text-right">
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => onPreview(candidate)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#379f70] transition-colors hover:text-[#26784f]"
          >
            <Eye className="h-3.5 w-3.5" />
            快速查看
          </button>
          <Link
            to={`/candidates/${candidate.id}`}
            className="text-xs font-medium text-accent-blue transition-colors hover:underline"
          >
            查看完整简历
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isAdding}
            disabled={!targetDemandId || isAdding}
            onClick={() => onAddToDemand(candidate.id)}
          >
            <UserPlus className="h-4 w-4" />
            加入所选需求
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function CandidatesPage() {
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const composingRef = useRef(false);
  const [cityFilter, setCityFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sourceChannelFilter, setSourceChannelFilter] = useState('all');
  const [parseStatusFilter, setParseStatusFilter] = useState<'all' | ParseStatus>('all');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<'all' | 'in_pipeline' | 'not_in_pipeline'>('all');
  const [scoreFilter, setScoreFilter] = useState('0');
  const [targetDemandId, setTargetDemandId] = useState('');
  const [addingCandidateId, setAddingCandidateId] = useState<number | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [candidatePreview, setCandidatePreview] = useState<CandidateListItem | null>(null);
  const [batchAdding, setBatchAdding] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100 }),
    [],
  );
  const scopeCountsAsync = useAsync(async () => {
    const [all, inPipeline, talentPool] = await Promise.all([
      api.searchCandidates({ page: 1, per_page: 1 }),
      api.searchCandidates({ pipeline_status: 'in_pipeline', page: 1, per_page: 1 }),
      api.searchCandidates({ pipeline_status: 'not_in_pipeline', page: 1, per_page: 1 }),
    ]);
    return {
      all: all.total,
      in_pipeline: inPipeline.total,
      not_in_pipeline: talentPool.total,
    };
  }, []);

  const { data, loading, error, reload } = useAsync(
    () => api.searchCandidates({
      search: debouncedQuery || undefined,
      city: cityFilter === 'all' ? undefined : cityFilter,
      source_channel: sourceChannelFilter === 'all' ? undefined : sourceChannelFilter,
      parse_status: parseStatusFilter === 'all' ? undefined : parseStatusFilter,
      pipeline_status: pipelineStatusFilter === 'all' ? undefined : pipelineStatusFilter,
      page,
      per_page: 20,
      sort_by: 'created_at',
      sort_order: 'desc',
    }),
    [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, pipelineStatusFilter, page],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, pipelineStatusFilter]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const resultTotal = data?.total ?? candidates.length;
  const hasServerFilters =
    debouncedQuery.trim() !== '' ||
    cityFilter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    parseStatusFilter !== 'all' ||
    pipelineStatusFilter !== 'all';

  useEffect(() => {
    if (data && !hasServerFilters) {
      setLibraryTotal(data.total);
    }
  }, [data, hasServerFilters]);

  const totalCandidates = libraryTotal ?? resultTotal;
  const selectedDemand = useMemo(
    () => (demandsAsync.data?.items ?? []).find(
      (demand) => String(demand.id) === targetDemandId,
    ) ?? null,
    [demandsAsync.data, targetDemandId],
  );
  const selectedJobId = selectedDemand?.job_id ?? 0;
  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates]);
  const candidateIdKey = candidateIds.join(',');

  useEffect(() => {
    const visibleIds = new Set(
      candidateIdKey ? candidateIdKey.split(',').map(Number) : [],
    );
    setSelectedCandidateIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [candidateIdKey]);
  const matchPreviewAsync = useAsync(
    () => {
      if (!selectedJobId || candidateIds.length === 0) {
        return Promise.resolve({ job_id: selectedJobId, results: [] });
      }
      return api.previewJobMatch(selectedJobId, candidateIds);
    },
    [selectedJobId, candidateIdKey],
  );
  const matchByCandidateId = useMemo(() => {
    const map = new Map<number, MatchResultItem>();
    for (const item of matchPreviewAsync.data?.results ?? []) {
      map.set(item.candidate_id, item);
    }
    return map;
  }, [matchPreviewAsync.data]);

  const cityOptions = useMemo(() => {
    const parsedCities = candidates
      .map((candidate) => candidate.intent_city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set([...COMMON_CITY_OPTIONS, ...parsedCities]));
  }, [candidates]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      for (const skill of candidateTags(candidate)) {
        counts.set(skill.tag, (counts.get(skill.tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 30);
  }, [candidates]);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>(COMMON_SOURCE_OPTIONS);
    if (sourceChannelFilter !== 'all') values.add(sourceChannelFilter);
    for (const candidate of candidates) {
      const channel = candidate.source?.channel?.trim();
      if (channel) values.add(channel);
    }
    return Array.from(values);
  }, [candidates, sourceChannelFilter]);

  const filteredCandidates = useMemo(() => {
    const minScore = Number(scoreFilter);
    return candidates
      .filter((candidate) => {
        const matchesCity = cityFilter === 'all' || candidate.intent_city === cityFilter;
        const matchesTag =
          tagFilter === 'all' || candidateTags(candidate).some((skill) => skill.tag === tagFilter);
        const matchesScore = (candidate.max_score ?? 0) >= minScore;
        return matchesCity && matchesTag && matchesScore;
      })
      .sort((a, b) => {
        if (selectedJobId) {
          const fitDiff = (matchByCandidateId.get(b.id)?.score ?? 0) - (matchByCandidateId.get(a.id)?.score ?? 0);
          if (fitDiff !== 0) return fitDiff;
        }
        const scoreDiff = (b.max_score ?? 0) - (a.max_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, cityFilter, matchByCandidateId, scoreFilter, selectedJobId, tagFilter]);
  const selectedCandidateSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );
  const visibleCandidateIds = useMemo(
    () => filteredCandidates.map((candidate) => candidate.id),
    [filteredCandidates],
  );
  const allVisibleSelected =
    visibleCandidateIds.length > 0
    && visibleCandidateIds.every((id) => selectedCandidateSet.has(id));

  const uniqueTagCount = tagOptions.length;
  const taggedCandidateCount = candidates.filter(
    (candidate) => candidateTags(candidate).length > 0,
  ).length;
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    cityFilter !== 'all' ||
    tagFilter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    parseStatusFilter !== 'all' ||
    pipelineStatusFilter !== 'all' ||
    scoreFilter !== '0';

  function resetFilters() {
    composingRef.current = false;
    setQuery('');
    setSearchQuery('');
    setCityFilter('all');
    setTagFilter('all');
    setSourceChannelFilter('all');
    setParseStatusFilter('all');
    setPipelineStatusFilter('all');
    setScoreFilter('0');
    setActionError(null);
    setActionMessage(null);
    setPage(1);
  }

  async function handleAddToDemand(candidateId: number) {
    const demandId = Number(targetDemandId);
    if (!selectedJobId || !targetDemandId || Number.isNaN(demandId)) {
      setActionError('请先选择要加入的招聘需求');
      setActionMessage(null);
      return;
    }

    setAddingCandidateId(candidateId);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await api.batchAddToPipeline(selectedJobId, [candidateId], demandId);
      if (result.added > 0) {
        setActionMessage('已加入该招聘需求，当前阶段为待筛选');
        reload();
      } else if (result.skipped_existing > 0) {
        setActionMessage('这位候选人已经在该招聘需求中');
      } else {
        setActionMessage('未加入招聘需求，请根据提示处理后重试');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '加入招聘需求失败');
    } finally {
      setAddingCandidateId(null);
    }
  }

  async function handleBatchAddToDemand() {
    const demandId = Number(targetDemandId);
    if (!selectedJobId || !targetDemandId || Number.isNaN(demandId)) {
      setActionError('请先选择要加入的招聘需求');
      setActionMessage(null);
      return;
    }
    if (selectedCandidateIds.length === 0) return;

    setBatchAdding(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await api.batchAddToPipeline(selectedJobId, selectedCandidateIds, demandId);
      setActionMessage(
        `批量处理完成：成功加入 ${result.added} 人${result.skipped_existing ? `，已在流程 ${result.skipped_existing} 人` : ''}`,
      );
      setSelectedCandidateIds([]);
      reload();
      scopeCountsAsync.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '批量加入招聘需求失败');
    } finally {
      setBatchAdding(false);
    }
  }

  if (loading && data === null) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && data === null) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-display text-ink">简历库</h1>
        <div className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  return (
    <div data-ui="readdy-candidates">
      <EnterprisePage className="readdy-candidates">
      <EnterpriseHero
        title="简历库"
        description={
          <>
            已收录 <AnimatedNumber value={totalCandidates} /> 份简历
            {selectedDemand ? (
              <> · 正在按「{selectedDemand.job_title} · {selectedDemand.job_department} · {selectedDemand.job_city}」查看适配</>
            ) : (
              <>
                {' '}· 当前页核心技能 <AnimatedNumber value={uniqueTagCount} /> 类
              </>
            )}
          </>
        }
        metrics={
          <>
            <EnterpriseMetric label="简历总量" value={<AnimatedNumber value={totalCandidates} />} tone="success" />
            <EnterpriseMetric label="有技能标签" value={<AnimatedNumber value={taggedCandidateCount} />} />
            <EnterpriseMetric
              label={selectedDemand ? '当前页匹配结果' : '可筛选技能'}
              value={<AnimatedNumber value={selectedDemand ? matchByCandidateId.size : uniqueTagCount} />}
            />
            <EnterpriseMetric label="当前显示" value={filteredCandidates.length} />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/demands">
              <Button variant="secondary">
                <Target className="h-4 w-4" />
                选择招聘需求
              </Button>
            </Link>
            <Link to="/upload">
              <Button variant="accent">
                <Upload className="h-4 w-4" />
                上传简历
              </Button>
            </Link>
          </div>
        }
      />

      <section
        data-ui="readdy-candidate-tabs"
        aria-label="候选人范围"
        className="grid overflow-hidden rounded-xl border border-[#f3f2ed] bg-white sm:grid-cols-3"
      >
        {([
          { key: 'all', label: '全部候选人', count: scopeCountsAsync.data?.all },
          { key: 'in_pipeline', label: '招聘流程中', count: scopeCountsAsync.data?.in_pipeline },
          { key: 'not_in_pipeline', label: '人才池', count: scopeCountsAsync.data?.not_in_pipeline },
        ] as const).map((item) => {
          const active = item.key === 'all'
            ? pipelineStatusFilter === 'all'
            : pipelineStatusFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPipelineStatusFilter(item.key)}
              className={`flex h-14 items-center justify-center gap-2 border-b border-[#f3f2ed] px-4 text-sm font-medium transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${active ? 'bg-[#e9f5f0] text-[#1d6b42]' : 'text-[#575454] hover:bg-[#fafaf9]'}`}
            >
              <span>{item.label}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${active ? 'bg-white/80 text-[#1d6b42]' : 'bg-[#f8f7f4] text-[#959190]'}`}>
                {item.count ?? '—'}
              </span>
            </button>
          );
        })}
      </section>

      {scopeCountsAsync.error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>候选人范围统计暂时不可用，列表数据不受影响。</span>
          <Button type="button" variant="secondary" size="sm" onClick={scopeCountsAsync.reload}>
            重试统计
          </Button>
        </div>
      )}

      {selectedCandidateIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#cce7da] bg-[#f2faf6] px-4 py-3">
          <p className="text-sm font-medium text-[#245f43]">
            已选择 {selectedCandidateIds.length} 位候选人
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedCandidateIds([])}>
              取消选择
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              loading={batchAdding}
              disabled={!targetDemandId || batchAdding}
              onClick={handleBatchAddToDemand}
            >
              <UserPlus className="h-4 w-4" />
              批量加入所选需求
            </Button>
          </div>
        </div>
      )}

      {candidates.length === 0 && !hasActiveFilters ? (
        <EnterpriseTableCard>
          <EnterpriseEmptyState
            icon={Users}
            title="暂无简历"
            description={
              <>
                先{' '}
                <Link to="/upload" className="font-medium text-ink hover:underline">
                  上传简历
                </Link>{' '}
                以添加候选人到简历库
              </>
            }
          />
        </EnterpriseTableCard>
      ) : (
        <>
          <EnterpriseSearchPanel>
              <div className="enterprise-search-grid">
                <Input
                  label="搜索简历"
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    if (!composingRef.current) {
                      setSearchQuery(nextQuery);
                    }
                  }}
                  onCompositionStart={() => {
                    composingRef.current = true;
                  }}
                  onCompositionEnd={(event) => {
                    composingRef.current = false;
                    const nextQuery = event.currentTarget.value;
                    setQuery(nextQuery);
                    setSearchQuery(nextQuery);
                  }}
                  placeholder="姓名、邮箱、公司、岗位、学校或技能"
                />
                <Select
                  label="意向城市"
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                >
                  <option value="all">全部城市</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </Select>
                <Select
                  label="技能标签"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                >
                  <option value="all">全部技能</option>
                  {tagOptions.map(([tag, count]) => (
                    <option key={tag} value={tag}>
                      {tag}（{count}）
                    </option>
                  ))}
                </Select>
                <Select
                  label="来源渠道"
                  value={sourceChannelFilter}
                  onChange={(event) => setSourceChannelFilter(event.target.value)}
                >
                  <option value="all">全部来源</option>
                  {sourceOptions.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </Select>
                <Select
                  label="解析状态"
                  value={parseStatusFilter}
                  onChange={(event) => setParseStatusFilter(event.target.value as 'all' | ParseStatus)}
                >
                  <option value="all">全部状态</option>
                  <option value="ok">解析成功</option>
                  <option value="failed">解析失败</option>
                  <option value="pending">待解析</option>
                  <option value="processing">解析中</option>
                </Select>
                <Select
                  label="入流程状态"
                  value={pipelineStatusFilter}
                  onChange={(event) =>
                    setPipelineStatusFilter(event.target.value as 'all' | 'in_pipeline' | 'not_in_pipeline')
                  }
                >
                  <option value="all">全部状态</option>
                  <option value="not_in_pipeline">未进入流程</option>
                  <option value="in_pipeline">已进入流程</option>
                </Select>
                <Select
                  label="最低技能分"
                  value={scoreFilter}
                  onChange={(event) => setScoreFilter(event.target.value)}
                >
                  <option value="0">全部分数</option>
                  <option value="3">3 分及以上</option>
                  <option value="4">4 分及以上</option>
                  <option value="5">5 分</option>
                </Select>
                <div className="flex items-end">
                  <Button variant="secondary" onClick={resetFilters}>
                    <RotateCcw className="h-4 w-4" />
                    重置
                  </Button>
                </div>
              </div>
              <div className="mt-4 border-t border-hairline-soft pt-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
                  <Select
                    label="目标招聘需求"
                    value={targetDemandId}
                    onChange={(event) => {
                      setTargetDemandId(event.target.value);
                      setActionError(null);
                      setActionMessage(null);
                    }}
                  >
                    <option value="">先不加入需求</option>
                    {(demandsAsync.data?.items ?? [])
                      .filter((demand) => ['pending', 'active'].includes(demand.status))
                      .map((demand) => (
                      <option key={demand.id} value={demand.id}>
                        {[demand.request_no, demand.job_title, demand.job_department, demand.job_city].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-end">
                    <div className="w-full rounded-md border border-hairline bg-surface-soft px-3 py-2 text-xs text-muted">
                      {demandsAsync.loading ? (
                        <span>正在加载招聘需求…</span>
                      ) : demandsAsync.error ? (
                        <span className="flex items-center justify-between gap-3 text-danger-600">
                          <span>招聘需求加载失败：{demandsAsync.error.message}</span>
                          <button
                            type="button"
                            onClick={demandsAsync.reload}
                            className="shrink-0 font-medium underline underline-offset-2"
                          >
                            重试
                          </button>
                        </span>
                      ) : targetDemandId && matchPreviewAsync.loading ? (
                        <span>正在计算当前页候选人与该岗位的命中、欠缺和建议。</span>
                      ) : targetDemandId && matchPreviewAsync.error ? (
                        <span className="flex items-center justify-between gap-3 text-danger-600">
                          <span>职位匹配预览失败，请重试后再决定是否加入需求。</span>
                          <button
                            type="button"
                            onClick={matchPreviewAsync.reload}
                            className="shrink-0 font-medium underline underline-offset-2"
                          >
                            重试
                          </button>
                        </span>
                      ) : targetDemandId ? (
                        <span>列表已切换为职位匹配摘要；点击“加入所选需求”才会写入流程。</span>
                      ) : (
                        <span>先扫简历库；选择具体招聘需求后，再看匹配并决定是否加入。</span>
                      )}
                    </div>
                  </div>
                </div>
                {actionMessage && <p className="mt-2 text-xs text-success-700">{actionMessage}</p>}
                {actionError && <p className="mt-2 text-xs text-danger-600">{actionError}</p>}
              </div>
          </EnterpriseSearchPanel>

          <EnterpriseTableCard
            title="候选人列表"
            summary={
              <span aria-live="polite">
                {loading
                  ? '正在搜索，当前列表保持可见…'
                  : error
                    ? '搜索失败，当前仍显示上一次结果'
                    : `当前显示 ${filteredCandidates.length} / ${resultTotal} 份`}
              </span>
            }
            footer={
              data && data.pages > 1 ? (
                <Pagination
                  page={data.page}
                  totalPages={data.pages}
                  onChange={setPage}
                  summary={`第 ${data.page} / ${data.pages} 页，共 ${data.total} 条`}
                />
              ) : null
            }
          >
            {filteredCandidates.length === 0 ? (
                <EnterpriseEmptyState
                  icon={Users}
                  title="没有符合条件的简历"
                  description="调整搜索词、城市、来源、解析状态、入流程状态或技能条件后再查看"
                />
            ) : (
                <table className="enterprise-table">
	                  <thead>
	                    <tr>
	                      <th className="w-12 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              aria-label="选择当前页全部候选人"
                              checked={allVisibleSelected}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedCandidateIds(visibleCandidateIds);
                                } else {
                                  setSelectedCandidateIds([]);
                                }
                              }}
                              className="h-4 w-4 rounded border-[#d9d5d0] text-[#379f70] focus:ring-[#379f70]"
                            />
                          </th>
	                      <th className="px-5 py-3">候选人</th>
	                      <th className="px-5 py-3">简历摘要</th>
	                      <th className="px-5 py-3">{targetDemandId ? '职位匹配摘要' : '核心技能'}</th>
	                      <th className="px-5 py-3">来源信息</th>
	                      <th className="px-5 py-3">最高分</th>
	                      <th className="px-5 py-3">入库时间</th>
	                      <th className="px-5 py-3 text-right">操作</th>
	                    </tr>
                  </thead>
                  <Reveal as="tbody" stagger={0.035} y={10}>
	                    {filteredCandidates.map((candidate) => (
	                      <CandidateRow
	                        key={candidate.id}
	                        candidate={candidate}
	                        selected={selectedCandidateSet.has(candidate.id)}
	                        targetDemandId={targetDemandId}
	                        jobFit={matchByCandidateId.get(candidate.id) ?? null}
	                        jobFitLoading={Boolean(targetDemandId && matchPreviewAsync.loading)}
	                        jobFitError={Boolean(targetDemandId && matchPreviewAsync.error)}
	                        addingCandidateId={addingCandidateId}
	                        onSelect={(candidateId, selected) => {
                              setSelectedCandidateIds((current) => selected
                                ? Array.from(new Set([...current, candidateId]))
                                : current.filter((id) => id !== candidateId));
                            }}
	                        onPreview={setCandidatePreview}
	                        onAddToDemand={handleAddToDemand}
	                      />
	                    ))}
                  </Reveal>
                </table>
            )}
          </EnterpriseTableCard>
        </>
      )}

      {candidatePreview && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setCandidatePreview(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="候选人快速详情"
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#eeeae5] pb-5">
              <div>
                <p className="text-xs font-medium text-[#379f70]">候选人快速详情</p>
                <h2 className="mt-1 text-xl font-bold text-[#292b2a]">
                  {candidatePreview.name_masked || `候选人 #${candidatePreview.id}`}
                </h2>
                <p className="mt-1 text-sm text-[#8b8784]">
                  {[candidatePreview.latest_experience?.position, candidatePreview.latest_experience?.company]
                    .filter(Boolean)
                    .join(' · ') || '暂无工作经历'}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭候选人快速详情"
                onClick={() => setCandidatePreview(null)}
                className="rounded-lg p-2 text-[#8b8784] hover:bg-[#f6f4f1] hover:text-[#292b2a]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 py-5 text-sm">
              <section className="grid grid-cols-2 gap-3 rounded-xl bg-[#faf9f7] p-4">
                <div><p className="text-xs text-[#9a9692]">意向城市</p><p className="mt-1 font-medium">{candidatePreview.intent_city || '未填写'}</p></div>
                <div><p className="text-xs text-[#9a9692]">简历来源</p><p className="mt-1 font-medium">{candidatePreview.source?.channel || '未记录'}</p></div>
                <div><p className="text-xs text-[#9a9692]">最高技能分</p><p className="mt-1 font-medium">{candidatePreview.max_score || '—'}</p></div>
                <div><p className="text-xs text-[#9a9692]">解析状态</p><div className="mt-1"><ParseStatusPill status={candidatePreview.parse_status} /></div></div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-[#292b2a]">核心技能</h3>
                <SkillBadges candidate={candidatePreview} />
              </section>
              {candidatePreview.education_summary && (
                <section>
                  <h3 className="mb-2 font-semibold text-[#292b2a]">教育经历</h3>
                  <p className="rounded-xl border border-[#eeeae5] p-4 text-[#625f5c]">{candidatePreview.education_summary}</p>
                </section>
              )}
            </div>

            <div className="sticky bottom-0 flex gap-3 border-t border-[#eeeae5] bg-white pt-4">
              <Link to={`/candidates/${candidatePreview.id}`} className="flex-1">
                <Button type="button" variant="secondary" className="w-full">查看完整简历</Button>
              </Link>
              <Button
                type="button"
                variant="accent"
                className="flex-1"
                disabled={!targetDemandId}
                onClick={() => {
                  void handleAddToDemand(candidatePreview.id);
                  setCandidatePreview(null);
                }}
              >
                加入所选需求
              </Button>
            </div>
          </aside>
        </div>
      )}
      </EnterprisePage>
    </div>
  );
}
