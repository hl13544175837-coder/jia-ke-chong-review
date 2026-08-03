import { useState, useEffect, useRef } from 'react';
import { requisitionCandidates } from '@/mocks/requisitionCandidates';
import { candidateList } from '@/mocks/candidates';
import { interviewerPool } from '@/mocks/interviews';
import { addResumePushRecord, updatePushRecordStatus } from '@/mocks/resumePush';
import ResumePanel from '@/features/candidates/components/ResumePanel';
import SelectCandidateDrawer from '@/features/candidates/components/SelectCandidateDrawer';
import ScheduleInterviewModal from '@/features/interviews/components/LegacyScheduleInterviewModal';
import CandidateQuickDetail from '@/features/candidates/components/CandidateQuickDetail';
import MultiInterviewerPushModal, { type PushReviewData } from '@/features/businessReviews/components/MultiInterviewerPushModal';
import ResumeUploadModal from '@/components/feature/ResumeUploadModal';
import { useToast } from '@/hooks/useToast';
import JobActivityLogSection from './JobActivityLogSection';
import JobCandidatesSection from './JobCandidatesSection';
import JobDescriptionSection from './JobDescriptionSection';
import JobOverviewSection from './JobOverviewSection';
import RecruitmentProgressSection from './RecruitmentProgressSection';

// ── Types ──────────────────────────────────────────────

interface ReqCandidate {
  id: string;
  name: string;
  position: string;
  source: string;
  stage: string;
  lastUpdate: string;
  interviewRound?: string;
  interviewer?: string;
  interviewTime?: string;
  interviewType?: string;
  interviewLocation?: string;
  // For resume lookup
  _sourceId?: number;
  // Push tracking
  pushStatus?: 'pending' | 'approved' | 'rejected' | 'needMoreInfo' | null;
  pushReviewers?: string[];
  pushReviewerIds?: string[];
  pushTime?: string;
  pushDeadline?: string;
  pushKeyRequirements?: string;
}

// ResumeData shape needed by ResumePanel
interface ResumeData {
  name: string;
  gender: string;
  age: number;
  phone: string;
  email: string;
  source: string;
  appliedAt: string;
  experienceYears: string;
  summary: string;
  skills: string[];
  workHistory: Array<{ company: string; role: string; period: string; highlights: string[] }>;
  educationHistory: Array<{ school: string; degree: string; major: string; period: string }>;
  projects?: Array<{ name: string; role: string; desc: string }>;
  languages?: string[];
  certifications?: string[];
}

function resolveResumeData(c: ReqCandidate): ResumeData {
  // Try to find full data from candidateList by sourceId
  if (c._sourceId) {
    const full = candidateList.find((x) => x.id === c._sourceId);
    if (full) {
      return {
        name: full.name, gender: full.gender, age: full.age, phone: full.phone, email: full.email,
        source: full.source, appliedAt: c.lastUpdate, experienceYears: full.experienceYears,
        summary: full.summary, skills: full.skills, workHistory: full.workHistory,
        educationHistory: full.educationHistory, projects: full.projects,
        languages: full.languages, certifications: full.certifications,
      };
    }
  }
  // Try legacy requisitionCandidates lookup
  const allLegacy = Object.values(requisitionCandidates).flat();
  const legacy = allLegacy.find((rc) => rc.name === c.name);
  if (legacy) {
    return {
      name: legacy.name, gender: legacy.gender, age: legacy.age, phone: legacy.phone, email: legacy.email,
      source: legacy.source, appliedAt: legacy.appliedAt, experienceYears: legacy.experienceYears,
      summary: legacy.summary, skills: legacy.skills, workHistory: legacy.workHistory,
      educationHistory: legacy.educationHistory, projects: legacy.projects,
      languages: legacy.languages, certifications: legacy.certifications,
    };
  }
  // Fallback
  return {
    name: c.name, gender: '', age: 0, phone: '', email: '', source: c.source,
    appliedAt: c.lastUpdate, experienceYears: '', summary: '', skills: [],
    workHistory: [], educationHistory: [],
  };
}

interface ReqOverrides {
  status?: string;
  statusCode?: string;
  salaryRange?: string;
  deadline?: string | null;
}

interface JobDetailPanelProps {
  req: {
    id: string;
    name: string;
    title: string;
    department: string;
    city: string;
    owner: string;
    headcount: number;
    filled: number;
    deadline: string | null;
    status: string;
    statusCode: string;
    stageAll: number;
    stageFeedback: number;
    stageInterview: number;
    stageOffer: number;
    statusNote: string;
    priority: string;
    createdAt: string;
    startDate?: string | null;
    salaryRange?: string;
    responsibilities?: string;
    requirements?: string;
    interviewProcess?: string;
  } | null;
  onClose: () => void;
  highlightCandidateName?: string;
}

// ── Module-level persistence ───────────────────────────

const persistedCandidates: Record<string, ReqCandidate[]> = {};
const persistedOverrides: Record<string, ReqOverrides> = {};

let idCounter = Date.now();

function generateId(): string {
  return `rc-${++idCounter}`;
}

function initCandidates(req: NonNullable<JobDetailPanelProps['req']>): ReqCandidate[] {
  const existing = requisitionCandidates[req.id] || [];
  const legacyIds = new Set(existing.map((c) => `rc-legacy-${c.id}`));

  // Preserve non-legacy entries added via UI (e.g. SelectCandidateDrawer)
  const cached = persistedCandidates[req.id] || [];
  const nonLegacy = cached.filter((c) => !legacyIds.has(c.id));

  // Rebuild legacy entries from current requisitionCandidates so external additions are picked up
  const legacy = existing.map((c) => ({
    id: `rc-legacy-${c.id}`,
    name: c.name,
    position: c.position || req.title,
    source: c.source,
    stage: mapMockStage(c.stage),
    lastUpdate: c.appliedAt,
    interviewRound: undefined,
    interviewer: undefined,
    interviewTime: undefined,
    interviewType: undefined,
    interviewLocation: undefined,
  }));

  persistedCandidates[req.id] = [...legacy, ...nonLegacy];
  return persistedCandidates[req.id];
}

function mapMockStage(stage: string): string {
  const mapping: Record<string, string> = {
    '已推送简历': '待筛选',
    '面试官反馈': '初筛通过',
    '已面试': '面试中',
    'Offer': 'Offer',
    '已淘汰': '已淘汰',
  };
  return mapping[stage] || stage;
}

// ── Pipeline config ────────────────────────────────────

const pipelineStages = [
  { key: '待筛选', label: '待筛选', icon: 'ri-file-search-line', colorBar: 'bg-secondary-500', bgColor: 'bg-secondary-50/60', borderColor: 'border-secondary-200' },
  { key: '面试官评审中', label: '面试官评审中', icon: 'ri-user-search-line', colorBar: 'bg-accent-500', bgColor: 'bg-accent-50/60', borderColor: 'border-accent-200' },
  { key: '同意面试', label: '同意面试', icon: 'ri-check-double-line', colorBar: 'bg-emerald-500', bgColor: 'bg-emerald-50/60', borderColor: 'border-emerald-200' },
  { key: '待安排', label: '待安排', icon: 'ri-calendar-todo-line', colorBar: 'bg-amber-500', bgColor: 'bg-amber-50/60', borderColor: 'border-amber-200' },
  { key: '初筛通过', label: '初筛通过', icon: 'ri-check-line', colorBar: 'bg-primary-500', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: '一面', label: '一面', icon: 'ri-chat-1-line', colorBar: 'bg-primary-500', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: '二面', label: '二面', icon: 'ri-chat-3-line', colorBar: 'bg-primary-500', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: '终面', label: '终面', icon: 'ri-chat-check-line', colorBar: 'bg-primary-500', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: 'Offer', label: 'Offer', icon: 'ri-file-text-line', colorBar: 'bg-primary-600', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: '待入职', label: '待入职', icon: 'ri-user-star-line', colorBar: 'bg-primary-700', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
  { key: '已入职', label: '已入职', icon: 'ri-user-heart-line', colorBar: 'bg-primary-800', bgColor: 'bg-primary-50/60', borderColor: 'border-primary-200' },
];

function mapCandidateToPipeline(c: ReqCandidate): string {
  if (c.stage === '已淘汰') return '';
  if (c.stage === '待筛选') return '待筛选';
  if (c.stage === '面试官评审中') return '面试官评审中';
  if (c.stage === '同意面试') return '同意面试';
  if (c.stage === '待安排') return '待安排';
  if (c.stage === '初筛通过') return '初筛通过';
  if (c.stage === '一面待进行' || c.stage === '面试中') return '一面';
  if (c.stage === '二面待进行') return '二面';
  if (c.stage === '终面待进行') return '终面';
  if (c.stage === 'Offer') return 'Offer';
  if (c.stage === '待入职') return '待入职';
  if (c.stage === '已入职') return '已入职';
  return '';
}

// ── Status helpers ─────────────────────────────────────

const statusDisplayMap: Record<string, string> = {
  active: '招聘中',
  pending: '需求待确认',
  paused: '暂停',
  completed: '已完成',
  closed: '已关闭',
};

const statusColorMap: Record<string, string> = {
  active: 'bg-primary-100 text-primary-700',
  pending: 'bg-accent-100 text-accent-700',
  paused: 'bg-secondary-100 text-secondary-700',
  completed: 'bg-primary-50 text-primary-600',
  closed: 'bg-background-200 text-foreground-500',
};

const stageTagColors: Record<string, string> = {
  '待筛选': 'bg-secondary-100 text-secondary-700',
  '面试官评审中': 'bg-accent-100 text-accent-700',
  '同意面试': 'bg-emerald-50 text-emerald-700',
  '待安排': 'bg-amber-50 text-amber-700',
  '初筛通过': 'bg-accent-100 text-accent-700',
  '一面待进行': 'bg-primary-100 text-primary-700',
  '面试中': 'bg-primary-100 text-primary-700',
  '二面待进行': 'bg-primary-100 text-primary-700',
  '终面待进行': 'bg-primary-100 text-primary-700',
  'Offer': 'bg-primary-100 text-primary-700',
  '待入职': 'bg-primary-50 text-primary-600',
  '已入职': 'bg-primary-50 text-primary-600',
  '已淘汰': 'bg-background-200 text-foreground-400',
};

// ── Component ──────────────────────────────────────────

export default function JobDetailWorkspace({ req, onClose, highlightCandidateName }: JobDetailPanelProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'info' | 'candidates' | 'pipeline'>('info');
  const [localCandidates, setLocalCandidates] = useState<ReqCandidate[]>([]);
  const [localOverrides, setLocalOverrides] = useState<ReqOverrides>({});
  const [resumeCandidate, setResumeCandidate] = useState<ReqCandidate | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [candidateDrawerOpen, setCandidateDrawerOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<ReqCandidate | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: string; label: string } | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [actionDropdown, setActionDropdown] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferDropdown, setTransferDropdown] = useState<string | null>(null);
  const [quickDetailCandidate, setQuickDetailCandidate] = useState<ReqCandidate | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);

  // ── Checkbox & push state ─────────────────────────
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [pushTargets, setPushTargets] = useState<ReqCandidate[]>([]);
  const [showPushModal, setShowPushModal] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [jobTitleDraft, setJobTitleDraft] = useState('');
  const [savedJobTitle, setSavedJobTitle] = useState('');

  // Init on req change
  useEffect(() => {
    if (req) {
      document.body.style.overflow = 'hidden';
      setActiveTab(highlightCandidateName ? 'candidates' : 'info');
      const cands = initCandidates(req);
      setLocalCandidates(cands);
      const ovr = persistedOverrides[req.id] || {};
      setLocalOverrides(ovr);
      setPipelineFilter(null);
      setJobTitleDraft(req.title);
      setSavedJobTitle('');
      setEditOpen(false);
      setUploadOpen(false);
    } else {
      document.body.style.overflow = '';
      setResumeCandidate(null);
      setLocalCandidates([]);
      setLocalOverrides({});
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [req, highlightCandidateName]);

  // Persist changes
  useEffect(() => {
    if (req && localCandidates.length >= 0) {
      persistedCandidates[req.id] = localCandidates;
    }
  }, [localCandidates, req]);

  useEffect(() => {
    if (req) {
      persistedOverrides[req.id] = localOverrides;
    }
  }, [localOverrides, req]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) setActionDropdown(null);
      if (transferRef.current && !transferRef.current.contains(e.target as Node)) setTransferDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!req) return null;

  const currentStatus = localOverrides.statusCode || req.statusCode;
  const currentStatusLabel = localOverrides.status || req.status;
  const displayTitle = savedJobTitle || req.title;
  const candidates = localCandidates;
  const pipelineFiltered = pipelineFilter ? candidates.filter((c) => mapCandidateToPipeline(c) === pipelineFilter) : candidates;

  // Stats
  const pendingCount = candidates.filter((c) => c.stage === '待筛选').length;
  const interviewCount = candidates.filter((c) =>
    ['初筛通过', '一面待进行', '面试中', '二面待进行', '终面待进行'].includes(c.stage)
  ).length;
  const offerCount = candidates.filter((c) => c.stage === 'Offer').length;
  const hiredCount = candidates.filter((c) => c.stage === '已入职').length;

  // Pipeline counts
  const pipelineCounts = pipelineStages.map((ps) => ({
    ...ps,
    count: candidates.filter((c) => mapCandidateToPipeline(c) === ps.key).length,
  }));

  const tabs = [
    { key: 'info' as const, label: '岗位信息', icon: 'ri-information-line' },
    { key: 'candidates' as const, label: `候选人（${candidates.length}）`, icon: 'ri-team-line' },
    { key: 'pipeline' as const, label: '招聘进展', icon: 'ri-line-chart-line' },
  ];

  // ── Handlers ────────────────────────────────────────

  const handleAddCandidates = (reqId: string, candidateIds: number[]) => {
    const newEntries: ReqCandidate[] = candidateIds
      .map((cid) => {
        const c = candidateList.find((x) => x.id === cid);
        if (!c) return null;
        return {
          id: generateId(),
          name: c.name,
          position: c.position,
          source: c.source,
          stage: '待筛选',
          lastUpdate: new Date().toISOString().slice(0, 10),
          _sourceId: c.id,
        };
      })
      .filter(Boolean) as ReqCandidate[];
    setLocalCandidates((prev) => [...prev, ...newEntries]);
    return newEntries;
  };

  const handleAddAndPush = (reqId: string, candidateIds: number[], pushData: PushReviewData) => {
    const added = handleAddCandidates(reqId, candidateIds);
    if (added.length === 0) return;
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setLocalCandidates((prev) =>
      prev.map((c) => {
        if (added.some((a) => a.id === c.id)) {
          return {
            ...c,
            stage: '面试官评审中',
            pushStatus: 'pending',
            pushReviewers: pushData.reviewerNames,
            pushReviewerIds: pushData.reviewerIds,
            pushTime: now,
            pushDeadline: pushData.deadline,
            pushKeyRequirements: pushData.keyRequirements,
            lastUpdate: now.split(' ')[0],
          };
        }
        return c;
      })
    );
  };

  // ── Push from candidate list ──────────────────────
  const handleBatchPushOpen = () => {
    const targets = candidates.filter((c) => selectedCandidateIds.has(c.id));
    if (targets.length === 0) return;
    setPushTargets(targets);
    setShowPushModal(true);
  };

  const handleSinglePushOpen = (cand: ReqCandidate) => {
    setActionDropdown(null);
    setPushTargets([cand]);
    setShowPushModal(true);
  };

  const handlePushConfirm = (pushData: PushReviewData) => {
    setShowPushModal(false);
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const targetIds = new Set(pushTargets.map((t) => t.id));
    setLocalCandidates((prev) =>
      prev.map((c) => {
        if (!targetIds.has(c.id)) return c;
        // Merge new reviewers with existing ones
        const existingReviewerIds = c.pushReviewerIds || [];
        const existingReviewers = c.pushReviewers || [];
        const newReviewerIds = pushData.reviewerIds.filter((id) => !existingReviewerIds.includes(id));
        const newReviewers = pushData.reviewerNames.filter((_, i) =>
          !existingReviewerIds.includes(pushData.reviewerIds[i])
        );
        // Create push records for performance tracking
        pushData.reviewerIds.forEach((reviewerId, i) => {
          if (!existingReviewerIds.includes(reviewerId)) {
            const sourceCandidate = candidateList.find((cl) => cl.id === c._sourceId);
            addResumePushRecord({
              candidateId: c._sourceId,
              candidateName: c.name,
              position: c.position,
              source: c.source,
              pusher: localStorage.getItem('zhipin-current-role') === 'recruiter_lead' ? '张敏' : '李华',
              pushTime: now,
              reviewerId,
              reviewerName: pushData.reviewerNames[i],
              reviewerTitle: pushData.reviewerTitles[i],
              deadline: pushData.deadline,
              keyRequirements: pushData.keyRequirements,
              status: 'pending',
              reviewComment: '',
              reviewTime: null,
            });
          }
        });
        return {
          ...c,
          stage: '面试官评审中',
          pushStatus: 'pending',
          pushReviewers: [...existingReviewers, ...newReviewers],
          pushReviewerIds: [...existingReviewerIds, ...pushData.reviewerIds],
          pushTime: now,
          pushDeadline: pushData.deadline,
          pushKeyRequirements: pushData.keyRequirements,
          lastUpdate: now.split(' ')[0],
        };
      })
    );
    setSelectedCandidateIds(new Set());
    setPushTargets([]);
  };

  // ── Checkbox handlers ─────────────────────────────
  const toggleCandidateSelect = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (candList: ReqCandidate[]) => {
    setSelectedCandidateIds((prev) => {
      if (prev.size === candList.length && candList.length > 0) {
        return new Set();
      }
      return new Set(candList.map((c) => c.id));
    });
  };

  const clearSelection = () => setSelectedCandidateIds(new Set());

  // Check if a candidate has been pushed to the same interviewer
  const hasBeenPushedToReviewer = (cand: ReqCandidate, reviewerId: string): boolean => {
    return (cand.pushReviewerIds || []).includes(reviewerId);
  };

  const handlePassScreening = (cand: ReqCandidate) => {
    setActionDropdown(null);
    setLocalCandidates((prev) =>
      prev.map((c) =>
        c.id === cand.id ? { ...c, stage: '初筛通过', lastUpdate: new Date().toISOString().slice(0, 10) } : c
      )
    );
  };

  const handleReject = (cand: ReqCandidate) => {
    setActionDropdown(null);
    setLocalCandidates((prev) =>
      prev.map((c) =>
        c.id === cand.id ? { ...c, stage: '已淘汰', lastUpdate: new Date().toISOString().slice(0, 10) } : c
      )
    );
  };

  const handleSchedule = (data: {
    round: string;
    interviewer: string;
    interviewerId: string;
    date: string;
    time: string;
    type: string;
    location: string;
  }) => {
    if (!scheduleTarget) return;
    const stageMap: Record<string, string> = {
      '一面': '一面待进行',
      '二面': '二面待进行',
      '终面': '终面待进行',
    };
    setLocalCandidates((prev) =>
      prev.map((c) =>
        c.id === scheduleTarget.id
          ? {
              ...c,
              stage: stageMap[data.round] || '一面待进行',
              interviewRound: data.round,
              interviewer: data.interviewer,
              interviewTime: `${data.date} ${data.time}`,
              interviewType: data.type,
              interviewLocation: data.location,
              lastUpdate: new Date().toISOString().slice(0, 10),
            }
          : c
      )
    );
    setScheduleTarget(null);
  };

  const handleTransfer = (cand: ReqCandidate, targetReqName: string) => {
    setTransferDropdown(null);
    setTransferTarget(null);
    // Remove from current req and could add to target — for now just remove from current
    setLocalCandidates((prev) => prev.filter((c) => c.id !== cand.id));
  };

  const handleStatusChange = (newCode: string) => {
    setMoreOpen(false);
    if (newCode === 'paused' || newCode === 'closed') {
      setConfirmAction({
        type: newCode,
        label: newCode === 'paused' ? '暂停招聘' : '关闭岗位',
      });
    } else {
      applyStatusChange(newCode);
    }
  };

  const applyStatusChange = (newCode: string) => {
    setConfirmAction(null);
    setLocalOverrides((prev) => ({
      ...prev,
      statusCode: newCode,
      status: statusDisplayMap[newCode] || newCode,
    }));
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-foreground-900/30 z-40" onClick={onClose}></div>

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground-900">{displayTitle}</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap ${statusColorMap[currentStatus] || 'bg-background-200 text-foreground-500'}`}>
                {currentStatusLabel}
              </span>
            </div>
            <p className="text-xs text-foreground-400 mt-0.5">{req.department} · {req.city} · 招聘负责人：{req.owner}</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
              >
                <i className="ri-more-2-fill text-xl"></i>
              </button>
              {moreOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1 z-50 min-w-[140px]">
                  <button
                    onClick={() => { setMoreOpen(false); }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-edit-line mr-1.5"></i>编辑岗位
                  </button>
                  {currentStatus === 'active' && (
                    <button
                      onClick={() => handleStatusChange('paused')}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-pause-circle-line mr-1.5"></i>暂停招聘
                    </button>
                  )}
                  {currentStatus === 'paused' && (
                    <button
                      onClick={() => applyStatusChange('active')}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-play-circle-line mr-1.5"></i>恢复招聘
                    </button>
                  )}
                  <button
                    onClick={() => handleStatusChange('closed')}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-500 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line mr-1.5"></i>关闭岗位
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-background-200 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPipelineFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === tab.key
                  ? 'text-primary-600 border-primary-500'
                  : 'text-foreground-500 border-transparent hover:text-foreground-700'
              }`}
            >
              <i className={`${tab.icon} text-base`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── Tab: Info ────────────────────────────── */}
          {activeTab === 'info' && (
            <>
              {req.statusNote && (
                <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
                  <p className="text-sm text-accent-800">
                    <i className="ri-information-line mr-1"></i>
                    {req.statusNote}
                  </p>
                </div>
              )}

              <JobOverviewSection {...req} displayTitle={displayTitle} />
              <JobDescriptionSection responsibilities={req.responsibilities} requirements={req.requirements} interviewProcess={req.interviewProcess} />
              <RecruitmentProgressSection
                pendingCount={pendingCount}
                interviewCount={interviewCount}
                offerCount={offerCount}
                hiredCount={hiredCount}
                onAddCandidate={() => setCandidateDrawerOpen(true)}
                onEdit={() => { setJobTitleDraft(displayTitle); setEditOpen(true); }}
              />
            </>
          )}

          {/* ── Tab: Candidates ──────────────────────── */}
          {activeTab === 'candidates' && (
            <JobCandidatesSection>
              {candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mb-4">
                    <i className="ri-user-search-line text-2xl text-foreground-400"></i>
                  </div>
                  <p className="text-sm font-medium text-foreground-500 mb-1">该岗位暂无候选人</p>
                  <p className="text-xs text-foreground-400 mb-6">从简历库中添加合适的候选人，开始招聘流程</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCandidateDrawerOpen(true)}
                      className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-file-search-line mr-1.5"></i>
                      从简历库添加
                    </button>
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="px-5 py-2.5 bg-white border border-background-200 hover:bg-background-50 text-foreground-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-upload-cloud-line mr-1.5"></i>
                      上传新简历
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-background-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-background-50 border-b border-background-200">
                        <th className="px-4 py-2.5 w-10">
                          <input
                            type="checkbox"
                            checked={candidates.length > 0 && selectedCandidateIds.size === candidates.length}
                            onChange={() => toggleSelectAll(candidates)}
                            className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">当前职位</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">阶段</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">来源</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">最近进展</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap w-[80px]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-background-100">
                      {candidates.map((c) => {
                        const isScreening = c.stage === '待筛选';
                        const isPassed = c.stage === '初筛通过';
                        const isInterviewPending = c.stage.endsWith('待进行');
                        const isRejected = c.stage === '已淘汰';
                        const isUnderReview = c.stage === '面试官评审中';
                        const isApproved = c.stage === '同意面试';
                        const isPendingSchedule = c.stage === '待安排';
                        const isSelected = selectedCandidateIds.has(c.id);

                        // Render push status info
                        const renderPushInfo = () => {
                          if (isUnderReview && c.pushReviewers) {
                            return (
                              <div className="space-y-0.5">
                                <span className="text-xs text-accent-600 font-medium">评审中</span>
                                <p className="text-[11px] text-foreground-400">评审人：{c.pushReviewers.join('、')}</p>
                                {c.pushDeadline && <p className="text-[11px] text-foreground-400">截止：{c.pushDeadline}</p>}
                              </div>
                            );
                          }
                          if (isApproved) {
                            return <span className="text-xs text-emerald-600 font-medium">评审通过，待安排面试</span>;
                          }
                          if (isPendingSchedule) {
                            return <span className="text-xs text-amber-600 font-medium">待安排面试</span>;
                          }
                          if (c.interviewTime) {
                            return (
                              <span className="text-xs text-foreground-500">
                                {c.interviewRound} · {c.interviewer} · {c.interviewTime}
                              </span>
                            );
                          }
                          if (c.stage === '初筛通过') {
                            return <span className="text-xs text-foreground-400">待安排面试</span>;
                          }
                          if (c.stage === '已淘汰') {
                            return <span className="text-xs text-foreground-400">已结束</span>;
                          }
                          return <span className="text-xs text-foreground-500">{c.lastUpdate}</span>;
                        };

                        return (
                          <tr
                            key={c.id}
                            className={`transition-colors ${isSelected ? 'bg-accent-50/40' : highlightCandidateName === c.name ? 'bg-accent-50/70' : 'hover:bg-background-50/60'}`}
                          >
                            <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCandidateSelect(c.id)}
                                className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-primary-600">{c.name.charAt(0)}</span>
                                </div>
                                <button onClick={() => setQuickDetailCandidate(c)} className="text-sm font-medium text-foreground-900 hover:text-primary-600 transition-colors cursor-pointer text-left">{c.name}</button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground-700 whitespace-nowrap">{c.position}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${stageTagColors[c.stage] || 'bg-background-200 text-foreground-500'}`}>
                                {c.stage}
                                {c.interviewRound && !isUnderReview && !isApproved && !isPendingSchedule && <span className="ml-1 opacity-70">· {c.interviewRound}</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground-600 whitespace-nowrap">{c.source}</td>
                            <td className="px-4 py-3">
                              {renderPushInfo()}
                            </td>
                            <td className="px-4 py-3 text-center w-[80px]">
                              <div className="relative inline-block" ref={actionDropdown === c.id ? actionRef : undefined}>
                                <button
                                  onClick={() => setActionDropdown(actionDropdown === c.id ? null : c.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-background-200 hover:bg-background-50 text-foreground-600 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  操作 <i className="ri-arrow-down-s-line"></i>
                                </button>
                                {actionDropdown === c.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1 z-50 min-w-[150px]">
                                    <button
                                      onClick={() => { setActionDropdown(null); setResumeCandidate(c); }}
                                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                                    >
                                      <i className="ri-eye-line mr-1.5"></i>查看简历
                                    </button>
                                    {/* Push to reviewer - available for 待筛选, 初筛通过 */}
                                    {(isScreening || isPassed) && (
                                      <button
                                        onClick={() => handleSinglePushOpen(c)}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-send-plane-line mr-1.5"></i>推送面试官评审
                                      </button>
                                    )}
                                    {/* Push to reviewer - also available for 面试官评审中 (add more reviewers) */}
                                    {isUnderReview && (
                                      <button
                                        onClick={() => handleSinglePushOpen(c)}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-user-add-line mr-1.5"></i>追加评审人
                                      </button>
                                    )}
                                    {/* Approve and schedule */}
                                    {isUnderReview && (
                                      <button
                                        onClick={() => {
                                          setActionDropdown(null);
                                          const now = new Date().toISOString().slice(0, 10);
                                          // Update push records
                                          if (c.pushReviewerIds && c._sourceId) {
                                            c.pushReviewerIds.forEach((rid) => {
                                              updatePushRecordStatus(c._sourceId!, rid, 'approved', '简历评审通过，同意安排面试');
                                            });
                                          }
                                          setLocalCandidates((prev) =>
                                            prev.map((x) =>
                                              x.id === c.id
                                                ? { ...x, stage: '同意面试', pushStatus: 'approved', lastUpdate: now }
                                                : x
                                            )
                                          );
                                        }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-check-double-line mr-1.5"></i>同意面试
                                      </button>
                                    )}
                                    {isApproved && (
                                      <button
                                        onClick={() => {
                                          setActionDropdown(null);
                                          setScheduleTarget(c);
                                        }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-calendar-check-line mr-1.5"></i>安排面试
                                      </button>
                                    )}
                                    {isScreening && (
                                      <button
                                        onClick={() => handlePassScreening(c)}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-check-line mr-1.5"></i>通过初筛
                                      </button>
                                    )}
                                    {isPassed && (
                                      <button
                                        onClick={() => { setActionDropdown(null); setScheduleTarget(c); }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-calendar-check-line mr-1.5"></i>安排面试
                                      </button>
                                    )}
                                    {!isRejected && (
                                      <button
                                        onClick={() => handleReject(c)}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-500 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-close-circle-line mr-1.5"></i>淘汰
                                      </button>
                                    )}
                                    {!isRejected && (
                                      <button
                                        onClick={() => { setActionDropdown(null); setTransferTarget(c.id); setTransferDropdown(c.id); }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground-500 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <i className="ri-shuffle-line mr-1.5"></i>转其他岗位
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Batch action bar */}
              {candidates.length > 0 && selectedCandidateIds.size > 0 && (
                <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-accent-50 border border-accent-200 rounded-lg">
                  <span className="text-sm font-medium text-accent-700">
                    已选择 <strong>{selectedCandidateIds.size}</strong> 人
                  </span>
                  <button
                    onClick={handleBatchPushOpen}
                    className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                  >
                    <i className="ri-send-plane-line"></i>
                    推送面试官评审
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-3 py-2 text-sm font-medium text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-close-line mr-1"></i>取消选择
                  </button>
                </div>
              )}

              {/* Add candidate btn at bottom when has candidates */}
              {candidates.length > 0 && (
                <button
                  onClick={() => setCandidateDrawerOpen(true)}
                  className="w-full mt-4 px-4 py-2.5 bg-white border border-dashed border-background-300 hover:border-primary-300 hover:bg-primary-50/30 text-foreground-500 hover:text-primary-600 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line mr-1.5"></i>
                  添加候选人
                </button>
              )}
            </JobCandidatesSection>
          )}

          {/* ── Tab: Pipeline ────────────────────────── */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {pipelineFilter && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground-600">已筛选：</span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    {pipelineFilter}（{pipelineFiltered.length}人）
                    <button onClick={() => setPipelineFilter(null)} className="cursor-pointer hover:text-primary-900">
                      <i className="ri-close-line"></i>
                    </button>
                  </span>
                </div>
              )}

              {pipelineFilter ? (
                // Filtered candidate list
                pipelineFiltered.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-foreground-400">该阶段暂无候选人</p>
                  </div>
                ) : (
                  <div className="border border-background-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-background-50 border-b border-background-200">
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">职位</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">来源</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">最近进展</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-background-100">
                        {pipelineFiltered.map((c) => (
                          <tr key={c.id} className="hover:bg-background-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-primary-600">{c.name.charAt(0)}</span>
                                </div>
                                <button onClick={() => setQuickDetailCandidate(c)} className="text-sm font-medium text-foreground-900 hover:text-primary-600 transition-colors cursor-pointer text-left">{c.name}</button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground-700 whitespace-nowrap">{c.position}</td>
                            <td className="px-4 py-3 text-sm text-foreground-600 whitespace-nowrap">{c.source}</td>
                            <td className="px-4 py-3 text-xs text-foreground-500">{c.lastUpdate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                // Pipeline overview
                <div className="space-y-2">
                  {pipelineCounts.map((ps) => (
                    <button
                      key={ps.key}
                      onClick={() => ps.count > 0 && setPipelineFilter(ps.key)}
                      className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-lg border transition-all ${
                        ps.count > 0
                          ? `${ps.bgColor} ${ps.borderColor} hover:shadow-sm cursor-pointer`
                          : 'bg-background-50 border-background-200 cursor-default'
                      }`}
                    >
                      <div className={`w-2 h-10 rounded-full ${ps.colorBar}`}></div>
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 border border-background-200">
                        <i className={`${ps.icon} text-base ${ps.count > 0 ? 'text-foreground-700' : 'text-foreground-400'}`}></i>
                      </div>
                      <span className={`text-sm font-medium flex-1 text-left ${ps.count > 0 ? 'text-foreground-900' : 'text-foreground-400'}`}>
                        {ps.label}
                      </span>
                      <span className={`text-lg font-bold ${ps.count > 0 ? 'text-foreground-900' : 'text-foreground-400'}`}>
                        {ps.count}
                      </span>
                      {ps.count > 0 && (
                        <i className="ri-arrow-right-s-line text-foreground-400"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-panels & Modals ────────────────────────── */}
      <JobActivityLogSection>

      <ResumeUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={(files) => {
          const today = new Date().toISOString().slice(0, 10);
          const imported = files.map((file, index): ReqCandidate => ({
            id: generateId(),
            name: file.name.replace(/\.[^.]+$/, '') || `新导入候选人${index + 1}`,
            position: displayTitle,
            source: /\.zip$/i.test(file.name) ? 'ZIP批量导入' : '图片/文件导入',
            stage: '待筛选',
            lastUpdate: today,
          }));
          setLocalCandidates((previous) => [...previous, ...imported]);
          setActiveTab('candidates');
          showToast(`已导入 ${files.length} 份简历并加入当前岗位`);
        }}
      />

      {editOpen && (
        <>
          <div className="fixed inset-0 z-[120] bg-foreground-900/40" onClick={() => setEditOpen(false)}></div>
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl pointer-events-auto" role="dialog" aria-modal="true" aria-label="编辑岗位">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground-900">编辑岗位</h3>
                <button type="button" aria-label="关闭编辑岗位弹窗" onClick={() => setEditOpen(false)} className="h-9 w-9 rounded-lg hover:bg-background-100 cursor-pointer"><i className="ri-close-line text-xl"></i></button>
              </div>
              <label className="mt-5 block text-sm font-medium text-foreground-700" htmlFor="demo-job-title">岗位名称</label>
              <input id="demo-job-title" value={jobTitleDraft} onChange={(event) => setJobTitleDraft(event.target.value)} className="mt-2 w-full rounded-lg border border-background-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none" />
              <p className="mt-3 text-xs text-foreground-500">演示保存会立即更新当前详情；正式接口由研发后续接入。</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setEditOpen(false)} className="rounded-lg border border-background-200 px-4 py-2 text-sm hover:bg-background-50 cursor-pointer">取消</button>
                <button type="button" onClick={() => { const next = jobTitleDraft.trim(); if (!next) return; setSavedJobTitle(next); setEditOpen(false); showToast('岗位信息已保存到当前演示状态'); }} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:bg-primary-600 cursor-pointer">保存修改</button>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Resume Panel */}
      <ResumePanel
        candidate={resumeCandidate ? resolveResumeData(resumeCandidate) : null}
        onClose={() => setResumeCandidate(null)}
      />

      {/* Candidate Quick Detail */}
      <CandidateQuickDetail
        candidate={quickDetailCandidate}
        resumeData={quickDetailCandidate ? resolveResumeData(quickDetailCandidate) : null}
        onClose={() => setQuickDetailCandidate(null)}
      />

      {/* Select Candidate Drawer */}
      <SelectCandidateDrawer
        isOpen={candidateDrawerOpen}
        onClose={() => setCandidateDrawerOpen(false)}
        req={req}
        onAddCandidates={handleAddCandidates}
        onAddAndPush={handleAddAndPush}
      />

      {/* Schedule Interview Modal */}
      <ScheduleInterviewModal
        isOpen={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        candidateName={scheduleTarget?.name || ''}
        position={scheduleTarget?.position || ''}
        onSchedule={handleSchedule}
      />

      {/* Multi Interviewer Push Modal */}
      {showPushModal && (
        <MultiInterviewerPushModal
          targets={pushTargets.map((t) => ({
            candidateId: t.id,
            candidateName: t.name,
            position: t.position,
            source: t.source,
          }))}
          onClose={() => { setShowPushModal(false); setPushTargets([]); }}
          onPush={handlePushConfirm}
        />
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-[100]" onClick={() => setConfirmAction(null)}></div>
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto animate-modal-in">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center mx-auto mb-4">
                  <i className="ri-error-warning-line text-xl text-accent-600"></i>
                </div>
                <h3 className="text-base font-bold text-foreground-900 mb-2">
                  确认{confirmAction.label}？
                </h3>
                <p className="text-sm text-foreground-500">
                  {confirmAction.type === 'paused'
                    ? '暂停后该岗位将不再接受新的候选人，已进行的招聘流程可继续推进。'
                    : '关闭后该岗位将归档，不再显示在招聘列表中。此操作可撤销。'}
                </p>
                <div className="flex items-center gap-3 mt-6">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 px-4 py-2.5 bg-white border border-background-200 hover:bg-background-50 text-foreground-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => applyStatusChange(confirmAction.type)}
                    className="flex-1 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    确认{confirmAction.label}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Transfer Dropdown */}
      {transferTarget && transferDropdown && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => { setTransferTarget(null); setTransferDropdown(null); }}></div>
          <div className="fixed z-[110]" ref={transferRef}
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="bg-white rounded-xl shadow-xl border border-background-200 p-4 w-64">
              <p className="text-sm font-medium text-foreground-900 mb-3">选择目标岗位</p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                <button
                  onClick={() => handleTransfer(candidates.find((c) => c.id === transferTarget)!, '产品经理')}
                  className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 rounded-lg transition-colors cursor-pointer"
                >
                  产品经理
                </button>
                <button
                  onClick={() => handleTransfer(candidates.find((c) => c.id === transferTarget)!, '前端开发工程师')}
                  className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 rounded-lg transition-colors cursor-pointer"
                >
                  前端开发工程师
                </button>
                <button
                  onClick={() => handleTransfer(candidates.find((c) => c.id === transferTarget)!, '测试工程师')}
                  className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 rounded-lg transition-colors cursor-pointer"
                >
                  测试工程师
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </JobActivityLogSection>

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
