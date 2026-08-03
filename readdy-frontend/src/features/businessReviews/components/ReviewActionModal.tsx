import { useEffect, useState, type ComponentType } from 'react';
import {
  AlertCircle,
  Check,
  CircleHelp,
  LoaderCircle,
  X,
} from 'lucide-react';
import type {
  BusinessReviewDecisionInput,
  BusinessReviewTask,
} from '@/features/businessReviews/types';

type BusinessDecision = BusinessReviewDecisionInput['decision'];

interface LegacyReviewRecord {
  candidateName: string;
  position: string;
  source: string;
  pusher: string;
  pushTime: string;
  deadline: string;
  keyRequirements: string;
}

interface BusinessReviewModalProps {
  task: BusinessReviewTask;
  record?: never;
  onClose: () => void;
  onSubmit: (action: BusinessDecision, comment: string) => void | Promise<void>;
  isSubmitting?: boolean;
  error?: string;
}

interface LegacyReviewModalProps<TAction extends string> {
  record: LegacyReviewRecord;
  task?: never;
  onClose: () => void;
  onSubmit: (action: TAction, comment: string) => void | Promise<void>;
  isSubmitting?: boolean;
  error?: string;
}

type ReviewActionModalProps<TAction extends string> = BusinessReviewModalProps | LegacyReviewModalProps<TAction>;

interface DecisionConfig {
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  activeClass: string;
  buttonClass: string;
}

const actionConfig: Record<BusinessDecision, DecisionConfig> = {
  approved: {
    label: '通过，进入一面',
    description: '保存通过结论，等待 HR 安排一面',
    icon: Check,
    activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
  },
  rejected: {
    label: '不合适',
    description: '返回 HR 确认，不会在这里直接淘汰',
    icon: X,
    activeClass: 'border-red-300 bg-red-50 text-red-800',
    buttonClass: 'bg-red-600 hover:bg-red-700',
  },
  needs_info: {
    label: '需要 HR 补充信息',
    description: '说明缺少的资料，等待 HR 补充后再处理',
    icon: CircleHelp,
    activeClass: 'border-amber-300 bg-amber-50 text-amber-800',
    buttonClass: 'bg-amber-600 hover:bg-amber-700',
  },
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function ReviewActionModal<TAction extends string = BusinessDecision>(
  props: ReviewActionModalProps<TAction>,
) {
  const [action, setAction] = useState<BusinessDecision>('approved');
  const [comment, setComment] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const businessTask = 'task' in props && props.task ? props.task : null;
  const legacyRecord = 'record' in props && props.record ? props.record : null;
  const isSubmitting = props.isSubmitting ?? false;
  const onClose = props.onClose;
  const commentRequired = action !== 'approved';
  const commentMissing = commentRequired && !comment.trim();

  const candidateName = businessTask?.candidate.name_masked ?? legacyRecord?.candidateName ?? '候选人';
  const position = businessTask?.demand.job_title ?? legacyRecord?.position ?? '岗位未填写';
  const pusher = businessTask?.created_by_name ?? legacyRecord?.pusher ?? '招聘专员';
  const pushedAt = businessTask?.created_at ?? legacyRecord?.pushTime ?? null;
  const dueAt = businessTask?.due_at ?? legacyRecord?.deadline ?? null;
  const reviewContext = businessTask
    ? businessTask.hr_note || (businessTask.demand.focus_points ?? []).join('、') || 'HR 未填写筛选备注'
    : legacyRecord?.keyRequirements || '未填写重点评审要求';

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSubmitting, onClose]);

  const handleSubmit = () => {
    const trimmedComment = comment.trim();
    if (action !== 'approved' && !trimmedComment) {
      setShowValidation(true);
      return;
    }

    const submit = props.onSubmit as (decision: BusinessDecision, note: string) => void | Promise<void>;
    void submit(action, trimmedComment);
  };

  const activeConfig = actionConfig[action];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onMouseDown={() => {
        if (!isSubmitting) props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-review-dialog-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-background-200 px-5 py-4 sm:px-6">
          <div className="min-w-0 pr-4">
            <h2 id="business-review-dialog-title" className="text-lg font-bold text-foreground-900">提交业务筛选结果</h2>
            <p className="mt-1 truncate text-sm text-foreground-500">{candidateName} · {position}</p>
          </div>
          <button
            type="button"
            title="关闭弹窗"
            aria-label="关闭弹窗"
            disabled={isSubmitting}
            onClick={props.onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100 hover:text-foreground-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <section className="rounded-lg border border-background-200 bg-background-50 px-4 py-3">
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <p><span className="text-foreground-400">推送人：</span><span className="text-foreground-700">{pusher}</span></p>
              <p><span className="text-foreground-400">推送时间：</span><span className="text-foreground-700">{formatDate(pushedAt)}</span></p>
              <p className="sm:col-span-2"><span className="text-foreground-400">处理截止：</span><span className="text-foreground-700">{formatDate(dueAt)}</span></p>
            </div>
            <div className="mt-3 border-t border-background-200 pt-3">
              <p className="text-xs font-medium text-foreground-500">HR 备注 / 考察重点</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground-700">{reviewContext}</p>
            </div>
          </section>

          <fieldset>
            <legend className="text-sm font-semibold text-foreground-800">筛选结论</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(Object.keys(actionConfig) as BusinessDecision[]).map((key) => {
                const config = actionConfig[key];
                const Icon = config.icon;
                const selected = action === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    disabled={isSubmitting}
                    onClick={() => {
                      setAction(key);
                      setShowValidation(false);
                    }}
                    className={`min-h-28 rounded-lg border-2 px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? config.activeClass
                        : 'border-background-200 bg-white text-foreground-600 hover:border-background-300'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="mt-2 block text-sm font-semibold leading-5">{config.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground-500">{config.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="business-review-note" className="text-sm font-semibold text-foreground-800">
              {action === 'approved' ? '筛选备注（选填）' : action === 'rejected' ? '不合适原因' : '需要补充的信息'}
              {commentRequired && <span className="ml-1 text-red-600">*</span>}
            </label>
            <textarea
              id="business-review-note"
              value={comment}
              disabled={isSubmitting}
              aria-invalid={showValidation && commentMissing}
              aria-describedby={showValidation && commentMissing ? 'business-review-note-error' : undefined}
              onChange={(event) => {
                setComment(event.target.value);
                if (event.target.value.trim()) setShowValidation(false);
              }}
              rows={4}
              maxLength={500}
              placeholder={
                action === 'approved'
                  ? '可填写给 HR 的面试建议'
                  : action === 'rejected'
                    ? '请说明候选人与岗位不匹配的具体原因'
                    : '请具体说明需要 HR 补充哪些资料'
              }
              className={`mt-2 w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-sm leading-6 text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 disabled:bg-background-50 ${
                showValidation && commentMissing ? 'border-red-400' : 'border-background-300'
              }`}
            />
            <div className="mt-1 flex min-h-5 items-start justify-between gap-3 text-xs">
              <span id="business-review-note-error" className="text-red-600">
                {showValidation && commentMissing ? '该筛选结论必须填写备注，且不能只输入空格。' : ''}
              </span>
              <span className="flex-shrink-0 text-foreground-400">{comment.length}/500</span>
            </div>
          </div>

          {props.error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{props.error}</span>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-background-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={props.onClose}
            className="min-h-10 rounded-lg border border-background-300 bg-white px-4 text-sm font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSubmitting || commentMissing}
            onClick={handleSubmit}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500 ${activeConfig.buttonClass}`}
          >
            {isSubmitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? '正在提交...' : `确认：${activeConfig.label}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
