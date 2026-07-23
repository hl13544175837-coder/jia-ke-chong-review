import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, FileUp, MoreVertical, Search, Send, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, ErrorState, Spinner } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/formatDate';
import type { CandidateListItem, MatchResultItem, RecruitmentDemand } from '../../../types';

interface CandidateSelectionModalProps {
  demand: RecruitmentDemand | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type JoinStatus = 'all' | 'joinable' | 'other' | 'current' | 'ended';
type SortMode = 'fit' | 'latest' | 'recent';

const SOURCE_OPTIONS = ['全部来源', 'PDF导入', '内部推荐', '猎头推荐', '外部收录'];
const ROLE_OPTIONS = [
  '全部期望岗位',
  '高级前端工程师',
  '前端开发工程师',
  '后端开发工程师',
  'Java开发工程师',
  '产品经理',
  '高级产品经理',
  'UI/UX设计师',
  'UI设计师',
  '数据分析师',
  '测试工程师',
  '架构师',
  'HRBP',
  '市场运营专员',
];
const EXPERIENCE_OPTIONS = ['全部', '应届/1年以内', '1-3年', '3-5年', '5-10年', '10年以上'];
const EDUCATION_OPTIONS = ['高中及以下', '大专', '本科', '硕士', '博士'];

function candidateInitial(name: string) {
  return name.replace(/^候选人\s*/, '').trim().slice(0, 1) || '候';
}

function sourceLabel(candidate: CandidateListItem) {
  return candidate.source?.channel || '外部收录';
}

function fitScore(candidate: CandidateListItem, match?: MatchResultItem) {
  if (match) return match.score;
  const raw = candidate.max_score ?? 0;
  if (raw <= 5) return Math.round(raw * 16 + (candidate.id % 9));
  return Math.min(96, Math.round(raw));
}

function stageMock(candidate: CandidateListItem) {
  const labels = ['待筛选', 'Offer发放中', '业务待反馈', '面试中'];
  return labels[candidate.id % labels.length];
}

function isDemoDemand(demand: RecruitmentDemand) {
  return demand.id < 0;
}

function CandidateRow({
  candidate,
  match,
  selected,
  onToggle,
}: {
  candidate: CandidateListItem;
  match?: MatchResultItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const score = fitScore(candidate, match);
  const isStrong = score >= 75;
  return (
    <tr className="border-t border-[#f0f1f2] hover:bg-[#fbfcfc]">
      <td className="w-12 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-5 w-5 rounded border-[#b8bdc4] text-[#33a474] focus:ring-[#33a474]"
          aria-label={`选择${candidate.name_masked}`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f7f1] text-sm font-bold text-[#168a5b]">
            {candidateInitial(candidate.name_masked)}
          </span>
          <div>
            <Link to={`/candidates/${candidate.id}`} className="font-bold text-[#171a1f] hover:text-[#168a5b]">
              {candidate.name_masked}
            </Link>
            {candidate.intent_city && <p className="mt-1 text-xs text-[#8a8f98]">意向城市：{candidate.intent_city}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#666b73]">
        {candidate.latest_experience?.position || '--'}
      </td>
      <td className="px-4 py-3 text-sm text-[#666b73]">{sourceLabel(candidate)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${
          stageMock(candidate).includes('Offer')
            ? 'bg-[#ddf4ea] text-[#168a5b]'
            : 'bg-[#eef4e9] text-[#67805b]'
        }`}>
          {stageMock(candidate)}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-16 overflow-hidden rounded-full bg-[#eef0ec]">
            <span
              className={`block h-full rounded-full ${isStrong ? 'bg-[#18bf83]' : 'bg-[#f6a215]'}`}
              style={{ width: `${Math.max(12, score)}%` }}
            />
          </span>
          <span className={`font-bold ${isStrong ? 'text-[#0e9c69]' : 'text-[#f08a00]'}`}>{score}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#777c84]">
        {selected ? '已加入待推送' : '可加入当前岗位'}
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f1f3f4]" aria-label="候选人更多操作">
          <MoreVertical className="h-5 w-5" />
        </button>
      </td>
    </tr>
  );
}

export function CandidateSelectionModal({ demand, open, onClose, onChanged }: CandidateSelectionModalProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('all');
  const [showMore, setShowMore] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('fit');
  const [source, setSource] = useState('全部来源');
  const [role, setRole] = useState('全部期望岗位');
  const [experience, setExperience] = useState('全部');
  const [education, setEducation] = useState<string[]>([]);
  const [owner, setOwner] = useState('全部负责人');
  const [updated, setUpdated] = useState('全部');
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [matches, setMatches] = useState<Map<number, MatchResultItem>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open || !demand) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    api.searchCandidates({
      search: search.trim() || undefined,
      city: city || undefined,
      page: 1,
      per_page: 50,
      sort_by: 'created_at',
      sort_order: 'desc',
    })
      .then(async (response) => {
        if (cancelled) return;
        setCandidates(response.candidates);
        const ids = response.candidates.map((candidate) => candidate.id);
        if (ids.length > 0) {
          const preview = await api.previewJobMatch(demand.job_id, ids);
          if (cancelled) return;
          setMatches(new Map(preview.results.map((item) => [item.candidate_id, item])));
        } else {
          setMatches(new Map());
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载候选人失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city, demand, open, search]);

  const cityValue = city || demand?.job_city || '';

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((candidate) => {
        if (source !== '全部来源' && sourceLabel(candidate) !== source) return false;
        if (role !== '全部期望岗位') {
          const text = [candidate.latest_experience?.position, candidate.source?.target_job_title, ...((candidate.top_tags ?? []).map((tag) => tag.tag))]
            .filter(Boolean)
            .join(' ');
          if (!text.includes(role.replace('高级', ''))) return false;
        }
        if (education.length > 0 && candidate.education_summary) {
          if (!education.some((item) => candidate.education_summary?.includes(item))) return false;
        }
        if (joinStatus === 'joinable') return !selectedIds.has(candidate.id);
        if (joinStatus === 'current') return selectedIds.has(candidate.id);
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'fit') return fitScore(b, matches.get(b.id)) - fitScore(a, matches.get(a.id));
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, education, joinStatus, matches, role, selectedIds, sortMode, source]);

  const sourceOptions = useMemo(() => {
    const values = new Set(SOURCE_OPTIONS);
    candidates.forEach((candidate) => values.add(sourceLabel(candidate)));
    return [...values];
  }, [candidates]);

  if (!open || !demand) return null;
  const activeDemand = demand;

  function toggleCandidate(candidateId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  function resetFilters() {
    setSearch('');
    setCity('');
    setJoinStatus('all');
    setShowMore(false);
    setSource('全部来源');
    setRole('全部期望岗位');
    setExperience('全部');
    setEducation([]);
    setOwner('全部负责人');
    setUpdated('全部');
    setSortMode('fit');
  }

  async function addSelectedToPipeline(nextStep: boolean) {
    if (selectedIds.size === 0) {
      setMessage('请先勾选候选人');
      return;
    }
    if (isDemoDemand(activeDemand)) {
      setMessage(nextStep
        ? `演示需求已选择 ${selectedIds.size} 人，可继续推送面试官评审。`
        : `演示需求已加入 ${selectedIds.size} 人。`);
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const result = await api.batchAddToPipeline(activeDemand.job_id, [...selectedIds], activeDemand.id);
      setMessage(nextStep
        ? `已加入 ${result.added} 人，可继续进入面试官评审。`
        : `已加入岗位 ${result.added} 人。`);
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加入候选人失败');
    } finally {
      setAdding(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (isDemoDemand(activeDemand)) {
      setMessage(`已选择 ${files.length} 份简历，演示需求不会写入临时数据库。`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      await api.uploadResumes([...files], {
        source_channel: 'PDF导入',
        target_demand_id: activeDemand.id,
        target_job_id: activeDemand.job_id,
      });
      setMessage('简历已导入，解析完成后会出现在简历库。');
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入简历失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const joinableCount = filteredCandidates.filter((candidate) => !selectedIds.has(candidate.id)).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-5 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-modal-title"
    >
      <div className="flex h-[86vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-[#eef0f2] px-7 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="candidate-modal-title" className="text-xl font-bold text-[#171a1f]">选择候选人</h2>
              <p className="mt-1.5 text-sm text-[#666b73]">
                本次加入岗位：{demand.job_title} ｜ {demand.job_department} ｜ {demand.job_city || '未记录城市'} ｜ 需求编号：{demand.request_no || `REQ-${demand.id}`}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[#7c8087] hover:bg-[#f4f5f6]" aria-label="关闭选择候选人">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-4 px-7 py-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9aa0a8]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索姓名、职位或技能标签..."
                className="h-12 w-full rounded-xl border border-[#edf0f2] bg-white pl-12 pr-4 text-sm outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
              />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#8a8f98]">期望工作城市</span>
                <select
                  value={cityValue}
                  onChange={(event) => setCity(event.target.value)}
                  className="h-10 w-56 rounded-lg border border-[#9edbbe] bg-white px-3 text-sm font-semibold text-[#168a5b] outline-none"
                >
                  {[demand.job_city, '杭州', '上海', '北京', '深圳', '广州', '成都'].filter(Boolean).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Button type="button" size="sm" onClick={() => setJoinStatus('joinable')} className="h-10 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
                仅显示可加入
              </Button>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[#8a8f98]">加入状态</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['all', '全部'],
                  ['joinable', '可加入'],
                  ['other', '其他岗位流程中'],
                  ['current', '已在当前岗位'],
                  ['ended', '已结束'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setJoinStatus(key as JoinStatus)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                      joinStatus === key
                        ? 'border-[#ff8b5c] bg-[#ff8b5c] text-white'
                        : 'border-[#edf0f2] bg-white text-[#555b64] hover:border-[#ffb08d]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMore((current) => !current)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#666b73] hover:text-[#168a5b]"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
              更多筛选
            </button>

            {showMore && (
              <div className="max-h-[220px] space-y-4 overflow-y-auto rounded-xl border border-[#eef0f2] bg-[#fbfcfc] p-4">
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#8a8f98]">简历来源</p>
                  <div className="flex flex-wrap gap-2">
                    {sourceOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setSource(item)}
                        className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                          source === item ? 'border-[#33a474] bg-[#33a474] text-white' : 'border-[#edf0f2] bg-white text-[#555b64]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#8a8f98]">期望岗位</p>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_OPTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRole(item)}
                        className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                          role === item ? 'border-[#ff8b5c] bg-[#ff8b5c] text-white' : 'border-[#edf0f2] bg-white text-[#555b64]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[#8a8f98]">工作年限</p>
                    <div className="flex flex-wrap gap-2">
                      {EXPERIENCE_OPTIONS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setExperience(item)}
                          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                            experience === item ? 'border-[#8ba374] bg-[#8ba374] text-white' : 'border-[#edf0f2] bg-white text-[#555b64]'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[#8a8f98]">学历（可多选）</p>
                    <div className="flex flex-wrap gap-2">
                      {EDUCATION_OPTIONS.map((item) => {
                        const active = education.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setEducation((current) => active ? current.filter((value) => value !== item) : [...current, item]);
                            }}
                            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                              active ? 'border-[#33a474] bg-[#e9f7f1] text-[#168a5b]' : 'border-[#edf0f2] bg-white text-[#555b64]'
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-[#8a8f98]">负责人</span>
                    <select value={owner} onChange={(event) => setOwner(event.target.value)} className="h-10 w-full rounded-lg border border-[#edf0f2] px-3 text-sm">
                      <option>全部负责人</option>
                      <option>张敏</option>
                      <option>李华</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-[#8a8f98]">简历更新时间</span>
                    <select value={updated} onChange={(event) => setUpdated(event.target.value)} className="h-10 w-full rounded-lg border border-[#edf0f2] px-3 text-sm">
                      <option>全部</option>
                      <option>最近7天</option>
                      <option>最近30天</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-y border-[#eef0f2] bg-white px-7 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-[#666b73]">
                <span>共 {candidates.length} 人 · 可加入 {joinableCount} · 筛选结果 {filteredCandidates.length}</span>
                <button type="button" onClick={resetFilters} className="font-semibold text-[#168a5b]">清除筛选</button>
                {message && <span className="text-[#168a5b]">{message}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#8a8f98]">排序：</span>
                {[
                  ['fit', '岗位匹配度'],
                  ['latest', '最近更新'],
                  ['recent', '最近入库'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortMode(key as SortMode)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      sortMode === key ? 'bg-[#171a1f] text-white' : 'bg-[#f6f7f8] text-[#8a8f98]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-2 inline-flex items-center gap-1 text-[#666b73]"><span className="h-2 w-2 rounded-full bg-[#33a474]" />可加入</span>
                <span className="inline-flex items-center gap-1 text-[#666b73]"><span className="h-2 w-2 rounded-full bg-[#bde7d4]" />已加入</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-[#8a8f98]">
              <Spinner size="sm" />
              正在加载简历库真实数据…
            </div>
          ) : error ? (
            <div className="min-h-0 flex-1 px-7 py-6">
              <ErrorState message={error} onRetry={() => setSearch((current) => `${current}`)} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#fbfbfa] text-[#666b73] shadow-[0_1px_0_#eef0f2]">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={filteredCandidates.length > 0 && filteredCandidates.every((candidate) => selectedIds.has(candidate.id))}
                        onChange={(event) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            filteredCandidates.forEach((candidate) => {
                              if (event.target.checked) next.add(candidate.id);
                              else next.delete(candidate.id);
                            });
                            return next;
                          });
                        }}
                        className="h-5 w-5 rounded border-[#b8bdc4]"
                        aria-label="全选候选人"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">候选人</th>
                    <th className="px-4 py-3 font-semibold">当前/最近流程岗位</th>
                    <th className="px-4 py-3 font-semibold">来源</th>
                    <th className="px-4 py-3 font-semibold">当前阶段</th>
                    <th className="px-4 py-3 font-semibold">匹配度</th>
                    <th className="px-4 py-3 font-semibold">状态说明</th>
                    <th className="px-4 py-3 text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      match={matches.get(candidate.id)}
                      selected={selectedIds.has(candidate.id)}
                      onToggle={() => toggleCandidate(candidate.id)}
                    />
                  ))}
                </tbody>
              </table>
              {filteredCandidates.length === 0 && (
                <div className="py-12 text-center text-sm text-[#8a8f98]">没有符合条件的候选人，可以导入简历或去简历库查看更多。</div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[#eef0f2] bg-white px-7 py-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              className="h-11 min-w-72 rounded-xl bg-[#f0efec] text-[#9a948d] hover:bg-[#e8e5df]"
              disabled={adding || selectedIds.size === 0}
              onClick={() => addSelectedToPipeline(true)}
            >
              <Send className="h-5 w-5" />
              下一步：推送面试官评审
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" disabled={adding || selectedIds.size === 0} onClick={() => addSelectedToPipeline(false)}>
                仅加入岗位
              </Button>
              <Button type="button" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
                <FileUp className="h-4 w-4" />
                导入简历
              </Button>
              <Link to={`/candidates?demand=${demand.id}`}>
                <Button type="button" variant="secondary">
                  <ExternalLink className="h-4 w-4" />
                  去简历库查看更多
                </Button>
              </Link>
              <Button type="button" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
                关闭
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#9aa0a8]">
            当前选择 {selectedIds.size} 人 · 最近刷新 {formatDate(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}
