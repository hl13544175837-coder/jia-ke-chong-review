import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, Download, FilePenLine, History, LoaderCircle, RefreshCw, Upload } from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateProfileUpdate, CandidateResumeDetail } from '@/features/candidates/types';

interface ResumeRecoveryPanelProps {
  detail: CandidateResumeDetail;
  initialEditing?: boolean;
  onUpdated: (detail: CandidateResumeDetail) => void;
}

interface ProfileForm {
  name: string;
  phone: string;
  email: string;
  targetPosition: string;
  city: string;
  workYears: string;
  education: string;
  skills: string;
}

const emptyForm: ProfileForm = {
  name: '',
  phone: '',
  email: '',
  targetPosition: '',
  city: '',
  workYears: '',
  education: '',
  skills: '',
};

function extractedInfo(detail: CandidateResumeDetail): Record<string, unknown> {
  const extracted = detail.resume_json?.extracted_info;
  return extracted && typeof extracted === 'object' && !Array.isArray(extracted)
    ? extracted as Record<string, unknown>
    : {};
}

function educationText(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return '';
  const first = value[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const row = first as Record<string, unknown>;
    return String(row.degree || row.education || row['学历'] || '');
  }
  return '';
}

function looksLikeResumeFilename(value: string) {
  return /\.(pdf|docx?|jpe?g|png|webp|gif)$/i.test(value.trim());
}

function formFromDetail(detail: CandidateResumeDetail): ProfileForm {
  const info = extractedInfo(detail);
  const fallbackName = String(detail.name_masked || '').trim();
  return {
    name: String(info.name || (looksLikeResumeFilename(fallbackName) ? '' : fallbackName)),
    phone: String(info.phone || ''),
    email: String(info.email || ''),
    targetPosition: String(info.target_position || ''),
    city: String(info.intent_city || ''),
    workYears: String(info.work_years || ''),
    education: educationText(info.education),
    skills: detail.tags.map((item) => item.tag).join('、'),
  };
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function friendlyParseError(value: string | null) {
  if (!value) return 'AI 识别未成功，可先确认原件或手动补录。';
  if (value.includes('当前测试环境未启用模型解析')) return value;
  const lower = value.toLowerCase();
  if (
    lower.includes('403')
    || lower.includes('forbidden')
    || lower.includes('model')
    || lower.includes('模型')
    || lower.includes('百炼')
    || lower.includes('dashscope')
  ) {
    return '模型暂时不可用，可先手动补录；原始文件已保留。';
  }
  return `AI 识别未成功，可先手动补录。原因：${value}`;
}

function formatVersionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function ResumeRecoveryPanel({ detail, initialEditing = false, onUpdated }: ResumeRecoveryPanelProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [action, setAction] = useState<'confirm' | 'retry' | 'replace' | 'save' | null>(null);
  const [downloadingVersionId, setDownloadingVersionId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [message, setMessage] = useState('');

  const needsConfirmation = detail.parse_status === 'failed';
  const originalConfirmed = detail.parse_status === 'original_confirmed';
  const aiDisabled = Boolean(
    needsConfirmation
    && detail.parse_error?.includes('当前测试环境未启用模型解析'),
  );

  useEffect(() => {
    setForm(formFromDetail(detail));
    if (detail.parse_error?.includes('当前测试环境未启用模型解析')) {
      setEditing(true);
    }
  }, [detail]);

  const updateField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const run = async (
    currentAction: NonNullable<typeof action>,
    operation: () => Promise<CandidateResumeDetail>,
    successMessage: string,
  ) => {
    setAction(currentAction);
    setError('');
    setWarning('');
    setMessage('');
    try {
      const updated = await operation();
      onUpdated(updated);
      if (currentAction === 'replace' && updated.parse_status === 'failed') {
        setWarning('新原件已保留，但 AI 仍未识别；可先手动补录或稍后重新解析。');
      } else {
        setMessage(successMessage);
      }
      if (currentAction === 'save') setEditing(false);
    } catch (requestError) {
      setError(messageOf(requestError, '操作失败，请稍后重试'));
    } finally {
      setAction(null);
    }
  };

  const confirmOriginal = () => run(
    'confirm',
    () => candidatesApi.confirmOriginal(detail.id),
    '已确认原件有效，现在可继续加入招聘流程',
  );

  const retryParse = () => run(
    'retry',
    () => candidatesApi.retryParse(detail.id),
    '重新解析成功',
  );

  const replaceResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('当前简历会自动归档为历史版本，新版将成为当前简历；招聘流程、面试和 Offer 不会改变。确认继续吗？')) return;
    await run(
      'replace',
      () => candidatesApi.replaceResume(detail.id, file),
      '新版简历已启用，旧版已保留在历史版本中',
    );
  };

  const downloadVersion = async (versionId: number, versionNo: number) => {
    setDownloadingVersionId(versionId);
    setError('');
    try {
      const blob = await candidatesApi.downloadResumeVersion(detail.id, versionId);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `${detail.name_masked || '候选人'}-历史简历-v${versionNo}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (requestError) {
      setError(messageOf(requestError, '历史简历下载失败'));
    } finally {
      setDownloadingVersionId(null);
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) {
      setError('请至少填写候选人姓名');
      return;
    }
    const initialForm = formFromDetail(detail);
    const profile: CandidateProfileUpdate['profile'] = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      target_position: form.targetPosition.trim(),
      intent_city: form.city.trim(),
      work_years: form.workYears.trim(),
    };
    if (form.education !== initialForm.education) {
      profile.education = form.education.trim() ? [{ degree: form.education.trim() }] : [];
    }
    const payload: CandidateProfileUpdate = { profile };
    if (form.skills !== initialForm.skills) {
      payload.skills = form.skills
        .split(/[,\uff0c\u3001\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((tag) => ({ tag, score: 3 }));
    }
    await run(
      'save',
      () => candidatesApi.updateProfile(detail.id, payload),
      '候选人基础信息已补全，现在可正常流转',
    );
  };

  const inputClass = 'h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';
  const versions = detail.resume_versions ?? [];
  const panelTone = needsConfirmation
    ? 'border-amber-200 bg-amber-50/70'
    : originalConfirmed
      ? 'border-emerald-200 bg-emerald-50/60'
      : 'border-background-200 bg-white';

  return (
    <section className={`rounded-xl border px-4 py-4 ${panelTone}`}>
      <div className="flex items-start gap-3">
        {needsConfirmation
          ? <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={19} aria-hidden="true" />
          : originalConfirmed
            ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} aria-hidden="true" />
            : <FilePenLine className="mt-0.5 shrink-0 text-primary-600" size={19} aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground-900">
            {needsConfirmation
              ? aiDisabled
                ? '模型解析未启用，请手动补录'
                : 'AI 未识别成功，请确认原简历'
              : originalConfirmed
                ? '原件有效，结构化信息待补全'
                : '简历信息与历史版本'}
          </h3>
          <p className="mt-1 text-xs leading-5 text-foreground-600">
            {needsConfirmation
              ? aiDisabled
                ? '原始简历已经安全入库。请在下方填写候选人基础信息，保存后即可继续招聘流程。'
                : '请先预览原件。文件正确可确认原件有效；文件错误可更换，也可手动补录。'
              : originalConfirmed
                ? '可继续使用原版简历；建议补录基础信息，方便后续检索和匹配。'
                : '可编辑候选人基础信息；更换简历时旧版会自动归档。'}
          </p>
          {detail.parse_error && needsConfirmation && (
            <p className="mt-2 break-words text-xs text-amber-700">{friendlyParseError(detail.parse_error)}</p>
          )}
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void replaceResume(event)}
            className="hidden"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {needsConfirmation && (
              <button type="button" onClick={() => void confirmOriginal()} disabled={action !== null || !detail.original_resume.available} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-sm font-medium text-white disabled:opacity-50">
                {action === 'confirm' ? <LoaderCircle className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}确认原件有效
              </button>
            )}
            {needsConfirmation && !aiDisabled && (
              <button type="button" onClick={() => void retryParse()} disabled={action !== null || !detail.original_resume.available} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-700 disabled:opacity-50">
                {action === 'retry' ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}重新解析
              </button>
            )}
            <button type="button" onClick={() => replaceInputRef.current?.click()} disabled={action !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-700 disabled:opacity-50">
              {action === 'replace' ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}更换简历
            </button>
            <button type="button" onClick={() => { setEditing((value) => !value); setError(''); setWarning(''); setMessage(''); }} disabled={action !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-700 disabled:opacity-50">
              <FilePenLine size={14} />{editing ? '收起编辑' : needsConfirmation || originalConfirmed ? '手动补录' : '编辑简历信息'}
            </button>
          </div>
        </div>
      </div>

      {versions.length > 0 && (
        <div className="mt-4 rounded-lg border border-background-200 bg-background-50 px-3 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground-700">
            <History size={14} aria-hidden="true" />历史简历版本（{versions.length}）
          </div>
          <div className="mt-2 space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs">
                <span className="text-foreground-600">第 {version.version_no} 版 · {formatVersionDate(version.created_at)}</span>
                <button
                  type="button"
                  onClick={() => void downloadVersion(version.id, version.version_no)}
                  disabled={!version.available || downloadingVersionId !== null}
                  className="inline-flex items-center gap-1 font-medium text-primary-700 disabled:text-foreground-400"
                >
                  {downloadingVersionId === version.id ? <LoaderCircle className="animate-spin" size={13} /> : <Download size={13} />}
                  {version.available ? '下载历史原件' : '历史原件不可用'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-4 border-t border-background-200 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-foreground-600">姓名 *<input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="请输入候选人姓名" className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">手机号<input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">邮箱<input value={form.email} onChange={(event) => updateField('email', event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">当前 / 目标岗位<input value={form.targetPosition} onChange={(event) => updateField('targetPosition', event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">城市<input value={form.city} onChange={(event) => updateField('city', event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">工作年限<input value={form.workYears} onChange={(event) => updateField('workYears', event.target.value)} placeholder="例如：8年" className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">学历<input value={form.education} onChange={(event) => updateField('education', event.target.value)} placeholder="例如：本科" className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-foreground-600">技能关键词<input value={form.skills} onChange={(event) => updateField('skills', event.target.value)} placeholder="用逗号分隔" className={`mt-1 ${inputClass}`} /></label>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => void saveProfile()} disabled={action !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white disabled:opacity-50">
              {action === 'save' && <LoaderCircle className="animate-spin" size={14} />}保存并完成补录
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}
      {warning && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{warning}</p>}
      {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
    </section>
  );
}
