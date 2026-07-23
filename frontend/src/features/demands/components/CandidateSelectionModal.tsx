import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarCheck, CheckCircle2, ChevronDown, ExternalLink, FileUp, Search, Send, X } from 'lucide-react';
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

type SortMode = 'fit' | 'recent';
type CandidateSelectionAction = 'pool' | 'business_review' | 'offline_pass';

const ACTION_CONFIG = {
  pool: {
    stage: 'pending',
    note: '加入岗位人选池，暂不提交业务评审',
  },
  business_review: {
    stage: 'business_review',
    note: '提交用人负责人业务评审',
  },
  offline_pass: {
    stage: 'interview',
    note: '线下业务评审已通过，进入待安排面试',
  },
} as const;

const EDUCATION_OPTIONS = ['高中及以下', '大专', '本科', '硕士', '博士'];

function candidateInitial(name: string) {
  return name.replace(/^候选人\s*/, '').trim().slice(0, 1) || '候';
}

function sourceLabel(candidate: CandidateListItem) {
  return candidate.source?.channel || '未记录';
}

function fitScore(match?: MatchResultItem) {
  const score = Number(match?.score);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
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
  const score = fitScore(match);
  const isStrong = score !== null && score >= 75;
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
            <Link
              to={`/candidates/${candidate.id}`}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#171a1f] hover:text-[#168a5b]"
            >
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
      <td className="px-4 py-3 text-sm text-[#666b73]">{candidate.education_summary || '未记录'}</td>
      <td className="px-4 py-3">
        {score === null ? (
          <span className="text-sm text-[#8a8f98]">未计算</span>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-2 w-16 overflow-hidden rounded-full bg-[#eef0ec]">
              <span
                className={`block h-full rounded-full ${isStrong ? 'bg-[#18bf83]' : 'bg-[#f6a215]'}`}
                style={{ width: `${Math.max(4, score)}%` }}
              />
            </span>
            <span className={`font-bold ${isStrong ? 'text-[#0e9c69]' : 'text-[#f08a00]'}`}>{score}%</span>
          </div>
        )}
      </td>
    </tr>
  );
}

export function CandidateSelectionModal({ demand, open, onClose, onChanged }: CandidateSelectionModalProps) {
  const demandId = demand?.id ?? null;
  const demandJobId = demand?.job_id ?? null;
  const demandCity = demand?.job_city ?? '';
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('fit');
  const [source, setSource] = useState('全部来源');
  const [role, setRole] = useState('全部岗位');
  const [education, setEducation] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [matches, setMatches] = useState<Map<number, MatchResultItem>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState<CandidateSelectionAction | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [offlineConfirmOpen, setOfflineConfirmOpen] = useState(false);
  const [offlineReviewMethod, setOfflineReviewMethod] = useState('线下会议');
  const [offlineReviewNote, setOfflineReviewNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open || demandId === null) return;
    setSearch('');
    setCity(demandCity);
    setShowMore(false);
    setSortMode('fit');
    setSource('全部来源');
    setRole('全部岗位');
    setEducation([]);
    setSelectedIds(new Set());
    setMessage(null);
    setScheduleReady(false);
    setOfflineConfirmOpen(false);
    setOfflineReviewMethod('线下会议');
    setOfflineReviewNote('');
  }, [demandCity, demandId, open]);

  useEffect(() => {
    if (!open || demandId === null || demandJobId === null) return;
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
          const preview = await api.previewJobMatch(demandJobId, ids);
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
  }, [city, demandId, demandJobId, open, reloadKey, search]);

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((candidate) => {
        if (source !== '全部来源' && sourceLabel(candidate) !== source) return false;
        if (role !== '全部岗位') {
          const text = [candidate.latest_experience?.position, candidate.source?.target_job_title, ...((candidate.top_tags ?? []).map((tag) => tag.tag))]
            .filter(Boolean)
            .join(' ');
          if (!text.includes(role)) return false;
        }
        if (education.length > 0) {
          if (!candidate.education_summary || !education.some((item) => candidate.education_summary?.includes(item))) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'fit') return (fitScore(matches.get(b.id)) ?? -1) - (fitScore(matches.get(a.id)) ?? -1);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, education, matches, role, sortMode, source]);

  const sourceOptions = useMemo(() => {
    const values = new Set(['全部来源']);
    candidates.forEach((candidate) => {
      const value = sourceLabel(candidate);
      if (value !== '未记录') values.add(value);
    });
    return [...values];
  }, [candidates]);

  const roleOptions = useMemo(() => {
    const values = new Set(['全部岗位']);
    candidates.forEach((candidate) => {
      const currentRole = candidate.latest_experience?.position?.trim();
      const targetRole = candidate.source?.target_job_title?.trim();
      if (currentRole) values.add(currentRole);
      if (targetRole) values.add(targetRole);
    });
    return [...values];
  }, [candidates]);

  const cityOptions = useMemo(() => {
    const values = new Set<string>();
    if (demandCity) values.add(demandCity);
    if (city) values.add(city);
    candidates.forEach((candidate) => {
      if (candidate.intent_city) values.add(candidate.intent_city);
    });
    return [...values];
  }, [candidates, city, demandCity]);

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
    setShowMore(false);
    setSource('全部来源');
    setRole('全部岗位');
    setEducation([]);
    setSortMode('fit');
  }

  function openOfflineConfirmation() {
    if (selectedIds.size === 0) {
      setMessage('请先勾选候选人');
      return;
    }
    setMessage(null);
    setScheduleReady(false);
    setOfflineConfirmOpen(true);
  }

  async function applySelectedAction(action: CandidateSelectionAction) {
    if (selectedIds.size === 0) {
      setMessage('请先勾选候选人');
      return;
    }
    if (action === 'business_review' && !activeDemand.default_interviewer_id) {
      setMessage('该需求尚未设置用人负责人，不能提交业务评审。请先补齐需求信息。');
      return;
    }
    setAdding(action);
    setMessage(null);
    setScheduleReady(false);
    const candidateIds = [...selectedIds];
    const config = ACTION_CONFIG[action];
    const actionNote = action === 'offline_pass'
      ? `${config.note}；线下确认方式：${offlineReviewMethod}${offlineReviewNote.trim() ? `；备注：${offlineReviewNote.trim()}` : ''}`
      : config.note;
    const results = await Promise.allSettled(candidateIds.map((candidateId) => api.movePipeline({
      candidate_id: candidateId,
      demand_id: activeDemand.id,
      stage: config.stage,
      note: actionNote,
    })));
    const succeededIds = candidateIds.filter((_, index) => results[index]?.status === 'fulfilled');
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    const firstFailure = failures[0]?.reason;
    const failureMessage = firstFailure instanceof Error ? firstFailure.message : '部分候选人处理失败';

    if (succeededIds.length > 0) {
      setSelectedIds((current) => {
        const next = new Set(current);
        succeededIds.forEach((candidateId) => next.delete(candidateId));
        return next;
      });
      onChanged();
    }

    if (action === 'pool') {
      setMessage(`${succeededIds.length} 人已加入岗位人选池${failures.length > 0 ? `，${failures.length} 人失败：${failureMessage}` : ''}。`);
    } else if (action === 'business_review') {
      setMessage(`${succeededIds.length} 人已进入业务评审${failures.length > 0 ? `，${failures.length} 人失败：${failureMessage}` : ''}。企业微信通知接口尚未接通，本次未发送企微消息。`);
    } else {
      setMessage(`${succeededIds.length} 人已记录为线下业务通过并进入待安排面试${failures.length > 0 ? `，${failures.length} 人失败：${failureMessage}` : ''}。`);
      setScheduleReady(succeededIds.length > 0);
      if (succeededIds.length > 0) {
        setOfflineConfirmOpen(false);
        setOfflineReviewNote('');
      }
    }
    setAdding(null);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
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

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/35 px-5 py-6"
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
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="h-10 w-56 rounded-lg border border-[#9edbbe] bg-white px-3 text-sm font-semibold text-[#168a5b] outline-none"
                >
                  <option value="">全部城市</option>
                  {cityOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
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
                  <p className="mb-2 text-xs font-semibold text-[#8a8f98]">岗位经历</p>
                  <div className="flex flex-wrap gap-2">
                    {roleOptions.map((item) => (
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
            )}
          </div>

          <div className="shrink-0 border-y border-[#eef0f2] bg-white px-7 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-[#666b73]">
                <span>共 {candidates.length} 人 · 筛选结果 {filteredCandidates.length} · 已选择 {selectedIds.size}</span>
                <button type="button" onClick={resetFilters} className="font-semibold text-[#168a5b]">清除筛选</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#8a8f98]">排序：</span>
                {[
                  ['fit', '岗位匹配度'],
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
              <ErrorState message={error} onRetry={() => setReloadKey((current) => current + 1)} />
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
                    <th className="px-4 py-3 font-semibold">最近任职岗位</th>
                    <th className="px-4 py-3 font-semibold">来源</th>
                    <th className="px-4 py-3 font-semibold">学历</th>
                    <th className="px-4 py-3 font-semibold">匹配度</th>
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
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.zip"
            onChange={(event) => handleFiles(event.target.files)}
          />
          {offlineConfirmOpen && (
            <div className="mb-3 grid gap-3 rounded-lg border border-[#f1d7bd] bg-[#fffaf4] p-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[#7a5b3c]">线下确认方式</span>
                <select
                  value={offlineReviewMethod}
                  onChange={(event) => setOfflineReviewMethod(event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#e8cfb5] bg-white px-3 text-sm outline-none focus:border-[#c77738]"
                >
                  <option value="线下会议">线下会议</option>
                  <option value="电话确认">电话确认</option>
                  <option value="线上会议">线上会议</option>
                  <option value="其他">其他</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[#7a5b3c]">补充备注</span>
                <input
                  value={offlineReviewNote}
                  onChange={(event) => setOfflineReviewNote(event.target.value)}
                  placeholder="可填写确认人补充说明"
                  className="h-10 w-full rounded-lg border border-[#e8cfb5] bg-white px-3 text-sm outline-none focus:border-[#c77738]"
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={Boolean(adding)} onClick={() => setOfflineConfirmOpen(false)}>
                  返回
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={adding === 'offline_pass'}
                  disabled={Boolean(adding)}
                  onClick={() => applySelectedAction('offline_pass')}
                >
                  确认通过
                </Button>
              </div>
            </div>
          )}
          {message && (
            <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#eef8f3] px-4 py-3 text-sm font-semibold text-[#166b4a]">
              <span>{message}</span>
              {scheduleReady && (
                <Link to={`/pipeline?demand=${demand.id}&stage=interview&schedule=unassigned`}>
                  <Button type="button" size="sm">
                    <CalendarCheck className="h-4 w-4" />
                    去安排面试
                  </Button>
                </Link>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                loading={adding === 'business_review'}
                disabled={Boolean(adding) || selectedIds.size === 0}
                onClick={() => {
                  setOfflineConfirmOpen(false);
                  applySelectedAction('business_review');
                }}
              >
                <Send className="h-5 w-5" />
                提交业务评审
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(adding) || selectedIds.size === 0}
                onClick={openOfflineConfirmation}
              >
                <CalendarCheck className="h-4 w-4" />
                线下已通过，去安排面试
              </Button>
              <Button
                type="button"
                variant="ghost"
                loading={adding === 'pool'}
                disabled={Boolean(adding) || selectedIds.size === 0}
                onClick={() => {
                  setOfflineConfirmOpen(false);
                  applySelectedAction('pool');
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                仅加入岗位人选池
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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

  return createPortal(modal, document.body);
}
