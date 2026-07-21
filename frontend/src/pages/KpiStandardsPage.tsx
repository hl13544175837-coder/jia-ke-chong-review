import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Spinner,
  useToast,
} from '../components/ui';
import type {
  KpiBlockCategory,
  KpiStandardConfig,
} from '../types';

type SectionKey = 'categories' | 'risk' | 'health';

function copyConfig(config: KpiStandardConfig): KpiStandardConfig {
  return JSON.parse(JSON.stringify(config)) as KpiStandardConfig;
}

function NumberField({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        className="h-10 w-24 rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[#3d7b6b]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix && <span className="text-sm text-[#777b78]">{suffix}</span>}
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-[#4f5551]">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-[#cfd3cd] accent-[#3d7b6b]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Section({
  title,
  description,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-[#e8e7e1]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#fafbf8]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf5f1] text-[#3d7b6b]">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#292b2a]">{title}</h2>
              <span className="rounded bg-[#f1f2ee] px-2 py-0.5 text-[11px] text-[#777b78]">{badge}</span>
            </div>
            <p className="mt-1 text-xs text-[#858a86]">{description}</p>
          </div>
        </div>
      </button>
      {open && <div className="border-t border-[#ecece8] px-5 py-5">{children}</div>}
    </Card>
  );
}

export function KpiStandardsPage() {
  const toast = useToast();
  const standardsAsync = useAsync(() => api.getKpiStandards(), []);
  const [config, setConfig] = useState<KpiStandardConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    categories: true,
    risk: true,
    health: true,
  });

  useEffect(() => {
    if (!standardsAsync.data) return;
    setConfig(copyConfig(standardsAsync.data.config));
    setVersion(standardsAsync.data.version);
    setDirty(false);
  }, [standardsAsync.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !config) return { categories: true, risk: true, health: true };
    return {
      categories: config.block_categories.some((category) => (
        `${category.name} ${category.keywords.join(' ')}`.toLowerCase().includes(term)
      )),
      risk: ['风险', 'hc', 'deadline', '暂停', '阻塞'].some((item) => item.toLowerCase().includes(term)),
      health: ['流程', '健康', '阈值', '绿色', '黄色'].some((item) => item.includes(term)),
    };
  }, [config, search]);

  function update(next: KpiStandardConfig) {
    setConfig(next);
    setDirty(true);
  }

  function updateCategory(id: string, patch: Partial<KpiBlockCategory>) {
    if (!config) return;
    update({
      ...config,
      block_categories: config.block_categories.map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  }

  function addCategory() {
    if (!config || config.block_categories.length >= 20) return;
    const id = `category-${crypto.randomUUID()}`;
    update({
      ...config,
      block_categories: [...config.block_categories, { id, name: '', keywords: [] }],
    });
    setExpanded((current) => ({ ...current, categories: true }));
  }

  function removeCategory(id: string) {
    if (!config || config.block_categories.length <= 1) return;
    update({ ...config, block_categories: config.block_categories.filter((item) => item.id !== id) });
  }

  function moveCategory(id: string, direction: -1 | 1) {
    if (!config) return;
    const currentIndex = config.block_categories.findIndex((item) => item.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= config.block_categories.length) return;
    const categories = [...config.block_categories];
    const [item] = categories.splice(currentIndex, 1);
    categories.splice(targetIndex, 0, item);
    update({ ...config, block_categories: categories });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await api.saveKpiStandards(version, config);
      setConfig(copyConfig(saved.config));
      setVersion(saved.version);
      setDirty(false);
      toast.success('流程口径已保存');
      standardsAsync.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '保存失败，请刷新后重试');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      const saved = await api.resetKpiStandards(version);
      setConfig(copyConfig(saved.config));
      setVersion(saved.version);
      setDirty(false);
      setConfirmReset(false);
      toast.success('已恢复默认流程口径');
      standardsAsync.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '恢复失败，请刷新后重试');
    } finally {
      setSaving(false);
    }
  }

  if (standardsAsync.loading) {
    return <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#777b78]"><Spinner />加载口径配置…</div>;
  }
  if (standardsAsync.error) {
    return <ErrorState message={standardsAsync.error.message} onRetry={standardsAsync.reload} />;
  }
  if (!config) {
    return <ErrorState message="口径配置为空，请重试" onRetry={standardsAsync.reload} />;
  }

  const risk = config.risk_thresholds;
  const health = config.process_health_thresholds;

  return (
    <div data-ui="readdy-kpi-standards" className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-[#3d7b6b]" /><h1 className="text-2xl font-bold text-[#292b2a]">招聘流程口径配置</h1></div>
          <p className="mt-2 text-sm text-[#777b78]">用于 Demand 风险、阻塞原因和流程健康提醒；不用于个人排名或绩效评价。</p>
          <p className="mt-1 text-xs text-[#969a97]">当前版本 {version} · {standardsAsync.data?.updated_by_name ? `最近由 ${standardsAsync.data.updated_by_name} 更新` : '尚未自定义'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(true)} disabled={saving}><RotateCcw className="h-4 w-4" />恢复默认</Button>
          <Button onClick={save} loading={saving} disabled={!dirty}><Save className="h-4 w-4" />保存配置</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#959a96]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#e0e1dc] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#3d7b6b]"
          placeholder="搜索规则名称、分类关键词…"
        />
      </div>

      <div className="space-y-3">
        {visible.categories && (
          <Section
            title="阻塞原因分类规则"
            description="系统按顺序匹配关键词，未命中时落入“其他原因”"
            badge={`${config.block_categories.length} 条规则`}
            open={expanded.categories}
            onToggle={() => setExpanded((current) => ({ ...current, categories: !current.categories }))}
          >
            <div className="space-y-3">
              {config.block_categories.map((category, index) => (
                <div key={category.id} className="flex flex-col gap-3 rounded-xl border border-[#ecece8] bg-[#fafbf8] p-3 sm:flex-row sm:items-center">
                  <div className="flex gap-1 sm:flex-col">
                    <button type="button" onClick={() => moveCategory(category.id, -1)} disabled={index === 0} className="rounded p-1.5 text-[#858a86] hover:bg-white disabled:opacity-30" aria-label="上移"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveCategory(category.id, 1)} disabled={index === config.block_categories.length - 1} className="rounded p-1.5 text-[#858a86] hover:bg-white disabled:opacity-30" aria-label="下移"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <input
                    value={category.name}
                    onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                    className="h-10 flex-1 rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[#3d7b6b]"
                    placeholder="分类名称"
                    maxLength={80}
                  />
                  <input
                    value={category.keywords.join(', ')}
                    onChange={(event) => updateCategory(category.id, {
                      keywords: event.target.value.split(/[,，]/).map((item) => item.trim()),
                    })}
                    className="h-10 flex-[1.5] rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[#3d7b6b]"
                    placeholder="多个关键词用逗号分隔"
                  />
                  <button type="button" onClick={() => removeCategory(category.id)} disabled={config.block_categories.length <= 1} className="self-end rounded-lg p-2 text-[#929793] hover:bg-red-50 hover:text-red-600 disabled:opacity-30 sm:self-auto" aria-label="删除分类"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addCategory} disabled={config.block_categories.length >= 20}><Plus className="h-4 w-4" />添加分类</Button>
            </div>
          </Section>
        )}

        {visible.risk && (
          <Section
            title="Demand 风险等级判定"
            description="仅用于提醒招聘协同卡点，不计算个人绩效"
            badge={`Deadline ${risk.deadline_warning_days} 天预警`}
            open={expanded.risk}
            onToggle={() => setExpanded((current) => ({ ...current, risk: !current.risk }))}
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4 rounded-xl bg-red-50/60 p-4">
                <h3 className="text-sm font-semibold text-red-800">高风险：满足任一条件</h3>
                <Toggle checked={risk.high_if_status_paused_or_closed} label="Demand 状态为已暂停或已关闭" onChange={(checked) => update({ ...config, risk_thresholds: { ...risk, high_if_status_paused_or_closed: checked } })} />
                <Toggle checked={risk.high_if_zero_fill_and_blocked} label="HC 零入职且存在阻塞候选人" onChange={(checked) => update({ ...config, risk_thresholds: { ...risk, high_if_zero_fill_and_blocked: checked } })} />
              </div>
              <div className="space-y-4 rounded-xl bg-amber-50/70 p-4">
                <h3 className="text-sm font-semibold text-amber-800">需关注：未命中高风险后判断</h3>
                <Toggle checked={risk.attention_if_blocked} label="存在阻塞时启用 HC 缺口判断" onChange={(checked) => update({ ...config, risk_thresholds: { ...risk, attention_if_blocked: checked } })} />
                <label className="block text-sm text-[#555b57]">HC 缺口比例达到</label>
                <NumberField value={risk.attention_hc_gap_ratio} min={0} max={1} step={0.05} onChange={(value) => update({ ...config, risk_thresholds: { ...risk, attention_hc_gap_ratio: value } })} />
                <label className="block text-sm text-[#555b57]">Deadline 剩余天数</label>
                <NumberField value={risk.deadline_warning_days} min={1} max={90} suffix="天内预警" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, deadline_warning_days: value } })} />
              </div>
            </div>
          </Section>
        )}

        {visible.health && (
          <Section
            title="流程健康度阈值"
            description="作用于 Demand 流程提醒，不生成专员健康分、个人排名或绩效结论"
            badge={`绿 ${health.green_threshold}% · 黄 ${health.yellow_threshold}%`}
            open={expanded.health}
            onToggle={() => setExpanded((current) => ({ ...current, health: !current.health }))}
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">绿色正常线</p><NumberField value={health.green_threshold} min={0} max={100} suffix="% 以上" onChange={(value) => update({ ...config, process_health_thresholds: { ...health, green_threshold: value } })} /></div>
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">黄色警戒线</p><NumberField value={health.yellow_threshold} min={0} max={100} suffix="% 以上" onChange={(value) => update({ ...config, process_health_thresholds: { ...health, yellow_threshold: value } })} /></div>
              <div className="rounded-xl bg-[#f6f7f3] p-4 text-xs leading-6 text-[#606662]">
                <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#3d7b6b]" />≥ {health.green_threshold}% 正常</p>
                <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{health.yellow_threshold}%–{Math.max(health.green_threshold - 1, health.yellow_threshold)}% 警戒</p>
                <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />&lt; {health.yellow_threshold}% 高风险</p>
              </div>
            </div>
          </Section>
        )}

        {!visible.categories && !visible.risk && !visible.health && (
          <Card className="p-8 text-center text-sm text-[#777b78]">没有匹配的配置项</Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="恢复默认流程口径？"
        description="当前组织的自定义规则会被默认值覆盖，操作会记录审计历史。"
        confirmLabel="恢复默认"
        destructive
        loading={saving}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

export default KpiStandardsPage;
