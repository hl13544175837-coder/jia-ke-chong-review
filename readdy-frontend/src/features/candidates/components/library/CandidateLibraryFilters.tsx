import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';

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
    ActionButton,
    candidateScopeTabs,
    candidateStageOptions,
    isCandidateStage,
    isParseStatus,
    isPipelineStatus,
    parseStatusMeta,
    stageLabels,
    sourceFilterOptions,
    educationOptions,
    cityOptions,
    businessReviewStatusMeta,
    filterControlClass,
    role,
    navigate,
    requestedCandidateId,
    navState,
    searchQuery,
    demandFilter,
    cityFilter,
    setCityFilter,
    educationFilter,
    setEducationFilter,
    skillFilter,
    setSkillFilter,
    sourceFilter,
    setSourceFilter,
    parseStatusFilter,
    setParseStatusFilter,
    pipelineStatusFilter,
    setPipelineStatusFilter,
    stageFilter,
    setStageFilter,
    scoreFilter,
    setScoreFilter,
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
    submitSearch,
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
<section className="space-y-3">
        <WorkspaceTabs
          items={candidateScopeTabs}
          value={libraryScope}
          onChange={selectLibraryScope}
          ariaLabel="候选人库范围"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
                <span className="sr-only">搜索候选人</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submitSearch();
                    }
                  }}
                  placeholder="搜索姓名、联系方式、公司、学校或简历内容"
                  className="h-10 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <ActionButton type="button" tone="primary" onClick={() => submitSearch()} icon={<Search size={16} aria-hidden="true" />} className="shrink-0">
                搜索
              </ActionButton>
            </div>
            <label className="relative block sm:w-80">
              <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
              <span className="sr-only">按招聘需求筛选</span>
              <select
                value={demandFilter}
                onChange={handleDemandFilterChange}
                disabled={demandsLoading}
                className="h-10 w-full appearance-none rounded-lg border border-background-300 bg-white pl-9 pr-8 text-sm text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-background-50"
              >
                <option value="">{demandsLoading ? '加载需求中' : '全部招聘需求'}</option>
                {demands.map((demand) => (
                  <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <div className="text-sm text-foreground-500">
              共 <span className="font-semibold text-foreground-900">{candidateResponse.total}</span> 位候选人
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground-600">
              <input
                type="checkbox"
                checked={hideLocalDemoRecords}
                onChange={(event) => {
                  setHideLocalDemoRecords(event.target.checked);
                  setSelectedIds(new Set());
                }}
                className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200"
              />
              隐藏本地演示数据{localDemoRecordCount > 0 ? `（当前页 ${localDemoRecordCount} 条）` : ''}
            </label>
            <p className="text-[11px] text-foreground-400">仅筛选当前页已加载结果，不会删除数据</p>
          </div>
        </div>

        <div className="grid gap-2 border-y border-background-200 bg-background-50 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">意向城市</span>
            <input
              list="candidate-city-options"
              value={cityFilter}
              onChange={(event) => changeFilter(() => setCityFilter(event.target.value))}
              placeholder="全部城市或输入城市"
              className={filterControlClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">学历</span>
            <select value={educationFilter} onChange={(event) => changeFilter(() => setEducationFilter(event.target.value))} className={filterControlClass}>
              <option value="">全部学历</option>
              {educationOptions.map((education) => <option key={education} value={education}>{education}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">技能关键词</span>
            <input value={skillFilter} onChange={(event) => changeFilter(() => setSkillFilter(event.target.value))} placeholder="如 Java、Python" className={filterControlClass} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">来源渠道</span>
            <input
              list="candidate-source-options"
              value={sourceFilter}
              onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))}
              placeholder="全部来源或输入渠道"
              className={filterControlClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">解析状态</span>
            <select
              value={parseStatusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === '' || isParseStatus(nextStatus)) changeFilter(() => setParseStatusFilter(nextStatus));
              }}
              className={filterControlClass}
            >
              <option value="">全部状态</option>
              {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">流程状态</span>
            <select
              value={pipelineStatusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === '' || isPipelineStatus(nextStatus)) changeFilter(() => setPipelineStatusFilter(nextStatus));
              }}
              className={filterControlClass}
            >
              <option value="">全部流程状态</option>
              <option value="not_in_pipeline">未进入流程</option>
              <option value="in_pipeline">已进入流程</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">招聘阶段</span>
            <select
              value={stageFilter}
              onChange={(event) => {
                const nextStage = event.target.value;
                if (nextStage === '' || isCandidateStage(nextStage)) changeFilter(() => setStageFilter(nextStage));
              }}
              className={filterControlClass}
            >
              <option value="">全部阶段</option>
              {candidateStageOptions.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">最低技能分</span>
            <select value={scoreFilter} onChange={(event) => changeFilter(() => setScoreFilter(event.target.value))} className={filterControlClass}>
              <option value="0">全部分数</option>
              <option value="3">3 分及以上</option>
              <option value="4">4 分及以上</option>
              <option value="5">5 分</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">排序方式</span>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(event) => {
                const [nextSortBy, nextSortOrder] = event.target.value.split(':');
                if (
                  (nextSortBy === 'created_at' || nextSortBy === 'name_masked')
                  && (nextSortOrder === 'asc' || nextSortOrder === 'desc')
                ) {
                  changeFilter(() => {
                    setSortBy(nextSortBy);
                    setSortOrder(nextSortOrder);
                  });
                }
              }}
              className={filterControlClass}
            >
              <option value="created_at:desc">最近入库</option>
              <option value="created_at:asc">最早入库</option>
              <option value="name_masked:asc">候选人名称升序</option>
              <option value="name_masked:desc">候选人名称降序</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetCandidateFilters}
              disabled={!hasActiveFilters}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-600 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" />
              重置筛选
            </button>
          </div>
          <datalist id="candidate-city-options">
            {cityOptions.map((city) => <option key={city} value={city} />)}
          </datalist>
          <datalist id="candidate-source-options">
            {sourceFilterOptions.map((source) => <option key={source} value={source} />)}
          </datalist>
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
