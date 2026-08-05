import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';
import CandidateLibraryBulkActions from '@/features/candidates/components/library/CandidateLibraryBulkActions';
import CandidateLibraryPagination from '@/features/candidates/components/library/CandidateLibraryPagination';
import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';

interface CandidateLibraryTableProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryTable({ controller }: CandidateLibraryTableProps) {
  const {
    AlertCircle,
    Inbox,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    activeCandidateStageOptions,
    candidateResumeReady,
    formatDate,
    isCandidateStage,
    isPipelineStateFilter,
    parseStatusMeta,
    pipelineStateMeta,
    stageLabels,
    educationOptions,
    cityOptions,
    filterControlClass,
    CandidateColumnFilterHeader,
    cityFilter,
    setCityFilter,
    educationFilter,
    setEducationFilter,
    parseStatusFilter,
    setParseStatusFilter,
    pipelineStateFilter,
    setPipelineStateFilter,
    stageFilter,
    setStageFilter,
    libraryScope,
    setLibraryScope,
    openColumnFilter,
    candidateResponse,
    candidatesLoading,
    candidatesError,
    hideLocalDemoRecords,
    setHideLocalDemoRecords,
    selectedIds,
    favoriteSaving,
    visibleCandidates,
    loadCandidates,
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

  const applyPipelineState = (value: typeof pipelineStateFilter) => {
    changeFilter(() => {
      if (value && libraryScope === 'in_pipeline') setLibraryScope('all');
      if ((value === 'onboarded' || value === 'transferred') && libraryScope === 'talent_pool') setLibraryScope('all');
      setPipelineStateFilter(value);
    });
  };

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
            <button type="button" onClick={() => void loadCandidates()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50">
              <RefreshCw size={15} aria-hidden="true" />重试
            </button>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Inbox className="text-foreground-300" size={32} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-900">
              {hideLocalDemoRecords && candidateResponse.candidates.length > 0 ? '当前筛选条件下没有候选人' : '暂无候选人'}
            </p>
            <p className="mt-1 text-sm text-foreground-500">
              {hideLocalDemoRecords && candidateResponse.candidates.length > 0
                ? '当前页只包含已标记的本地演示数据，数据仍完整保留'
                : hasActiveFilters ? '当前筛选条件下没有匹配结果' : '导入简历建立公司人才库，再按岗位筛选并加入招聘流程'}
            </p>
            {hideLocalDemoRecords && candidateResponse.candidates.length > 0 ? (
              <button type="button" onClick={() => setHideLocalDemoRecords(false)} className="mt-4 rounded-lg border border-background-300 px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50">显示全部数据</button>
            ) : hasActiveFilters && (
              <button type="button" onClick={resetCandidateFilters} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50">
                <RotateCcw size={14} aria-hidden="true" />重置筛选
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-collapse text-left">
              <thead className="bg-background-50 text-xs font-medium text-foreground-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="选择当前页所有候选人" className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200" />
                  </th>
                  <th className="min-w-52 px-3 py-3">候选人</th>
                  <CandidateColumnFilterHeader data-ui="candidate-column-filter-pipeline" label="流程状态" open={openColumnFilter === 'pipeline'} onToggle={() => toggleColumnFilter('pipeline')}>
                    <select value={pipelineStateFilter} onChange={(event) => { const next = event.target.value; if (next === '' || isPipelineStateFilter(next)) applyPipelineState(next); }} aria-label="按精确流程状态筛选" className={filterControlClass}>
                      <option value="">全部精确状态</option>
                      <option value="never_entered">未进入流程</option>
                      <option value="rejected">已淘汰</option>
                      <option value="onboarded">已入职</option>
                      <option value="transferred">已转出</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader data-ui="candidate-column-filter-education" label="学历" open={openColumnFilter === 'education'} onToggle={() => toggleColumnFilter('education')}>
                    <select value={educationFilter} onChange={(event) => changeFilter(() => setEducationFilter(event.target.value))} aria-label="按学历筛选" className={filterControlClass}>
                      <option value="">全部学历</option>
                      {educationOptions.map((education) => <option key={education} value={education}>{education}</option>)}
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader data-ui="candidate-column-filter-city" label="意向城市" open={openColumnFilter === 'city'} onToggle={() => toggleColumnFilter('city')}>
                    <input list="candidate-city-options" value={cityFilter} onChange={(event) => changeFilter(() => setCityFilter(event.target.value))} placeholder="输入意向城市" aria-label="按意向城市筛选" className={filterControlClass} />
                  </CandidateColumnFilterHeader>
                  <th className="min-w-52 px-3 py-3">目标岗位 / 当前需求</th>
                  <CandidateColumnFilterHeader data-ui="candidate-column-filter-stage" label="当前阶段" open={openColumnFilter === 'stage'} onToggle={() => toggleColumnFilter('stage')}>
                    <select value={stageFilter} onChange={(event) => { const next = event.target.value; if (next === '' || isCandidateStage(next)) changeFilter(() => setStageFilter(next)); }} aria-label="按当前招聘阶段筛选" className={filterControlClass}>
                      <option value="">全部活动阶段</option>
                      {activeCandidateStageOptions.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
                    </select>
                  </CandidateColumnFilterHeader>
                  <th className="min-w-28 px-3 py-3">入库日期</th>
                  <th className="w-32 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {visibleCandidates.map((candidate) => {
                  const targetDemand = candidate.current_demand ?? candidate.latest_demand;
                  const pipeline = pipelineStateMeta[candidate.pipeline_state];
                  const educationValue = educationOptions.find((value) => candidate.education_summary?.includes(value)) || candidate.education_summary || '';
                  const menuItems: RowActionItem[] = [
                    {
                      key: 'resume',
                      label: '查看候选人简历',
                      icon: <i className="ri-file-user-line" />,
                      onSelect: () => openCandidateDetail(candidate, 'resume'),
                    },
                    {
                      key: 'process',
                      label: '查看面试信息',
                      icon: <i className="ri-calendar-event-line" />,
                      onSelect: () => openCandidateDetail(candidate, 'interview'),
                    },
                    {
                      key: 'journey',
                      label: '查看流程记录',
                      icon: <i className="ri-history-line" />,
                      onSelect: () => openCandidateDetail(candidate, 'feedback'),
                    },
                    {
                      key: 'favorite',
                      label: candidate.is_favorite ? '取消收藏' : '收藏',
                      icon: <i className={candidate.is_favorite ? 'ri-star-fill' : 'ri-star-line'} />,
                      dividerBefore: true,
                      disabled: favoriteSaving,
                      onSelect: () => void updateFavorites([candidate], !candidate.is_favorite),
                    },
                  ];
                  return (
                    <tr key={candidate.id} onClick={() => openCandidateDetail(candidate)} className="cursor-pointer transition-colors hover:bg-background-50">
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(candidate.id)} onChange={() => toggleCandidate(candidate.id)} disabled={!candidateResumeReady(candidate)} aria-label={`选择 ${candidate.name_masked}`} className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40" />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">{candidate.name_masked.slice(0, 1) || '?'}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-foreground-900">{candidate.name_masked}</p>
                              <button type="button" onClick={(event) => { event.stopPropagation(); changeFilter(() => setParseStatusFilter(candidate.parse_status)); }} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${parseStatusMeta[candidate.parse_status].className}`} aria-label={`筛选${parseStatusMeta[candidate.parse_status].label}候选人`}>{parseStatusMeta[candidate.parse_status].label}</button>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-foreground-400">{candidate.phone_masked || candidate.email_masked || '暂无联系方式'}</p>
                            {(candidate.identical_resume_count > 1 || candidate.same_name_count > 1 || candidate.is_local_demo_record) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {candidate.identical_resume_count > 1 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">相同文件 {candidate.identical_resume_count} 条</span>}
                                {candidate.same_name_count > 1 && <span className="rounded bg-background-100 px-1.5 py-0.5 text-[11px] font-medium text-foreground-600">同名 {candidate.same_name_count} 条</span>}
                                {candidate.is_local_demo_record && <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">本地演示</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => candidate.pipeline_state === 'in_pipeline' ? controller.selectLibraryScope('in_pipeline') : applyPipelineState(candidate.pipeline_state)} className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium hover:underline ${pipeline.className}`}>{pipeline.label}</button>
                        {candidate.pipeline_state === 'in_pipeline' && candidate.has_rejected_history && <span className="ml-1.5 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">曾淘汰</span>}
                      </td>
                      <td className="max-w-48 px-3 py-3.5 text-sm" onClick={(event) => event.stopPropagation()}>
                        {educationValue ? <button type="button" onClick={() => changeFilter(() => setEducationFilter(educationValue))} className="line-clamp-2 text-left text-primary-700 hover:underline">{candidate.education_summary}</button> : <span className="text-foreground-400">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm" onClick={(event) => event.stopPropagation()}>
                        {candidate.intent_city ? <button type="button" onClick={() => changeFilter(() => setCityFilter(candidate.intent_city || ''))} className="text-primary-700 hover:underline">{candidate.intent_city}</button> : <span className="text-foreground-400">—</span>}
                      </td>
                      <td className="max-w-56 px-3 py-3.5">
                        {candidate.desired_position || targetDemand ? (
                          <div><p className="truncate text-sm font-medium text-foreground-800">{candidate.desired_position || '求职目标待补充'}</p>{targetDemand && <p className="mt-0.5 truncate text-xs text-foreground-400">{candidate.current_demand ? '当前需求' : '最近需求'} · {targetDemand.job_title} · {targetDemand.request_no || '未编号'}</p>}</div>
                        ) : <span className="text-sm text-foreground-400">求职目标待补充</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm" onClick={(event) => event.stopPropagation()}>
                        {candidate.pipeline_state === 'in_pipeline' && candidate.current_stage ? <button type="button" onClick={() => changeFilter(() => setStageFilter(candidate.current_stage || ''))} className="text-primary-700 hover:underline">{stageLabels[candidate.current_stage]}</button> : <span className="text-foreground-400">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-500">{formatDate(candidate.created_at)}</td>
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {renderCandidateBusinessAction(candidate, true)}
                          <RowActionMenu ariaLabel={`打开${candidate.name_masked}的更多操作`} items={menuItems} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="candidate-city-options">{cityOptions.map((city) => <option key={city} value={city} />)}</datalist>
          </div>
        )}
      </section>
      <CandidateLibraryPagination controller={controller} />
    </>
  );
}
