import {
  CalendarDays,
  Clock3,
  Download,
  FileSearch,
  FileText,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateResumeDetail } from '@/features/candidates/types';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { interviewsApi } from '@/features/interviews/api';
import type {
  InterviewAssignment,
  InterviewFeedback,
  Satisfaction,
} from '@/features/interviews/types';
import SimpleFeedbackModal from './components/SimpleFeedbackModal';

type TabKey = 'all' | 'upcoming' | 'feedback' | 'completed';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'upcoming', label: '待面试' },
  { key: 'feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

const satisfactionLabels: Record<Satisfaction, string> = {
  satisfied: '满意',
  pending: '待定',
  unsatisfied: '不满意',
};

function assignmentBucket(item: InterviewAssignment): Exclude<TabKey, 'all'> {
  if (item.feedback_submitted || ['completed', 'feedback_submitted'].includes(item.status)) {
    return 'completed';
  }
  if (item.status === 'awaiting_feedback' || item.is_overdue) return 'feedback';
  return 'upcoming';
}

function dateTime(value: string | null) {
  if (!value) return '时间待安排';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function readableValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('；');
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export default function InterviewerInterviewsPage() {
  const [searchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const handledCandidateId = useRef<number | null>(null);
  const [assignments, setAssignments] = useState<InterviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<InterviewAssignment | null>(null);
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [selectedResume, setSelectedResume] = useState<CandidateResumeDetail | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<InterviewFeedback | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [feedbackAssignment, setFeedbackAssignment] = useState<InterviewAssignment | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAssignments(await interviewsApi.listMyAssignments());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载面试任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
    const refreshAssignments = () => void loadAssignments();
    window.addEventListener('focus', refreshAssignments);
    return () => window.removeEventListener('focus', refreshAssignments);
  }, [loadAssignments]);

  const filtered = useMemo(() => assignments.filter((item) => {
    if (activeTab !== 'all' && assignmentBucket(item) !== activeTab) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [item.name_masked, item.job_title, item.job_department]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }), [activeTab, assignments, searchQuery]);

  const counts = useMemo(() => ({
    all: assignments.length,
    upcoming: assignments.filter((item) => assignmentBucket(item) === 'upcoming').length,
    feedback: assignments.filter((item) => assignmentBucket(item) === 'feedback').length,
    completed: assignments.filter((item) => assignmentBucket(item) === 'completed').length,
  }), [assignments]);

  const openDetail = useCallback(async (assignment: InterviewAssignment) => {
    setSelected(assignment);
    setSelectedDemand(null);
    setSelectedResume(null);
    setSelectedFeedback(null);
    setDetailLoading(true);
    setDetailError('');
    try {
      const [resume, feedbackRows, demand] = await Promise.all([
        candidatesApi.getResume(assignment.candidate_id),
        interviewsApi.listFeedback({
          candidateId: assignment.candidate_id,
          demandId: assignment.demand_id ?? undefined,
        }),
        assignment.demand_id
          ? demandsApi.getDemand(assignment.demand_id)
          : Promise.resolve(null),
      ]);
      setSelectedResume(resume);
      setSelectedDemand(demand);
      setSelectedFeedback(
        feedbackRows.find((item) => item.assignment_id === assignment.id)
          ?? feedbackRows.find((item) => item.round === assignment.round)
          ?? null,
      );
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载面试详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !requestedCandidateId || handledCandidateId.current === requestedCandidateId) return;
    const assignment = assignments.find((item) => (
      item.candidate_id === requestedCandidateId
      && (!requestedDemandId || item.demand_id === requestedDemandId)
    ));
    if (!assignment) return;
    handledCandidateId.current = requestedCandidateId;
    void openDetail(assignment);
  }, [assignments, loading, openDetail, requestedCandidateId, requestedDemandId]);

  const openOriginalResume = async (download: boolean) => {
    if (!selected) return;
    setDetailError('');
    try {
      const blob = download
        ? await businessReviewsApi.downloadResume(selected.candidate_id)
        : await businessReviewsApi.loadResume(selected.candidate_id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = selectedResume?.original_resume.filename || `candidate-${selected.candidate_id}-resume`;
        anchor.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '读取原版简历失败');
    }
  };

  const startFeedback = async (assignment: InterviewAssignment) => {
    if (selected?.id !== assignment.id) await openDetail(assignment);
    setFeedbackError('');
    setFeedbackAssignment(assignment);
  };

  const saveFeedback = async (satisfaction: Satisfaction, note: string) => {
    if (!feedbackAssignment) return;
    setFeedbackSaving(true);
    setFeedbackError('');
    try {
      if (selectedFeedback?.assignment_id === feedbackAssignment.id) {
        await interviewsApi.updateFeedback(selectedFeedback.id, { satisfaction, note });
      } else {
        await interviewsApi.saveFeedback({
          assignment_id: feedbackAssignment.id,
          satisfaction,
          note,
        });
      }
      setFeedbackAssignment(null);
      await Promise.all([loadAssignments(), openDetail(feedbackAssignment)]);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : '保存面试评价失败');
    } finally {
      setFeedbackSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-interviewer-assignments">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground-900">我的面试</h1>
          <p className="mt-1 text-sm text-foreground-500">查看已分配任务并提交每轮评价</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAssignments()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-background-200 bg-white px-3 text-sm text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              activeTab === tab.key
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-background-200 bg-white text-foreground-600 hover:bg-background-50'
            }`}
          >
            {tab.label} <span className="ml-1 text-xs opacity-80">{counts[tab.key]}</span>
          </button>
        ))}
        <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索候选人、岗位或部门"
            className="h-9 w-full rounded-md border border-background-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400"
          />
        </label>
      </div>

      {loading ? (
        <div className="rounded-lg border border-background-200 bg-white py-16 text-center text-sm text-foreground-500">
          <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
          正在加载面试任务...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center">
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadAssignments()}
            className="mt-3 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700"
          >
            重新加载
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-background-200 bg-white py-16 text-center">
          <CalendarDays size={28} className="mx-auto mb-3 text-foreground-300" />
          <p className="text-sm font-medium text-foreground-600">暂无符合条件的面试任务</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-background-200 bg-white">
          <div className="divide-y divide-background-100">
            {filtered.map((item) => {
              const bucket = assignmentBucket(item);
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-background-50/70">
                  <button
                    type="button"
                    onClick={() => void openDetail(item)}
                    className="flex min-w-[240px] flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 text-sm font-bold text-primary-700">
                      {(item.name_masked || '?').slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground-900">
                        {item.name_masked || `候选人 #${item.candidate_id}`}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-500">
                        {item.job_title || `岗位 #${item.job_id}`} · 第 {item.round_sequence} 轮
                      </span>
                    </span>
                  </button>
                  <span className="inline-flex min-w-[150px] items-center gap-2 text-xs text-foreground-500">
                    <Clock3 size={14} /> {dateTime(item.scheduled_at)}
                  </span>
                  <span className="inline-flex min-w-[120px] items-center gap-2 text-xs text-foreground-500">
                    <MapPin size={14} /> {item.location || '地点待确认'}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    bucket === 'feedback'
                      ? 'bg-amber-100 text-amber-700'
                      : bucket === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-primary-100 text-primary-700'
                  }`}>
                    {bucket === 'feedback' ? '待反馈' : bucket === 'completed' ? '已完成' : '待面试'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void startFeedback(item)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground-900 px-3 text-sm font-medium text-white hover:bg-foreground-800"
                  >
                    <MessageSquareText size={15} />
                    {item.feedback_submitted ? '修改评价' : '填写评价'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <>
          <button
            type="button"
            aria-label="关闭详情"
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-40 bg-foreground-900/40"
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[620px] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-foreground-900">
                  {selected.name_masked || `候选人 #${selected.candidate_id}`}
                </h2>
                <p className="mt-1 truncate text-sm text-foreground-500">
                  {selected.job_title || `岗位 #${selected.job_id}`} · 第 {selected.round_sequence} 轮
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {detailLoading ? (
                <div className="py-16 text-center text-sm text-foreground-500">
                  <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
                  正在加载面试详情...
                </div>
              ) : detailError ? (
                <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{detailError}</div>
              ) : (
                <>
                  <section>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                      <FileText size={16} /> 岗位 JD
                    </h3>
                    <div className="mt-2 whitespace-pre-wrap rounded-md bg-background-50 p-4 text-sm leading-6 text-foreground-700">
                      {selectedDemand?.jd_text || '未填写岗位 JD'}
                    </div>
                  </section>

                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                        <FileSearch size={16} /> 候选人简历
                      </h3>
                      {selectedResume?.original_resume.available && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void openOriginalResume(false)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-background-200 px-3 py-1.5 text-xs font-medium text-foreground-600 hover:bg-background-50"
                          >
                            <FileText size={14} /> 查看原版
                          </button>
                          <button
                            type="button"
                            onClick={() => void openOriginalResume(true)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-background-200 px-3 py-1.5 text-xs font-medium text-foreground-600 hover:bg-background-50"
                          >
                            <Download size={14} /> 下载
                          </button>
                        </div>
                      )}
                    </div>
                    <dl className="mt-2 divide-y divide-background-100 rounded-md border border-background-200">
                      {Object.entries(selectedResume?.resume_json || {}).slice(0, 12).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm">
                          <dt className="text-foreground-500">{key}</dt>
                          <dd className="whitespace-pre-wrap break-words text-foreground-700">{readableValue(value)}</dd>
                        </div>
                      ))}
                      {Object.keys(selectedResume?.resume_json || {}).length === 0 && (
                        <div className="px-4 py-5 text-sm text-foreground-500">暂无结构化简历信息</div>
                      )}
                    </dl>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                      <MessageSquareText size={16} /> 本轮评价
                    </h3>
                    <div className="mt-2 rounded-md border border-background-200 p-4">
                      {selectedFeedback ? (
                        <>
                          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                            {selectedFeedback.satisfaction
                              ? satisfactionLabels[selectedFeedback.satisfaction]
                              : '已提交'}
                          </span>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground-700">
                            {selectedFeedback.note || '未填写备注'}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-foreground-500">尚未提交本轮评价</p>
                      )}
                      <button
                        type="button"
                        onClick={() => setFeedbackAssignment(selected)}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-foreground-900 px-3 py-2 text-sm font-medium text-white"
                      >
                        <MessageSquareText size={15} />
                        {selectedFeedback ? '修改评价' : '填写评价'}
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {feedbackAssignment && (
        <SimpleFeedbackModal
          assignment={feedbackAssignment}
          existingFeedback={
            selectedFeedback?.assignment_id === feedbackAssignment.id ? selectedFeedback : null
          }
          saving={feedbackSaving}
          error={feedbackError}
          onClose={() => !feedbackSaving && setFeedbackAssignment(null)}
          onSave={(satisfaction, note) => void saveFeedback(satisfaction, note)}
        />
      )}
    </div>
  );
}
