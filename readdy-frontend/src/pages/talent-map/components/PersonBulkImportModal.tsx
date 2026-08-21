import { useMemo, useState } from 'react';
import type { TalentMapPersonBulkItem, TalentMapPersonBulkResult } from '@/features/talentMaps/types';

interface Props {
  open: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (items: TalentMapPersonBulkItem[]) => Promise<TalentMapPersonBulkResult>;
}

type Mode = 'paste' | 'csv';

function parseText(text: string): TalentMapPersonBulkItem[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,，\t]/).map((part) => part.trim());
      return {
        name: parts[0] || '',
        phone: parts[1] || '',
        company_name: parts[2] || '',
        title: parts[3] || '',
      };
    })
    .filter((item) => item.name);
}

function parseCsv(file: File): Promise<TalentMapPersonBulkItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        resolve(parseText(text));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

function ResultBadge({ status }: { status: 'created' | 'duplicate' | 'error' }) {
  if (status === 'created') return <span className="text-xs text-emerald-700">成功</span>;
  if (status === 'duplicate') return <span className="text-xs text-amber-700">已跳过</span>;
  return <span className="text-xs text-red-700">失败</span>;
}

export default function PersonBulkImportModal({ open, saving, error, onClose, onSave }: Props) {
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<TalentMapPersonBulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [csvItems, setCsvItems] = useState<TalentMapPersonBulkItem[]>([]);

  const parsed = useMemo(() => (mode === 'paste' ? parseText(text) : []), [mode, text]);

  if (!open) return null;

  const reset = () => {
    setText('');
    setFileName('');
    setResult(null);
    setLocalError('');
    setCsvItems([]);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setLocalError('请选择 .csv 文件（第一行为表头，随后每行一列：姓名、手机号、公司、职位）');
      return;
    }
    try {
      const items = await parseCsv(file);
      setCsvItems(items);
      setFileName(file.name);
      setLocalError(items.length === 0 ? '文件中未解析出有效人才行' : '');
    } catch {
      setLocalError('解析文件失败，请检查格式');
    }
  };

  const submit = async () => {
    const items = mode === 'paste' ? parsed : csvItems;
    if (items.length === 0) {
      setLocalError('没有可导入的人才行');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const res = await onSave(items);
      setResult(res);
      reset();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const displayItems = mode === 'paste' ? parsed : [];

  const hasUnsavedContent = mode === 'paste' ? Boolean(text.trim()) : Boolean(fileName);

  return (
    <>
      <div
        className="fixed inset-0 bg-foreground-900/40 z-40"
        role="presentation"
        onClick={() => { if (!saving && !busy && !hasUnsavedContent) onClose(); }}
      ></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto flex flex-col animate-modal-in">
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">新增 / 批量导入人才</h2>
              <p className="text-xs text-foreground-400 mt-0.5">只需「姓名、手机号、公司、职位」四项，不需要简历，也不调用 AI</p>
            </div>
            <button
              onClick={() => { if (!saving && !busy && !hasUnsavedContent) onClose(); }}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex rounded-lg bg-background-100 p-0.5 w-fit">
              <button type="button" onClick={() => { setMode('paste'); setResult(null); }} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${mode === 'paste' ? 'bg-white shadow-sm text-foreground-900 font-medium' : 'text-foreground-500 hover:text-foreground-700'}`}>
                粘贴表格
              </button>
              <button type="button" onClick={() => { setMode('csv'); setResult(null); }} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${mode === 'csv' ? 'bg-white shadow-sm text-foreground-900 font-medium' : 'text-foreground-500 hover:text-foreground-700'}`}>
                上传 CSV
              </button>
            </div>

            {mode === 'paste' ? (
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                  人才表格（每行一人，四列用逗号或表格键隔开：姓名、手机号、公司、职位）
                </label>
                <textarea
                  value={text}
                  onChange={(e) => { setText(e.target.value); setResult(null); }}
                  placeholder={'每行：姓名,手机号,公司,职位\n如：\n张三,13800138000,云启科技,算法工程师\n李四,13900139000,智远网络,产品经理'}
                  rows={6}
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none font-mono"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[10px] text-foreground-400">手机号重复会自动跳过，不会覆盖原资料；公司不存在会自动创建</p>
                  {displayItems.length > 0 && <span className="text-xs text-foreground-500">识别到 {displayItems.length} 人</span>}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">选择 CSV 文件</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                  className="block w-full text-sm text-foreground-700 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                />
                {fileName && <p className="mt-1.5 text-xs text-foreground-500">已选择：{fileName}</p>}
                <p className="mt-1.5 text-[10px] text-foreground-400">CSV 需为 UTF-8 编码，第一行表头，随后每行一列：姓名、手机号、公司、职位</p>
              </div>
            )}

            {(error || localError) && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || localError}</p>
            )}

            {result && (
              <div className="rounded-lg border border-background-200 bg-background-50 px-3 py-3">
                <p className="text-sm font-medium text-foreground-800">导入结果：成功 {result.count} · 跳过 {result.duplicate} · 失败 {result.failed}</p>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {result.results.map((row, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 rounded bg-white px-2 py-1 text-xs text-foreground-600">
                      <span className="truncate">#{row.index + 1}</span>
                      <span className="flex-1 truncate">{row.person?.name || '—'}{row.person?.company_name ? ` · ${row.person.company_name}` : ''}</span>
                      <ResultBadge status={row.status} />
                      {row.reason && <span className="w-32 truncate text-foreground-400">{row.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-100">
            <button onClick={onClose} disabled={saving || busy} className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors">
              关闭
            </button>
            <button
              onClick={() => void submit()}
              disabled={saving || busy || (mode === 'paste' ? parsed.length === 0 : !fileName)}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {busy ? '导入中…' : '开始导入'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
