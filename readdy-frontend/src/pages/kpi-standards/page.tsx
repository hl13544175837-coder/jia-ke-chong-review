import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import PageHeader from '@/components/ui/PageHeader';
import { kpiStandardsApi } from '@/features/kpiStandards/api';
import type {
  BlockCategoryRule,
  KpiStandardConfig,
} from '@/features/kpiStandards/types';

type SectionKey = 'categories' | 'risk' | 'health';

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function KpiStandardsPage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<KpiStandardConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    categories: false,
    risk: false,
    health: false,
  });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await kpiStandardsApi.get();
      setConfig(payload.config);
      setVersion(payload.version);
      setUpdatedByName(payload.updated_by_name);
      setUpdatedAt(payload.updated_at);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '口径配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCategories = useCallback((categories: BlockCategoryRule[]) => {
    setConfig((prev) => (prev ? { ...prev, block_categories: categories } : prev));
  }, []);

  const updateRisk = useCallback(
    (patch: Partial<KpiStandardConfig['risk_thresholds']>) => {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              risk_thresholds: { ...prev.risk_thresholds, ...patch },
            }
          : prev,
      );
    },
    [],
  );

  const updateHealth = useCallback(
    (patch: Partial<KpiStandardConfig['health_thresholds']>) => {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              health_thresholds: { ...prev.health_thresholds, ...patch },
            }
          : prev,
      );
    },
    [],
  );

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await kpiStandardsApi.save(version, config);
      setConfig(saved.config);
      setVersion(saved.version);
      setUpdatedByName(saved.updated_by_name);
      setUpdatedAt(saved.updated_at);
      showToast('口径配置已保存，刷新后仍会保留');
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 409) {
          await load();
          showToast(cause.message);
          return;
        }
        const firstFieldError = cause.fields
          ? Object.values(cause.fields)[0]
          : null;
        showToast(firstFieldError ?? cause.message);
        return;
      }
      showToast('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('确定恢复默认口径配置吗？当前自定义规则将丢失。')) return;
    setSaving(true);
    try {
      const payload = await kpiStandardsApi.reset(version);
      setConfig(payload.config);
      setVersion(payload.version);
      setUpdatedByName(payload.updated_by_name);
      setUpdatedAt(payload.updated_at);
      showToast('已恢复默认口径配置');
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 409) {
          await load();
        }
        showToast(cause.message);
      } else {
        showToast('恢复默认失败，请重试');
      }
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    if (!config) return;
    const newId = `cat-${Date.now()}`;
    updateCategories([
      ...config.block_categories,
      { id: newId, name: '', keywords: [] },
    ]);
    setExpanded((prev) => ({ ...prev, categories: true }));
  };

  const removeCategory = (id: string) => {
    if (!config || config.block_categories.length <= 1) return;
    updateCategories(config.block_categories.filter((c) => c.id !== id));
  };

  const updateCategory = (id: string, patch: Partial<BlockCategoryRule>) => {
    if (!config) return;
    updateCategories(
      config.block_categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const updateCategoryKeywords = (id: string, raw: string) => {
    const keywords = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    updateCategory(id, { keywords });
  };

  const moveCategory = (id: string, direction: -1 | 1) => {
    if (!config) return;
    const idx = config.block_categories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= config.block_categories.length) return;
    const arr = [...config.block_categories];
    const [item] = arr.splice(idx, 1);
    arr.splice(newIdx, 0, item);
    updateCategories(arr);
  };

  const searchLower = search.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!config) return { categories: true, risk: true, health: true };
    if (!searchLower) return { categories: true, risk: true, health: true };
    const keywordText = config.block_categories
      .map((c) => `${c.name} ${c.keywords.join(',')}`)
      .join(' ')
      .toLowerCase();
    return {
      categories: keywordText.includes(searchLower),
      risk: ['风险', '高风险', '需关注', 'deadline', '阈值', '停滞', '推荐', '转化'].some(
        (word) => word.includes(searchLower),
      ),
      health: ['健康', '绿色', '黄色', '阈值'].some((word) =>
        word.includes(searchLower),
      ),
    };
  }, [searchLower, config]);

  const sectionMeta: { key: SectionKey; title: string; desc: string; badge: string }[] =
    [
      {
        key: 'categories',
        title: '阻塞原因分类规则',
        desc: '系统按顺序匹配关键词，命中则归入对应分类；均未命中落入「其他原因」',
        badge: config ? `${config.block_categories.length} 条规则` : '',
      },
      {
        key: 'risk',
        title: '风险等级判定规则',
        desc: '需求风险标记与团队告警由以下开关和阈值真实驱动，保存后全局生效',
        badge: '9 项配置',
      },
      {
        key: 'health',
        title: '健康度阈值',
        desc: '需求健康度按风险标记扣分（100 分制），颜色由以下阈值决定',
        badge: config
          ? `绿 ${config.health_thresholds.green_threshold} · 黄 ${config.health_thresholds.yellow_threshold}`
          : '',
      },
    ];

  if (loading) {
    return (
      <div className="p-6 space-y-5 max-w-4xl">
        <div className="h-8 w-40 bg-background-100 animate-pulse rounded-lg" />
        <div className="h-24 bg-background-100 animate-pulse rounded-xl" />
        <div className="h-24 bg-background-100 animate-pulse rounded-xl" />
        <div className="h-24 bg-background-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader
        title="口径配置"
        description={
          updatedByName && updatedAt
            ? `最近更新：${updatedByName} · ${formatDate(updatedAt)}`
            : '尚未配置过，当前为组织默认口径'
        }
        actions={
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleReset}
              disabled={saving || !config}
              className="px-4 py-2 bg-background-100 hover:bg-background-200 text-sm text-foreground-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              恢复默认
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !config}
              className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存配置'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-accent-50 border border-accent-200 rounded-xl text-sm text-accent-700">
          <span>{error}</span>
          <button
            onClick={() => void load()}
            className="px-3 py-1.5 bg-white border border-accent-200 rounded-lg text-accent-600 hover:bg-accent-100 cursor-pointer whitespace-nowrap"
          >
            重新加载
          </button>
        </div>
      )}

      {config && (
        <>
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-foreground-400 text-sm"></i>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索规则名称、分类关键词..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-background-200 rounded-xl text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-foreground-400 hover:text-foreground-600 cursor-pointer"
              >
                <i className="ri-close-line text-sm"></i>
              </button>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {sectionMeta.map((meta) => {
              const isVisible = visibleSections[meta.key];
              const isOpen = expanded[meta.key];
              if (!isVisible) return null;

              return (
                <div
                  key={meta.key}
                  className={`bg-white rounded-xl border transition-all ${
                    isOpen
                      ? 'border-background-200'
                      : 'border-background-200 hover:border-background-300'
                  }`}
                >
                  {/* Collapse header */}
                  <button
                    onClick={() => toggle(meta.key)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <i
                          className={`text-sm text-primary-600 transition-transform ${
                            isOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'
                          }`}
                        ></i>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground-900">
                            {meta.title}
                          </h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-100 text-foreground-500 font-medium">
                            {meta.badge}
                          </span>
                        </div>
                        <p className="text-xs text-foreground-400 mt-0.5">{meta.desc}</p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-background-100">
                      {meta.key === 'categories' && (
                        <div className="pt-4 space-y-3">
                          {config.block_categories.map((cat, index) => (
                            <div
                              key={cat.id}
                              className="flex items-center gap-3 p-3 bg-background-50 rounded-lg border border-background-100"
                            >
                              <div className="flex flex-col gap-0.5">
                                <button
                                  onClick={() => moveCategory(cat.id, -1)}
                                  disabled={index === 0}
                                  className="w-6 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-600 hover:bg-background-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <i className="ri-arrow-up-s-line text-xs"></i>
                                </button>
                                <button
                                  onClick={() => moveCategory(cat.id, 1)}
                                  disabled={index === config.block_categories.length - 1}
                                  className="w-6 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-600 hover:bg-background-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <i className="ri-arrow-down-s-line text-xs"></i>
                                </button>
                              </div>

                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  value={cat.name}
                                  onChange={(e) =>
                                    updateCategory(cat.id, { name: e.target.value })
                                  }
                                  placeholder="分类名称，如：薪资不匹配"
                                  className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                                />
                                <input
                                  type="text"
                                  value={cat.keywords.join(', ')}
                                  onChange={(e) =>
                                    updateCategoryKeywords(cat.id, e.target.value)
                                  }
                                  placeholder="匹配关键词，多个用逗号分隔"
                                  className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                                />
                              </div>

                              <button
                                onClick={() => removeCategory(cat.id)}
                                disabled={config.block_categories.length <= 1}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-400 hover:text-accent-600 hover:bg-accent-50 disabled:opacity-30 cursor-pointer"
                                title="删除"
                              >
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={addCategory}
                            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
                          >
                            <i className="ri-add-line"></i>
                            添加分类
                          </button>
                        </div>
                      )}

                      {meta.key === 'risk' && (
                        <div className="pt-4 space-y-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div className="space-y-4">
                              <h4 className="text-sm font-medium text-foreground-700 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-accent-500"></span>
                                高风险触发条件
                                <span className="text-xs text-foreground-400 font-normal">
                                  满足任一即判定
                                </span>
                              </h4>

                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    config.risk_thresholds.high_if_status_paused_or_closed
                                  }
                                  onChange={(e) =>
                                    updateRisk({
                                      high_if_status_paused_or_closed:
                                        e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                                />
                                <span className="text-sm text-foreground-700">
                                  需求状态为「已暂停」或「已关闭」
                                </span>
                              </label>

                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    config.risk_thresholds.high_if_zero_fill_and_blocked
                                  }
                                  onChange={(e) =>
                                    updateRisk({
                                      high_if_zero_fill_and_blocked: e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                                />
                                <span className="text-sm text-foreground-700">
                                  HC 零入职 <strong>且</strong> 存在阻塞问题
                                </span>
                              </label>
                            </div>

                            <div className="space-y-4">
                              <h4 className="text-sm font-medium text-foreground-700 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                                需关注触发条件
                                <span className="text-xs text-foreground-400 font-normal">
                                  未命中高风险后判定
                                </span>
                              </h4>

                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.risk_thresholds.medium_if_blocked}
                                  onChange={(e) =>
                                    updateRisk({
                                      medium_if_blocked: e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                                />
                                <span className="text-sm text-foreground-700">
                                  存在阻塞问题时判定为需关注
                                </span>
                              </label>

                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  HC 填充率低于
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  value={
                                    config.risk_thresholds.medium_fill_ratio_threshold
                                  }
                                  onChange={(e) =>
                                    updateRisk({
                                      medium_fill_ratio_threshold: Math.min(
                                        1,
                                        Math.max(0, Number(e.target.value)),
                                      ),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-700">
                                  判定为需关注
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-background-100">
                            <h4 className="text-sm font-medium text-foreground-700 flex items-center gap-2 mb-3">
                              <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                              告警与风险阈值
                              <span className="text-xs text-foreground-400 font-normal">
                                驱动团队告警与需求风险标记
                              </span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  Deadline 剩余天数 ≤
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={90}
                                  value={config.risk_thresholds.deadline_warning_days}
                                  onChange={(e) =>
                                    updateRisk({
                                      deadline_warning_days: Math.max(
                                        1,
                                        Number(e.target.value),
                                      ),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-400">天即预警</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  候选人阶段停滞 ≥
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={config.risk_thresholds.stale_stage_days}
                                  onChange={(e) =>
                                    updateRisk({
                                      stale_stage_days: Math.max(1, Number(e.target.value)),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-400">天告警</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  需求开放超过
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={3650}
                                  value={config.risk_thresholds.open_too_long_days}
                                  onChange={(e) =>
                                    updateRisk({
                                      open_too_long_days: Math.max(
                                        1,
                                        Number(e.target.value),
                                      ),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-400">
                                  天标记风险
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  推荐达到
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10000}
                                  value={
                                    config.risk_thresholds.low_interview_candidate_threshold
                                  }
                                  onChange={(e) =>
                                    updateRisk({
                                      low_interview_candidate_threshold: Math.max(
                                        1,
                                        Number(e.target.value),
                                      ),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  人仍无面试，标记低转化
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  超过
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={config.risk_thresholds.no_recommendation_days}
                                  onChange={(e) =>
                                    updateRisk({
                                      no_recommendation_days: Math.max(
                                        1,
                                        Number(e.target.value),
                                      ),
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                                />
                                <span className="text-sm text-foreground-700 flex-shrink-0">
                                  天无推荐，标记待补
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {meta.key === 'health' && (
                        <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-5">
                          <div>
                            <label className="block text-sm font-medium text-foreground-700 mb-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary-500"></span>
                                绿色及格线
                              </span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={config.health_thresholds.green_threshold}
                                onChange={(e) =>
                                  updateHealth({
                                    green_threshold: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value)),
                                    ),
                                  })
                                }
                                className="w-24 px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                              />
                              <span className="text-sm text-foreground-500">
                                % 以上绿色
                              </span>
                            </div>
                            <p className="text-xs text-foreground-400 mt-1">
                              健康度 = 100 分制，按需求风险标记扣分（逾期、超期开放、零入职有卡点等）
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-foreground-700 mb-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-accent-500"></span>
                                黄色警戒线
                              </span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={config.health_thresholds.yellow_threshold}
                                onChange={(e) =>
                                  updateHealth({
                                    yellow_threshold: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value)),
                                    ),
                                  })
                                }
                                className="w-24 px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                              />
                              <span className="text-sm text-foreground-500">
                                % 以上黄色
                              </span>
                            </div>
                            <p className="text-xs text-foreground-400 mt-1">
                              低于此值显示红色
                            </p>
                          </div>

                          <div className="flex items-center">
                            <div className="bg-background-50 rounded-lg p-4 border border-background-100 w-full">
                              <p className="text-xs text-foreground-500 mb-2">预览效果</p>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full bg-primary-500"></span>
                                  <span className="text-xs text-foreground-600">
                                    ≥ {config.health_thresholds.green_threshold} 分 正常
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full bg-accent-500"></span>
                                  <span className="text-xs text-foreground-600">
                                    {config.health_thresholds.yellow_threshold} ~{' '}
                                    {config.health_thresholds.green_threshold - 1} 分 警戒
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full bg-accent-600"></span>
                                  <span className="text-xs text-foreground-600">
                                    &lt; {config.health_thresholds.yellow_threshold} 分 危险
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
