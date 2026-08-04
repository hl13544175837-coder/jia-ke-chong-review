import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';
import CandidateLibraryBulkActions from '@/features/candidates/components/library/CandidateLibraryBulkActions';
import CandidateLibraryPagination from '@/features/candidates/components/library/CandidateLibraryPagination';

interface CandidateLibraryTableProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryTable({ controller }: CandidateLibraryTableProps) {
  const {
    AlertCircle,
    Eye,
    Inbox,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    Star,
    candidateResumeReady,
    candidateStageOptions,
    formatDate,
    isCandidateStage,
    isParseStatus,
    isPipelineStatus,
    parseStatusMeta,
    stageLabels,
    educationOptions,
    filterControlClass,
    CandidateColumnFilterHeader,
    searchQuery,
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
    openColumnFilter,
    page,
    setPage,
    candidateResponse,
    candidatesLoading,
    candidatesError,
    hideLocalDemoRecords,
    setHideLocalDemoRecords,
    selectedIds,
    setSelectedIds,
    favoriteSaving,
    visibleCandidates,
    loadCandidates,
    handleSearchChange,
    changeFilter,
    resetCandidateFilters,
    hasActiveFilters,
    toggleColumnFilter,
    toggleCandidate,
    toggleAllVisible,
    openCandidateDetail,
    updateFavorites,
    allVisibleSelected,
    renderCandidateBusinessAction,
  } = controller;

  return (
    <>
      <CandidateLibraryBulkActions controller={controller} />
<section className="overflow-hidden border-y border-background-200 bg-white">
        {candidatesLoading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-foreground-500">
            <LoaderCircle className="animate-spin text-primary-500" size={24} aria-hidden="true" />
            <p className="text-sm">加载候选人中</p>
          </div>
        ) : candidatesError ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-900">候选人加载失败</p>
            <p className="mt-1 max-w-lg text-sm text-foreground-500">{candidatesError}</p>
            <button
              type="button"
              onClick={() => void loadCandidates()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50"
            >
              <RefreshCw size={15} aria-hidden="true" />
              重试
            </button>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Inbox className="text-foreground-300" size={32} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-900">
              {hideLocalDemoRecords && candidateResponse.candidates.length > 0
                ? '当前筛选条件下没有候选人'
                : '暂无候选人'}
            </p>
            <p className="mt-1 text-sm text-foreground-500">
              {hideLocalDemoRecords && candidateResponse.candidates.length > 0
                ? '当前页只包含已标记的本地演示数据，数据仍完整保留'
                : hasActiveFilters
                  ? '当前筛选条件下没有匹配结果'
                  : '导入简历建立公司人才库，再按岗位筛选并加入招聘流程'}
            </p>
            {hideLocalDemoRecords && candidateResponse.candidates.length > 0 ? (
              <button
                type="button"
                onClick={() => setHideLocalDemoRecords(false)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50"
              >
                显示全部数据
              </button>
            ) : hasActiveFilters && (
              <button type="button" onClick={resetCandidateFilters} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50">
                <RotateCcw size={14} aria-hidden="true" />
                重置筛选
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1460px] border-collapse text-left">
              <thead className="bg-background-50 text-xs font-medium text-foreground-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="选择当前页所有候选人"
                      className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200"
                    />
                  </th>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-identity"
                    label="候选人"
                    open={openColumnFilter === 'identity'}
                    onToggle={() => toggleColumnFilter('identity')}
                  >
                    <input
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="姓名、联系方式或经历"
                      aria-label="按候选人信息筛选"
                      className={filterControlClass}
                    />
                    <select
                      value={sortBy === 'name_masked' ? sortOrder : ''}
                      onChange={(event) => {
                        const nextOrder = event.target.value;
                        if (nextOrder === 'asc' || nextOrder === 'desc') {
                          changeFilter(() => {
                            setSortBy('name_masked');
                            setSortOrder(nextOrder);
                          });
                        }
                      }}
                      aria-label="按候选人名称排序"
                      className={filterControlClass}
                    >
                      <option value="">默认排序</option>
                      <option value="asc">名称升序</option>
                      <option value="desc">名称降序</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-parse"
                    label="解析状态"
                    open={openColumnFilter === 'parse'}
                    onToggle={() => toggleColumnFilter('parse')}
                  >
                    <select
                      value={parseStatusFilter}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === '' || isParseStatus(nextStatus)) changeFilter(() => setParseStatusFilter(nextStatus));
                      }}
                      aria-label="按解析状态筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部解析状态</option>
                      {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-profile"
                    label="学历 / 城市"
                    open={openColumnFilter === 'profile'}
                    onToggle={() => toggleColumnFilter('profile')}
                  >
                    <select value={educationFilter} onChange={(event) => changeFilter(() => setEducationFilter(event.target.value))} aria-label="按学历筛选" className={filterControlClass}>
                      <option value="">全部学历</option>
                      {educationOptions.map((education) => <option key={education} value={education}>{education}</option>)}
                    </select>
                    <input
                      list="candidate-city-options"
                      value={cityFilter}
                      onChange={(event) => changeFilter(() => setCityFilter(event.target.value))}
                      placeholder="输入意向城市"
                      aria-label="按意向城市筛选"
                      className={filterControlClass}
                    />
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-skills"
                    label="核心技能"
                    open={openColumnFilter === 'skills'}
                    onToggle={() => toggleColumnFilter('skills')}
                  >
                    <input value={skillFilter} onChange={(event) => changeFilter(() => setSkillFilter(event.target.value))} placeholder="技能关键词" aria-label="按技能关键词筛选" className={filterControlClass} />
                    <select value={scoreFilter} onChange={(event) => changeFilter(() => setScoreFilter(event.target.value))} aria-label="按最低技能分筛选" className={filterControlClass}>
                      <option value="0">全部分数</option>
                      <option value="3">3 分及以上</option>
                      <option value="4">4 分及以上</option>
                      <option value="5">5 分</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-source"
                    label="来源"
                    open={openColumnFilter === 'source'}
                    onToggle={() => toggleColumnFilter('source')}
                  >
                    <input
                      list="candidate-source-options"
                      value={sourceFilter}
                      onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))}
                      placeholder="输入来源渠道"
                      aria-label="按来源渠道筛选"
                      className={filterControlClass}
                    />
                  </CandidateColumnFilterHeader>
                  <th className="min-w-48 px-3 py-3">目标岗位 / 当前需求</th>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-stage"
                    label="当前阶段"
                    open={openColumnFilter === 'stage'}
                    onToggle={() => toggleColumnFilter('stage')}
                  >
                    <select
                      value={stageFilter}
                      onChange={(event) => {
                        const nextStage = event.target.value;
                        if (nextStage === '' || isCandidateStage(nextStage)) changeFilter(() => setStageFilter(nextStage));
                      }}
                      aria-label="按招聘阶段筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部阶段</option>
                      {candidateStageOptions.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
                    </select>
                    <select
                      value={pipelineStatusFilter}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === '' || isPipelineStatus(nextStatus)) changeFilter(() => setPipelineStatusFilter(nextStatus));
                      }}
                      aria-label="按流程状态筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部流程状态</option>
                      <option value="not_in_pipeline">未进入流程</option>
                      <option value="in_pipeline">已进入流程</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-created"
                    label="入库日期"
                    open={openColumnFilter === 'created'}
                    onToggle={() => toggleColumnFilter('created')}
                  >
                    <select
                      value={sortBy === 'created_at' ? sortOrder : ''}
                      onChange={(event) => {
                        const nextOrder = event.target.value;
                        if (nextOrder === 'asc' || nextOrder === 'desc') {
                          changeFilter(() => {
                            setSortBy('created_at');
                            setSortOrder(nextOrder);
                          });
                        }
                      }}
                      aria-label="按入库日期排序"
                      className={filterControlClass}
                    >
                      <option value="">默认排序</option>
                      <option value="desc">最近入库</option>
                      <option value="asc">最早入库</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <th className="w-32 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {visibleCandidates.map((candidate) => {
                  const status = parseStatusMeta[candidate.parse_status];
                  const targetDemand = candidate.current_demand ?? candidate.latest_demand;
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => openCandidateDetail(candidate)}
                      className="cursor-pointer transition-colors hover:bg-background-50"
                    >
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.id)}
                          onChange={() => toggleCandidate(candidate.id)}
                          disabled={!candidateResumeReady(candidate)}
                          aria-label={`选择 ${candidate.name_masked}`}
                          className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
                            {candidate.name_masked.slice(0, 1) || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground-900">{candidate.name_masked}</p>
                            <p className="mt-0.5 truncate text-xs text-foreground-400">
                              {candidate.phone_masked || candidate.email_masked || '暂无联系方式'}
                            </p>
                            {(candidate.identical_resume_count > 1 || candidate.same_name_count > 1 || candidate.is_local_demo_record) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {candidate.identical_resume_count > 1 && (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                                    相同文件 {candidate.identical_resume_count} 条
                                  </span>
                                )}
                                {candidate.same_name_count > 1 && (
                                  <span className="rounded bg-background-100 px-1.5 py-0.5 text-[11px] font-medium text-foreground-600">
                                    同名 {candidate.same_name_count} 条
                                  </span>
                                )}
                                {candidate.is_local_demo_record && (
                                  <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">本地演示</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="max-w-64 px-3 py-3.5 text-sm text-foreground-600">
                        <span className="line-clamp-2">{candidate.education_summary || '—'}</span>
                        {candidate.intent_city && <span className="mt-1 block text-xs text-foreground-400">意向 {candidate.intent_city}</span>}
                      </td>
                      <td className="max-w-64 px-3 py-3.5">
                        {candidate.top_tags?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {candidate.top_tags.slice(0, 3).map((tag) => (
                              <span key={tag.tag} className="inline-flex rounded-md bg-primary-50 px-2 py-1 text-xs text-primary-700">
                                {tag.tag}{tag.score ? ` · ${tag.score}分` : ''}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-sm text-foreground-400">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-600">
                        {candidate.source?.channel || '—'}
                      </td>
                      <td className="max-w-56 px-3 py-3.5">
                        {candidate.desired_position || targetDemand ? (
                          <div>
                            <p className="truncate text-sm font-medium text-foreground-800">{candidate.desired_position || '求职目标待补充'}</p>
                            {targetDemand && <p className="mt-0.5 truncate text-xs text-foreground-400">
                              {candidate.current_demand ? '当前需求' : '最近需求'} · {targetDemand.job_title} · {targetDemand.request_no || '未编号'}
                            </p>}
                          </div>
                        ) : <span className="text-sm text-foreground-400">求职目标待补充</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-600">
                        {candidate.current_stage ? stageLabels[candidate.current_stage] : '—'}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-500">{formatDate(candidate.created_at)}</td>
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void updateFavorites([candidate], !candidate.is_favorite)}
                            disabled={favoriteSaving}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${candidate.is_favorite ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'text-foreground-400 hover:bg-background-100 hover:text-amber-600'}`}
                            aria-label={`${candidate.is_favorite ? '取消收藏' : '收藏'} ${candidate.name_masked}`}
                            title={candidate.is_favorite ? '取消收藏' : '收藏'}
                          >
                            <Star size={16} fill={candidate.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openCandidateDetail(candidate)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
                            aria-label={`查看 ${candidate.name_masked} 简历`}
                            title="查看简历"
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          {renderCandidateBusinessAction(candidate, true)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <CandidateLibraryPagination controller={controller} />
    </>
  );
}
