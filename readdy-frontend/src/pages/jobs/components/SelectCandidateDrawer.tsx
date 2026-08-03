import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidateList, stageColorMap, type Candidate } from '@/mocks/candidates';
import { requisitionCandidates } from '@/mocks/requisitionCandidates';
import { requisitions } from '@/mocks/jobs';
import ResumePanel from '@/features/candidates/components/ResumePanel';
import CandidateQuickDetail from './CandidateQuickDetail';
import ImportResumeModal from './ImportResumeModal';
import MultiInterviewerPushModal, { type PushReviewData } from './MultiInterviewerPushModal';

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

type JoinStatus = 'available' | 'in_current' | 'in_other' | 'ended';

const allReqIds = Object.keys(requisitionCandidates);

// City mapping for existing candidates (derived from their education / work context)
const candidateCityMap: Record<number, string> = {
  1: '上海', 2: '上海', 3: '杭州', 4: '北京', 5: '北京',
  6: '上海', 7: '广州', 8: '武汉', 9: '武汉', 10: '成都',
  11: '南京', 12: '无锡', 13: '北京', 14: '北京', 15: '成都',
  16: '北京', 17: '哈尔滨', 18: '西安', 19: '天津', 20: '厦门',
  21: '重庆', 22: '杭州', 23: '合肥', 24: '南京', 25: '上海',
  26: '广州', 27: '成都', 28: '上海', 29: '北京', 30: '杭州',
  31: '广州', 32: '广州', 33: '北京',
};

function getCity(c: Candidate): string {
  return c.city || candidateCityMap[c.id] || '北京';
}

// ── Helper: parse education level ───────────────────
function parseEduLevel(edu: string): string {
  if (edu.includes('博士')) return '博士';
  if (edu.includes('硕士')) return '硕士';
  if (edu.includes('本科')) return '本科';
  if (edu.includes('大专')) return '大专';
  return '高中及以下';
}

// ── Helper: map experience years to range ──────────
function getExpRange(expYears: string): string {
  if (!expYears || expYears.includes('应届')) return '应届/1年以内';
  const n = parseInt(expYears);
  if (isNaN(n) || n <= 1) return '应届/1年以内';
  if (n <= 3) return '1–3年';
  if (n <= 5) return '3–5年';
  if (n <= 10) return '5–10年';
  return '10年以上';
}

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

// ── Chip definitions ────────────────────────────────

const sourceChips = [
  { value: '', label: '全部来源' },
  { value: 'PDF导入', label: 'PDF导入' },
  { value: '内部推荐', label: '内部推荐' },
  { value: '猎头公司推荐', label: '猎头推荐' },
  { value: '外部收录', label: '外部收录' },
];

const expRangeChips = [
  { value: '', label: '全部' },
  { value: '应届/1年以内', label: '应届/1年以内' },
  { value: '1–3年', label: '1–3年' },
  { value: '3–5年', label: '3–5年' },
  { value: '5–10年', label: '5–10年' },
  { value: '10年以上', label: '10年以上' },
];

const eduOptions = [
  { value: '高中及以下', label: '高中及以下' },
  { value: '大专', label: '大专' },
  { value: '本科', label: '本科' },
  { value: '硕士', label: '硕士' },
  { value: '博士', label: '博士' },
];

const joinStatusChips = [
  { value: '', label: '全部' },
  { value: 'available', label: '可加入' },
  { value: 'in_other', label: '其他岗位流程中' },
  { value: 'in_current', label: '已在当前岗位' },
  { value: 'ended', label: '已结束' },
];

const cityOptions = [
  { value: '', label: '全部城市' },
  ...['上海', '北京', '杭州', '广州', '深圳', '武汉', '成都', '南京',
  '西安', '天津', '重庆', '合肥', '厦门', '无锡', '哈尔滨', '苏州',
  ].map((c) => ({ value: c, label: c })),
];

const recruiterOptions = [
  { value: '', label: '全部负责人' },
  { value: '张敏', label: '张敏' },
  { value: '李华', label: '李华' },
  { value: '王磊', label: '王磊' },
];

const resumeTimeOptions = [
  { value: '', label: '全部' },
  { value: '7d', label: '最近7天' },
  { value: '14d', label: '最近14天' },
  { value: '30d', label: '最近30天' },
  { value: '90d', label: '最近90天' },
];

const positionChips = [
  { value: '', label: '全部期望岗位' },
  { value: '高级前端工程师', label: '高级前端工程师' },
  { value: '前端开发工程师', label: '前端开发工程师' },
  { value: '后端开发工程师', label: '后端开发工程师' },
  { value: 'Java开发工程师', label: 'Java开发工程师' },
  { value: '产品经理', label: '产品经理' },
  { value: '高级产品经理', label: '高级产品经理' },
  { value: 'UI/UX设计师', label: 'UI/UX设计师' },
  { value: 'UI设计师', label: 'UI设计师' },
  { value: '数据分析师', label: '数据分析师' },
  { value: '测试工程师', label: '测试工程师' },
  { value: '架构师', label: '架构师' },
  { value: 'HRBP', label: 'HRBP' },
  { value: '市场运营专员', label: '市场运营专员' },
];

const sortModes = [
  { value: 'match' as const, label: '岗位匹配度' },
  { value: 'updated' as const, label: '最近更新' },
  { value: 'entry' as const, label: '最近入库' },
];

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
  const filteredCandidates = useMemo(() => {
    let data = [...candidatesWithStatus];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.position.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // City
    if (cityFilter) {
      data = data.filter((c) => getCity(c) === cityFilter);
    }

    // Join status filter (overrides joinableOnly when set)
    if (joinStatusFilter) {
      data = data.filter((c) => c.joinStatus === joinStatusFilter);
    } else if (joinableOnly) {
      data = data.filter((c) => c.joinStatus === 'available');
    }

    // Source (in more filters)
    if (sourceFilter) {
      data = data.filter((c) => c.source === sourceFilter);
    }

    // Experience range
    if (expFilter) {
      data = data.filter((c) => getExpRange(c.experienceYears) === expFilter);
    }

    // Education multi-select
    if (eduFilters.size > 0) {
      data = data.filter((c) => eduFilters.has(parseEduLevel(c.education)));
    }

    // Recruiter (in more filters)
    if (recruiterFilter) {
      data = data.filter((c) => c.recruiter === recruiterFilter);
    }

    // Resume update time (in more filters)
    if (resumeTimeFilter) {
      const daysMap: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
      const days = daysMap[resumeTimeFilter] || 999;
      const cutoff = new Date('2026-07-21');
      cutoff.setDate(cutoff.getDate() - days);
      data = data.filter((c) => {
        const updated = new Date(c.resumeUpdatedAt || c.appliedAt);
        return updated >= cutoff;
      });
    }

    // Position / desired role (in more filters)
    if (positionFilter) {
      data = data.filter((c) => c.position === positionFilter);
    }

    // Sort
    data.sort((a, b) => {
      switch (sortMode) {
        case 'match':
          return (b.matchScore || 0) - (a.matchScore || 0);
        case 'updated':
          return new Date(b.resumeUpdatedAt || b.appliedAt).getTime() - new Date(a.resumeUpdatedAt || a.appliedAt).getTime();
        case 'entry':
          return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
        default:
          return 0;
      }
    });

    return data;
  }, [
    searchQuery, cityFilter, joinStatusFilter, joinableOnly,
    sourceFilter, expFilter, eduFilters, recruiterFilter, resumeTimeFilter, positionFilter,
    sortMode, candidatesWithStatus,
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
  const renderSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    accent?: boolean
  ) => (
    <div>
      <span className="text-[11px] text-foreground-400 mb-1 block">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-foreground-900 focus:outline-none appearance-none pr-8 cursor-pointer transition-colors ${
            value
              ? accent
                ? 'border-accent-300 bg-accent-50/60 text-accent-700'
                : 'border-primary-300 bg-primary-50/60 text-primary-700'
              : 'border-background-200 hover:border-primary-300'
          }`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <i className="ri-arrow-down-s-line text-foreground-400 text-sm"></i>
        </div>
      </div>
    </div>
  );

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

        {/* Filters */}
        <div className="px-6 py-3 border-b border-background-100 flex-shrink-0 space-y-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-foreground-400 text-sm"></i>
            </div>
            <input
              type="text"
              placeholder="搜索姓名、职位或技能标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
            />
          </div>

          {/* Quick filters: 期望工作城市 + 仅显示可加入 */}
          <div className="flex items-end gap-3">
            <div className="w-52">
              <span className="text-[11px] text-foreground-400 mb-1 block">期望工作城市</span>
              <div className="relative">
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-foreground-900 focus:outline-none appearance-none pr-8 cursor-pointer transition-colors ${
                    cityFilter
                      ? 'border-primary-300 bg-primary-50/60 text-primary-700'
                      : 'border-background-200 hover:border-primary-300'
                  }`}
                >
                  {cityOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <i className="ri-arrow-down-s-line text-foreground-400 text-sm"></i>
                </div>
              </div>
            </div>
            <button
              onClick={() => setJoinableOnly(!joinableOnly)}
              className={`px-3 py-2 text-xs rounded-lg border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                joinableOnly
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-white text-foreground-600 border-background-200 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              <i className={`${joinableOnly ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} text-sm`}></i>
              仅显示可加入
            </button>
          </div>

          {/* Join status chips */}
          <div>
            <span className="text-[11px] text-foreground-400 mb-1.5 block">加入状态</span>
            <div className="flex flex-wrap gap-1.5">
              {joinStatusChips.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => {
                    setJoinStatusFilter(joinStatusFilter === chip.value ? '' : chip.value);
                    if (chip.value) setJoinableOnly(false);
                  }}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                    joinStatusFilter === chip.value
                      ? 'bg-accent-500 text-white border-accent-500'
                      : 'bg-white text-foreground-600 border-background-200 hover:border-accent-300 hover:text-accent-600'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* More filters toggle */}
          <div>
            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer"
            >
              {showMoreFilters ? <i className="ri-arrow-up-s-line"></i> : <i className="ri-arrow-down-s-line"></i>}
              更多筛选
              {moreFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary-500 text-white text-[10px] font-medium">
                  {moreFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filters: 来源 + 工作年限 + 学历 + 负责人 + 简历更新时间 + 期望岗位 */}
          {showMoreFilters && (
            <div className="space-y-3 pt-1 border-t border-background-100">
              {/* 简历来源 */}
              <div>
                <span className="text-[11px] text-foreground-400 mb-1.5 block">简历来源</span>
                <div className="flex flex-wrap gap-1.5">
                  {sourceChips.map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setSourceFilter(sourceFilter === chip.value ? '' : chip.value)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                        sourceFilter === chip.value
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-white text-foreground-600 border-background-200 hover:border-primary-300 hover:text-primary-600'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 期望岗位 */}
              <div>
                <span className="text-[11px] text-foreground-400 mb-1.5 block">期望岗位</span>
                <div className="flex flex-wrap gap-1.5">
                  {positionChips.map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setPositionFilter(positionFilter === chip.value ? '' : chip.value)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                        positionFilter === chip.value
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'bg-white text-foreground-600 border-background-200 hover:border-accent-300 hover:text-accent-600'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 工作年限 + 学历 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-foreground-400 mb-1.5 block">工作年限</span>
                  <div className="flex flex-wrap gap-1.5">
                    {expRangeChips.map((chip) => (
                      <button
                        key={chip.value}
                        onClick={() => setExpFilter(expFilter === chip.value ? '' : chip.value)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                          expFilter === chip.value
                            ? 'bg-secondary-500 text-white border-secondary-500'
                            : 'bg-white text-foreground-600 border-background-200 hover:border-secondary-300 hover:text-secondary-600'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-foreground-400 mb-1.5 block">学历（可多选）</span>
                  <div className="flex flex-wrap gap-1.5">
                    {eduOptions.map((opt) => {
                      const isActive = eduFilters.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setEduFilters((prev) => {
                              const next = new Set(prev);
                              if (next.has(opt.value)) {
                                next.delete(opt.value);
                              } else {
                                next.add(opt.value);
                              }
                              return next;
                            });
                          }}
                          className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-accent-500 text-white border-accent-500'
                              : 'bg-white text-foreground-600 border-background-200 hover:border-accent-300 hover:text-accent-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 负责人 + 简历更新时间 */}
              <div className="grid grid-cols-2 gap-3">
                {renderSelect('负责人', recruiterFilter, setRecruiterFilter, recruiterOptions, true)}
                <div>
                  <span className="text-[11px] text-foreground-400 mb-1 block">简历更新时间</span>
                  <div className="relative">
                    <select
                      value={resumeTimeFilter}
                      onChange={(e) => setResumeTimeFilter(e.target.value)}
                      className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-foreground-900 focus:outline-none appearance-none pr-8 cursor-pointer transition-colors ${
                        resumeTimeFilter
                          ? 'border-accent-300 bg-accent-50/60 text-accent-700'
                          : 'border-background-200 hover:border-accent-300'
                      }`}
                    >
                      {resumeTimeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <i className="ri-arrow-down-s-line text-foreground-400 text-sm"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats + sort + legend row */}
          <div className="flex items-center gap-3 text-xs pt-1 border-t border-background-100 flex-wrap">
            <span className="text-foreground-500 whitespace-nowrap">
              共 {filterStats.total} 人
              <span className="mx-0.5">·</span>
              可加入 {filterStats.available}
              {hasActiveFilters ? ` · 筛选结果 ${filterStats.filtered}` : ''}
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer whitespace-nowrap"
              >
                <i className="ri-close-circle-line mr-0.5"></i>清除筛选
              </button>
            )}

            <div className="flex-1"></div>

            {/* Sort mode buttons */}
            <span className="text-foreground-400 whitespace-nowrap">排序：</span>
            <div className="flex items-center gap-0.5">
              {sortModes.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setSortMode(mode.value)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                    sortMode === mode.value
                      ? 'bg-foreground-900 text-white'
                      : 'bg-background-100 text-foreground-500 hover:bg-background-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Legend */}
            <span className="flex items-center gap-1 text-foreground-500">
              <span className="w-2 h-2 rounded-full bg-primary-500"></span>
              可加入
            </span>
            <span className="flex items-center gap-1 text-foreground-500">
              <span className="w-2 h-2 rounded-full bg-primary-200"></span>
              已加入
            </span>
            <span className="flex items-center gap-1 text-foreground-500">
              <span className="w-2 h-2 rounded-full bg-foreground-300"></span>
              其他流程/已结束
            </span>
            {selectedIds.length > 0 && (
              <span className="text-xs text-primary-600 font-medium whitespace-nowrap">
                已选 {selectedIds.length} 人
              </span>
            )}
          </div>
        </div>

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
