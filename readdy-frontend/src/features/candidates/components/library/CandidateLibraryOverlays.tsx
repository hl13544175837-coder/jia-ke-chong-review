import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';
import TransferCandidateModal from '@/features/candidates/components/TransferCandidateModal';
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Upload, X } from 'lucide-react';
import PushToReviewerModal from '@/features/businessReviews/components/PushToReviewerModal';
import AddToPipelineModal from '@/features/candidates/components/AddToPipelineModal';
import CandidateUploadModal from '@/features/candidates/components/CandidateUploadModal';
import DuplicateCandidatesModal from '@/features/candidates/components/DuplicateCandidatesModal';
import {
  sourceChannels,
  supportedReplacementPattern,
  supportedResumeAccept,
} from '@/features/candidates/library';

interface CandidateLibraryOverlaysProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryOverlays({ controller }: CandidateLibraryOverlaysProps) {
  const {
    role,
    showToast,
    demandFilter,
    demands,
    demandsLoading,
    demandError,
    reviewers,
    reviewersLoading,
    reviewerError,
    pipelineTargets,
    setPipelineTargets,
    pipelineSubmitting,
    pipelineResult,
    setPipelineResult,
    transferCandidate,
    setTransferCandidate,
    transferSubmitting,
    transferError,
    transferInvalidated,
    duplicatesOpen,
    setDuplicatesOpen,
    uploadOpen,
    setUploadOpen,
    uploadDemandId,
    setUploadDemandId,
    uploadSourceChannel,
    setUploadSourceChannel,
    uploadNote,
    setUploadNote,
    uploadFiles,
    setUploadFiles,
    uploadRowActions,
    uploadResponse,
    uploadError,
    uploadSubmitting,
    uploadDragOver,
    setUploadDragOver,
    uploadInputRef,
    pushTargets,
    setPushTargets,
    pushSubmitting,
    pushResults,
    setPushResults,
    pushInitialReviewerId,
    setPushInitialReviewerId,
    reassignTask,
    setReassignTask,
    activeDemands,
    pushDemandOptions,
    loadCandidates,
    loadDemands,
    loadReviewers,
    handleUploadFileSelect,
    handleUploadDrop,
    submitUpload,
    openExistingCandidateFromUpload,
    openConfirmationCandidateFromUpload,
    sourceFileForUploadResult,
    keepExistingResumeVersion,
    replaceDuplicateAsCurrentVersion,
    retrySingleUploadFile,
    handleAddToPipeline,
    handleTransferCandidate,
    handlePushToBusiness,
    initialPushDemandId,
  } = controller;

  return (
    <>
<CandidateUploadModal
        open={uploadOpen}
        busy={uploadSubmitting}
        onClose={() => setUploadOpen(false)}
      >
            <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
              <div>
                <h2 id="upload-resume-title" className="text-lg font-bold text-foreground-900">导入简历</h2>
                <p className="mt-1 text-sm text-foreground-500">可先存入公司人才库，也可在入库时关联招聘需求</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                disabled={uploadSubmitting}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="关闭上传弹窗"
                title="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <label htmlFor="upload-demand" className="mb-2 block text-xs font-medium text-foreground-600">入库后关联需求（选填）</label>
                <select
                  id="upload-demand"
                  value={uploadDemandId}
                  onChange={(event) => setUploadDemandId(event.target.value ? Number(event.target.value) : '')}
                  disabled={uploadSubmitting || demandsLoading}
                  className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-background-50"
                >
                  <option value="">暂不关联，先存公司人才库</option>
                  {activeDemands.map((demand) => (
                    <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title} · {demand.job_department}</option>
                  ))}
                </select>
                {demandsLoading && <p className="mt-1 text-xs text-foreground-400">正在加载可关联的招聘需求</p>}
                {demandError && (
                  <p className="mt-1 text-xs text-amber-700">
                    招聘需求暂时不可用，仍可先入公司人才库。
                    <button type="button" onClick={() => void loadDemands()} className="ml-1 font-medium hover:text-amber-800">重试</button>
                  </p>
                )}
                {!demandsLoading && !demandError && activeDemands.length === 0 && <p className="mt-1 text-xs text-foreground-400">暂无在招需求，本次简历将保存到公司人才库</p>}
              </div>

              <div
                onDragOver={(event) => { event.preventDefault(); setUploadDragOver(true); }}
                onDragLeave={() => setUploadDragOver(false)}
                onDrop={handleUploadDrop}
                className={`flex min-h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-6 text-center transition-colors ${
                  uploadDragOver ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50'
                }`}
              >
                <input ref={uploadInputRef} type="file" multiple accept={supportedResumeAccept} onChange={handleUploadFileSelect} className="hidden" />
                <Upload className="text-foreground-400" size={24} aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-foreground-800">拖入简历，或选择文件</p>
                <p className="mt-1 text-xs text-foreground-400">PDF、DOC、DOCX、JPG、PNG、WebP、GIF、ZIP</p>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploadSubmitting}
                  className="mt-3 rounded-lg border border-background-300 bg-white px-3 py-1.5 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  选择文件
                </button>
              </div>

              {uploadFiles.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-foreground-600">待上传文件（{uploadFiles.length}）</p>
                  <div className="max-h-36 space-y-2 overflow-y-auto">
                    {uploadFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-lg border border-background-200 px-3 py-2">
                        <FileText className="shrink-0 text-primary-500" size={16} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground-700">{file.name}</span>
                        <span className="shrink-0 text-xs text-foreground-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                        <button
                          type="button"
                          onClick={() => setUploadFiles((current) => current.filter((item) => item !== file))}
                          disabled={uploadSubmitting}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700"
                          aria-label={`移除 ${file.name}`}
                          title="移除"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="upload-source" className="mb-2 block text-xs font-medium text-foreground-600">来源渠道（选填）</label>
                  <select
                    id="upload-source"
                    value={uploadSourceChannel}
                    onChange={(event) => setUploadSourceChannel(event.target.value)}
                    disabled={uploadSubmitting}
                    className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">未标注</option>
                    {sourceChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="upload-note" className="mb-2 block text-xs font-medium text-foreground-600">来源备注（选填）</label>
                  <input
                    id="upload-note"
                    value={uploadNote}
                    onChange={(event) => setUploadNote(event.target.value)}
                    disabled={uploadSubmitting}
                    maxLength={500}
                    placeholder="例如：7 月专场招聘"
                    className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadResponse && (
                <div aria-live="polite">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-foreground-600">文件处理结果</p>
                    {uploadResponse.deduplicated && <span className="text-xs font-medium text-amber-700">重复批次</span>}
                  </div>
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {uploadResponse.results.map((result, index) => {
                      const success = result.status === 'ok';
                      const processing = result.status === 'processing';
                      const duplicate = result.status === 'duplicate';
                      const needsConfirmation = result.status === 'needs_confirmation';
                      const rowAction = uploadRowActions[result.file];
                      const sourceFile = sourceFileForUploadResult(result);
                      const canSetAsVersion = Boolean(
                        duplicate
                        && result.existing_candidate_id
                        && sourceFile
                        && supportedReplacementPattern.test(sourceFile.name),
                      );
                      return (
                        <div key={`${result.file}-${index}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${success ? 'border-emerald-200 bg-emerald-50' : processing ? 'border-blue-200 bg-blue-50' : duplicate || needsConfirmation ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
                          {success ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" /> : processing ? <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-blue-600" size={16} aria-hidden="true" /> : <AlertCircle className={`mt-0.5 shrink-0 ${duplicate || needsConfirmation ? 'text-amber-600' : 'text-red-600'}`} size={16} aria-hidden="true" />}
                          <div className="min-w-0 flex-1">
                            <p className={`break-words text-sm font-medium ${success ? 'text-emerald-800' : processing ? 'text-blue-800' : duplicate || needsConfirmation ? 'text-amber-800' : 'text-red-800'}`}>{result.file}</p>
                            <p className={`mt-0.5 text-xs ${success ? 'text-emerald-700' : processing ? 'text-blue-700' : duplicate || needsConfirmation ? 'text-amber-700' : 'text-red-700'}`}>
                              {success ? '候选人档案已入库' : processing ? '文件已入库，AI 正在后台解析' : (result.reason || `处理状态：${result.status}`)}
                            </p>
                            {duplicate && (
                              <div className="mt-1.5 space-y-2 text-xs text-amber-800">
                                <p>已有候选人：{result.existing_candidate_name || '当前组织已有候选人'}{result.match_basis ? ` · ${result.match_basis}` : ''}</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {result.existing_candidate_id && (
                                    <button type="button" className="font-medium text-primary-700 hover:text-primary-800" onClick={() => openExistingCandidateFromUpload(result)}>查看已有候选人</button>
                                  )}
                                  {rowAction === 'keeping' && <span className="font-medium text-foreground-600">已保留现有版本</span>}
                                  {rowAction === 'replaced' && <span className="font-medium text-emerald-700">新版简历已启用，旧版已归档</span>}
                                  {!rowAction && (
                                    <>
                                      <button type="button" className="rounded-md border border-background-300 bg-white px-2 py-1 font-medium text-foreground-700 hover:bg-background-50" onClick={() => keepExistingResumeVersion(result)}>保留现有版本</button>
                                      {canSetAsVersion && (
                                        <button type="button" className="rounded-md bg-primary-500 px-2 py-1 font-medium text-white hover:bg-primary-600" onClick={() => void replaceDuplicateAsCurrentVersion(result)}>设为新版简历</button>
                                      )}
                                    </>
                                  )}
                                  {rowAction === 'replacing' && <span className="inline-flex items-center gap-1 font-medium text-primary-700"><LoaderCircle className="animate-spin" size={12} />正在设为新版</span>}
                                  {rowAction === 'retry_failed' && canSetAsVersion && (
                                    <button type="button" className="font-medium text-red-700 underline" onClick={() => void replaceDuplicateAsCurrentVersion(result)}>重新尝试设为新版</button>
                                  )}
                                </div>
                              </div>
                            )}
                            {needsConfirmation && result.candidate_id && (
                              <button type="button" className="mt-1.5 text-xs font-medium text-primary-700 hover:text-primary-800" onClick={() => openConfirmationCandidateFromUpload(result)}>查看并处理</button>
                            )}
                            {!success && !processing && !duplicate && !needsConfirmation && sourceFile && (
                              <button
                                type="button"
                                disabled={rowAction === 'retrying'}
                                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800 disabled:opacity-50"
                                onClick={() => void retrySingleUploadFile(result)}
                              >
                                {rowAction === 'retrying' && <LoaderCircle className="animate-spin" size={12} />}
                                {rowAction === 'retrying' ? '正在重试' : '重试此文件'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-background-200 bg-background-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                disabled={uploadSubmitting}
                className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadResponse ? '完成' : '取消'}
              </button>
              <button
                type="button"
                onClick={() => void submitUpload()}
                disabled={uploadSubmitting || uploadFiles.length === 0}
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500"
              >
                {uploadSubmitting ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                {uploadSubmitting ? '正在上传' : uploadResponse && uploadFiles.length > 0 ? '重试失败文件' : '上传并入库'}
              </button>
            </div>
      </CandidateUploadModal>
{pushTargets && (
        <PushToReviewerModal
          mode={reassignTask ? 'reassign' : 'create'}
          currentReviewerName={reassignTask?.reviewer_name}
          targets={pushTargets}
          demands={pushDemandOptions}
          reviewers={reviewers}
          initialDemandId={initialPushDemandId}
          initialReviewerId={pushInitialReviewerId}
          demandsLoading={demandsLoading}
          demandError={demandError}
          reviewersLoading={reviewersLoading}
          reviewerError={reviewerError}
          isSubmitting={pushSubmitting}
          results={pushResults}
          onRetryDemands={() => void loadDemands()}
          onRetryReviewers={() => void loadReviewers()}
          onClose={() => { setPushTargets(null); setPushResults([]); setPushInitialReviewerId(null); setReassignTask(null); }}
          onPush={(value) => void handlePushToBusiness(value)}
        />
      )}
{pipelineTargets && (
        <AddToPipelineModal
          candidates={pipelineTargets}
          demands={activeDemands}
          initialDemandId={demandFilter || null}
          demandsLoading={demandsLoading}
          demandError={demandError}
          submitting={pipelineSubmitting}
          result={pipelineResult}
          onRetryDemands={() => void loadDemands()}
          onClose={() => { setPipelineTargets(null); setPipelineResult(null); }}
          onAdd={(demandId, reason, pushAfterAdd) => void handleAddToPipeline(demandId, reason, pushAfterAdd)}
        />
      )}
{transferCandidate && (
        <TransferCandidateModal
          candidate={transferCandidate}
          demands={activeDemands}
          saving={transferSubmitting}
          error={transferError}
          invalidated={transferInvalidated}
          onClose={() => { if (!transferSubmitting) setTransferCandidate(null); }}
          onTransfer={(targetDemandId, reason) => void handleTransferCandidate(targetDemandId, reason)}
        />
      )}
{duplicatesOpen && (
        <DuplicateCandidatesModal
          onClose={() => setDuplicatesOpen(false)}
          onMerged={() => {
            showToast('重复候选人档案已合并');
            void loadCandidates();
          }}
        />
      )}
    </>
  );
}
