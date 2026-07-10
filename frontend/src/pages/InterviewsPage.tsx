// AI 预筛面试页 — 三阶段流程：配置 → 作答（HR 代录）→ 报告。

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  PageHeader,
  Select,
} from '../components/ui';
import { InterviewReport } from '../components/InterviewReport';
import { Reveal } from '../components/motion';
import { demandOptionLabel } from '../lib/interviewRecords';
import type { InterviewReport as InterviewReportType, QaPair } from '../types';

type Phase = 'setup' | 'answer' | 'report';

// ---- Setup phase ----

interface SetupProps {
  onStart: (
    candidateId: number,
    demandId: number,
    jobId: number,
    questions: string[],
  ) => void;
}

function SetupPhase({ onStart }: SetupProps) {
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );

  const [candidateId, setCandidateId] = useState('');
  const [demandId, setDemandId] = useState('');
  const [count, setCount] = useState('5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDemandId = Number(demandId);
  const boardAsync = useAsync(
    () => selectedDemandId > 0
      ? api.getDemandPipelineBoard(selectedDemandId)
      : Promise.resolve(null),
    [selectedDemandId],
  );
  const demandCandidates = boardAsync.data?.candidates.filter(
    (candidate) => !['rejected', 'onboarded', 'transferred'].includes(candidate.stage),
  ) ?? [];

  async function handleStart() {
    const cid = Number(candidateId);
    const did = Number(demandId);
    const cnt = Number(count) || 5;

    if (!candidateId || Number.isNaN(cid)) {
      setError('请选择候选人');
      return;
    }
    if (!demandId || Number.isNaN(did)) {
      setError('请选择具体招聘需求');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.startInterview({
        candidate_id: cid,
        demand_id: did,
        count: cnt,
      });
      onStart(cid, did, res.job_id, res.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (demandsAsync.loading) {
    return (
      <Card>
        <CardBody className="flex items-center justify-center gap-3 py-20">
          <Spinner size="lg" />
          <span className="text-sm text-muted">加载招聘需求…</span>
        </CardBody>
      </Card>
    );
  }

  const loadError = demandsAsync.error?.message;
  if (loadError) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger-600">
            {loadError}
            <button
              onClick={demandsAsync.reload}
              className="ml-3 font-medium underline hover:no-underline"
            >
              重试
            </button>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>生成预筛题目</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="max-w-md space-y-4">
          {(demandsAsync.data?.items.length ?? 0) === 0 && (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-xs text-muted">
              <p>
                暂无可选招聘需求，请先去
                <Link to="/demands" className="font-semibold text-ink hover:underline">
                  创建招聘需求
                </Link>
                。
              </p>
            </div>
          )}

          <Select
            label="招聘需求"
            id="setup-demand"
            value={demandId}
            onChange={(e) => {
              setDemandId(e.target.value);
              setCandidateId('');
              setError(null);
            }}
          >
            <option value="">— 请选择具体招聘需求 —</option>
            {(demandsAsync.data?.items ?? [])
              .filter((demand) => demand.status === 'pending' || demand.status === 'active')
              .map((demand) => (
              <option key={demand.id} value={demand.id}>
                {demandOptionLabel(demand)}
              </option>
            ))}
          </Select>

          <Select
            label="候选人"
            id="setup-candidate"
            value={candidateId}
            disabled={!demandId || boardAsync.loading}
            onChange={(e) => {
              setCandidateId(e.target.value);
              setError(null);
            }}
          >
            <option value="">— 请选择该需求中的候选人 —</option>
            {demandCandidates.map((candidate) => (
              <option key={candidate.candidate_id} value={candidate.candidate_id}>
                {candidate.name_masked} (ID {candidate.candidate_id})
              </option>
            ))}
          </Select>
          {boardAsync.error && (
            <p className="text-sm text-danger-600">{boardAsync.error.message}</p>
          )}
          {demandId && !boardAsync.loading && !boardAsync.error && demandCandidates.length === 0 && (
            <p className="text-xs text-muted">
              该需求暂无进行中候选人，请先到
              <Link to={`/pipeline?demand=${selectedDemandId}`} className="font-semibold text-ink hover:underline">
                候选人流程
              </Link>
              加入或查看候选人。
            </p>
          )}

          {/* Question count */}
          <Input
            label="生成题目数量"
            id="setup-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />

          {error && (
            <div className="space-y-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
              <p>{error}</p>
              <p>
                AI 生成失败也不影响流程，可回到面试任务页手动安排面试。
              </p>
              <Link to="/interviews" className="font-medium underline hover:no-underline">
                回面试任务
              </Link>
            </div>
          )}

          <Button
            onClick={handleStart}
            loading={loading}
            disabled={loading}
            className="w-full"
          >
            {loading ? 'AI 正在生成参考题目…' : '生成参考题目'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---- Answer phase ----
// 注意：这是 HR 代录候选人作答的界面，不是候选人本人作答。

interface AnswerProps {
  questions: string[];
  answers: string[];
  onAnswerChange: (index: number, value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}

function AnswerPhase({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  submitting,
  submitError,
}: AnswerProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>录入候选人作答</CardTitle>
            <span className="text-xs text-muted">
              共 {questions.length} 题 — 录入候选人作答内容，用于 AI 参考评估
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-4 rounded-lg bg-surface-soft border border-hairline-soft px-4 py-3">
            <p className="text-xs text-muted">
              请将候选人对以下题目的实际作答内容逐题录入，提交后将生成参考报告；最终结论仍以人工反馈为准。
            </p>
          </div>
          <Reveal className="space-y-6" stagger={0.06}>
            {questions.map((q, i) => (
              <div key={i}>
                <p className="mb-2 text-sm font-medium text-ink">
                  <span className="mr-2 text-muted-soft">{i + 1}.</span>
                  {q}
                </p>
                <textarea
                  id={`answer-${i}`}
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  rows={3}
                  placeholder={`在此录入该候选人对第 ${i + 1} 题的作答内容…`}
                  value={answers[i] ?? ''}
                  onChange={(e) => onAnswerChange(i, e.target.value)}
                  aria-label={`第 ${i + 1} 题 · 候选人作答录入`}
                />
              </div>
            ))}
          </Reveal>

          {submitError && (
            <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {submitError}
            </div>
          )}

          <div className="mt-6">
            <Button
              onClick={onSubmit}
              loading={submitting}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? 'AI 正在生成参考报告…' : '提交 AI 参考评估'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---- Page ----

export function InterviewsPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [candidateId, setCandidateId] = useState<number>(0);
  const [demandId, setDemandId] = useState<number>(0);
  const [jobId, setJobId] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<InterviewReportType | null>(null);
  const [interviewId, setInterviewId] = useState<number | null>(null);

  function handleStart(cid: number, did: number, jid: number, qs: string[]) {
    setCandidateId(cid);
    setDemandId(did);
    setJobId(jid);
    setQuestions(qs);
    setAnswers(new Array(qs.length).fill(''));
    setPhase('answer');
  }

  function handleAnswerChange(index: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function handleSubmit() {
    const qaPairs: QaPair[] = questions.map((q, i) => ({
      q,
      a: answers[i] ?? '',
    }));

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitInterview({
        candidate_id: candidateId,
        demand_id: demandId,
        qa_pairs: qaPairs,
      });
      setReport(res.report);
      setInterviewId(res.interview_id);
      setPhase('report');
    } catch (err) {
      // Error must NOT lose entered answers — stay on answer phase
      setSubmitError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setPhase('setup');
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setInterviewId(null);
    setSubmitError(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="AI 预筛参考"
        description="生成参考题目、录入作答并获取辅助报告；面试结论仍由人工反馈确认"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/interviews">
              <Button variant="secondary" size="sm">
                手动安排面试
              </Button>
            </Link>
            {phase !== 'setup' && (
              <Button variant="secondary" size="sm" onClick={handleReset}>
                重新开始
              </Button>
            )}
          </div>
        }
      />

      {/* Phase indicator */}
      <div className="flex items-center gap-0">
        {(['setup', 'answer', 'report'] as Phase[]).map((p, i) => {
          const labels: Record<Phase, string> = {
            setup: '配置',
            answer: '录入作答',
            report: '评估报告',
          };
          const isActive = phase === p;
          const isDone =
            (p === 'setup' && (phase === 'answer' || phase === 'report')) ||
            (p === 'answer' && phase === 'report');
          return (
            <span key={p} className="flex items-center gap-0">
              {i > 0 && (
                <span className="mx-2 text-hairline">›</span>
              )}
              <span className="flex items-center gap-1.5">
                <span
                  className={[
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                    isActive
                      ? 'bg-ink text-on-primary'
                      : isDone
                        ? 'bg-success-100 text-success-700'
                        : 'bg-surface-strong text-muted',
                  ].join(' ')}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span
                  className={[
                    'text-sm',
                    isActive
                      ? 'font-semibold text-ink'
                      : isDone
                        ? 'text-success-600'
                        : 'text-muted-soft',
                  ].join(' ')}
                >
                  {labels[p]}
                </span>
              </span>
            </span>
          );
        })}
      </div>

      {/* Phase content */}
      {phase === 'setup' && <SetupPhase onStart={handleStart} />}

      {phase === 'answer' && (
        <AnswerPhase
          questions={questions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      {phase === 'report' && report && (
        <>
          <InterviewReport
            report={report}
            questions={questions}
            meta={
              interviewId !== null
                ? {
                    interviewId,
                    candidateId,
                    demandId,
                    jobId,
                    createdAt: new Date().toISOString(),
                  }
                : undefined
            }
          />
        </>
      )}

      {phase === 'report' && !report && (
        <Card>
          <CardBody>
            <p className="text-sm text-danger-600">
              报告生成失败，请重试，或回到面试任务页手动安排面试
              <button
                onClick={handleReset}
                className="ml-3 font-medium underline hover:no-underline"
              >
                重新开始
              </button>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
