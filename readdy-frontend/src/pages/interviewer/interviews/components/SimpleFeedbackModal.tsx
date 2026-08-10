import { CheckCircle2, CircleHelp, Save, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import type {
  InterviewAssignment,
  InterviewFeedback,
  InterviewRecommendation,
  JobMatch,
  Satisfaction,
  StructuredInterviewFeedbackValues,
} from '@/features/interviews/types';

interface SimpleFeedbackModalProps {
  assignment: InterviewAssignment;
  existingFeedback: InterviewFeedback | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: StructuredInterviewFeedbackValues) => void;
}

const choices: Array<{
  value: Satisfaction;
  label: string;
  icon: typeof CheckCircle2;
  activeClass: string;
}> = [
  {
    value: 'pass',
    label: '通过',
    icon: CheckCircle2,
    activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  },
  {
    value: 'fail',
    label: '不通过',
    icon: XCircle,
    activeClass: 'border-red-400 bg-red-50 text-red-700',
  },
];

const jobMatchOptions: Array<{ value: JobMatch; label: string }> = [
  { value: 'high', label: '高匹配' },
  { value: 'medium', label: '基本匹配' },
  { value: 'low', label: '低匹配' },
];

const recommendationOptions: Array<{
  value: InterviewRecommendation;
  label: string;
}> = [
  { value: 'next_round', label: '进入下一轮' },
  { value: 'offer', label: '建议进入 Offer' },
  { value: 'reject', label: '不建议继续' },
];

function evaluationValue<T extends string>(
  feedback: InterviewFeedback | null,
  key: string,
  allowed: readonly T[],
): T | '' {
  const value = feedback?.evaluation?.[key];
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : '';
}

export default function SimpleFeedbackModal({
  assignment,
  existingFeedback,
  saving,
  error,
  onClose,
  onSave,
}: SimpleFeedbackModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [satisfaction, setSatisfaction] = useState<Satisfaction | null>(
    existingFeedback?.satisfaction ?? null,
  );
  const [jobMatch, setJobMatch] = useState<JobMatch | ''>(() => evaluationValue(
    existingFeedback,
    'job_match',
    jobMatchOptions.map((item) => item.value),
  ));
  const [recommendation, setRecommendation] = useState<InterviewRecommendation | ''>(
    () => evaluationValue(
      existingFeedback,
      'recommendation',
      recommendationOptions.map((item) => item.value),
    ),
  );
  const [strengths, setStrengths] = useState(existingFeedback?.strengths ?? '');
  const [concerns, setConcerns] = useState(existingFeedback?.concerns ?? '');
  const [note, setNote] = useState(existingFeedback?.note ?? '');

  useEffect(() => {
    setSatisfaction(existingFeedback?.satisfaction ?? null);
    setJobMatch(evaluationValue(
      existingFeedback,
      'job_match',
      jobMatchOptions.map((item) => item.value),
    ));
    setRecommendation(evaluationValue(
      existingFeedback,
      'recommendation',
      recommendationOptions.map((item) => item.value),
    ));
    setStrengths(existingFeedback?.strengths ?? '');
    setConcerns(existingFeedback?.concerns ?? '');
    setNote(existingFeedback?.note ?? '');
  }, [existingFeedback, assignment.id]);

  useOverlayLifecycle({
    canClose: !saving,
    onClose,
    initialFocusRef: modalRef,
  });

  const canSave = Boolean(
    satisfaction
    && jobMatch
    && recommendation
    && (satisfaction !== 'pass' || strengths.trim())
    && (satisfaction !== 'fail' || concerns.trim())
    && true,
  );

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={existingFeedback ? '修改面试评价' : '填写面试评价'}
      onClick={saving ? undefined : onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground-900">
              {existingFeedback ? '修改面试评价' : '填写面试评价'}
            </h2>
            <p className="mt-1 truncate text-sm text-foreground-500">
              {assignment.name_masked || `候选人 #${assignment.candidate_id}`} · 第 {assignment.round_sequence} 轮
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:cursor-not-allowed"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground-800">满意程度</legend>
            <div className="grid grid-cols-3 gap-2">
              {choices.map((choice) => {
                const Icon = choice.icon;
                const active = satisfaction === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setSatisfaction(choice.value)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${
                      active
                        ? choice.activeClass
                        : 'border-background-200 text-foreground-500 hover:border-background-300 hover:bg-background-50'
                    }`}
                  >
                    <Icon size={21} />
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-foreground-800">岗位匹配 <span className="text-red-500">*</span></span>
              <select
                value={jobMatch}
                onChange={(event) => setJobMatch(event.target.value as JobMatch)}
                className="mt-2 h-10 w-full rounded-md border border-background-200 bg-white px-3 text-sm text-foreground-800 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {jobMatchOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-foreground-800">建议结论 <span className="text-red-500">*</span></span>
              <select
                value={recommendation}
                onChange={(event) => setRecommendation(event.target.value as InterviewRecommendation)}
                className="mt-2 h-10 w-full rounded-md border border-background-200 bg-white px-3 text-sm text-foreground-800 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {recommendationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-foreground-800">优势{satisfaction === 'pass' && <span className="text-red-500"> *</span>}</span>
              <textarea
                value={strengths}
                onChange={(event) => setStrengths(event.target.value.slice(0, 1000))}
                rows={4}
                maxLength={1000}
                placeholder="记录与岗位相关的能力亮点"
                className="mt-2 w-full resize-none rounded-md border border-background-200 px-3 py-2 text-sm leading-6 outline-none focus:border-primary-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-foreground-800">顾虑{satisfaction === 'fail' && <span className="text-red-500"> *</span>}</span>
              <textarea
                value={concerns}
                onChange={(event) => setConcerns(event.target.value.slice(0, 1000))}
                rows={4}
                maxLength={1000}
                placeholder="记录需要复核或不匹配的地方"
                className="mt-2 w-full resize-none rounded-md border border-background-200 px-3 py-2 text-sm leading-6 outline-none focus:border-primary-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-foreground-800">补充备注</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 1000))}
              rows={7}
              maxLength={1000}
              placeholder="补充需要后续确认的信息"
              className="mt-2 w-full resize-none rounded-md border border-background-200 px-3 py-2.5 text-sm leading-6 text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-50"
            />
            <span className="mt-1 block text-right text-xs text-foreground-400">{note.length}/1000</span>
          </label>

          {existingFeedback?.updated_at && (
            <p className="text-xs text-foreground-400">
              最后修改：{existingFeedback.updated_by_name || `用户 #${existingFeedback.updated_by || '-'}`} ·{' '}
              {new Date(existingFeedback.updated_at).toLocaleString('zh-CN')}
            </p>
          )}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-background-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-background-300 px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (!satisfaction || !jobMatch || !recommendation) return;
              onSave({
                satisfaction,
                job_match: jobMatch,
                recommendation,
                strengths: strengths.trim(),
                concerns: concerns.trim(),
                note: note.trim(),
              });
            }}
            disabled={!canSave || saving}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300"
          >
            <Save size={16} />
            {saving ? '保存中...' : existingFeedback ? '保存修改' : '提交评价'}
          </button>
        </div>
      </div>
    </div>
  );
}
