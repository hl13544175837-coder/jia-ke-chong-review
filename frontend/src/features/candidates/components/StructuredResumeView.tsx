import type { ReactNode } from 'react';
import { AlertTriangle, Edit3, RefreshCw, Save, X } from 'lucide-react';
import { Button } from '../../../components/ui';

interface StructuredResumeViewProps {
  parseFailed: boolean;
  parseError?: string | null;
  retryingParse: boolean;
  editing: boolean;
  saving: boolean;
  canEdit: boolean;
  exporting: boolean;
  retryLabel?: string;
  editLabel?: string;
  exportLabel?: string;
  onRetryParse: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onExport: () => void;
  outline?: ReactNode;
  children: ReactNode;
}

export function StructuredResumeView({
  parseFailed,
  parseError,
  retryingParse,
  editing,
  saving,
  canEdit,
  exporting,
  retryLabel = '重新解析',
  editLabel = '编辑档案',
  exportLabel = '导出简历',
  onRetryParse,
  onStartEdit,
  onCancelEdit,
  onSave,
  onExport,
  outline,
  children,
}: StructuredResumeViewProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
      <header className="flex flex-col gap-4 border-b border-hairline-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">结构化画像</h2>
          <p className="mt-1 text-xs text-muted-soft">
            AI 抽取与人工补充的可编辑信息，不代表原始简历原文。
          </p>
        </div>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCancelEdit} disabled={saving}>
              <X className="h-4 w-4" aria-hidden="true" />
              取消
            </Button>
            <Button type="button" variant="accent" size="sm" loading={saving} onClick={onSave}>
              <Save className="h-4 w-4" aria-hidden="true" />
              保存修改
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" loading={exporting} onClick={onExport}>
              {exportLabel}
            </Button>
            {canEdit && (
              <Button type="button" variant="secondary" size="sm" onClick={onStartEdit}>
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                {editLabel}
              </Button>
            )}
          </div>
        )}
      </header>

      {parseFailed && (
        <div className="border-b border-danger-200 bg-danger-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-danger-700">简历解析失败</p>
                <p className="mt-1 text-sm leading-6 text-danger-700">
                  {parseError || '原始文件仍可在「原始简历」页签查看，也可手动补全画像。'}
                </p>
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" loading={retryingParse} onClick={onRetryParse}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {retryLabel}
            </Button>
          </div>
        </div>
      )}

      {outline && !editing && (
        <details className="border-b border-hairline-soft px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">
            查看结构化目录
          </summary>
          <div className="mt-3">{outline}</div>
        </details>
      )}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
