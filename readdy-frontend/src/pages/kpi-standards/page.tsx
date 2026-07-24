import { useState, useCallback, useMemo } from 'react';
import {
  defaultKpiConfig,
  loadKpiConfig,
  saveKpiConfig,
  resetKpiConfig,
  type BlockCategoryRule,
  type RiskThresholdConfig,
  type HealthThresholdConfig,
} from '@/mocks/kpiStandards';

type SectionKey = 'categories' | 'risk' | 'health';

export default function KpiStandardsPage() {
  const [config, setConfig] = useState(() => loadKpiConfig());
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    categories: false,
    risk: false,
    health: false,
  });
  const [search, setSearch] = useState('');

  const toggle = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCategories = useCallback((categories: BlockCategoryRule[]) => {
    setConfig((prev) => ({ ...prev, blockCategories: categories }));
    setSaved(false);
  }, []);

  const updateRisk = useCallback((risk: RiskThresholdConfig) => {
    setConfig((prev) => ({ ...prev, riskThresholds: risk }));
    setSaved(false);
  }, []);

  const updateHealth = useCallback((health: HealthThresholdConfig) => {
    setConfig((prev) => ({ ...prev, healthThresholds: health }));
    setSaved(false);
  }, []);

  const handleSave = () => {
    saveKpiConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (window.confirm('确定恢复默认口径配置吗？当前自定义规则将丢失。')) {
      const fresh = resetKpiConfig();
      setConfig(fresh);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const addCategory = () => {
    const newId = `cat-${Date.now()}`;
    updateCategories([
      ...config.blockCategories,
      { id: newId, name: '', keywords: '' },
    ]);
    setExpanded((prev) => ({ ...prev, categories: true }));
  };

  const removeCategory = (id: string) => {
    if (config.blockCategories.length <= 1) return;
    updateCategories(config.blockCategories.filter((c) => c.id !== id));
  };

  const updateCategory = (id: string, patch: Partial<BlockCategoryRule>) => {
    updateCategories(
      config.blockCategories.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const moveCategory = (id: string, direction: -1 | 1) => {
    const idx = config.blockCategories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= config.blockCategories.length) return;
    const arr = [...config.blockCategories];
    const [item] = arr.splice(idx, 1);
    arr.splice(newIdx, 0, item);
    updateCategories(arr);
  };

  const searchLower = search.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!searchLower) return { categories: true, risk: true, health: true };
    return {
      categories: config.blockCategories.some(
        (c) => c.name.toLowerCase().includes(searchLower) || c.keywords.toLowerCase().includes(searchLower)
      ),
      risk:
        '风险'.includes(searchLower) ||
        '高风险'.includes(searchLower) ||
        '需关注'.includes(searchLower) ||
        'deadline'.includes(searchLower) ||
        'hc'.includes(searchLower),
      health:
        '健康'.includes(searchLower) ||
        '绿色'.includes(searchLower) ||
        '黄色'.includes(searchLower) ||
        '阈值'.includes(searchLower),
    };
  }, [searchLower, config.blockCategories]);

  const sectionMeta: { key: SectionKey; title: string; desc: string; badge: string }[] = [
    {
      key: 'categories',
      title: '阻塞原因分类规则',
      desc: '系统按顺序匹配关键词，命中则归入对应分类；均未命中落入「其他原因」',
      badge: `${config.blockCategories.length} 条规则`,
    },
    {
      key: 'risk',
      title: '风险等级判定规则',
      desc: '岗位矩阵中的「高风险」「需关注」「正常」由以下规则依次判定',
      badge: `${
        (config.riskThresholds.highIfStatusPausedOrClosed ? 1 : 0) +
        (config.riskThresholds.highIfZeroFillAndBlocked ? 1 : 0) +
        (config.riskThresholds.mediumIfBlocked ? 1 : 0) +
        1
      } 项配置`,
    },
    {
      key: 'health',
      title: '专员健康度阈值',
      desc: '招聘专员卡片中的健康度圆环颜色由以下阈值决定',
      badge: `绿 ${config.healthThresholds.greenThreshold}% · 黄 ${config.healthThresholds.yellowThreshold}%`,
    },
  ];

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground-900">口径配置</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && (
            <span className="text-sm text-primary-600 font-medium flex items-center gap-1">
              <i className="ri-check-line"></i> 已保存
            </span>
          )}
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-background-100 hover:bg-background-200 text-sm text-foreground-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            恢复默认
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            保存配置
          </button>
        </div>
      </div>

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
                isOpen ? 'border-background-200' : 'border-background-200 hover:border-background-300'
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
                      <h3 className="text-sm font-semibold text-foreground-900">{meta.title}</h3>
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
                      {config.blockCategories.map((cat, index) => (
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
                              disabled={index === config.blockCategories.length - 1}
                              className="w-6 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-600 hover:bg-background-200 disabled:opacity-30 cursor-pointer"
                            >
                              <i className="ri-arrow-down-s-line text-xs"></i>
                            </button>
                          </div>

                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={cat.name}
                              onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                              placeholder="分类名称，如：薪资不匹配"
                              className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                            />
                            <input
                              type="text"
                              value={cat.keywords}
                              onChange={(e) => updateCategory(cat.id, { keywords: e.target.value })}
                              placeholder="匹配关键词，多个用逗号分隔"
                              className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                            />
                          </div>

                          <button
                            onClick={() => removeCategory(cat.id)}
                            disabled={config.blockCategories.length <= 1}
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
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-4">
                        <h4 className="text-sm font-medium text-foreground-700 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-accent-500"></span>
                          高风险触发条件
                          <span className="text-xs text-foreground-400 font-normal">满足任一即判定</span>
                        </h4>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.riskThresholds.highIfStatusPausedOrClosed}
                            onChange={(e) =>
                              updateRisk({ ...config.riskThresholds, highIfStatusPausedOrClosed: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                          />
                          <span className="text-sm text-foreground-700">岗位状态为「已暂停」或「已关闭」</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.riskThresholds.highIfZeroFillAndBlocked}
                            onChange={(e) =>
                              updateRisk({ ...config.riskThresholds, highIfZeroFillAndBlocked: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                          />
                          <span className="text-sm text-foreground-700">
                            HC 零入职 <strong>且</strong> 存在阻塞候选人
                          </span>
                        </label>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-medium text-foreground-700 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                          需关注触发条件
                          <span className="text-xs text-foreground-400 font-normal">未命中高风险后判定</span>
                        </h4>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={config.riskThresholds.mediumIfBlocked}
                              onChange={(e) =>
                                updateRisk({ ...config.riskThresholds, mediumIfBlocked: e.target.checked })
                              }
                              className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                            />
                            <span className="text-sm text-foreground-700">HC 缺口比例 ≥</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={config.riskThresholds.mediumFillRatioThreshold}
                            onChange={(e) =>
                              updateRisk({
                                ...config.riskThresholds,
                                mediumFillRatioThreshold: Math.min(1, Math.max(0, Number(e.target.value))),
                              })
                            }
                            className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                          />
                          <span className="text-sm text-foreground-700">
                            <strong>且</strong> 存在阻塞
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm text-foreground-700 flex-shrink-0">Deadline 剩余天数 ≤</span>
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={config.riskThresholds.deadlineWarningDays}
                            onChange={(e) =>
                              updateRisk({
                                ...config.riskThresholds,
                                deadlineWarningDays: Math.max(1, Number(e.target.value)),
                              })
                            }
                            className="w-20 px-2 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                          />
                          <span className="text-sm text-foreground-400">天即预警</span>
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
                            value={config.healthThresholds.greenThreshold}
                            onChange={(e) =>
                              updateHealth({
                                ...config.healthThresholds,
                                greenThreshold: Math.min(100, Math.max(0, Number(e.target.value))),
                              })
                            }
                            className="w-24 px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                          />
                          <span className="text-sm text-foreground-500">% 以上绿色</span>
                        </div>
                        <p className="text-xs text-foreground-400 mt-1">
                          健康度 = (负责总人数 - 阻塞人数) / 负责总人数
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
                            value={config.healthThresholds.yellowThreshold}
                            onChange={(e) =>
                              updateHealth({
                                ...config.healthThresholds,
                                yellowThreshold: Math.min(100, Math.max(0, Number(e.target.value))),
                              })
                            }
                            className="w-24 px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                          />
                          <span className="text-sm text-foreground-500">% 以上黄色</span>
                        </div>
                        <p className="text-xs text-foreground-400 mt-1">低于此值显示红色</p>
                      </div>

                      <div className="flex items-center">
                        <div className="bg-background-50 rounded-lg p-4 border border-background-100 w-full">
                          <p className="text-xs text-foreground-500 mb-2">预览效果</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full bg-primary-500"></span>
                              <span className="text-xs text-foreground-600">
                                ≥ {config.healthThresholds.greenThreshold}% 正常
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full bg-accent-500"></span>
                              <span className="text-xs text-foreground-600">
                                {config.healthThresholds.yellowThreshold}% ~ {config.healthThresholds.greenThreshold - 1}% 警戒
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full bg-accent-600"></span>
                              <span className="text-xs text-foreground-600">
                                &lt; {config.healthThresholds.yellowThreshold}% 危险
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
    </div>
  );
}