import { useMemo, useRef, useState } from 'react';
import { RESUME_UPLOAD_ACCEPT, RESUME_UPLOAD_CONTRACT } from './resumeUploadContract';

interface ResumeUploadModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (files: File[]) => void;
}

export default function ResumeUploadModal({ open, onClose, onImported }: ResumeUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  if (!open) return null;

  const resetAndClose = () => {
    if (processing) return;
    setFiles([]);
    setError('');
    onClose();
  };

  const handleImport = () => {
    if (files.length === 0) {
      setError('请先选择至少一份简历');
      return;
    }
    setError('');
    setProcessing(true);
    window.setTimeout(() => {
      onImported(files);
      setProcessing(false);
      setFiles([]);
      onClose();
    }, 500);
  };

  return (
    <>
      <div className="fixed inset-0 z-[120] bg-foreground-900/40" onClick={resetAndClose}></div>
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none">
        <section className="w-full max-w-xl rounded-2xl bg-white shadow-2xl pointer-events-auto" role="dialog" aria-modal="true" aria-label="上传新简历">
          <header className="flex items-center justify-between border-b border-background-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">上传新简历</h2>
              <p className="mt-1 text-xs text-foreground-500">图片与 ZIP 已保留真实接口格式，本地先更新演示数据。</p>
            </div>
            <button type="button" onClick={resetAndClose} aria-label="关闭上传简历弹窗" className="h-9 w-9 rounded-lg text-foreground-500 hover:bg-background-100 cursor-pointer">
              <i className="ri-close-line text-xl"></i>
            </button>
          </header>

          <div className="space-y-4 p-6">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={RESUME_UPLOAD_ACCEPT}
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/40 px-5 py-10 text-center hover:border-primary-400 hover:bg-primary-50 cursor-pointer"
            >
              <i className="ri-upload-cloud-2-line text-3xl text-primary-500"></i>
              <span className="mt-2 block text-sm font-semibold text-foreground-800">选择或拖入简历文件</span>
              <span className="mt-1 block text-xs text-foreground-500">PDF、DOCX、JPG、PNG、WebP、GIF、ZIP，可多选</span>
            </button>

            {files.length > 0 && (
              <div className="rounded-lg border border-background-200 bg-background-50 p-3">
                <p className="text-sm font-medium text-foreground-800">已选择 {files.length} 个文件 · {(totalSize / 1024 / 1024).toFixed(2)} MB</p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-foreground-600">
                  {files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}
                </ul>
              </div>
            )}

            <div className="rounded-lg bg-secondary-50 px-3 py-2 text-xs text-secondary-700">
              正式接入位置：POST {RESUME_UPLOAD_CONTRACT.endpoint}，字段名 files。图片识别结果必须人工复核。
            </div>
            {error && <p className="text-sm text-accent-600" role="alert">{error}</p>}
          </div>

          <footer className="flex justify-end gap-3 border-t border-background-100 px-6 py-4">
            <button type="button" onClick={resetAndClose} className="rounded-lg border border-background-200 px-4 py-2 text-sm text-foreground-700 hover:bg-background-50 cursor-pointer">取消</button>
            <button type="button" onClick={handleImport} disabled={processing} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 cursor-pointer">
              {processing ? '解析中...' : '确认导入'}
            </button>
          </footer>
        </section>
      </div>
    </>
  );
}
