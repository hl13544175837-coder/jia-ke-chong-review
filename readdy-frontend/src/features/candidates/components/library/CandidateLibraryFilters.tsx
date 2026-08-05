import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';
import { FILTER_CONTROL_CLASS, FILTER_GRID_CLASS } from '@/components/ui/FilterBar';

interface CandidateLibraryFiltersProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryFilters({ controller }: CandidateLibraryFiltersProps) {
  const {
    ArrowLeft,
    BriefcaseBusiness,
    GitMerge,
    RefreshCw,
    RotateCcw,
    Search,
    Upload,
    PageHeader,
    WorkspaceTabs,
    candidateScopeTabs,
    isParseStatus,
    parseStatusMeta,
    sourceFilterOptions,
    businessReviewStatusMeta,
    role,
    navigate,
    requestedCandidateId,
    navState,
    searchQuery,
    demandFilter,
    sourceFilter,
    setSourceFilter,
    parseStatusFilter,
    setParseStatusFilter,
    createdFrom,
    setCreatedFrom,
    createdTo,
    setCreatedTo,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    candidateResponse,
    candidatesLoading,
    hideLocalDemoRecords,
    setHideLocalDemoRecords,
    demands,
    demandsLoading,
    demandError,
    reviewTasksError,
    setSelectedIds,
    setDuplicatesOpen,
    localDemoRecordCount,
    loadCandidates,
    loadDemands,
    loadReviewTasks,
    handleSearchChange,
    handleDemandFilterChange,
    changeFilter,
    resetCandidateFilters,
    hasActiveFilters,
    openUploadDialog,
    visibleReviewResults,
    renderReviewAction,
    selectLibraryScope,
    libraryScope,
  } = controller;

  return (
    <>
<PageHeader
        className="border-b border-background-200 pb-4"
        title={navState?.jobTitle ? '当前需求候选人' : '简历库'}
        visuallyHiddenTitle={!navState?.jobTitle}
        description={navState?.jobTitle ? `${navState.jobTitle} · 已自动带入需求和阶段条件` : '候选人与业务筛选'}
        leading={(navState?.fromJobs || navState?.fromDashboard) ? (
          <button
            type="button"
            onClick={() => navigate(navState.fromDashboard ? '/dashboard' : '/jobs')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-background-200 bg-white text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
            aria-label={navState.fromDashboard ? '返回工作台' : '返回招聘需求'}
            title={navState.fromDashboard ? '返回工作台' : '返回招聘需求'}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        ) : undefined}
        actions={(
          <>
          <button
            type="button"
            onClick={() => void loadCandidates()}
            disabled={candidatesLoading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 transition-colors hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="刷新候选人"
            title="刷新"
          >
            <RefreshCw className={candidatesLoading ? 'animate-spin' : ''} size={16} aria-hidden="true" />
          </button>
          {(role === 'manager' || role === 'admin') && (
            <button
              type="button"
              onClick={() => setDuplicatesOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-50"
            >
              <GitMerge size={16} aria-hidden="true" />
              查重合并
            </button>
          )}
          <button
            type="button"
            onClick={openUploadDialog}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            <Upload size={16} aria-hidden="true" />
            导入简历
          </button>
          </>
        )}
      />
{(visibleReviewResults.length > 0 || (requestedCandidateId && reviewTasksError)) && (
        <section className="rounded-lg border border-primary-200 bg-primary-50/40 px-4 py-4" aria-label="待处理的业务筛选反馈">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">待处理的业务筛选反馈</h2>
              <p className="mt-0.5 text-xs text-foreground-500">这里只显示等待招聘专员继续推进的结果；已进入后续流程的结果可在候选人详情中查看</p>
            </div>
            <button type="button" onClick={() => void loadReviewTasks()} className="text-xs font-medium text-primary-700 hover:text-primary-800">
              刷新待办
            </button>
          </div>
          {reviewTasksError ? (
            <p className="mt-3 text-sm text-red-700">{reviewTasksError}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleReviewResults.map((task) => {
                const meta = businessReviewStatusMeta[task.status];
                return (
                  <article key={task.id} className="flex flex-col gap-3 rounded-lg border border-background-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground-900">{task.candidate.name_masked}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground-500">{task.demand.job_title} · 业务负责人：{task.reviewer_name || '未显示'}</p>
                      {task.business_note && <p className="mt-1 text-xs text-foreground-700">业务备注：{task.business_note}</p>}
                    </div>
                    <div className="shrink-0">{renderReviewAction(task)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
<section className="space-y-2">
        <div aria-label="候选人补充筛选" className={`${FILTER_GRID_CLASS} rounded-xl border border-background-200 bg-background-50 p-3`}>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">精确搜索</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
              <input type="search" value={searchQuery} onChange={handleSearchChange} placeholder="姓名、联系方式、公司或学校" className={`${FILTER_CONTROL_CLASS} pl-9`} />
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">招聘需求</span>
            <span className="relative block">
              <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
              <select value={demandFilter} onChange={handleDemandFilterChange} disabled={demandsLoading} className={`${FILTER_CONTROL_CLASS} appearance-none pl-9 pr-8 disabled:cursor-not-allowed disabled:bg-background-50`}>
                <option value="">{demandsLoading ? '加载需求中' : '全部招聘需求'}</option>
                {demands.map((demand) => <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title}</option>)}
              </select>
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">入库开始日期</span>
            <input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => changeFilter(() => setCreatedFrom(event.target.value))} className={FILTER_CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">入库结束日期</span>
            <input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => changeFilter(() => setCreatedTo(event.target.value))} className={FILTER_CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">来源渠道</span>
            <input list="candidate-source-options" value={sourceFilter} onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))} placeholder="全部来源或输入渠道" className={FILTER_CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">解析状态</span>
            <select value={parseStatusFilter} onChange={(event) => { const next = event.target.value; if (next === '' || isParseStatus(next)) changeFilter(() => setParseStatusFilter(next)); }} className={FILTER_CONTROL_CLASS}>
              <option value="">全部状态</option>
              {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">排序方式</span>
            <select value={`${sortBy}:${sortOrder}`} onChange={(event) => { const [nextSortBy, nextSortOrder] = event.target.value.split(':'); if ((nextSortBy === 'created_at' || nextSortBy === 'name_masked') && (nextSortOrder === 'asc' || nextSortOrder === 'desc')) changeFilter(() => { setSortBy(nextSortBy); setSortOrder(nextSortOrder); }); }} className={FILTER_CONTROL_CLASS}>
              <option value="created_at:desc">最近入库</option>
              <option value="created_at:asc">最早入库</option>
              <option value="name_masked:asc">候选人名称升序</option>
              <option value="name_masked:desc">候选人名称降序</option>
            </select>
          </label>
          <datalist id="candidate-source-options">{sourceFilterOptions.map((source) => <option key={source} value={source} />)}</datalist>
        </div>
        <WorkspaceTabs items={candidateScopeTabs} value={libraryScope} onChange={selectLibraryScope} ariaLabel="候选人库范围" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-500">
          <div className="flex flex-wrap items-center gap-3">
            <span>共 <strong className="text-foreground-900">{candidateResponse.total}</strong> 位候选人</span>
            <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-foreground-600">
              <input type="checkbox" checked={hideLocalDemoRecords} onChange={(event) => { setHideLocalDemoRecords(event.target.checked); setSelectedIds(new Set()); }} className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200" />
              隐藏本地演示数据{localDemoRecordCount > 0 ? `（当前页 ${localDemoRecordCount} 条）` : ''}
            </label>
            <span className="text-[11px] text-foreground-400">仅筛选当前页已加载结果，不会删除数据</span>
          </div>
          <button type="button" onClick={resetCandidateFilters} disabled={!hasActiveFilters} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 font-medium text-foreground-600 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcw size={14} aria-hidden="true" />重置筛选
          </button>
        </div>
      </section>
{demandError && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{demandError}，需求筛选与上传目标暂不可用。</span>
          <button type="button" onClick={() => void loadDemands()} className="inline-flex items-center gap-1 font-medium hover:text-amber-900">
            <RefreshCw size={14} aria-hidden="true" />
            重试
          </button>
        </div>
      )}
    </>
  );
}
