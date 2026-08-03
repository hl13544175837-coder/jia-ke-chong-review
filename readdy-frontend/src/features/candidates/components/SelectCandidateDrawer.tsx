import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidateList, stageColorMap, type Candidate } from '@/mocks/candidates';
import { requisitionCandidates } from '@/mocks/requisitionCandidates';
import { requisitions } from '@/mocks/jobs';
import ResumePanel from '@/features/candidates/components/ResumePanel';
import CandidateQuickDetail from './CandidateQuickDetail';
import ImportResumeModal from './ImportResumeModal';
import MultiInterviewerPushModal, { type PushReviewData } from '@/features/businessReviews/components/MultiInterviewerPushModal';
import CandidateSelectionFilters from './CandidateSelectionFilters';
import { filterCandidateSelection, type JoinStatus } from '@/features/candidates/selection';

interface SelectCandidateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  req: {
    id: string;
    name: string;
    title: string;
    city?: string;
    department?: string;
  } | null;
  onAddCandidates: (reqId: string, candidateIds: number[]) => void;
  onAddAndPush?: (reqId: string, candidateIds: number[], pushData: PushReviewData) => void;
}


const allReqIds = Object.keys(requisitionCandidates);

// ── Helper: compute match score ─────────────────────
function computeMatchScore(candidatePos: string, jobTitle: string): number {
  const cLower = candidatePos.toLowerCase();
  const jLower = jobTitle.toLowerCase();
  const keywords = ['前端', '后端', 'java', 'react', 'vue', '产品', '设计', 'ui', 'ux', '数据', '测试', '架构', '运营', '市场', 'hr', '工程师', '经理', '专员'];
  let matchCount = 0;
  keywords.forEach((k) => {
    if (cLower.includes(k) && jLower.includes(k)) matchCount++;
  });
  const hash = (candidatePos.length * 7 + jobTitle.length * 13 + candidatePos.charCodeAt(0)) % 12;
  return Math.min(95, 55 + matchCount * 8 + hash);
}

// ── Helper: compute resume updated at ───────────────
function getResumeUpdatedAt(c: Candidate): string {
  if (!c.appliedAt) return '';
  const applied = new Date(c.appliedAt);
  const offset = (c.id * 3 + 1) % 14;
  applied.setDate(applied.getDate() + offset);
  if (applied > new Date('2026-07-21')) applied.setDate(applied.getDate() - 14);
  return applied.toISOString().slice(0, 10);
}

// ── Stages that block joining another position ──────
const blockingStages = ['一面', '二面', '终面', '面试完成', '谈薪中', '沟通中', 'Offer发放中', '正式到岗中'];

// ── Helper: find current/most recent process position ──
function getCurrentProcessPosition(candidateName: string, activeReqId: string): string {
  if (activeReqId) {
    const cands = requisitionCandidates[activeReqId] || [];
    if (cands.some((rc) => rc.name === candidateName)) {
      const req = requisitions.find((r) => r.id === activeReqId);
      return req?.title || req?.name || activeReqId;
    }
  }
  const otherReqIds = allReqIds.filter((rid) => rid !== activeReqId);
  for (const rid of otherReqIds) {
    const cands = requisitionCandidates[rid] || [];
    if (cands.some((rc) => rc.name === candidateName)) {
      const req = requisitions.find((r) => r.id === rid);
      return req?.title || req?.name || rid;
    }
  }
  return '';
}

// ── Build helpers ───────────────────────────────────

function buildResumeData(c: Candidate) {
  return {
    name: c.name,
    gender: c.gender,
    age: c.age,
    phone: c.phone,
    email: c.email,
    source: c.source,
    appliedAt: c.appliedAt,
    experienceYears: c.experienceYears,
    summary: c.summary,
    skills: c.skills,
    workHistory: c.workHistory,
    educationHistory: c.educationHistory,
    projects: c.projects,
    languages: c.languages,
    certifications: c.certifications,
  };
}

function buildQuickDetailCandidate(c: Candidate) {
  return {
    id: String(c.id),
    name: c.name,
    position: c.position,
    source: c.source,
    stage: c.stage,
    lastUpdate: c.appliedAt,
  };
}

export default function SelectCandidateDrawer({ isOpen, onClose, req, onAddCandidates, onAddAndPush }: SelectCandidateDrawerProps) {
  const navigate = useNavigate();

  // ── Search & filters ───────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [joinStatusFilter, setJoinStatusFilter] = useState('');
  const [joinableOnly, setJoinableOnly] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [expFilter, setExpFilter] = useState('');
  const [eduFilters, setEduFilters] = useState<Set<string>>(new Set());
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [resumeTimeFilter, setResumeTimeFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortMode, setSortMode] = useState<'match' | 'updated' | 'entry'>('match');

  // Default city to current job's city
  useEffect(() => {
    if (req?.city) {
      setCityFilter(req.city);
    } else {
      setCityFilter('');
    }
  }, [req?.city, req?.id]);

  // ── Selection ────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [showAddedToast, setShowAddedToast] = useState(false);

  // ── Sub-panels ───────────────────────────────────
  const [quickDetailId, setQuickDetailId] = useState<number | null>(null);
  const [resumeTarget, setResumeTarget] = useState<Candidate | null>(null);
  const [actionDropdown, setActionDropdown] = useState<number | null>(null);

  // ── Import resume ────────────────────────────────
  const [allCandidates, setAllCandidates] = useState(() => [...candidateList]);
  const [nextImportId, setNextImportId] = useState(1000);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedBoundIds, setImportedBoundIds] = useState<Set<number>>(new Set());

  // ── Push to reviewer ────────────────────────────
  const [showPushModal, setShowPushModal] = useState(false);

  const activeReqId = req?.id || '';

  // ── Derived data: classify each candidate ─────────
  const candidatesWithStatus = useMemo(() => {
    return allCandidates.map((c) => {
      const candidateName = c.name;
      let joinStatus: JoinStatus = 'available';

      // Check ended first
      if (c.stage === '已淘汰' || c.stage === '已入职') {
        joinStatus = 'ended';
      } else if (addedIds.has(c.id) || importedBoundIds.has(c.id)) {
        joinStatus = 'in_current';
      } else if (activeReqId) {
        const reqCands = requisitionCandidates[activeReqId] || [];
        if (reqCands.some((rc) => rc.name === candidateName)) {
          joinStatus = 'in_current';
        } else {
          const otherReqIds = allReqIds.filter((rid) => rid !== activeReqId);
          let inOther = false;
          for (const rid of otherReqIds) {
            const otherCands = requisitionCandidates[rid] || [];
            if (otherCands.some((rc) => rc.name === candidateName)) {
              inOther = true;
              break;
            }
          }
          // Only mark as in_other when actively in a blocking stage
          if (inOther && blockingStages.includes(c.stage)) {
            joinStatus = 'in_other';
          }
        }
      }

      const matchScore = computeMatchScore(c.position, req?.title || '');
      const resumeUpdatedAt = getResumeUpdatedAt(c);
      const currentProcessPosition = getCurrentProcessPosition(candidateName, activeReqId);

      return { ...c, joinStatus, matchScore, resumeUpdatedAt, currentProcessPosition };
    });
  }, [allCandidates, addedIds, importedBoundIds, activeReqId, req?.title]);

  // ── Filtered & sorted data ────────────────────────
  const filteredCandidates = useMemo(() => filterCandidateSelection(candidatesWithStatus, {
    searchQuery, cityFilter, joinStatusFilter, joinableOnly, sourceFilter, expFilter,
    eduFilters, recruiterFilter, resumeTimeFilter, positionFilter, sortMode,
  }), [
    candidatesWithStatus, searchQuery, cityFilter, joinStatusFilter, joinableOnly, sourceFilter,
    expFilter, eduFilters, recruiterFilter, resumeTimeFilter, positionFilter, sortMode,
  ]);

  const filterStats = useMemo(() => {
    const total = candidatesWithStatus.length;
    const available = candidatesWithStatus.filter((c) => c.joinStatus === 'available').length;
    const inCurrent = candidatesWithStatus.filter((c) => c.joinStatus === 'in_current').length;
    const inOther = candidatesWithStatus.filter((c) => c.joinStatus === 'in_other').length;
    const ended = candidatesWithStatus.filter((c) => c.joinStatus === 'ended').length;
    return { total, available, inCurrent, inOther, ended, filtered: filteredCandidates.length };
  }, [candidatesWithStatus, filteredCandidates]);

  if (!isOpen || !req) return null;

  // ── Handlers ─────────────────────────────────────
  const toggleSelect = (id: number, status: JoinStatus) => {
    if (status !== 'available') return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectable = filteredCandidates.filter((c) => c.joinStatus === 'available');
    if (selectedIds.length === selectable.length && selectable.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map((c) => c.id));
    }
  };

  const handleAddCandidates = () => {
    if (selectedIds.length === 0) return;
    const newAddedIds = new Set(addedIds);
    selectedIds.forEach((id) => newAddedIds.add(id));
    setAddedIds(newAddedIds);
    onAddCandidates(req.id, selectedIds);
    setSelectedIds([]);
    setShowAddedToast(true);
    setTimeout(() => {
      setShowAddedToast(false);
      onClose();
    }, 800);
  };

  const handleAddAndPush = () => {
    if (selectedIds.length === 0) return;
    const newAddedIds = new Set(addedIds);
    selectedIds.forEach((id) => newAddedIds.add(id));
    setAddedIds(newAddedIds);
    onAddCandidates(req.id, selectedIds);
    setShowPushModal(true);
  };

  const handlePushConfirm = (pushData: PushReviewData) => {
    setShowPushModal(false);
    if (onAddAndPush) {
      onAddAndPush(req.id, selectedIds, pushData);
    }
    setSelectedIds([]);
    setShowAddedToast(true);
    setTimeout(() => {
      setShowAddedToast(false);
      onClose();
    }, 800);
  };

  const handleGoToResumeLibrary = () => {
    onClose();
    navigate('/candidates', {
      state: {
        fromJobs: true,
        jobTitle: req.title,
        jobName: req.name,
        jobId: req.id,
        selectMode: true,
      },
    });
  };

  const handleImport = (data: {
    name: string;
    gender: string;
    age: string;
    phone: string;
    email: string;
    position: string;
    department: string;
    city: string;
    source: string;
    experienceYears: string;
    education: string;
    summary: string;
  }) => {
    const id = nextImportId;
    setNextImportId(id + 1);

    const newCandidate: Candidate = {
      id,
      name: data.name,
      gender: data.gender,
      age: Number(data.age),
      phone: data.phone,
      email: data.email,
      position: data.position,
      department: data.department,
      city: data.city,
      source: data.source,
      stage: '待筛选',
      stageColor: stageColorMap['待筛选'],
      appliedAt: new Date().toISOString().slice(0, 10),
      education: `${data.education} · 未知院校`,
      experience: data.experienceYears,
      experienceYears: data.experienceYears,
      tags: [],
      resumeUrl: '#',
      summary: data.summary || `${data.experienceYears}经验，${data.position}方向。`,
      workHistory: [],
      educationHistory: [],
      skills: [],
      recruiter: '',
      screeningStage: 'ai',
    };

    setAllCandidates((prev) => [...prev, newCandidate]);
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setImportedBoundIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onAddCandidates(req.id, [id]);
    setShowAddedToast(true);
    setTimeout(() => setShowAddedToast(false), 1500);
  };

  const quickDetailCand = quickDetailId !== null ? candidatesWithStatus.find((c) => c.id === quickDetailId) : null;

  const selectableCount = filteredCandidates.filter((c) => c.joinStatus === 'available').length;

  // Active filter count for "更多筛选" badge
  const moreFilterCount = [sourceFilter, expFilter, recruiterFilter, resumeTimeFilter, positionFilter].filter(Boolean).length + (eduFilters.size > 0 ? 1 : 0);
  const hasActiveFilters = cityFilter || joinStatusFilter || (!joinableOnly) || sourceFilter || expFilter || eduFilters.size > 0 || recruiterFilter || resumeTimeFilter || positionFilter;

  const clearAllFilters = () => {
    setSourceFilter('');
    setExpFilter('');
    setEduFilters(new Set());
    setRecruiterFilter('');
    setResumeTimeFilter('');
    setPositionFilter('');
    setJoinStatusFilter('');
    setJoinableOnly(true);
    setCityFilter(req?.city || '');
  };

  const getDisabledReason = (c: Candidate & { joinStatus: JoinStatus; currentProcessPosition?: string }): string => {
    if (c.joinStatus === 'in_current') {
      const isInCurrentReq = activeReqId && (requisitionCandidates[activeReqId] || []).some((rc) => rc.name === c.name);
      if (importedBoundIds.has(c.id)) return '已通过本次操作加入';
      if (addedIds.has(c.id)) return '已通过本次操作加入';
      if (isInCurrentReq) return '已在当前岗位';
      return '已加入当前岗位';
    }
    if (c.joinStatus === 'in_other') {
      const pos = c.currentProcessPosition || '其他岗位';
      return `已在「${pos}」流程中（${c.stage}环节）`;
    }
    if (c.joinStatus === 'ended') return '流程已结束';
    return '';
  };

  // ── Dropdown renderer ────────────────────────────
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-foreground-900/30 z-40"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white shadow-xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground-900">选择候选人</h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              本次加入岗位：{req.title}
              {req.department && (
                <>
                  <span className="mx-1.5 text-foreground-300">|</span>
                  {req.department}
                </>
              )}
              {req.city && (
                <>
                  <span className="mx-1.5 text-foreground-300">|</span>
                  {req.city}
                </>
              )}
              <span className="mx-1.5 text-foreground-300">|</span>
              需求编号：{req.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <CandidateSelectionFilters
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          cityFilter={cityFilter} setCityFilter={setCityFilter}
          joinStatusFilter={joinStatusFilter} setJoinStatusFilter={setJoinStatusFilter}
          joinableOnly={joinableOnly} setJoinableOnly={setJoinableOnly}
          showMoreFilters={showMoreFilters} setShowMoreFilters={setShowMoreFilters}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          expFilter={expFilter} setExpFilter={setExpFilter}
          eduFilters={eduFilters} setEduFilters={setEduFilters}
          recruiterFilter={recruiterFilter} setRecruiterFilter={setRecruiterFilter}
          resumeTimeFilter={resumeTimeFilter} setResumeTimeFilter={setResumeTimeFilter}
          positionFilter={positionFilter} setPositionFilter={setPositionFilter}
          sortMode={sortMode} setSortMode={setSortMode}
          moreFilterCount={moreFilterCount}
          filterStats={filterStats}
          hasActiveFilters={Boolean(hasActiveFilters)}
          selectedCount={selectedIds.length}
          onClear={clearAllFilters}
        />

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto">
          {filteredCandidates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
                <i className="ri-user-search-line text-xl text-foreground-400"></i>
              </div>
              <p className="text-sm text-foreground-500">没有匹配的候选人</p>
              <p className="text-xs text-foreground-400 mt-1">尝试调整筛选条件或清除筛选</p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="mt-3 px-4 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 cursor-pointer whitespace-nowrap transition-colors"
                >
                  清除所有筛选
                </button>
              )}
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead className="sticky top-0 bg-background-50 z-10">
                <tr className="border-b border-background-200">
                  <th className="px-4 py-2.5" style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectableCount > 0 && selectedIds.length === selectableCount}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '110px' }}>候选人</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '100px' }}>当前/最近流程岗位</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '60px' }}>来源</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '85px' }}>当前阶段</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '90px' }}>匹配度</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '130px' }}>状态说明</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap" style={{ width: '60px' }}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {filteredCandidates.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isInCurrent = c.joinStatus === 'in_current';
                  const isNotAvailable = c.joinStatus !== 'available';

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors ${
                        isInCurrent
                          ? 'bg-primary-50/50'
                          : isNotAvailable
                            ? 'bg-background-50/50'
                            : isSelected
                              ? 'bg-primary-50/30'
                              : 'hover:bg-background-50/50'
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()} style={{ width: '40px' }}>
                        {isInCurrent ? (
                          <span className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-check-line text-primary-400 text-sm"></i>
                          </span>
                        ) : isNotAvailable ? (
                          <span className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-forbid-line text-foreground-300 text-sm"></i>
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(c.id, c.joinStatus)}
                            className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3" style={{ width: '110px' }}>
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isInCurrent ? 'bg-primary-200' : isNotAvailable ? 'bg-background-200' : 'bg-primary-50'
                          }`}>
                            <span className={`text-[11px] font-semibold ${
                              isInCurrent ? 'text-primary-500' : isNotAvailable ? 'text-foreground-400' : 'text-primary-600'
                            }`}>{c.name.charAt(0)}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickDetailId(c.id); }}
                            className={`text-sm font-medium text-left truncate hover:text-primary-600 transition-colors cursor-pointer ${
                              isInCurrent ? 'text-primary-600' : isNotAvailable ? 'text-foreground-400' : 'text-foreground-900'
                            }`}
                          >
                            {c.name}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm truncate" style={{ width: '100px' }}>
                        {c.currentProcessPosition ? (
                          <span className="text-foreground-700">{c.currentProcessPosition}</span>
                        ) : (
                          <span className="text-foreground-400">--</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground-500 whitespace-nowrap" style={{ width: '60px' }}>{c.source}</td>
                      <td className="px-3 py-3" style={{ width: '85px' }}>
                        <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap ${c.stageColor}`}>
                          {c.stage}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center" style={{ width: '90px' }}>
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-12 h-1.5 rounded-full bg-background-200 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${c.matchScore || 50}%`,
                                backgroundColor: (c.matchScore || 50) >= 75 ? '#10b981' : (c.matchScore || 50) >= 60 ? '#f59e0b' : '#ef4444',
                              }}
                            ></div>
                          </div>
                          <span className={`text-xs font-semibold ${
                            (c.matchScore || 50) >= 75 ? 'text-emerald-600' : (c.matchScore || 50) >= 60 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {c.matchScore || 50}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3" style={{ width: '130px' }}>
                        {isNotAvailable ? (
                          <span className="text-xs text-foreground-400">{getDisabledReason(c)}</span>
                        ) : isSelected ? (
                          <span className="text-xs text-primary-600">已选中</span>
                        ) : (
                          <span className="text-xs text-foreground-400">可加入当前岗位</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center" style={{ width: '60px' }}>
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionDropdown(actionDropdown === c.id ? null : c.id);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-background-100 text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                          >
                            <i className="ri-more-2-fill text-base"></i>
                          </button>
                          {actionDropdown === c.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={(e) => { e.stopPropagation(); setActionDropdown(null); }}
                              ></div>
                              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1 z-20 min-w-[120px]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActionDropdown(null);
                                    setResumeTarget(c);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <i className="ri-eye-line mr-1.5"></i>查看简历
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-background-200 flex-shrink-0 space-y-3">
          {showAddedToast && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700">
              <i className="ri-check-double-line"></i>
              候选人已成功加入当前岗位
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddAndPush}
              disabled={selectedIds.length === 0}
              className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                selectedIds.length > 0
                  ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-sm'
                  : 'bg-background-200 text-foreground-400 cursor-not-allowed'
              }`}
            >
              <i className="ri-arrow-right-line"></i>
              下一步：推送面试官评审
              {selectedIds.length > 0 && (
                <span className="text-xs opacity-80">（{selectedIds.length}人）</span>
              )}
            </button>
            <button
              onClick={handleAddCandidates}
              disabled={selectedIds.length === 0}
              className={`px-3 py-2.5 text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                selectedIds.length > 0
                  ? 'text-foreground-500 hover:text-foreground-700 hover:bg-background-100'
                  : 'text-foreground-300 cursor-not-allowed'
              }`}
            >
              仅加入岗位
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2.5 text-sm font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-file-upload-line"></i>
              导入简历
            </button>
            <button
              onClick={handleGoToResumeLibrary}
              className="px-4 py-2.5 text-sm font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-external-link-line"></i>
              去简历库查看更多
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-panels ────────────────────────────── */}

      {/* Resume Panel */}
      <ResumePanel
        candidate={resumeTarget ? buildResumeData(resumeTarget) : null}
        onClose={() => setResumeTarget(null)}
      />

      {/* Candidate Quick Detail */}
      <CandidateQuickDetail
        candidate={quickDetailCand ? buildQuickDetailCandidate(quickDetailCand) : null}
        resumeData={quickDetailCand ? buildResumeData(quickDetailCand) : null}
        onClose={() => setQuickDetailId(null)}
      />

      {/* Import Resume Modal */}
      <ImportResumeModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />

      {/* Multi Interviewer Push Modal */}
      {showPushModal && (
        <MultiInterviewerPushModal
          targets={selectedIds.map((id) => {
            const c = allCandidates.find((x) => x.id === id);
            return {
              candidateId: String(id),
              candidateName: c?.name || '',
              position: c?.position || '',
              source: c?.source || '',
            };
          })}
          onClose={() => setShowPushModal(false)}
          onPush={handlePushConfirm}
        />
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
