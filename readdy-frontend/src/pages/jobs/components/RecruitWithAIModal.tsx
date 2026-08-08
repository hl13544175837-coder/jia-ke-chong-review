import { useEffect, useMemo, useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { onlineResumesApi } from '@/features/onlineResumes/api';
import {
  AI_RECRUIT_PLATFORMS,
  buildAiRecruitTask,
  defaultApiBaseUrl,
  DEFAULT_GREETING_TEMPLATE,
  SKILL_INSTALL_HINT,
  type AiRecruitPlatformKey,
} from '@/features/demands/aiRecruit';

interface RecruitWithAIModalProps {
  demand: RecruitmentDemand;
  onClose: () => void;
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

export default function RecruitWithAIModal({ demand, onClose }: RecruitWithAIModalProps) {
  const [demandWithJd, setDemandWithJd] = useState<RecruitmentDemand>(demand);
  const [platforms, setPlatforms] = useState<Array<{ key: AiRecruitPlatformKey; account: string }>>([
    { key: 'BOSS直聘', account: '' },
  ]);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING_TEMPLATE);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => defaultApiBaseUrl());
  const [skillName, setSkillName] = useState('智聘AI找人');
  const [task, setTask] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSkillHint, setShowSkillHint] = useState(false);

  const hasAccount = platforms.some((item) => item.account.trim());

  // 列表接口不带 JD 正文,打开弹窗时若有需求 ID 则补齐,保证任务单里带真实 JD。
  useEffect(() => {
    let active = true;
    if (!demand.jd_text && demand.id) {
      demandsApi.getDemand(demand.id)
        .then((detail) => { if (active) setDemandWithJd(detail); })
        .catch(() => { /* 拉取失败不阻塞,生成时会有"暂未返回JD"提示 */ });
    }
    return () => { active = false; };
  }, [demand.id, demand.jd_text]);

  useEffect(() => {
    setCopied(false);
  }, [task]);

  const togglePlatform = (key: AiRecruitPlatformKey) => {
    setPlatforms((current) => {
      const exists = current.some((item) => item.key === key);
      if (exists) return current.filter((item) => item.key !== key);
      return [...current, { key, account: '' }];
    });
  };

  const setAccount = (key: AiRecruitPlatformKey, value: string) => {
    setPlatforms((current) => current.map((item) => (item.key === key ? { ...item, account: value } : item)));
  };

  const generate = async () => {
    if (!hasAccount) {
      setError('请至少填写一个平台账号');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const { token } = await onlineResumesApi.issueAgentImportToken();
      setTask(buildAiRecruitTask({
        demand: demandWithJd,
        platforms,
        greeting,
        apiBaseUrl: apiBaseUrl.trim() || defaultApiBaseUrl(),
        token,
        skillName: skillName.trim() || '智聘AI找人',
      }));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成任务单失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const copyTask = async () => {
    try {
      await navigator.clipboard.writeText(task);
      setCopied(true);
    } catch {
      setError('复制失败，请手动全选复制');
    }
  };

  const demandSummary = useMemo(() => `${demand.job_title} · ${demand.request_no}`, [demand]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="recruit-ai-title" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="recruit-ai-title" className="text-base font-semibold text-foreground-900">AI 帮我找人</h2>
            <p className="mt-1 text-sm text-foreground-500">{demandSummary} · 生成任务单，交给「{skillName || '智聘AI找人'}」Skill 执行</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-md p-2 text-foreground-400 hover:bg-background-100">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {!task ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground-800">目标平台（可多选）与账号</p>
              <div className="mt-2 space-y-2">
                {AI_RECRUIT_PLATFORMS.map((platform) => {
                  const active = platforms.some((item) => item.key === platform.key);
                  return (
                    <label key={platform.key} className="flex items-center gap-3 rounded-lg border border-background-200 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => togglePlatform(platform.key)}
                        className="h-4 w-4 accent-primary-500"
                      />
                      <span className="w-20 text-sm text-foreground-700">{platform.label}</span>
                      <input
                        type="text"
                        value={platforms.find((item) => item.key === platform.key)?.account || ''}
                        onChange={(event) => setAccount(platform.key, event.target.value)}
                        disabled={!active}
                        placeholder={`${platform.label}账号（用于标记简历来源）`}
                        className={inputClass}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-800">打招呼话术（{'{岗位}'}会替换成岗位名）
                <textarea value={greeting} onChange={(event) => setGreeting(event.target.value.slice(0, 500))} rows={2} maxLength={500} className={inputClass} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-foreground-800">Skill 名称
                <input type="text" value={skillName} onChange={(event) => setSkillName(event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm font-medium text-foreground-800">智聘接口地址
                <input type="text" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} className={inputClass} />
              </label>
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setShowSkillHint((current) => !current)} className="text-xs text-primary-700 hover:underline">
                {showSkillHint ? '收起 Skill 安装说明' : '还没有 Skill？查看安装说明'}
              </button>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">取消</button>
                <button type="button" onClick={() => void generate()} disabled={generating} className="rounded-lg bg-foreground-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {generating ? '生成中...' : '生成任务单'}
                </button>
              </div>
            </div>

            {showSkillHint && (
              <pre className="whitespace-pre-wrap rounded-lg bg-background-50 px-3 py-2 text-xs leading-5 text-foreground-600">{SKILL_INSTALL_HINT}</pre>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground-800">任务单已生成，复制后发给你的 AI（WorkBuddy / Claude 等）即可执行</p>
              <ActionButton size="sm" tone="primary" onClick={() => void copyTask()}>{copied ? '已复制' : '复制任务单'}</ActionButton>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-background-50 px-3 py-2 text-xs leading-5 text-foreground-700">{task}</pre>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setTask(''); setCopied(false); }} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">重新生成</button>
              <button type="button" onClick={onClose} className="rounded-lg bg-foreground-900 px-4 py-2 text-sm font-medium text-white">完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
