import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';

interface CandidateLibraryDetailProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryDetail({ controller }: CandidateLibraryDetailProps) {
  const {
    AlertCircle,
    Download,
    Eye,
    LoaderCircle,
    RefreshCw,
    X,
    StructuredResumeView,
    CandidateJourneySummary,
    ActionButton,
    DetailActionBar,
    CandidateDetailWorkspace,
    CandidateDetailDrawer,
    ResumeRecoveryPanel,
    formatDate,
    parseStatusMeta,
    businessReviewStatusMeta,
    role,
    requestedDemandId,
    detailCandidate,
    setDetailCandidate,
    detailTab,
    setDetailTab,
    resumeDetail,
    setResumeDetail,
    candidateJourney,
    journeyError,
    detailLoading,
    detailError,
    resumePreviewUrl,
    originalResumeLoading,
    originalResumeError,
    loadCandidates,
    loadCandidateDetail,
    detailReview,
    closeCandidateDetail,
    previewOriginalResume,
    downloadOriginalResume,
    renderReviewAction,
    renderCandidateBusinessAction,
  } = controller;

  return (
    <>
{detailCandidate && (
        <CandidateDetailDrawer onClose={closeCandidateDetail}>
            <div className="flex items-start justify-between border-b border-background-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="candidate-detail-title" className="truncate text-lg font-bold text-foreground-900">{detailCandidate.name_masked}</h2>
                <p className="mt-1 text-xs text-foreground-500">{detailCandidate.is_favorite ? '已收藏' : '公司候选人档案'} · 入库于 {formatDate(detailCandidate.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={closeCandidateDetail}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700"
                aria-label="关闭简历详情"
                title="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <CandidateDetailWorkspace value={detailTab} onChange={setDetailTab} className="flex min-h-0 flex-1 flex-col">

            <div data-testid="candidate-detail-scroll-panel" className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {detailLoading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-foreground-500">
                  <LoaderCircle className="animate-spin text-primary-500" size={24} aria-hidden="true" />
                  <p className="text-sm">加载简历详情中</p>
                </div>
              ) : detailError ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-foreground-900">简历详情加载失败</p>
                  <p className="mt-1 text-sm text-foreground-500">{detailError}</p>
                  <button
                    type="button"
                    onClick={() => void loadCandidateDetail(detailCandidate.id, detailCandidate.current_demand_id ?? detailCandidate.latest_demand_id ?? requestedDemandId)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50"
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    重试
                  </button>
                </div>
              ) : resumeDetail ? (
                <div className="space-y-6">
                  <div className={detailTab === 'interview' ? 'space-y-6' : 'hidden'} role="tabpanel" aria-label="面试信息">
                  {(detailCandidate.desired_position || detailCandidate.current_demand || detailCandidate.latest_demand) && (
                    <section className="rounded-lg border border-background-200 bg-background-50 px-4 py-3">
                      <p className="text-xs text-foreground-400">简历求职目标</p>
                      <p className="mt-1 text-sm font-semibold text-foreground-900">
                        {detailCandidate.desired_position || '待补充'}
                      </p>
                      {(detailCandidate.current_demand ?? detailCandidate.latest_demand) && <p className="mt-1 text-xs text-foreground-500">
                        {detailCandidate.current_demand ? '当前需求' : '最近需求'} · {(detailCandidate.current_demand ?? detailCandidate.latest_demand)?.job_title} · {(detailCandidate.current_demand ?? detailCandidate.latest_demand)?.request_no || '未编号'}
                      </p>}
                    </section>
                  )}
                  {detailReview && (
                    <section className="rounded-lg border border-primary-200 bg-primary-50/40 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground-900">业务筛选结果</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${businessReviewStatusMeta[detailReview.status].className}`}>
                              {businessReviewStatusMeta[detailReview.status].label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-foreground-500">
                            {detailReview.demand.job_title} · 业务负责人：{detailReview.reviewer_name || '未显示'}
                          </p>
                          {detailReview.business_note && (
                            <p className="mt-2 text-sm text-foreground-700">业务备注：{detailReview.business_note}</p>
                          )}
                        </div>
                        <div className="shrink-0">{renderReviewAction(detailReview)}</div>
                      </div>
                    </section>
                  )}

                  </div>

                  <div className={detailTab === 'feedback' ? 'space-y-6' : 'hidden'} role="tabpanel" aria-label="面试评价">
                  {candidateJourney && <CandidateJourneySummary journey={candidateJourney} />}
                  {journeyError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{journeyError}</div>
                  )}
                  {!candidateJourney && !journeyError && (
                    <div className="rounded-lg bg-background-50 px-4 py-8 text-center text-sm text-foreground-500">当前候选人暂无历史面试评价和操作记录</div>
                  )}
                  </div>

                  <div className={detailTab === 'resume' ? 'space-y-6' : 'hidden'} role="tabpanel" aria-label="候选人简历">
                  <ResumeRecoveryPanel
                    detail={resumeDetail}
                    onUpdated={(updated) => {
                      setResumeDetail(updated);
                      setDetailCandidate((current) => current ? {
                        ...current,
                        name_masked: updated.name_masked,
                        parse_status: updated.parse_status,
                        parse_error: updated.parse_error,
                      } : current);
                      void loadCandidates();
                    }}
                  />

                  <section className="grid grid-cols-2 gap-3 border-b border-background-200 pb-5 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-foreground-400">解析状态</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{parseStatusMeta[resumeDetail.parse_status].label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">HR 负责人</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{resumeDetail.owner_hr_id ? '已分配' : '待分配'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">标签数</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{resumeDetail.tags.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">入库日期</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{formatDate(resumeDetail.created_at)}</p>
                    </div>
                  </section>

                  {resumeDetail.parse_error && !['failed', 'original_confirmed'].includes(resumeDetail.parse_status) && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{resumeDetail.parse_error}</span>
                    </div>
                  )}

                  <section>
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground-900">原版简历</h3>
                        <p className="mt-0.5 text-xs text-foreground-400">{resumeDetail.original_resume.filename || '未返回文件名'}</p>
                      </div>
                      {resumeDetail.original_resume.available && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void previewOriginalResume()}
                            disabled={originalResumeLoading !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {originalResumeLoading === 'preview' ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                            预览
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadOriginalResume()}
                            disabled={originalResumeLoading !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {originalResumeLoading === 'download' ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                            下载
                          </button>
                        </div>
                      )}
                    </div>
                    {!resumeDetail.original_resume.available ? (
                      <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-4 text-sm text-foreground-500">暂无可用的原版简历</div>
                    ) : originalResumeError ? (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                        <span>{originalResumeError}</span>
                      </div>
                    ) : null}
                    {resumePreviewUrl && (
                      <iframe
                        src={resumePreviewUrl}
                        title={`${resumeDetail.name_masked} 原版简历预览`}
                        className="mt-3 h-[520px] w-full rounded-lg border border-background-200 bg-background-50"
                      />
                    )}
                  </section>

                  {resumeDetail.tags.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-semibold text-foreground-900">解析标签</h3>
                      <div className="flex flex-wrap gap-2">
                        {resumeDetail.tags.map((tag) => (
                          <span key={tag.tag} className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                            {tag.tag} · {tag.score}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-foreground-900">结构化简历</h3>
                    <StructuredResumeView resume={resumeDetail.resume_json} />
                  </section>
                  </div>
                </div>
              ) : null}
            </div>
            </CandidateDetailWorkspace>

            <DetailActionBar status={<span className="text-xs text-foreground-500">当前档案 · {detailCandidate.is_favorite ? '已收藏' : '公司人才库'}</span>}>
              <ActionButton tone="secondary" onClick={closeCandidateDetail}>关闭</ActionButton>
              {renderCandidateBusinessAction(detailCandidate)}
            </DetailActionBar>
        </CandidateDetailDrawer>
      )}
    </>
  );
}
