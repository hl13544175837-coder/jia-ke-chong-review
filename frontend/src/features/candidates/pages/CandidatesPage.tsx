import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  FileInput,
  Filter,
  MoreHorizontal,
  RotateCcw,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { candidatesApi as api } from '../api';
import { useDebounce } from '../../../lib/useDebounce';
import { useAsync } from '../../../lib/useAsync';
import { formatDate } from '../../../lib/formatDate';
import { stageLabel } from '../../../lib/pipelineStages';
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../../../lib/sourceChannels';
import { Button, ErrorState, Pagination, Spinner } from '../../../components/ui';
import {
  EnterpriseEmptyState,
  EnterprisePage,
  EnterpriseSearchPanel,
  EnterpriseTableCard,
} from '../../../components/enterprise';
import type { CandidateListItem, CandidateTag, MatchResultItem, ParseStatus } from '../types';

type LibraryStatus = 'all' | 'in_pipeline' | 'not_in_pipeline';

interface LibraryCandidate extends CandidateListItem {
  currentJob: string;
  jobContext: string;
  statusLabel: string;
  ownerName: string;
  recentActivity: string;
  candidateUrl: string;
}

const STATUS_TABS: Array<{ key: LibraryStatus; label: string }> = [
  { key: 'all', label: '全部候选人' },
  { key: 'in_pipeline', label: '已进入流程' },
  { key: 'not_in_pipeline', label: '未进入流程' },
];

const SOURCE_OPTIONS = ['PDF导入', '内部推荐', '外部收录', '猎头推荐', ...RESUME_SOURCE_CHANNEL_OPTIONS] as const;

const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '待解析',
  processing: '解析中',
  ok: '解析成功',
  failed: '解析失败',
};

function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function sourceOf(candidate: CandidateListItem) {
  return candidate.source?.channel?.trim() || '未记录来源';
}

function jobOf(candidate: CandidateListItem) {
  return candidate.current_job_title
    || candidate.source?.target_job_title
    || candidate.latest_experience?.position
    || '未记录岗位';
}

function jobContextOf(candidate: CandidateListItem) {
  const source = candidate.source;
  if (!source) return '';
  return [source.target_job_department, source.target_job_city]
    .filter(Boolean)
    .join(' · ');
}

function pipelineLabel(candidate: CandidateListItem) {
  if (candidate.pipeline_status !== 'in_pipeline') return '未进入流程';
  return candidate.current_stage ? stageLabel(candidate.current_stage) : '已进入流程';
}

function ownerNameOf(candidate: CandidateListItem) {
  return candidate.owner_hr_name?.trim() || '未分配负责人';
}

function recentActivityOf(candidate: CandidateListItem) {
  if (candidate.pipeline_updated_at) {
    return [
      candidate.current_demand_request_no,
      pipelineLabel(candidate),
      formatDate(candidate.pipeline_updated_at),
    ].filter(Boolean).join(' · ');
  }
  const parseStatus = PARSE_STATUS_LABELS[candidate.parse_status ?? 'pending'];
  return `${parseStatus} · ${formatDate(candidate.created_at)}入库`;
}

function toLibraryCandidate(candidate: CandidateListItem): LibraryCandidate {
  return {
    ...candidate,
    currentJob: jobOf(candidate),
    jobContext: jobContextOf(candidate),
    statusLabel: pipelineLabel(candidate),
    ownerName: ownerNameOf(candidate),
    recentActivity: recentActivityOf(candidate),
    candidateUrl: `/candidates/${candidate.id}`,
  };
}

function statusTone(status: string) {
  if (status === '人才池' || status === '已结束') return 'bg-[#ffe8d8] text-[#ff7b43]';
  if (status.includes('Offer')) return 'bg-[#dff6ec] text-[#168a5b]';
  if (status.includes('评审')) return 'bg-[#ffe8d8] text-[#ff7b43]';
  return 'bg-[#e7f1df] text-[#5d7b49]';
}

function JobFitSummary({
  candidate,
  jobFit,
}: {
  candidate: CandidateListItem;
  jobFit: MatchResultItem | null;
}) {
  const matchedTags = jobFit?.matched_tags?.slice(0, 2) ?? candidateTags(candidate).slice(0, 2).map((tag) => tag.tag);
  const missingTags = jobFit?.missing_tags?.slice(0, 1) ?? [];
  return (
    <div className="sr-only">
      职位匹配摘要 命中要求 {matchedTags.join('、') || '暂无'} 欠缺 {missingTags.join('、') || '暂无'} 建议初筛
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4f7ef] text-sm font-bold text-[#168a5b]">
      {name.slice(0, 1)}
    </span>
  );
}

export function CandidatesPage() {
  const [searchParams] = useSearchParams();
  const initialSource = searchParams.get('source') || 'all';
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const composingRef = useRef(false);
  const [statusTab, setStatusTab] = useState<LibraryStatus>('all');
  const pipelineStatusFilter = statusTab;
  const [sourceChannelFilter, setSourceChannelFilter] = useState(initialSource);
  const [cityFilter, setCityFilter] = useState('all');
  const [parseStatusFilter, setParseStatusFilter] = useState<'all' | ParseStatus>('all');
  const [targetDemandId, setTargetDemandId] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [addingCandidateId, setAddingCandidateId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(searchQuery, 300);

  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100 }),
    [],
  );

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
  }, [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, statusTab]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const resultTotal = data?.total ?? candidates.length;
  const hasServerFilters =
    debouncedQuery.trim() !== ''
    || cityFilter !== 'all'
    || sourceChannelFilter !== 'all'
    || parseStatusFilter !== 'all'
    || statusTab !== 'all';

  useEffect(() => {
    if (data && !hasServerFilters) {
      setLibraryTotal(data.total);
    }
  }, [data, hasServerFilters]);

  const totalCandidates = libraryTotal ?? resultTotal;
  const libraryRows = useMemo(() => candidates.map(toLibraryCandidate), [candidates]);
  const selectedDemand = useMemo(
    () => (demandsAsync.data?.items ?? []).find((demand) => String(demand.id) === targetDemandId) ?? null,
    [demandsAsync.data, targetDemandId],
  );
  const selectedJobId = selectedDemand?.job_id ?? 0;
  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates]);
  const candidateIdKey = candidateIds.join(',');
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
  const highFitCount = [...matchByCandidateId.values()]
    .filter((item) => item.score >= 80)
    .length;

  const filteredRows = libraryRows;

  const hasActiveFilters =
    statusTab !== 'all' ||
    sourceChannelFilter !== 'all' ||
    cityFilter !== 'all' ||
    parseStatusFilter !== 'all' ||
    searchQuery.trim() !== '';

  function resetFilters() {
    composingRef.current = false;
    setQuery('');
    setSearchQuery('');
    setStatusTab('all');
    setSourceChannelFilter('all');
    setCityFilter('all');
    setParseStatusFilter('all');
    setActionError(null);
    setActionMessage(null);
    setPage(1);
  }

  async function handleAddToDemand(candidateId: number) {
    const demandId = Number(targetDemandId);
    if (!selectedJobId || !targetDemandId || Number.isNaN(demandId)) {
      setActionError('请先在更多筛选里选择目标招聘需求');
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

  if (loading && data === null) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && data === null) {
    return (
      <EnterprisePage>
        <h1 className="mb-1 text-2xl font-display text-ink">简历库</h1>
        <div className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </EnterprisePage>
    );
  }

  return (
    <EnterprisePage className="px-7 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#171a1f]">简历库</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/demands">
            <Button variant="secondary">
              <Users className="h-4 w-4" />
              岗位匹配 · 选择招聘需求
            </Button>
          </Link>
          <Link to="/upload">
            <Button variant="secondary">
              <FileInput className="h-4 w-4" />
              导入简历
            </Button>
          </Link>
          <Link to="/upload?source=headhunter">
            <Button variant="accent">
              <Briefcase className="h-4 w-4" />
              猎头推荐导入
            </Button>
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-[#e6e9ee] bg-white">
        <div className="grid grid-cols-3 divide-x divide-[#edf0f2]">
          {STATUS_TABS.map((tab) => {
            const count = tab.key === 'all'
              ? totalCandidates
              : statusTab === tab.key
                ? resultTotal
                : null;
            return (
              <button
                key={tab.key}
                type="button"
                className={`h-14 text-center text-sm font-bold transition-colors ${statusTab === tab.key ? 'bg-[#35a36f] text-white' : 'bg-white text-[#4b515a] hover:bg-[#f5fbf8]'}`}
                onClick={() => setStatusTab(tab.key)}
              >
                {count !== null && <span className="mr-2 text-lg">{count}</span>}
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      <EnterpriseSearchPanel className="mt-5 border-0 bg-transparent p-0 shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block w-[320px] max-w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a8b1]" />
            <input
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (!composingRef.current) setSearchQuery(nextQuery);
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setQuery(event.currentTarget.value);
                setSearchQuery(event.currentTarget.value);
              }}
              className="h-12 w-full rounded-xl border border-[#e6e9ee] bg-white pl-11 pr-4 text-sm font-medium outline-none transition focus:border-[#35a36f] focus:ring-4 focus:ring-[#e5f7ee]"
              placeholder="搜索候选人姓名、职位..."
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => setShowMoreFilters((value) => !value)}>
            <Filter className="h-4 w-4" />
            更多筛选
            <ChevronDown className={`h-4 w-4 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
          </Button>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              清除全部
            </Button>
          )}
        </div>

        {showMoreFilters && (
          <div className="mt-4 grid gap-3 rounded-xl border border-[#e6e9ee] bg-white p-4 md:grid-cols-3">
            <label className="space-y-1 text-sm font-bold text-[#737983]">
              目标招聘需求
              <select
                value={targetDemandId}
                onChange={(event) => {
                  setTargetDemandId(event.target.value);
                  setActionError(null);
                  setActionMessage(null);
                }}
                className="h-11 w-full rounded-lg border border-[#e6e9ee] bg-white px-3 text-[#22262c]"
              >
                <option value="">先不加入需求</option>
                {(demandsAsync.data?.items ?? [])
                  .filter((demand) => ['pending', 'active'].includes(demand.status))
                  .map((demand) => (
                    <option key={demand.id} value={demand.id}>
                      {[demand.request_no, demand.job_title, demand.job_department, demand.job_city].filter(Boolean).join(' · ')}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold text-[#737983]">
              意向城市
              <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="h-11 w-full rounded-lg border border-[#e6e9ee] bg-white px-3 text-[#22262c]">
                <option value="all">全部城市</option>
                {['杭州', '上海', '北京', '深圳', '广州'].map((city) => <option key={city}>{city}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold text-[#737983]">
              来源渠道
              <select value={sourceChannelFilter} onChange={(event) => setSourceChannelFilter(event.target.value)} className="h-11 w-full rounded-lg border border-[#e6e9ee] bg-white px-3 text-[#22262c]">
                <option value="all">全部来源</option>
                {SOURCE_OPTIONS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold text-[#737983]">
              入流程状态
              <select
                value={statusTab}
                onChange={(event) => setStatusTab(event.target.value as LibraryStatus)}
                className="h-11 w-full rounded-lg border border-[#e6e9ee] bg-white px-3 text-[#22262c]"
              >
                <option value="all">全部状态</option>
                <option value="not_in_pipeline">未进入流程</option>
                <option value="in_pipeline">已进入流程</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold text-[#737983]">
              解析状态
              <select
                value={parseStatusFilter}
                onChange={(event) => setParseStatusFilter(event.target.value as 'all' | ParseStatus)}
                className="h-11 w-full rounded-lg border border-[#e6e9ee] bg-white px-3 text-[#22262c]"
              >
                <option value="all">全部状态</option>
                <option value="ok">{PARSE_STATUS_LABELS.ok}</option>
                <option value="failed">{PARSE_STATUS_LABELS.failed}</option>
                <option value="pending">{PARSE_STATUS_LABELS.pending}</option>
                <option value="processing">{PARSE_STATUS_LABELS.processing}</option>
              </select>
            </label>
          </div>
        )}

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {statusTab !== 'all' && (
              <button type="button" onClick={() => setStatusTab('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">
                状态: {STATUS_TABS.find((tab) => tab.key === statusTab)?.label} ×
              </button>
            )}
            {sourceChannelFilter !== 'all' && <button type="button" onClick={() => setSourceChannelFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">来源: {sourceChannelFilter} ×</button>}
            {cityFilter !== 'all' && <button type="button" onClick={() => setCityFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">城市: {cityFilter} ×</button>}
            {parseStatusFilter !== 'all' && <button type="button" onClick={() => setParseStatusFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">解析状态: {PARSE_STATUS_LABELS[parseStatusFilter]} ×</button>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-[#737983]">
          <p>{hasActiveFilters ? `筛选结果 ${resultTotal} 条，简历库共 ${totalCandidates} 条` : `共 ${totalCandidates} 条候选档案`}</p>
          {selectedDemand && !matchPreviewAsync.loading && <p>高匹配候选人 {highFitCount} 人</p>}
          {loading && data !== null && <p aria-live="polite" className="text-[#168a5b]">正在搜索候选人…</p>}
        </div>
        {actionMessage && <p className="mt-2 text-sm font-bold text-[#168a5b]">{actionMessage}</p>}
        {actionError && <p className="mt-2 text-sm font-bold text-[#ef4444]">{actionError}</p>}
      </EnterpriseSearchPanel>

      <EnterpriseTableCard className="mt-5 overflow-visible">
        <h2 className="sr-only">候选人列表</h2>
        {filteredRows.length === 0 ? (
          <EnterpriseEmptyState
            icon={Users}
            title="没有符合条件的简历"
            description="调整搜索词、城市、来源、解析状态或入流程状态后再查看，也可以先导入一份简历。"
          />
        ) : (
          <table className="enterprise-table min-w-[1120px]">
            <thead>
              <tr>
                <th className="w-12 px-5 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#ccd2d8]" />
                </th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">候选人</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">最近流程/来源岗位</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">流程状态</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">来源</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">招聘负责人</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">最近动态</th>
                <th className="px-5 py-4 text-right text-sm font-bold text-[#737983]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((candidate) => (
                <tr key={candidate.id} className="border-t border-[#edf0f2] transition hover:bg-[#fbfcfd]">
                  <td className="px-5 py-5">
                    <input type="checkbox" className="h-4 w-4 rounded border-[#ccd2d8]" />
                  </td>
                  <td className="px-5 py-5">
                    <Link to={candidate.candidateUrl} className="flex items-center gap-3 hover:text-[#168a5b]">
                      <Avatar name={candidate.name_masked} />
                      <span>
                        <span className="block font-bold text-[#168a5b]">{candidate.name_masked}</span>
                        <span className="block text-xs font-medium text-[#7d838c]">
                          {[
                            candidate.email_masked,
                            candidate.phone_masked,
                            candidate.intent_city ? `意向城市：${candidate.intent_city}` : '',
                            candidate.education_summary,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '暂无联系方式与教育摘要'}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-5">
                    <p className="font-bold text-[#30343a]">{candidate.currentJob}</p>
                    {candidate.jobContext && <p className="mt-1 text-xs text-[#737983]">{candidate.jobContext}</p>}
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusTone(candidate.statusLabel)}`}>{candidate.statusLabel}</span>
                      {candidate.current_demand_request_no && <span className="text-xs text-[#737983]">{candidate.current_demand_request_no}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-5 font-medium text-[#464b52]">{sourceOf(candidate)}</td>
                  <td className="px-5 py-5 font-medium text-[#464b52]">{candidate.ownerName}</td>
                  <td className="max-w-[260px] truncate px-5 py-5 font-medium text-[#5f6670]">{candidate.recentActivity}</td>
                  <td className="px-5 py-5">
                    <div className="flex items-center justify-end gap-3">
                      <JobFitSummary candidate={candidate} jobFit={matchByCandidateId.get(candidate.id) ?? null} />
                      {candidate.pipeline_status !== 'in_pipeline' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={addingCandidateId === candidate.id}
                          onClick={() => handleAddToDemand(candidate.id)}
                        >
                          <UserPlus className="h-4 w-4" />
                          加入所选需求
                        </Button>
                      ) : (
                        <Link to={candidate.candidateUrl} className="inline-flex h-9 items-center rounded-lg bg-[#35a36f] px-4 text-sm font-bold text-white hover:bg-[#168a5b]">
                          查看流程
                        </Link>
                      )}
                      <button type="button" className="rounded-md p-1.5 text-[#8d949d] hover:bg-[#f1f3f5] hover:text-[#4b515a]" aria-label="更多">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </EnterpriseTableCard>

      {data && data.pages > 1 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            totalPages={data.pages}
            onChange={setPage}
            summary={`第 ${data.page} / ${data.pages} 页，共 ${data.total} 条`}
          />
        </div>
      )}

    </EnterprisePage>
  );
}
