import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import type {
  ImportConfirmItem,
  ImportMatchItem,
  ImportPreviewResult,
  ResumeCandidateItem,
} from '@/features/talentMaps/types';
import type { TalentMapWorkspaceController } from '@/features/talentMaps/useTalentMapWorkspace';
import { materializeCompanies } from './aiImportCompanies';

interface AiImportWizardProps {
  open: boolean;
  workspace: TalentMapWorkspaceController;
  onClose: () => void;
}

const checkboxClass = 'w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400';

export default function AiImportWizard({ open, workspace, onClose }: AiImportWizardProps) {
  const { showToast } = useToast();
  const { loadResumeCandidates } = workspace;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<ResumeCandidateItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [fixMap, setFixMap] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);

  const loadLib = useCallback(async (kw = '') => {
    setLoadingLib(true);
    try {
      const result = await loadResumeCandidates(kw);
      setItems(result.items);
    } catch (loadError) {
      showToast(loadError instanceof Error ? loadError.message : '简历库加载失败');
    } finally {
      setLoadingLib(false);
    }
  }, [loadResumeCandidates, showToast]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setKeyword('');
    setSelected(new Set());
    setPreview(null);
    setFixMap({});
    void loadLib('');
  }, [open, loadLib]);

  // 支持 Esc 关闭弹窗
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, importing, onClose]);

  const filteredItems = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return items;
    return items.filter((item) =>
      [item.name, item.company, item.position].some((text) => text.includes(kw)),
    );
  }, [items, keyword]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = filteredItems.map((item) => item.candidate_id);
      const allChecked = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => (allChecked ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const allChecked = filteredItems.length > 0 && filteredItems.every((item) => selected.has(item.candidate_id));

  const startPreview = async () => {
    if (selected.size === 0) {
      showToast('请先勾选至少一位候选人');
      return;
    }
    setStep(2);
    try {
      const result = await workspace.previewImport([...selected]);
      setPreview(result);
      // 待确认项默认「按简历公司新建目标公司并导入」，一键确认即可闭环；单个可改跳过/归到现有公司
      const defaults: Record<number, string> = {};
      result.unmatch.forEach((item: ResumeCandidateItem) => {
        if (item.company) defaults[item.candidate_id] = `create:${item.company}`;
      });
      setFixMap(defaults);
      setStep(3);
    } catch (previewError) {
      showToast(previewError instanceof Error ? previewError.message : 'AI 匹配失败，请重试');
      setStep(1);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setImporting(true);
    let itemsToImport: ImportConfirmItem[] = [];
    try {
      itemsToImport = preview.match.map((item: ImportMatchItem) => ({
        name: item.name,
        company_id: item.matched_company_id,
        title: item.position || '',
        phone: item.phone || '',
        source: 'AI导入',
        note: `AI 从简历库导入：${item.company} · ${item.position || '任职信息待补充'}`,
      }));
      preview.unmatch.forEach((item: ResumeCandidateItem) => {
        const targetId = fixMap[item.candidate_id];
        if (!targetId) return;
        if (String(targetId).startsWith('create:')) {
          itemsToImport.push({
            name: item.name,
            create_company_name: String(targetId).slice(7),
            title: item.position || '',
            phone: item.phone || '',
            source: 'AI导入',
            note: `AI 从简历库导入（新建目标公司）：${item.company} · ${item.position || '任职信息待补充'}`,
          });
          return;
        }
        itemsToImport.push({
          name: item.name,
          company_id: Number(targetId),
          title: item.position || '',
          phone: item.phone || '',
          source: 'AI导入',
          note: `AI 从简历库导入（人工指定公司）：${item.company} · ${item.position || '任职信息待补充'}`,
        });
      });
      // 旧后端兼容:把"新建公司"先在前端落库 → 转为 company_id,后端即便不识别 create_company_name 也能成功
      const knownCompanies = new Map<string, number>(
        preview.map_companies.map((c) => [c.company_name, c.id]),
      );
      itemsToImport = await materializeCompanies(workspace, itemsToImport, knownCompanies);
      const result = await workspace.confirmImport(itemsToImport);
      showToast(
        result.skipped > 0
          ? `AI 导入完成：${result.count} 位入库，跳过重复 ${result.skipped} 位`
          : `AI 导入完成：${result.count} 位人才已入库，组织架构图已更新`,
      );
      onClose();
    } catch (importError) {
      // 完整打印错误以便诊断(F12 控制台),并向用户展示后端原 error
      console.error('[AI 导入失败]', { itemsToImport, error: importError });
      const apiError = importError as { message?: string; status?: number; statusText?: string; data?: unknown; details?: unknown };
      const detail = apiError?.data ?? apiError?.details ?? apiError?.statusText;
      const message = apiError?.message ?? '导入失败，请重试';
      showToast(detail ? `${message}（${typeof detail === 'string' ? detail : JSON.stringify(detail)}）` : message);
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const importableCount = preview ? preview.match.length + Object.values(fixMap).filter(Boolean).length : 0;

  const stepBar = (
    <div className="flex items-center gap-2 px-6 pt-4">
      {[
        { n: 1, label: '选择简历候选人' },
        { n: 2, label: 'AI 提取匹配' },
        { n: 3, label: '确认导入' },
      ].map((s, index) => {
        const isDone = step > s.n;
        const isOn = step === s.n;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs ${isOn ? 'text-primary-700 font-semibold' : isDone ? 'text-secondary-700' : 'text-foreground-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${isOn ? 'bg-primary-500 text-white' : isDone ? 'bg-secondary-500 text-white' : 'bg-background-200 text-foreground-500'}`}>
                {isDone ? <i className="ri-check-line"></i> : s.n}
              </span>
              {s.label}
            </div>
            {index < 2 && <div className={`w-8 h-0.5 ${step > s.n ? 'bg-secondary-400' : 'bg-background-200'}`}></div>}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => { if (!importing) onClose(); }}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl pointer-events-auto flex flex-col animate-modal-in max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">AI 从简历库导入</h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                AI 自动提取每位候选人的最近一份任职并匹配目标公司，匹配不准的可人工修正
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={importing}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
              aria-label="关闭"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {stepBar}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {step === 1 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="relative flex-1">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="搜索候选人姓名 / 公司 / 岗位"
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                    />
                  </div>
                  <button
                    onClick={toggleAll}
                    className="px-3 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm text-foreground-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {allChecked ? '取消全选' : '全选'}
                  </button>
                  <span className="text-xs text-foreground-400 whitespace-nowrap">已选 {selected.size} 人</span>
                </div>

                {loadingLib ? (
                  <div className="py-14 text-center text-sm text-foreground-500">正在加载简历库…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="py-14 text-center">
                    <i className="ri-file-search-line text-3xl text-foreground-300"></i>
                    <p className="mt-2 text-sm text-foreground-500">简历库暂无可用候选人</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredItems.map((item) => {
                      const checked = selected.has(item.candidate_id);
                      return (
                        <div
                          key={item.candidate_id}
                          onClick={() => toggle(item.candidate_id)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                            checked ? 'border-primary-300 bg-primary-50' : 'border-background-200 bg-white hover:border-background-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            className={checkboxClass}
                          />
                          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-600">{item.name.charAt(0)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground-900">{item.name}</p>
                            <p className="text-xs text-foreground-500 truncate">
                              {item.company} · {item.position || '职位待补充'}
                              {item.duration ? ` · ${item.duration}` : ''}
                            </p>
                          </div>
                          <span className="text-[11px] text-foreground-400 bg-background-100 px-2 py-1 rounded whitespace-nowrap">
                            {item.source_type === 'online' ? '线上简历' : '简历库'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="py-16 text-center">
                <div className="w-12 h-12 mx-auto rounded-full border-4 border-background-200 border-t-primary-500 animate-spin"></div>
                <p className="mt-5 text-sm font-semibold text-foreground-900">
                  AI 正在分析 {selected.size} 位候选人…
                </p>
                <p className="mt-2 text-xs text-foreground-500 leading-relaxed">
                  读取最近一份工作经历 → 提取「公司 + 职位」<br />
                  匹配目标公司与对应岗位，无法匹配的将进入「待确认」
                </p>
              </div>
            )}

            {step === 3 && preview && (
              <div className="space-y-5">
                {/* 建议导入 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-foreground-900">建议导入</span>
                    <span className="text-xs text-secondary-700 bg-secondary-50 px-2 py-0.5 rounded">
                      {preview.match.length} 位 · AI 已自动匹配
                    </span>
                  </div>
                  <div className="space-y-2">
                    {preview.match.map((item) => (
                      <div key={item.candidate_id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-background-200 bg-white">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary-600">{item.name.charAt(0)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground-900">{item.name}</p>
                          <p className="text-xs text-foreground-500 truncate">{item.company} · {item.position || '职位待补充'}</p>
                        </div>
                        <i className="ri-arrow-right-line text-foreground-300 flex-shrink-0"></i>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium text-primary-700">{item.matched_company_name}</p>
                          <p className="text-xs text-foreground-400">{item.industry || '目标公司'}</p>
                        </div>
                      </div>
                    ))}
                    {preview.match.length === 0 && (
                      <p className="text-xs text-foreground-400 text-center py-4 bg-background-50 rounded-xl">暂无自动匹配项</p>
                    )}
                  </div>
                </div>

                {/* 待确认 */}
                {preview.unmatch.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground-900">待确认</span>
                        <span className="text-xs text-secondary-700 bg-secondary-50 px-2 py-0.5 rounded">
                          {preview.unmatch.length} 位 · 公司不在目标名单，默认按简历公司新建目标公司
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<number, string> = {};
                            preview.unmatch.forEach((item) => { if (item.company) all[item.candidate_id] = `create:${item.company}`; });
                            setFixMap(all);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors cursor-pointer"
                        >
                          全部新建公司
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<number, string> = {};
                            preview.unmatch.forEach((item) => { all[item.candidate_id] = ''; });
                            setFixMap(all);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-background-100 text-foreground-600 hover:bg-background-200 text-xs font-medium transition-colors cursor-pointer"
                        >
                          全部跳过
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {preview.unmatch.map((item) => (
                        <div key={item.candidate_id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-background-200 bg-white flex-wrap sm:flex-nowrap">
                          <div className="w-8 h-8 rounded-full bg-background-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-foreground-500">{item.name.charAt(0)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground-900">{item.name}</p>
                            <p className="text-xs text-foreground-500 truncate">{item.company} · {item.position || '职位待补充'}</p>
                          </div>
                          <select
                            value={fixMap[item.candidate_id] ?? ''}
                            onChange={(e) => setFixMap((prev) => ({ ...prev, [item.candidate_id]: e.target.value }))}
                            className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 flex-shrink-0"
                          >
                            <option value="">跳过（不导入）</option>
                            {item.company && (
                              <option value={`create:${item.company}`}>新建公司并导入：{item.company}</option>
                            )}
                            {preview.map_companies.map((company) => (
                              <option key={company.id} value={company.id}>
                                导入到 {company.company_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-background-50 border border-background-200 px-4 py-3">
                  <p className="text-xs text-foreground-500 leading-relaxed flex items-start gap-2">
                    <i className="ri-information-line mt-0.5"></i>
                    <span>
                      {preview.map_companies.length === 0
                        ? '当前地图还没有目标公司，导入时将按简历中的公司名自动新建目标公司并归位。'
                        : '导入后每位人才归属当前操作人，出现在目标公司组织架构对应岗位下。职级、负责模块等简历未识别的信息，可在「编辑人才」中人工补充。'}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-background-100">
            <span className="text-xs text-foreground-400">
              {step === 3 && preview
                ? `将导入 ${importableCount} 位（待确认已默认按简历公司新建目标公司，可改跳过）`
                : ' '}
            </span>
            <div className="flex items-center gap-3">
              {step === 1 && (
                <button
                  onClick={() => void startPreview()}
                  disabled={selected.size === 0}
                  className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  下一步：AI 提取匹配 →
                </button>
              )}
              {step === 3 && (
                <>
                  <button
                    onClick={() => setStep(1)}
                    disabled={importing}
                    className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
                  >
                    返回
                  </button>
                  <button
                    onClick={() => void confirm()}
                    disabled={importing || importableCount === 0}
                    className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    {importing ? '导入中…' : '确认导入'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modalIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
