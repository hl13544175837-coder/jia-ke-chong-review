import { useEffect, useState } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '../../../components/ui';
import { candidatesApi } from '../api';
import type { OriginalResumeInfo } from '../types';

interface OriginalResumeViewerProps {
  candidateId: number;
  info: OriginalResumeInfo;
  parseFailed: boolean;
}

export function OriginalResumeViewer({
  candidateId,
  info,
  parseFailed,
}: OriginalResumeViewerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(info.available);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setError(null);
    if (!info.available) {
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    candidatesApi.previewOriginalResume(candidateId)
      .then(({ blob }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '原始简历加载失败');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidateId, info.available, info.preview_url]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await candidatesApi.downloadOriginalResume(candidateId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || info.filename || `candidate-${candidateId}-resume`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '原始简历下载失败');
    } finally {
      setDownloading(false);
    }
  };

  const unavailable = !info.available || Boolean(error);
  const isPdf = info.mime_type === 'application/pdf';

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
      <header className="flex flex-col gap-3 border-b border-hairline-soft bg-surface-soft/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas">
            <FileText className="h-5 w-5 text-ink" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">原始简历</h2>
            <p className="mt-0.5 truncate text-xs text-muted-soft">
              {info.filename || '原始文件是候选人信息的事实真源'}
            </p>
          </div>
        </div>
        {info.available && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={downloading}
            onClick={() => void handleDownload()}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            下载原件
          </Button>
        )}
      </header>

      {parseFailed && (
        <div className="border-b border-warning-200 bg-warning-50 px-5 py-3 text-sm text-warning-700">
          解析失败不影响查看原始简历；结构化内容仅是辅助信息。
        </div>
      )}

      <div className="min-h-[66vh] bg-[#f4f1ea] p-3 sm:p-5">
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center rounded-lg bg-canvas">
            <Spinner size="lg" />
          </div>
        ) : unavailable ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-canvas px-6 text-center">
            <FileText className="h-9 w-9 text-muted-soft" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-ink">未找到可用的原始简历</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              {error || '可能是原文件未保留或已移动。请重新上传，结构化画像仍可作为恢复参考。'}
            </p>
            <Link
              to="/upload"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-hairline bg-canvas px-3 text-sm font-semibold text-ink hover:bg-surface-soft"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              重新上传
            </Link>
          </div>
        ) : isPdf && previewUrl ? (
          <iframe
            title="原始简历预览"
            src={previewUrl}
            className="h-[66vh] w-full rounded-lg border border-hairline bg-canvas shadow-apple-sm"
          />
        ) : (
          <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg bg-canvas px-6 text-center">
            <FileText className="h-10 w-10 text-muted-soft" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-ink">Word 原件已安全保留</h3>
            <p className="mt-2 text-sm text-muted">浏览器无法直接预览 DOCX，请下载后查看完整版式。</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              loading={downloading}
              onClick={() => void handleDownload()}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              下载原件
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
