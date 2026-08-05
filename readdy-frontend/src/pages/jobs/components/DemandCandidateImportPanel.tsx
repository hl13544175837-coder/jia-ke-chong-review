import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { CheckCircle2, FileUp, LoaderCircle } from 'lucide-react';
import type { ResumeUploadResponse } from '@/features/candidates/types';
import { supportedResumeAccept } from '@/features/candidates/library';
import type { RecruitmentDemand } from '@/features/demands/types';

type UploadResult = ResumeUploadResponse['results'][number];

interface DemandCandidateImportPanelProps {
  demand: RecruitmentDemand;
  inputRef: RefObject<HTMLInputElement | null>;
  dragOver: boolean;
  onDragOverChange: (dragOver: boolean) => void;
  uploading: boolean;
  error: string;
  response: ResumeUploadResponse | null;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onOpenDuplicate: (result: UploadResult) => void;
  onOpenConfirmation: (result: UploadResult) => void;
}

export default function DemandCandidateImportPanel({
  demand,
  inputRef,
  dragOver,
  onDragOverChange,
  uploading,
  error,
  response,
  onFileSelect,
  onDrop,
  onOpenDuplicate,
  onOpenConfirmation,
}: DemandCandidateImportPanelProps) {
  return (
    <section className="p-5">
      <h3 className="text-sm font-semibold text-foreground-900">直接导入当前需求</h3>
      <p className="mt-1 text-xs leading-5 text-foreground-500">
        拖入后自动关联“{demand.job_title}”，无需再次选择需求。
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={supportedResumeAccept}
        onChange={onFileSelect}
        className="hidden"
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverChange(true);
        }}
        onDragLeave={() => onDragOverChange(false)}
        onDrop={onDrop}
        className={`mt-4 flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50'}`}
      >
        {uploading ? (
          <LoaderCircle className="animate-spin text-primary-600" size={28} />
        ) : (
          <FileUp className="text-foreground-400" size={28} />
        )}
        <p className="mt-3 text-sm font-medium text-foreground-700">拖入简历到这里</p>
        <p className="mt-1 text-xs text-foreground-400">PDF、DOCX、图片或 ZIP</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-3 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-700 disabled:opacity-50"
        >
          选择文件
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {response && (
        <div className="mt-3 rounded-lg border border-background-200 bg-white px-3 py-3 text-xs text-foreground-700">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={15} />已处理 {response.total} 份文件
          </p>
          <p className="mt-1">
            后台解析 {response.results.filter((item) => item.status === 'processing').length} 份，
            成功 {response.results.filter((item) => item.status === 'ok').length} 份，
            待确认 {response.results.filter((item) => item.status === 'needs_confirmation').length} 份，
            重复 {response.results.filter((item) => item.status === 'duplicate').length} 份，
            其他失败 {response.results.filter((item) => !['ok', 'processing', 'duplicate', 'needs_confirmation'].includes(item.status)).length} 份。
          </p>
          {response.results.filter((item) => item.status === 'duplicate').map((item) => (
            <div key={item.file} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
              <p className="font-medium">{item.reason || '导入失败：系统中已存在重复简历'}</p>
              <p className="mt-0.5">
                已有候选人：{item.existing_candidate_name || '当前组织已有候选人'}
                {item.match_basis ? ` · ${item.match_basis}` : ''}
              </p>
              {item.existing_candidate_id && (
                <button type="button" onClick={() => onOpenDuplicate(item)} className="mt-1 font-medium text-primary-700">
                  查看已有候选人
                </button>
              )}
            </div>
          ))}
          {response.results.filter((item) => item.status === 'needs_confirmation').map((item) => (
            <div key={item.file} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
              <p className="font-medium">{item.reason || 'AI 未能识别该简历，请确认原文件'}</p>
              {item.candidate_id && (
                <button type="button" onClick={() => onOpenConfirmation(item)} className="mt-1 font-medium text-primary-700">
                  查看并处理
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
