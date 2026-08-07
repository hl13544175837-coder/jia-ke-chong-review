import { useCallback, useEffect, useMemo, useState } from 'react';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import ActionButton from '@/components/ui/ActionButton';
import DetailActionBar from '@/components/ui/DetailActionBar';
import DetailDrawerShell from '@/components/ui/DetailDrawerShell';
import { onlineResumesApi } from '../api';
import type { OnlineResumeItem } from '../types';

interface OnlineResumeDetailDrawerProps {
  resumeId: number;
  initialEdit?: boolean;
  onClose: () => void;
  onSaved: (item: OnlineResumeItem) => void;
  onDeleted: (id: number) => void;
}

interface BasicProfileDraft {
  displayName: string;
  targetPosition: string;
  location: string;
  yearsOfExperience: string;
  salaryExpectation: string;
  summary: string;
}

const DELETE_WARNING = '删除后在线简历内容无法恢复，但已统计的导入数量不会减少。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
}

function profileSource(resume: OnlineResumeItem) {
  const extracted = resume.resume_json.extracted_info;
  return isRecord(extracted) ? extracted : resume.resume_json;
}

function draftFromResume(resume: OnlineResumeItem): BasicProfileDraft {
  const profile = profileSource(resume);
  return {
    displayName: resume.display_name,
    targetPosition: textValue(profile, ['target_position', 'desired_position', 'target_role']),
    location: textValue(profile, ['location', 'city', 'desired_city', 'intent_city']),
    yearsOfExperience: textValue(profile, ['years_of_experience', 'work_years']),
    salaryExpectation: textValue(profile, ['salary_expectation', 'expected_salary']),
    summary: textValue(profile, ['summary', 'profile', 'self_evaluation']),
  };
}

function resumeJsonWithDraft(
  resumeJson: Record<string, unknown>,
  draft: BasicProfileDraft,
) {
  const currentExtracted = resumeJson.extracted_info;
  const profile = isRecord(currentExtracted)
    ? { ...currentExtracted }
    : { ...resumeJson };
  profile.target_position = draft.targetPosition.trim();
  profile.location = draft.location.trim();
  profile.years_of_experience = draft.yearsOfExperience.trim();
  profile.salary_expectation = draft.salaryExpectation.trim();
  profile.summary = draft.summary.trim();

  return isRecord(currentExtracted)
    ? { ...resumeJson, extracted_info: profile }
    : profile;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

const senderLabels: Record<string, string> = {
  recruiter: '招聘专员',
  candidate: '候选人',
  system: '系统',
};

export default function OnlineResumeDetailDrawer({
  resumeId,
  initialEdit = false,
  onClose,
  onSaved,
  onDeleted,
}: OnlineResumeDetailDrawerProps) {
  const [resume, setResume] = useState<OnlineResumeItem | null>(null);
  const [draft, setDraft] = useState<BasicProfileDraft | null>(null);
  const [editing, setEditing] = useState(initialEdit);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const item = await onlineResumesApi.detail(resumeId);
      setResume(item);
      setDraft(draftFromResume(item));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '在线简历加载失败');
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const timeline = useMemo(() => (
    [...(resume?.chat_json ?? [])].sort((left, right) => (
      new Date(left.sent_at).getTime() - new Date(right.sent_at).getTime()
    ))
  ), [resume]);

  const handleSave = async () => {
    if (!resume || !draft || !draft.displayName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const updated = await onlineResumesApi.update(resume.id, {
        display_name: draft.displayName.trim(),
        resume_json: resumeJsonWithDraft(resume.resume_json, draft),
      });
      setResume(updated);
      setDraft(draftFromResume(updated));
      setEditing(false);
      onSaved(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '在线简历保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resume || !window.confirm(DELETE_WARNING)) return;
    setDeleting(true);
    setError('');
    try {
      await onlineResumesApi.remove(resume.id);
      onDeleted(resume.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '在线简历删除失败');
      setDeleting(false);
    }
  };

  const updateDraft = (field: keyof BasicProfileDraft, value: string) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  };

  return (
    <DetailDrawerShell
      ariaLabel="在线简历详情"
      closeLabel="关闭在线简历详情"
      onClose={onClose}
      canClose={!saving && !deleting}
      modal
      backdropClassName="fixed inset-0 z-40 cursor-default bg-black/30"
      panelClassName="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[760px] flex-col bg-white shadow-xl"
    >
      <header className="flex items-start justify-between border-b border-background-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground-900">
            {resume?.display_name || '在线简历详情'}
          </h2>
          {resume && (
            <>
              <p className="mt-1 text-xs text-foreground-500">
                {resume.demand.request_no} · {resume.demand.title} · {resume.boss_account}
              </p>
              {resume.source_url && (
                <a
                  href={resume.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-xs font-medium text-primary-700 hover:text-primary-800 hover:underline"
                >
                  打开BOSS聊天
                </a>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving || deleting}
          aria-label="关闭在线简历详情"
          className="ml-4 rounded-lg px-2 py-1 text-xl text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:opacity-50"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {loading && <p className="py-12 text-center text-sm text-foreground-500">正在加载在线简历...</p>}

        {!loading && !resume && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-center">
            <p className="text-sm text-red-700">{error || '在线简历暂时无法查看'}</p>
            <ActionButton className="mt-4" size="sm" onClick={() => void loadDetail()}>重新加载</ActionButton>
          </div>
        )}

        {!loading && resume && draft && (
          <div className="space-y-6">
            {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground-900">结构化在线简历</h3>
                {!editing && <ActionButton size="sm" onClick={() => setEditing(true)}>编辑资料</ActionButton>}
              </div>

              {editing ? (
                <div className="grid gap-4 rounded-xl border border-background-200 bg-background-50 p-4 sm:grid-cols-2">
                  <label className="text-sm text-foreground-600">
                    候选人姓名
                    <input
                      value={draft.displayName}
                      onChange={(event) => updateDraft('displayName', event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                  <label className="text-sm text-foreground-600">
                    目标岗位
                    <input
                      value={draft.targetPosition}
                      onChange={(event) => updateDraft('targetPosition', event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                  <label className="text-sm text-foreground-600">
                    所在地/意向城市
                    <input
                      value={draft.location}
                      onChange={(event) => updateDraft('location', event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                  <label className="text-sm text-foreground-600">
                    工作年限
                    <input
                      value={draft.yearsOfExperience}
                      onChange={(event) => updateDraft('yearsOfExperience', event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                  <label className="text-sm text-foreground-600 sm:col-span-2">
                    期望薪资
                    <input
                      value={draft.salaryExpectation}
                      onChange={(event) => updateDraft('salaryExpectation', event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                  <label className="text-sm text-foreground-600 sm:col-span-2">
                    个人概况
                    <textarea
                      value={draft.summary}
                      onChange={(event) => updateDraft('summary', event.target.value)}
                      rows={5}
                      className="mt-1.5 w-full resize-y rounded-lg border border-background-300 bg-white px-3 py-2 text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </label>
                </div>
              ) : (
                <StructuredResumeView resume={resume.resume_json} />
              )}
            </section>

            <section>
              <h3 className="mb-3 text-base font-semibold text-foreground-900">完整聊天记录</h3>
              {timeline.length === 0 ? (
                <p className="rounded-lg border border-background-200 bg-background-50 px-4 py-6 text-center text-sm text-foreground-500">暂无聊天记录</p>
              ) : (
                <ol className="space-y-3">
                  {timeline.map((message, index) => (
                    <li key={`${message.sent_at}-${index}`} className="rounded-xl border border-background-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground-800">
                          {senderLabels[message.sender] ?? (message.sender.trim() || '未知发送方')}
                        </span>
                        <time className="text-xs text-foreground-400" dateTime={message.sent_at}>{formatDate(message.sent_at)}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-700">{message.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>

      {resume && draft && (
        <DetailActionBar status={<span className="text-xs text-foreground-500">聊天记录只读，由外部Agent导入</span>}>
          {editing ? (
            <>
              <ActionButton
                onClick={() => {
                  setDraft(draftFromResume(resume));
                  setEditing(false);
                  setError('');
                }}
                disabled={saving || deleting}
              >
                取消
              </ActionButton>
              <ActionButton tone="primary" onClick={() => void handleSave()} disabled={saving || deleting || !draft.displayName.trim()}>
                {saving ? '保存中...' : '保存修改'}
              </ActionButton>
            </>
          ) : (
            <ActionButton tone="danger" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? '删除中...' : '删除在线简历'}
            </ActionButton>
          )}
        </DetailActionBar>
      )}
    </DetailDrawerShell>
  );
}
