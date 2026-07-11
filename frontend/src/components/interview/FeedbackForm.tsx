import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type {
  EvaluationScores,
  InterviewFeedbackResponse,
  InterviewRound,
  PipelineStage,
} from '../../types';

const ROUNDS: { key: InterviewRound; label: string }[] = [
  { key: 'round_1', label: '一面' },
  { key: 'round_2', label: '二面' },
  { key: 'round_3', label: '终面' },
  { key: 'additional', label: '加面' },
];

const ROUND_KEYS = new Set(ROUNDS.map((round) => round.key));

const EVALUATION_DIMENSIONS = ['专业能力', '沟通表达', '业务理解', '项目经验', '文化匹配'];

const FEEDBACK_REASON_OPTIONS = [
  '专业能力不匹配',
  '项目经验不足',
  '行业经验不匹配',
  '沟通表达不符合预期',
  '稳定性存疑',
  '薪资期望不匹配',
  '到岗时间不匹配',
  '候选人意愿不强',
  '候选人主动放弃',
  '候选人已接受其他机会',
  '工作地点不匹配',
  '面试时间无法协调',
  '简历信息存疑',
  '背景匹配度不足',
  '岗位要求变化',
  '部门内部意见不一致',
  '面试标准变化',
  'HC暂缓或冻结',
  '岗位暂停招聘',
  '组织架构或汇报关系变化',
  '优先级下降',
  '薪资预算变化',
  '需要加面确认',
  '需要补充作品或案例',
  '面试官暂未形成结论',
  '其他',
];

const DEFAULT_EVALUATION = EVALUATION_DIMENSIONS.reduce<EvaluationScores>((acc, item) => {
  acc[item] = 3;
  return acc;
}, {});

interface DemandScopedFeedbackProps {
  candidateId: number;
  demandId: number;
  jobId?: number;
  assignmentId: number;
}

interface LegacyFeedbackProps {
  candidateId: number;
  demandId?: undefined;
  jobId: number;
  assignmentId: number;
}

type FeedbackFormProps = (DemandScopedFeedbackProps | LegacyFeedbackProps) & {
  initialRound?: InterviewRound;
  /** Legacy caller compatibility only; feedback never invokes this callback. */
  onMove?: (toStage: PipelineStage, note: string) => void | Promise<void>;
  onSubmitted?: (result: InterviewFeedbackResponse) => void;
};

export function FeedbackForm({
  candidateId,
  demandId,
  jobId,
  assignmentId,
  initialRound,
  onSubmitted,
}: FeedbackFormProps) {
  const defaultRound = useMemo(
    () => (initialRound && ROUND_KEYS.has(initialRound) ? initialRound : 'round_1'),
    [initialRound],
  );
  const [round, setRound] = useState<InterviewRound>(defaultRound);
  const [score, setScore] = useState(3);
  const [passed, setPassed] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationScores>(DEFAULT_EVALUATION);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRound(defaultRound);
  }, [defaultRound]);

  async function submit() {
    setSaving(true);
    setMsg(null);
    try {
      const context = demandId
        ? { demand_id: demandId }
        : { job_id: jobId as number };
      const result = await api.submitFeedback({
        candidate_id: candidateId,
        ...context,
        assignment_id: assignmentId,
        round,
        score,
        passed,
        evaluation,
        reason_tags: reasonTags,
        strengths,
        concerns,
      });
      const nextMessage = result.next_action === 'awaiting_hr_decision'
        ? '主面试官反馈已提交，本轮完成，待 HR 确认下一步'
        : '反馈已提交，等待主面试官完成本轮';
      setMsg(nextMessage);
      onSubmitted?.(result);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSaving(false);
    }
  }

  function toggleReason(tag: string) {
    setReasonTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
      <p className="text-sm font-medium text-ink">人工反馈</p>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="轮次"
          value={round}
          onChange={(e) => setRound(e.target.value as InterviewRound)}
          disabled={Boolean(assignmentId)}
        >
          {ROUNDS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          label="评分(1-5)"
          value={String(score)}
          onChange={(e) => setScore(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <Select
        label="本轮反馈建议"
        value={passed ? 'y' : 'n'}
        onChange={(e) => setPassed(e.target.value === 'y')}
      >
        <option value="y">建议通过</option>
        <option value="n">建议不通过</option>
      </Select>
      <div className="rounded-md border border-hairline bg-canvas p-3">
        <p className="mb-3 text-sm font-medium text-ink">原因分类</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_REASON_OPTIONS.map((tag) => {
            const checked = reasonTags.includes(tag);
            return (
              <label
                key={tag}
                className={[
                  'inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  checked
                    ? 'border-ink bg-ink text-white'
                    : 'border-hairline bg-surface-soft text-muted hover:text-ink',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleReason(tag)}
                />
                {tag}
              </label>
            );
          })}
        </div>
      </div>
      <div className="rounded-md border border-hairline bg-canvas p-3">
        <p className="mb-3 text-sm font-medium text-ink">评价维度</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {EVALUATION_DIMENSIONS.map((dimension) => (
            <Select
              key={dimension}
              label={dimension}
              value={String(evaluation[dimension] ?? 3)}
              onChange={(e) => setEvaluation((prev) => ({
                ...prev,
                [dimension]: Number(e.target.value),
              }))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </div>
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2}
        placeholder="优势"
        value={strengths}
        onChange={(e) => setStrengths(e.target.value)}
      />
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2}
        placeholder="顾虑"
        value={concerns}
        onChange={(e) => setConcerns(e.target.value)}
      />
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} loading={saving} disabled={saving} size="sm">
          提交反馈
        </Button>
        <p className="self-center text-xs text-muted">
          反馈只完成本轮面试任务，推进或淘汰由 HR 另行确认。
        </p>
      </div>
    </div>
  );
}
