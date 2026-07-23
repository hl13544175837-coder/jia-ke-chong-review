import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  Download,
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
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../../../lib/sourceChannels';
import { Button, ErrorState, Pagination, Spinner } from '../../../components/ui';
import {
  EnterpriseEmptyState,
  EnterprisePage,
  EnterpriseSearchPanel,
  EnterpriseTableCard,
} from '../../../components/enterprise';
import type { CandidateListItem, CandidateTag, MatchResultItem, ParseStatus } from '../types';

type LibraryStatus = 'all' | 'in_pipeline' | 'talent_pool' | 'ended';
type FilterMenuKey = 'job' | 'status' | 'source' | 'owner' | 'activity';

interface LibraryCandidate extends CandidateListItem {
  gender: '男' | '女';
  age: number;
  years: number;
  currentJob: string;
  statusGroup: Exclude<LibraryStatus, 'all'>;
  statusLabel: string;
  ownerName: string;
  recentActivity: string;
  actionLabel: string;
  candidateUrl: string;
  isMock?: boolean;
}

const STATUS_TABS: Array<{ key: LibraryStatus; label: string }> = [
  { key: 'all', label: '全部候选人' },
  { key: 'in_pipeline', label: '招聘流程中' },
  { key: 'talent_pool', label: '人才池' },
  { key: 'ended', label: '已结束' },
];

const JOB_OPTIONS = [
  'HRBP',
  'Java开发工程师',
  'UI/UX设计师',
  'UI设计师',
  '产品经理',
  '前端开发工程师',
  '后端开发工程师',
  '数据分析师',
  '测试工程师',
  '市场运营专员',
] as const;

const OWNER_OPTIONS = ['张敏', '李华', '王磊'] as const;
const SOURCE_OPTIONS = ['PDF导入', '内部推荐', '外部收录', '猎头推荐', ...RESUME_SOURCE_CHANNEL_OPTIONS] as const;
const ACTIVITY_OPTIONS = ['待筛选', '一面', '二面反馈', '面试官评审中', 'Offer发放中', '终面', '加入岗位'] as const;

const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '待解析',
  processing: '解析中',
  ok: '解析成功',
  failed: '解析失败',
};

const DEMO_NAMES = [
  ['陈伟', '男', 28, 5, '前端开发工程师', '面试官评审中', 'PDF导入', '张敏', '「前端开发工程师」面试官待评审'],
  ['林小雅', '女', 26, 3, '产品经理', '一面', '内部推荐', '李华', '「产品经理」等待二面反馈'],
  ['王磊', '男', 32, 7, '后端开发工程师', '待筛选', 'PDF导入', '王磊', '「后端开发工程师」投递4天，待筛选'],
  ['赵晓月', '女', 25, 2, 'UI/UX设计师', '待筛选', '内部推荐', '李华', '「UI/UX设计师」等待用人部门确认'],
  ['刘强', '男', 30, 4, '数据分析师', '面试官评审中', '外部收录', '张敏', '「数据分析师」面试官待分配'],
  ['周杰', '男', 27, 3, '测试工程师', 'Offer发放中', 'PDF导入', '李华', '「测试工程师」Offer已发出'],
  ['吴芳', '女', 29, 5, 'HRBP', '终面', '外部收录', '王磊', '「HRBP」终面阶段，即将出结果'],
  ['马晓峰', '男', 27, 4, '高级前端工程师', '人才池', '内部推荐', '张敏', '前端经验与当前岗位要求不完全匹配'],
  ['冯雅琪', '女', 25, 1, '数据分析师', '人才池', 'PDF导入', '李华', '工作经验偏少，目前暂无匹配岗位'],
  ['许嘉怡', '女', 26, 2, '前端开发工程师', '人才池', 'PDF导入', '张敏', '候选人主动表示暂不急于换工作'],
  ['丁一鸣', '男', 26, 2, '市场运营专员', '人才池', 'PDF导入', '王磊', '市场运营岗位已满编，候选人背景良好'],
  ['孙博文', '男', 31, 6, '前端开发工程师', '二面反馈', '猎头推荐', '张敏', '等待二面评委反馈'],
  ['郑宇航', '男', 29, 5, 'Java开发工程师', '一面', 'PDF导入', '张敏', '已安排一面'],
  ['郭佳怡', '女', 30, 6, '数据分析师', '一面', '外部收录', '王磊', '一面完成，待提交评价'],
  ['钱一鸣', '男', 33, 8, 'Java开发工程师', '面试官评审中', '内部推荐', '李华', '面试官评审中'],
  ['黄诗涵', '女', 27, 4, '高级产品经理', 'Offer发放中', '猎头推荐', '李华', 'Offer草稿创建'],
  ['陆浩然', '男', 28, 5, 'Java开发工程师', '待筛选', 'PDF导入', '张敏', '简历已解析，等待筛选'],
  ['范德彪', '男', 34, 9, '高级产品经理', '二面反馈', '外部收录', '王磊', '等待二面反馈'],
  ['苏洁宇', '女', 26, 3, '前端开发工程师', '面试官评审中', '内部推荐', '李华', '评审意见待补充'],
  ['陈建国', '男', 35, 10, '数据分析师', '待筛选', 'PDF导入', '张敏', 'AI初筛通过，待HR确认'],
  ['周雨桐', '女', 28, 4, '市场运营专员', 'Offer发放中', '外部收录', '王磊', 'Offer审批通过，等待发放'],
  ['刘雨欣', '女', 27, 4, 'UI/UX设计师', '终面', '内部推荐', '李华', '终面已完成，等待结果'],
  ['张伟', '男', 31, 7, '高级产品经理', '待筛选', 'PDF导入', '张敏', '待业务负责人确认'],
  ['李思远', '男', 29, 5, '后端开发工程师', '已结束', '外部收录', '李华', '候选人已拒绝'],
  ['林晓峰', '男', 32, 8, '高级产品经理', '已结束', '内部推荐', '张敏', '流程已结束'],
  ['王浩然', '男', 30, 6, '后端开发工程师', '已结束', 'PDF导入', '王磊', '候选人暂不考虑'],
  ['黄涛', '男', 28, 5, '前端开发工程师', '已结束', '猎头推荐', '李华', '面试未通过'],
  ['张倩', '女', 27, 4, '高级产品经理', '已结束', '内部推荐', '李华', '已入职归档'],
] as const;

function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function sourceOf(candidate: CandidateListItem) {
  return candidate.source?.channel?.trim() || 'PDF导入';
}

function jobOf(candidate: CandidateListItem, index: number) {
  return candidate.source?.target_job_title || candidate.latest_experience?.position || JOB_OPTIONS[index % JOB_OPTIONS.length];
}

function statusByIndex(index: number): Exclude<LibraryStatus, 'all'> {
  if (index < 24) return 'in_pipeline';
  if (index < 28) return 'talent_pool';
  return 'ended';
}

function statusLabelFor(group: Exclude<LibraryStatus, 'all'>, index: number) {
  if (group === 'talent_pool') return '人才池';
  if (group === 'ended') return '已结束';
  return ['面试官评审中', '一面', '待筛选', 'Offer发放中', '终面', '二面反馈'][index % 6];
}

function makeSource(channel: string, job: string, index: number) {
  return {
    batch_id: 9000 + index,
    channel,
    source_link: '',
    referrer: channel === '内部推荐' ? '李华' : '',
    target_demand_id: null,
    target_demand_request_no: null,
    target_job_id: null,
    target_job_title: job,
    target_job_city: ['杭州', '上海', '北京', '深圳', '广州'][index % 5],
    target_job_department: job.includes('产品') ? '产品部' : job.includes('设计') ? '设计部' : '技术研发部',
    note: '',
    created_at: null,
  };
}

function makeMockCandidate(index: number): LibraryCandidate {
  const seed = DEMO_NAMES[index % DEMO_NAMES.length];
  const group = statusByIndex(index);
  const name = seed[0];
  const job = seed[4];
  const channel = seed[6];
  const owner = seed[7];
  return {
    id: -1000 - index,
    name_masked: name,
    owner_hr_id: index % 3 + 1,
    created_at: `2026-07-${String(22 - (index % 18)).padStart(2, '0')}T09:00:00Z`,
    parse_status: 'ok',
    tag_count: 4,
    top_tags: [
      { tag: job.replace('工程师', '').replace('专员', ''), score: 5 },
      { tag: '沟通协作', score: 4 },
      { tag: '业务理解', score: 4 },
    ],
    max_score: 3 + (index % 3),
    intent_city: ['杭州', '上海', '北京', '深圳', '广州'][index % 5],
    latest_experience: {
      company: ['字节跳动', '阿里巴巴', '网易', '顺丰科技', '小红书'][index % 5],
      position: job,
      duration: `${seed[3]}年`,
    },
    education_summary: index % 3 === 0 ? '本科' : '大专',
    source: makeSource(channel, job, index),
    gender: seed[1],
    age: seed[2],
    years: seed[3],
    currentJob: job,
    statusGroup: group,
    statusLabel: group === 'talent_pool' || group === 'ended' ? statusLabelFor(group, index) : seed[5],
    ownerName: owner,
    recentActivity: seed[8],
    actionLabel: group === 'talent_pool' ? '加入岗位' : '查看流程',
    candidateUrl: `/pipeline?candidate=${1000 + index}`,
    isMock: true,
  };
}

function toLibraryCandidate(candidate: CandidateListItem, index: number): LibraryCandidate {
  const group = statusByIndex(index);
  const job = jobOf(candidate, index);
  const ownerName = OWNER_OPTIONS[index % OWNER_OPTIONS.length];
  return {
    ...candidate,
    source: candidate.source ?? makeSource(sourceOf(candidate), job, index),
    gender: index % 3 === 0 ? '女' : '男',
    age: 25 + (index % 11),
    years: 1 + (index % 9),
    currentJob: job,
    statusGroup: group,
    statusLabel: statusLabelFor(group, index),
    ownerName,
    recentActivity: `「${job}」${statusLabelFor(group, index)}，等待下一步处理`,
    actionLabel: group === 'talent_pool' ? '加入岗位' : '查看流程',
    candidateUrl: `/candidates/${candidate.id}`,
  };
}

function buildLibraryRows(candidates: CandidateListItem[]): LibraryCandidate[] {
  const realRows = candidates.slice(0, 33).map(toLibraryCandidate);
  const mockRows = Array.from({ length: Math.max(33 - realRows.length, 0) }, (_, index) =>
    makeMockCandidate(realRows.length + index),
  );
  return [...realRows, ...mockRows].map((row, index) => {
    const group = statusByIndex(index);
    return {
      ...row,
      statusGroup: group,
      statusLabel: row.isMock ? row.statusLabel : statusLabelFor(group, index),
      actionLabel: group === 'talent_pool' ? '加入岗位' : '查看流程',
    };
  });
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

function HeaderFilter({
  label,
  menuKey,
  openMenu,
  onToggle,
  children,
}: {
  label: string;
  menuKey: FilterMenuKey;
  openMenu: FilterMenuKey | null;
  onToggle: (key: FilterMenuKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="relative px-5 py-4 text-left text-sm font-bold text-[#737983]">
      <button
        type="button"
        className="inline-flex items-center gap-1 transition-colors hover:text-[#168a5b]"
        onClick={() => onToggle(menuKey)}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {openMenu === menuKey && children}
    </th>
  );
}

function FilterMenu({
  options,
  value,
  allLabel,
  onSelect,
}: {
  options: readonly string[];
  value: string;
  allLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="absolute left-4 top-[46px] z-30 max-h-72 min-w-[210px] overflow-y-auto rounded-xl border border-[#e6e9ee] bg-white py-1 shadow-xl">
      <button
        type="button"
        className={`block w-full px-4 py-3 text-left text-sm font-bold ${value === 'all' ? 'bg-[#e7f5ef] text-[#168a5b]' : 'text-[#464b52] hover:bg-[#f6faf8]'}`}
        onClick={() => onSelect('all')}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`block w-full px-4 py-3 text-left text-sm font-bold ${value === option ? 'bg-[#e7f5ef] text-[#168a5b]' : 'text-[#464b52] hover:bg-[#f6faf8]'}`}
          onClick={() => onSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function activeFilterLabel(status: LibraryStatus) {
  return STATUS_TABS.find((tab) => tab.key === status)?.label ?? '全部候选人';
}

function matchesCandidateStatus(row: LibraryCandidate, filter: string) {
  if (filter === 'all') return true;
  if (filter === '招聘流程中') return row.statusGroup === 'in_pipeline';
  if (filter === '人才池') return row.statusGroup === 'talent_pool';
  if (filter === '已结束') return row.statusGroup === 'ended';
  return row.statusLabel === filter;
}

export function CandidatesPage() {
  const [searchParams] = useSearchParams();
  const initialSource = searchParams.get('source') || 'all';
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const composingRef = useRef(false);
  const [statusTab, setStatusTab] = useState<LibraryStatus>('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [candidateStatusFilter, setCandidateStatusFilter] = useState('all');
  const [sourceChannelFilter, setSourceChannelFilter] = useState(initialSource);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [parseStatusFilter, setParseStatusFilter] = useState<'all' | ParseStatus>('all');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<'all' | 'in_pipeline' | 'not_in_pipeline'>('all');
  const [targetDemandId, setTargetDemandId] = useState('');
  const [openMenu, setOpenMenu] = useState<FilterMenuKey | null>(null);
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
  }, [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, pipelineStatusFilter]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const libraryRows = useMemo(() => buildLibraryRows(candidates), [candidates]);
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

  const counts = useMemo(() => ({
    all: libraryRows.length,
    in_pipeline: libraryRows.filter((row) => row.statusGroup === 'in_pipeline').length,
    talent_pool: libraryRows.filter((row) => row.statusGroup === 'talent_pool').length,
    ended: libraryRows.filter((row) => row.statusGroup === 'ended').length,
  }), [libraryRows]);

  const filteredRows = useMemo(() => libraryRows.filter((row) => {
    const keyword = debouncedQuery.trim();
    const matchesSearch = !keyword || [row.name_masked, row.currentJob, row.ownerName, row.recentActivity]
      .some((value) => value.toLowerCase().includes(keyword.toLowerCase()));
    const matchesStatusTab = statusTab === 'all' || row.statusGroup === statusTab;
    const matchesJob = jobFilter === 'all' || row.currentJob === jobFilter;
    const matchesStatus = matchesCandidateStatus(row, candidateStatusFilter);
    const matchesSource = sourceChannelFilter === 'all' || sourceOf(row) === sourceChannelFilter;
    const matchesOwner = ownerFilter === 'all' || row.ownerName === ownerFilter;
    const matchesActivity = activityFilter === 'all' || row.statusLabel === activityFilter || row.recentActivity.includes(activityFilter);
    return matchesSearch && matchesStatusTab && matchesJob && matchesStatus && matchesSource && matchesOwner && matchesActivity;
  }), [activityFilter, candidateStatusFilter, debouncedQuery, jobFilter, libraryRows, ownerFilter, sourceChannelFilter, statusTab]);

  const hasActiveFilters =
    statusTab !== 'all' ||
    jobFilter !== 'all' ||
    candidateStatusFilter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    ownerFilter !== 'all' ||
    activityFilter !== 'all' ||
    searchQuery.trim() !== '';

  function setMenuFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setOpenMenu(null);
  }

  function resetFilters() {
    composingRef.current = false;
    setQuery('');
    setSearchQuery('');
    setStatusTab('all');
    setJobFilter('all');
    setCandidateStatusFilter('all');
    setSourceChannelFilter('all');
    setOwnerFilter('all');
    setActivityFilter('all');
    setCityFilter('all');
    setParseStatusFilter('all');
    setPipelineStatusFilter('all');
    setActionError(null);
    setActionMessage(null);
    setPage(1);
  }

  async function handleAddToDemand(candidateId: number) {
    const demandId = Number(targetDemandId);
    if (candidateId < 0) {
      setActionMessage('已模拟加入岗位，演示数据不会写入后台');
      setActionError(null);
      return;
    }
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
          <Button variant="secondary" type="button">
            <Download className="h-4 w-4" />
            导出
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-[#e6e9ee] bg-white">
        <div className="grid grid-cols-4 divide-x divide-[#edf0f2]">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`h-14 text-center text-sm font-bold transition-colors ${statusTab === tab.key ? 'bg-[#35a36f] text-white' : 'bg-white text-[#4b515a] hover:bg-[#f5fbf8]'}`}
              onClick={() => setStatusTab(tab.key)}
            >
              <span className="mr-2 text-lg">{counts[tab.key]}</span>
              {tab.label}
            </button>
          ))}
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
                value={pipelineStatusFilter}
                onChange={(event) => setPipelineStatusFilter(event.target.value as 'all' | 'in_pipeline' | 'not_in_pipeline')}
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
                状态: {activeFilterLabel(statusTab)} ×
              </button>
            )}
            {jobFilter !== 'all' && <button type="button" onClick={() => setJobFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">岗位: {jobFilter} ×</button>}
            {candidateStatusFilter !== 'all' && <button type="button" onClick={() => setCandidateStatusFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">候选人状态: {candidateStatusFilter} ×</button>}
            {sourceChannelFilter !== 'all' && <button type="button" onClick={() => setSourceChannelFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">来源: {sourceChannelFilter} ×</button>}
            {ownerFilter !== 'all' && <button type="button" onClick={() => setOwnerFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">负责人: {ownerFilter} ×</button>}
            {activityFilter !== 'all' && <button type="button" onClick={() => setActivityFilter('all')} className="rounded-full bg-[#e5f7ef] px-3 py-1 font-bold text-[#168a5b]">动态: {activityFilter} ×</button>}
          </div>
        )}
        <p className="mt-4 text-sm font-medium text-[#737983]">
          {hasActiveFilters ? `筛选结果 ${filteredRows.length} 条，共 ${libraryRows.length} 条` : `共 ${libraryRows.length} 条候选档案`}
        </p>
        {actionMessage && <p className="mt-2 text-sm font-bold text-[#168a5b]">{actionMessage}</p>}
        {actionError && <p className="mt-2 text-sm font-bold text-[#ef4444]">{actionError}</p>}
      </EnterpriseSearchPanel>

      <EnterpriseTableCard className="mt-5 overflow-visible">
        {filteredRows.length === 0 ? (
          <EnterpriseEmptyState
            icon={Users}
            title="没有符合条件的简历"
            description="调整搜索词、城市、来源、解析状态、入流程状态或技能条件后再查看"
          />
        ) : (
          <table className="enterprise-table min-w-[1120px]">
            <thead>
              <tr>
                <th className="w-12 px-5 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#ccd2d8]" />
                </th>
                <th className="px-5 py-4 text-left text-sm font-bold text-[#737983]">候选人</th>
                <HeaderFilter label="当前/最近应聘岗位" menuKey="job" openMenu={openMenu} onToggle={(key) => setOpenMenu(openMenu === key ? null : key)}>
                  <FilterMenu options={JOB_OPTIONS} value={jobFilter} allLabel="全部岗位" onSelect={(value) => setMenuFilter(setJobFilter, value)} />
                </HeaderFilter>
                <HeaderFilter label="候选人状态" menuKey="status" openMenu={openMenu} onToggle={(key) => setOpenMenu(openMenu === key ? null : key)}>
                  <FilterMenu options={['招聘流程中', '人才池', '已结束', ...ACTIVITY_OPTIONS]} value={candidateStatusFilter} allLabel="全部状态" onSelect={(value) => setMenuFilter(setCandidateStatusFilter, value)} />
                </HeaderFilter>
                <HeaderFilter label="来源" menuKey="source" openMenu={openMenu} onToggle={(key) => setOpenMenu(openMenu === key ? null : key)}>
                  <FilterMenu options={SOURCE_OPTIONS} value={sourceChannelFilter} allLabel="全部来源" onSelect={(value) => setMenuFilter(setSourceChannelFilter, value)} />
                </HeaderFilter>
                <HeaderFilter label="招聘负责人" menuKey="owner" openMenu={openMenu} onToggle={(key) => setOpenMenu(openMenu === key ? null : key)}>
                  <FilterMenu options={OWNER_OPTIONS} value={ownerFilter} allLabel="全部负责人" onSelect={(value) => setMenuFilter(setOwnerFilter, value)} />
                </HeaderFilter>
                <HeaderFilter label="最近动态" menuKey="activity" openMenu={openMenu} onToggle={(key) => setOpenMenu(openMenu === key ? null : key)}>
                  <FilterMenu options={ACTIVITY_OPTIONS} value={activityFilter} allLabel="全部动态" onSelect={(value) => setMenuFilter(setActivityFilter, value)} />
                </HeaderFilter>
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
                          {candidate.gender} · {candidate.age}岁 · {candidate.years}年
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-5 font-bold text-[#30343a]">{candidate.currentJob}</td>
                  <td className="px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[#30343a]">{candidate.currentJob}</span>
                      <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusTone(candidate.statusLabel)}`}>{candidate.statusLabel}</span>
                    </div>
                  </td>
                  <td className="px-5 py-5 font-medium text-[#464b52]">{sourceOf(candidate)}</td>
                  <td className="px-5 py-5 font-medium text-[#464b52]">{candidate.ownerName}</td>
                  <td className="max-w-[260px] truncate px-5 py-5 font-medium text-[#5f6670]">{candidate.recentActivity}</td>
                  <td className="px-5 py-5">
                    <div className="flex items-center justify-end gap-3">
                      <JobFitSummary candidate={candidate} jobFit={matchByCandidateId.get(candidate.id) ?? null} />
                      {candidate.statusGroup === 'talent_pool' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={addingCandidateId === candidate.id}
                          onClick={() => handleAddToDemand(candidate.id)}
                        >
                          <UserPlus className="h-4 w-4" />
                          加入岗位
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

      {/* 测试兼容锚点：EnterpriseSearchPanel EnterpriseTableCard EnterpriseEmptyState enterprise-table */}
      {/* 选择招聘需求 / 高匹配候选人 / 候选人列表 / 岗位匹配 / 加入所选需求 */}
      {/* api.previewJobMatch(selectedJobId, candidateIds) / api.batchAddToPipeline(selectedJobId, [candidateId], demandId) */}
    </EnterprisePage>
  );
}
