import { useEffect, useMemo, useRef, useState } from 'react';
import { useCompanyAuth } from '@/auth/companyAuth';
import ActionButton from '@/components/ui/ActionButton';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { externalApiBaseUrl } from '@/lib/api';
import { buildAgentConnectionPrompt } from '../agentConnection';
import { onlineResumesApi } from '../api';

interface AgentConnectionDialogProps {
  onClose: () => void;
}

function formatExpiry(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function AgentConnectionDialog({ onClose }: AgentConnectionDialogProps) {
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [selectedDemandId, setSelectedDemandId] = useState(0);
  const [bossAccount, setBossAccount] = useState('');
  const [prompt, setPrompt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLElement>(null);

  useOverlayLifecycle({ canClose: !generating, onClose, initialFocusRef: panelRef });

  useEffect(() => {
    let active = true;
    const loadDemands = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await demandsApi.listDemands();
        if (!active) return;
        const available = response.items.filter((demand) => demand.status === 'active');
        setDemands(available);
        setSelectedDemandId(available[0]?.id ?? 0);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '招聘需求加载失败，请重试');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDemands();
    return () => { active = false; };
  }, []);

  const selectedDemand = useMemo(
    () => demands.find((demand) => demand.id === selectedDemandId) ?? null,
    [demands, selectedDemandId],
  );
  const apiBase = externalApiBaseUrl();
  const isLocalOnly = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(apiBase);

  const generate = async () => {
    if (!selectedDemand) { setError('请选择一个正在招聘的需求'); return; }
    if (!bossAccount.trim()) { setError('请填写当前使用的BOSS账号'); return; }
    setGenerating(true);
    setCopied(false);
    setError('');
    try {
      const [fullDemand, issued] = await Promise.all([
        demandsApi.getDemand(selectedDemand.id),
        onlineResumesApi.issueAgentImportToken(),
      ]);
      setPrompt(buildAgentConnectionPrompt({
        apiBaseUrl: apiBase,
        token: issued.token,
        bossAccount: bossAccount.trim(),
        demand: fullDemand,
      }));
      setExpiresAt(issued.expires_at);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '连接提示词生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setError('');
    } catch {
      setCopied(false);
      setError('复制失败，请选中提示词后手动复制');
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-foreground-900/40 p-4" onMouseDown={() => { if (!generating) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="agent-connection-title" onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl outline-none">
        <header className="border-b border-background-200 px-6 py-5">
          <h2 id="agent-connection-title" className="text-lg font-bold text-foreground-900">AI 招聘助手</h2>
          <p className="mt-1 text-sm text-foreground-500">配置你的 AI 招聘助手：告诉它这次招什么、用哪个 BOSS 账号帮你筛人，然后生成授权指令发给它。</p>
        </header>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {/* 三步使用流程 */}
          <div className="grid gap-2 rounded-xl border border-background-200 bg-background-50 p-4 sm:grid-cols-4">
            {[
              { step: '①', text: '选需求、填 BOSS 账号' },
              { step: '②', text: '生成并复制授权指令' },
              { step: '③', text: '把指令发给你的 AI 助手' },
              { step: '✓', text: 'AI 筛完，简历自动出现在本页' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2.5">
                <span className="shrink-0 text-sm font-medium text-primary-700">{item.step}</span>
                <span className="text-xs leading-5 text-foreground-700">{item.text}</span>
              </div>
            ))}
          </div>

          <label className="block text-sm font-medium text-foreground-700">本次招聘需求
            <select aria-label="招聘需求" value={selectedDemandId || ''} onChange={(event) => { setSelectedDemandId(Number(event.target.value)); setPrompt(''); setError(''); }} disabled={loading || generating || Boolean(prompt)} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm disabled:bg-background-50">
              {loading && <option value="">正在加载招聘需求...</option>}
              {!loading && demands.length === 0 && <option value="">暂无正在招聘的需求</option>}
              {demands.map((demand) => <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground-700">BOSS账号
            <input aria-label="BOSS账号" value={bossAccount} onChange={(event) => { setBossAccount(event.target.value); setPrompt(''); setError(''); }} disabled={generating || Boolean(prompt)} maxLength={160} placeholder="例如：何龙-BOSS账号" className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm disabled:bg-background-50" />
            <span className="mt-1.5 block text-xs text-foreground-500">用于标记简历的来源账号，方便之后区分是谁导入的。</span>
          </label>
          {isLocalOnly && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">当前是本机地址，只能给同一台电脑上的 AI 助手使用；云端 AI 需要 Test/SIT 接口地址。</p>}
          {!loading && demands.length === 0 && <p className="rounded-lg bg-background-50 px-3 py-2 text-sm text-foreground-600">请先创建并启用一个招聘需求，再配置 AI 助手。</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {prompt && (
            <div className="space-y-2">
              <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
                <p className="text-xs leading-5 text-primary-800">下面这段就是给 AI 助手的授权指令（已绑定本次需求和你的 BOSS 账号）。复制后发给你的 AI 助手，它就会按这个需求开始筛人、导简历。凭证 30 天内有效，关闭后不再显示。</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground-700">AI 助手授权指令</p>
                <p className="text-xs text-foreground-500">有效至 {formatExpiry(expiresAt)}</p>
              </div>
              <textarea aria-label="AI 助手授权指令" readOnly value={prompt} rows={16} className="w-full resize-y rounded-lg border border-background-300 bg-background-50 px-3 py-2 font-mono text-xs leading-5 text-foreground-800" />
            </div>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-background-200 px-6 py-4">
          <ActionButton disabled={generating} onClick={onClose}>关闭</ActionButton>
          {!prompt ? (
            <ActionButton tone="primary" disabled={loading || generating || !selectedDemand || !bossAccount.trim()} onClick={() => void generate()}>{generating ? '正在生成...' : '生成授权指令'}</ActionButton>
          ) : (
            <ActionButton tone="primary" onClick={() => void copyPrompt()}>{copied ? '已复制' : '复制指令，发给我的 AI 助手'}</ActionButton>
          )}
        </footer>
      </section>
    </div>
  );
}

export default function AgentConnectionDialogEntry() {
  const { role } = useCompanyAuth();
  const [open, setOpen] = useState(false);
  if (role !== 'recruiter') return null;

  return (
    <>
      <ActionButton tone="primary" onClick={() => setOpen(true)}>AI 招聘助手</ActionButton>
      {open && <AgentConnectionDialog onClose={() => setOpen(false)} />}
    </>
  );
}
