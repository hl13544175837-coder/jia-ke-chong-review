import { useState } from 'react';
import type { InterviewFeedbackInput, InterviewManagementRow } from '@/features/interviews/types';

interface FillFeedbackModalProps {
  row: InterviewManagementRow;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: InterviewFeedbackInput) => void;
}

const SATISFACTION_OPTIONS: Array<[InterviewFeedbackInput['satisfaction'], string]> = [
  ['satisfied', '满意'],
  ['pending', '待定'],
  ['unsatisfied', '不满意'],
];

const JOB_MATCH_OPTIONS: Array<[InterviewFeedbackInput['job_match'], string]> = [
  ['high', '高'],
  ['medium', '中'],
  ['low', '低'],
];

const RECOMMENDATION_OPTIONS: Array<[InterviewFeedbackInput['recommendation'], string]> = [
  ['next_round', '推进下一轮'],
  ['offer', '发 Offer'],
  ['hold', '暂缓'],
  ['reject', '淘汰'],
];

const inputClass = 'mt-1.5 w-full rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

function optionClass(selected: boolean) {
  return selected
    ? 'rounded-lg bg-foreground-900 px-3 py-1.5 text-xs font-medium text-white'
    : 'rounded-lg border border-background-300 bg-white px-3 py-1.5 text-xs text-foreground-600 hover:bg-background-50';
}

export default function FillFeedbackModal({ row, busy, error, onClose, onSubmit }: FillFeedbackModalProps) {
  const [satisfaction, setSatisfaction] = useState<InterviewFeedbackInput['satisfaction'] | ''>('');
  const [jobMatch, setJobMatch] = useState<InterviewFeedbackInput['job_match'] | ''>('');
  const [recommendation, setRecommendation] = useState<InterviewFeedbackInput['recommendation'] | ''>('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [note, setNote] = useState('');
  const valid = Boolean(satisfaction && jobMatch && recommendation);

  const submit = () => {
    if (!valid || busy) return;
    onSubmit({
      assignment_id: row.assignment_id as number,
      satisfaction: satisfaction as InterviewFeedbackInput['satisfaction'],
      job_match: jobMatch as InterviewFeedbackInput['job_match'],
      recommendation: recommendation as InterviewFeedbackInput['recommendation'],
      strengths,
      concerns,
      note,
    });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="fill-feedback-title" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="fill-feedback-title" className="text-base font-semibold text-foreground-900">代填面试反馈</h2>
        <p className="mt-1 text-sm text-foreground-500">
          {row.name_masked} · 第 {row.round_sequence} 轮 · {row.interviewer_name || '面试官未填写'}
        </p>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          面试官尚未提交反馈，由你代为填写并记录为「专员代填」，后续仍可让面试官补充或修改。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground-800">面试结论</p>
            <div className="mt-2 flex gap-2">
              {SATISFACTION_OPTIONS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setSatisfaction(value)} className={optionClass(satisfaction === value)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground-800">岗位匹配度</p>
            <div className="mt-2 flex gap-2">
              {JOB_MATCH_OPTIONS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setJobMatch(value)} className={optionClass(jobMatch === value)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground-800">建议结论</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RECOMMENDATION_OPTIONS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setRecommendation(value)} className={optionClass(recommendation === value)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-800">优势 / 亮点
              <textarea value={strengths} onChange={(event) => setStrengths(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} placeholder="候选人表现好的地方（选填）" className={inputClass} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-800">顾虑 / 不足
              <textarea value={concerns} onChange={(event) => setConcerns(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} placeholder="需要留意的地方（选填）" className={inputClass} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-800">补充备注
              <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} placeholder="其他需要记录的信息（选填）" className={inputClass} />
            </label>
          </div>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">取消</button>
          <button type="button" onClick={submit} disabled={!valid || busy} className="rounded-lg bg-foreground-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? '保存中...' : '提交反馈'}
          </button>
        </div>
      </div>
    </div>
  );
}
