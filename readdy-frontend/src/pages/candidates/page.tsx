import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  allCandidateProfiles,
  statusLabel,
  statusTagColor,
  type CandidateProfile,
  type CandidateStatus,
  type CandidateApplication,
  type TalentPoolInfo,
} from '@/mocks/candidateProfiles';
import { candidateList, stageColorMap, type Candidate } from '@/mocks/candidates';
import { requisitionCandidates } from '@/mocks/requisitionCandidates';
import { resumePushRecords, type ResumePushRecord, getActivePushRecord } from '@/mocks/resumePush';
import ResumePanel from '@/pages/jobs/components/ResumePanel';
import CandidateDetailDrawer from './components/CandidateDetailDrawer';
import AddToPositionModal from './components/AddToPositionModal';
import HeadhunterImportModal from './components/HeadhunterImportModal';
import PushToReviewerModal from './components/PushToReviewerModal';
import { useToast } from '@/hooks/useToast';

// ── Types ──────────────────────────────────────────────

type StatusFilter = CandidateStatus | 'all';
type BatchAction = 'owner' | 'tag' | null;

// ── Derived filter options ─────────────────────────────

const positionOptions = (() => {
  const set = new Set<string>();
  allCandidateProfiles.forEach((p) => {
    p.applications.forEach((a) => { if (a.position) set.add(a.position); });
    if (p.candidate.position && !p.applications.length) set.add(p.candidate.position);
  });
  const opts = [{ value: '', label: '全部岗位' }];
  Array.from(set).sort().forEach((v) => opts.push({ value: v, label: v }));
  return opts;
})();

const ownerOptions = (() => {
  const set = new Set<string>();
  allCandidateProfiles.forEach((p) => { if (p.displayOwner) set.add(p.displayOwner); });
  return [{ value: '', label: '全部负责人' }, ...Array.from(set).sort().map((o) => ({ value: o, label: o }))];
})();

const sourceOptions = [
  { value: '', label: '全部来源' },
  { value: 'PDF导入', label: 'PDF导入' },
  { value: '内部推荐', label: '内部推荐' },
  { value: '猎头公司推荐', label: '猎头公司推荐' },
  { value: '外部收录', label: '外部收录' },
];

const supportedResumePattern = /\.(pdf|doc|docx|jpe?g|png|webp|gif|zip)$/i;
const supportedResumeAccept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.zip,image/jpeg,image/png,image/webp,image/gif,application/zip';

// ── Page Component ─────────────────────────────────────

export default function CandidatesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Core state ────────────────────────────────────────
  const [profiles, setProfiles] = useState<CandidateProfile[]>(() => [...allCandidateProfiles]);
  const [newCandidates, setNewCandidates] = useState<Candidate[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [deptFilter, setDeptFilter] = useState('');
  const [expFilter, setExpFilter] = useState('');
  const [eduFilter, setEduFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [latestActivityFilter, setLatestActivityFilter] = useState('');
  const [headerFilterOpen, setHeaderFilterOpen] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Panels & modals
  const [detailProfile, setDetailProfile] = useState<CandidateProfile | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'current' | 'history'>('current');
  const [addToPositionProfile, setAddToPositionProfile] = useState<CandidateProfile | null>(null);
  const [resumeProfile, setResumeProfile] = useState<CandidateProfile | null>(null);
  const [expandedAppIds, setExpandedAppIds] = useState<Set<number>>(new Set());
  const [flowDropdownId, setFlowDropdownId] = useState<number | null>(null);
  const [dropdownId, setDropdownId] = useState<number | null>(null);
  const [hhModalOpen, setHhModalOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pushModalTargets, setPushModalTargets] = useState<Array<{ candidateId: number; candidateName: string; position: string; source: string }> | null>(null);
  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const [batchValue, setBatchValue] = useState('');
  const [editingProfile, setEditingProfile] = useState<CandidateProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [lastDemoUpdate, setLastDemoUpdate] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const headerFilterRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextImportedIdRef = useRef(Math.max(...candidateList.map((candidate) => candidate.id), 0) + 1);

  // Navigation state
  const navState = location.state as { fromDashboard?: boolean; fromJobs?: boolean; jobTitle?: string; jobId?: string; selectMode?: boolean; presetFilter?: Record<string, string> } | null;
  const presetFilter = navState?.presetFilter;

  // ── Derived: all profiles including new candidates ─────
  const allProfiles = useMemo(() => {
    const main = profiles.map((p) => {
      // Recalculate status from applications
      const hasActiveApp = p.applications.some((a) => !['已入职', '已淘汰'].includes(a.stage));
      if (p.status === 'talentPool') return p;
      if (hasActiveApp) return { ...p, status: 'recruiting' as CandidateStatus };
      if (p.applications.length > 0) return { ...p, status: 'ended' as CandidateStatus };
      return p;
    });

    // Merge imported new candidates as recruiting profiles
    const importedProfiles: CandidateProfile[] = newCandidates.map((nc) => ({
      candidateId: nc.id,
      candidate: nc,
      status: 'recruiting' as CandidateStatus,
      applications: [{
        reqId: '', reqTitle: nc.position, position: nc.position,
        stage: '待筛选', stageColor: stageColorMap['待筛选'],
        owner: nc.recruiter || '未分配', source: nc.source,
        appliedAt: nc.appliedAt, progress: '新导入，待完善信息',
      }],
      talentPoolInfo: null,
      latestActivity: '新导入，待完善信息并绑定岗位',
      displayPosition: nc.position,
      displayPositionCount: 1,
      displayOwner: nc.recruiter || '未分配',
      displaySource: nc.source,
    }));

    return [...main, ...importedProfiles];
  }, [profiles, newCandidates]);

  // ── Filtered data ──────────────────────────────────────
  const filteredProfiles = useMemo(() => {
    let data = [...allProfiles];

    if (statusFilter !== 'all') {
      data = data.filter((p) => p.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((p) => {
        const c = p.candidate;
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          p.displayPosition.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    }

    if (positionFilter) {
      data = data.filter((p) => p.applications.some((a) => a.position === positionFilter));
    }

    if (sourceFilter) {
      data = data.filter((p) => p.displaySource === sourceFilter);
    }

    if (ownerFilter) {
      data = data.filter((p) => p.displayOwner === ownerFilter);
    }

    if (deptFilter) {
      data = data.filter((p) => p.candidate.department === deptFilter);
    }

    if (expFilter) {
      data = data.filter((p) => p.candidate.experienceYears === expFilter);
    }

    if (eduFilter) {
      if (eduFilter === '尚未明确') {
        data = data.filter((p) => {
          const prefix = p.candidate.education.split('·')[0].trim();
          return !prefix.startsWith('全日制') && !prefix.startsWith('非全日制');
        });
      } else {
        data = data.filter((p) => p.candidate.education.split('·')[0].trim() === eduFilter);
      }
    }

    if (genderFilter) {
      data = data.filter((p) => p.candidate.gender === genderFilter);
    }

    if (tagFilter) {
      data = data.filter((p) => p.candidate.tags.includes(tagFilter));
    }

    if (latestActivityFilter) {
      data = data.filter((p) => p.latestActivity.includes(latestActivityFilter));
    }

    return data;
  }, [allProfiles, statusFilter, searchQuery, positionFilter, sourceFilter, ownerFilter, deptFilter, expFilter, eduFilter, genderFilter, tagFilter, latestActivityFilter]);

  // ── Stats ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = allProfiles.length;
    const recruiting = allProfiles.filter((p) => p.status === 'recruiting').length;
    const pool = allProfiles.filter((p) => p.status === 'talentPool').length;
    const ended = allProfiles.filter((p) => p.status === 'ended').length;
    return { total, recruiting, pool, ended };
  }, [allProfiles]);

  const hasAnyFilter = statusFilter !== 'all' || searchQuery || positionFilter || sourceFilter || ownerFilter || deptFilter || expFilter || eduFilter || genderFilter || tagFilter || latestActivityFilter;
  const moreFiltersActive = !!(sourceFilter || ownerFilter || deptFilter || expFilter || eduFilter || genderFilter || tagFilter || latestActivityFilter);
  const activeMoreCount = [sourceFilter, ownerFilter, deptFilter, expFilter, eduFilter, genderFilter, tagFilter, latestActivityFilter].filter(Boolean).length;

  const activityOptions = useMemo(() => {
    const set = new Set<string>();
    allProfiles.forEach((p) => {
      const keyword = p.latestActivity.split('，')[0] || p.latestActivity.slice(0, 12);
      set.add(keyword);
    });
    return [{ value: '', label: '全部动态' }, ...Array.from(set).sort().map((v) => ({ value: v, label: v }))];
  }, [allProfiles]);

  // ── Apply preset filter from navigation state ────────
  useEffect(() => {
    const filter = presetFilter;
    if (!filter) return;

    if (filter.status === 'recruiting') setStatusFilter('recruiting');
    else if (filter.status === 'talentPool') setStatusFilter('talentPool');
    else if (filter.status === 'ended') setStatusFilter('ended');
    else if (filter.status === 'hired') setStatusFilter('ended');

    if (filter.source) setSourceFilter(filter.source);
    if (filter.position) setPositionFilter(filter.position);
    if (filter.name) setSearchQuery(filter.name);
    if (filter.experience) setExpFilter(filter.experience);
    if (filter.education) setEduFilter(filter.education);
    if (filter.skill) setTagFilter(filter.skill);
    if (filter.department) setDeptFilter(filter.department);
    if (filter.reactivatable === 'true') {
      setShowMoreFilters(true);
    }

    // Clear the preset so it doesn't reapply on re-render
    window.history.replaceState({}, '');
  }, [presetFilter]);

  // ── Click outside dropdown ────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownId(null);
      if (flowDropdownId !== null) setFlowDropdownId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [flowDropdownId]);

  useEffect(() => {
    if (!headerFilterOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerFilterRef.current && !headerFilterRef.current.contains(e.target as Node)) setHeaderFilterOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headerFilterOpen]);

  // ── Handlers ──────────────────────────────────────────

  const handleStatusFilterClick = (filter: StatusFilter) => {
    setStatusFilter((prev) => (prev === filter ? 'all' : filter));
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setPositionFilter('');
    setSourceFilter('');
    setOwnerFilter('');
    setDeptFilter('');
    setExpFilter('');
    setEduFilter('');
    setGenderFilter('');
    setTagFilter('');
    setLatestActivityFilter('');
    setStatusFilter('all');
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProfiles.length && filteredProfiles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProfiles.map((p) => p.candidateId)));
    }
  };

  // ── Mutations ─────────────────────────────────────────

  const handleAddToPosition = (profile: CandidateProfile, reqId: string, reqTitle: string) => {
    // If candidate was in talent pool, remove from pool
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.candidateId !== profile.candidateId) return p;
        const newApp: CandidateApplication = {
          reqId,
          reqTitle,
          position: reqTitle,
          stage: '待筛选',
          stageColor: stageColorMap['待筛选'],
          owner: p.displayOwner,
          source: p.displaySource,
          appliedAt: new Date().toISOString().split('T')[0],
          progress: '新加入，待HR初筛',
        };
        return {
          ...p,
          status: 'recruiting' as CandidateStatus,
          talentPoolInfo: null,
          applications: [...p.applications, newApp],
          displayPosition: reqTitle,
          displayPositionCount: p.displayPositionCount + 1,
          latestActivity: `已加入「${reqTitle}」，待筛选`,
        };
      })
    );

    // Sync to requisitionCandidates so JobDetailPanel can pick it up
    if (!requisitionCandidates[reqId]) {
      requisitionCandidates[reqId] = [];
    }
    const c = profile.candidate;
    const alreadyInReq = requisitionCandidates[reqId].some((rc) => rc.name === c.name);
    if (!alreadyInReq) {
      requisitionCandidates[reqId].push({
        id: c.id,
        name: c.name,
        gender: c.gender,
        age: c.age,
        phone: c.phone,
        email: c.email,
        source: c.source,
        stage: '已推送简历',
        appliedAt: new Date().toISOString().split('T')[0],
        position: reqTitle,
        experienceYears: c.experienceYears,
        education: c.education,
        summary: c.summary,
        skills: c.skills,
        workHistory: c.workHistory,
        educationHistory: c.educationHistory,
        projects: c.projects,
        languages: c.languages,
        certifications: c.certifications,
      } as unknown as (typeof requisitionCandidates)[string][number]);
    }

    // Also update candidateList so SelectCandidateDrawer can reflect changes
    const listCand = candidateList.find((x) => x.id === c.id);
    if (listCand) {
      listCand.position = reqTitle;
      listCand.stage = '待筛选';
      listCand.stageColor = stageColorMap['待筛选'];
    }

    showToast(`「${profile.candidate.name}」已加入「${reqTitle}」，阶段为待筛选`);
  };

  const handleMoveToPool = (profile: CandidateProfile) => {
    const now = new Date().toISOString().split('T')[0];
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.candidateId !== profile.candidateId) return p;
        const poolInfo: TalentPoolInfo = {
          reason: '由招聘专员手动加入人才池',
          tags: p.candidate.tags,
          contactable: '待确认',
          addedAt: now,
        };
        return {
          ...p,
          status: 'talentPool' as CandidateStatus,
          talentPoolInfo: poolInfo,
          latestActivity: `已加入人才池 (${now})`,
        };
      })
    );
    showToast(`「${profile.candidate.name}」已加入人才池`);
  };

  const handleRemoveFromPool = (profile: CandidateProfile) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.candidateId !== profile.candidateId) return p;
        const hasActiveApp = p.applications.some((a) => !['已入职', '已淘汰'].includes(a.stage));
        return {
          ...p,
          status: hasActiveApp ? ('recruiting' as CandidateStatus) : ('ended' as CandidateStatus),
          talentPoolInfo: null,
          latestActivity: '已从人才池移出',
        };
      })
    );
    showToast(`「${profile.candidate.name}」已从人才池移出`);
  };

  const openBatchAction = (action: Exclude<BatchAction, null>) => {
    setBatchAction(action);
    setBatchValue(action === 'owner' ? '李华' : '重点关注');
  };

  const handleConfirmBatchAction = () => {
    const value = batchValue.trim();
    if (!value) {
      showToast(batchAction === 'owner' ? '请选择负责人' : '请输入标签');
      return;
    }

    const targetIds = new Set(selectedIds);
    const targetCount = targetIds.size;
    if (batchAction === 'owner') {
      setProfiles((prev) => prev.map((profile) => targetIds.has(profile.candidateId)
        ? {
            ...profile,
            candidate: { ...profile.candidate, recruiter: value },
            applications: profile.applications.map((application) => ({ ...application, owner: value })),
            displayOwner: value,
            latestActivity: `招聘负责人已调整为 ${value}`,
          }
        : profile));
      setNewCandidates((prev) => prev.map((candidate) => targetIds.has(candidate.id)
        ? { ...candidate, recruiter: value }
        : candidate));
      setLastDemoUpdate(`已把 ${targetCount} 位候选人的负责人调整为 ${value}`);
      showToast(`已分配 ${targetCount} 位候选人给 ${value}`);
    } else if (batchAction === 'tag') {
      setProfiles((prev) => prev.map((profile) => targetIds.has(profile.candidateId)
        ? {
            ...profile,
            candidate: {
              ...profile.candidate,
              tags: profile.candidate.tags.includes(value)
                ? profile.candidate.tags
                : [...profile.candidate.tags, value],
            },
            latestActivity: `已添加标签「${value}」`,
          }
        : profile));
      setNewCandidates((prev) => prev.map((candidate) => targetIds.has(candidate.id)
        ? {
            ...candidate,
            tags: candidate.tags.includes(value) ? candidate.tags : [...candidate.tags, value],
          }
        : candidate));
      setLastDemoUpdate(`已给 ${targetCount} 位候选人添加标签「${value}」`);
      showToast(`已为 ${targetCount} 位候选人添加标签「${value}」`);
    }

    setBatchAction(null);
    setBatchValue('');
    setSelectedIds(new Set());
  };

  const openCandidateEditor = (profile: CandidateProfile) => {
    setEditingProfile(profile);
    setEditName(profile.candidate.name);
    setEditPhone(profile.candidate.phone);
    setEditEmail(profile.candidate.email);
    setDropdownId(null);
  };

  const handleSaveCandidate = () => {
    if (!editingProfile) return;
    const name = editName.trim();
    if (!name) {
      showToast('候选人姓名不能为空');
      return;
    }

    const candidateId = editingProfile.candidateId;
    const patch = { name, phone: editPhone.trim(), email: editEmail.trim() };
    setProfiles((prev) => prev.map((profile) => profile.candidateId === candidateId
      ? {
          ...profile,
          candidate: { ...profile.candidate, ...patch },
          latestActivity: '候选人档案已更新',
        }
      : profile));
    setNewCandidates((prev) => prev.map((candidate) => candidate.id === candidateId
      ? { ...candidate, ...patch }
      : candidate));
    setLastDemoUpdate(`候选人「${name}」的档案已保存`);
    showToast(`候选人「${name}」的档案已更新`);
    setEditingProfile(null);
  };

  const handleImportResume = (file: File) => {
    const nameParts = file.name.replace(supportedResumePattern, '').split(/[-_\s]+/);
    const guessedName = nameParts.length >= 1 ? nameParts[0] : file.name;
    const newId = nextImportedIdRef.current++;
    const isImage = /\.(jpe?g|png|webp|gif)$/i.test(file.name);
    const isZip = /\.zip$/i.test(file.name);
    const importSource = isImage ? '图片识别' : isZip ? 'ZIP批量导入' : 'PDF导入';
    const newCandidate: Candidate = {
      id: newId, name: guessedName, gender: '未知', age: 0, phone: '', email: '',
      position: '待定', department: '待分配', source: importSource, stage: '待筛选',
      stageColor: stageColorMap['待筛选'], appliedAt: new Date().toISOString().split('T')[0],
      education: '未知', experience: '未知', experienceYears: '未知', tags: [], resumeUrl: '#',
      summary: `从文件「${file.name}」导入，待完善信息。`, workHistory: [], educationHistory: [], skills: [], screeningStage: 'ai',
    };
    setNewCandidates((prev) => [...prev, newCandidate]);
    setLastDemoUpdate(`「${file.name}」已完成演示解析并加入简历库`);
    showToast(`「${file.name}」导入成功，请完善候选人信息。`);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (supportedResumePattern.test(file.name)) handleImportResume(file);
      else showToast('支持 PDF、DOC、DOCX、JPG、PNG、WebP、GIF 和 ZIP');
    });
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    Array.from(files).forEach((file) => {
      if (supportedResumePattern.test(file.name)) handleImportResume(file);
      else showToast(`「${file.name}」格式不支持`);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportCSV = () => {
    const data = selectedIds.size > 0 ? filteredProfiles.filter((p) => selectedIds.has(p.candidateId)) : filteredProfiles;
    const headers = ['姓名', '应聘岗位', '候选人状态', '来源', '招聘负责人', '最近动态', '学历', '经验年限', '电话', '邮箱'];
    const rows = data.map((p) => [p.candidate.name, p.displayPosition, statusLabel[p.status], p.displaySource, p.displayOwner, p.latestActivity, p.candidate.education, p.candidate.experienceYears, p.candidate.phone, p.candidate.email]);
    const bom = '\uFEFF';
    const csvContent = bom + [headers.join(','), ...rows.map((row) => row.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `候选人导出_${new Date().toISOString().split('T')[0]}.csv`; link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${data.length} 条数据`);
  };

  const handlePushToReviewer = (data: {
    reviewerId: string;
    reviewerName: string;
    reviewerTitle: string;
    deadline: string;
    keyRequirements: string;
  }) => {
    if (!pushModalTargets) return;
    const now = new Date().toISOString();
    const currentRecruiter = '李华'; // recruiter identity

    // Update candidate stage to 面试官评审中
    pushModalTargets.forEach((target) => {
      const profile = allProfiles.find((p) => p.candidateId === target.candidateId);
      if (profile) {
        // Update profile applications
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.candidateId !== target.candidateId) return p;
            return {
              ...p,
              applications: p.applications.map((app) => ({
                ...app,
                stage: '面试官评审中',
                stageColor: stageColorMap['面试官评审中'],
                progress: `面试官(${data.reviewerName})评审中，截止${data.deadline}`,
              })),
              latestActivity: `已推送${data.reviewerName}(${data.reviewerTitle})评审，截止${data.deadline}`,
            };
          })
        );
      }

      // Update candidateList
      const cand = candidateList.find((c) => c.id === target.candidateId);
      if (cand) {
        cand.stage = '面试官评审中';
        cand.stageColor = stageColorMap['面试官评审中'];
        cand.assignedReviewer = data.reviewerName;
        cand.reviewerFeedback = 'pending';
      }
    });

    // Add push records (in memory, simulating)
    const maxId = resumePushRecords.reduce((m, r) => Math.max(m, r.id), 0);
    pushModalTargets.forEach((target, idx) => {
      const existing = getActivePushRecord(target.candidateId);
      const pushCount = existing ? existing.pushCount + 1 : 1;
      resumePushRecords.push({
        id: maxId + idx + 1,
        candidateId: target.candidateId,
        candidateName: target.candidateName,
        position: target.position,
        source: target.source,
        pusher: currentRecruiter,
        pushTime: now,
        reviewerId: data.reviewerId,
        reviewerName: data.reviewerName,
        reviewerTitle: data.reviewerTitle,
        deadline: data.deadline,
        keyRequirements: data.keyRequirements,
        status: 'pending',
        reviewComment: '',
        reviewTime: null,
        scheduleMethod: null,
        scheduledTime: null,
        scheduledEndTime: null,
        interviewType: null,
        interviewLocation: null,
        interviewId: null,
        pushCount,
      });
    });

    setPushModalTargets(null);
    setSelectedIds(new Set());
    showToast(`已成功推送 ${pushModalTargets.length} 位候选人给 ${data.reviewerName}(${data.reviewerTitle}) 评审`);
  };

  return (
    <div className="px-6 pb-6 pt-3 space-y-5">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground-900">简历库</h1>
          {navState?.fromJobs && navState?.jobTitle && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <button onClick={() => navigate('/jobs')} className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer flex items-center gap-1">
                <i className="ri-arrow-left-line"></i> 返回招聘管理
              </button>
              <span className="text-foreground-300 text-xs">|</span>
              <span className="text-xs text-foreground-500">岗位：{navState.jobTitle}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple accept={supportedResumeAccept} onChange={handleFileSelect} className="hidden" />
          <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="导入简历"
            title="支持 PDF、DOC、DOCX、JPG、PNG、WebP、GIF 和 ZIP"
            className={`px-3 py-1.5 border-2 border-dashed rounded-lg text-sm transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${dragOver ? 'border-primary-400 bg-primary-50/50' : 'border-background-300 hover:border-primary-300 hover:bg-primary-50/30'}`}
          >
            <i className="ri-file-upload-line text-foreground-400"></i>
            <span className="text-foreground-600">导入简历</span>
          </div>
          <button onClick={() => setHhModalOpen(true)} className="px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <i className="ri-briefcase-line text-sm"></i> 猎头推荐导入
          </button>
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-white border border-background-200 hover:bg-background-50 text-foreground-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <i className="ri-download-line text-sm"></i> 导出
          </button>
        </div>
      </div>

      {lastDemoUpdate && (
        <div className="flex items-center justify-between gap-4 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 rounded-lg" role="status">
          <span className="flex items-center gap-2">
            <i className="ri-checkbox-circle-line text-primary-600"></i>
            {lastDemoUpdate}
          </span>
          <button
            type="button"
            onClick={() => setLastDemoUpdate('')}
            aria-label="关闭操作结果"
            title="关闭"
            className="w-7 h-7 flex items-center justify-center rounded-md text-primary-600 hover:bg-primary-100 cursor-pointer"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      {/* ── Top Stats Bar ────────────────────────────────── */}
      <div className="rounded-xl border border-background-200 bg-white overflow-hidden">
        <div className="flex items-center divide-x divide-background-200">
          {([
            { key: 'all' as const, label: '全部候选人', count: stats.total },
            { key: 'recruiting' as const, label: '招聘流程中', count: stats.recruiting },
            { key: 'talentPool' as const, label: '人才池', count: stats.pool },
            { key: 'ended' as const, label: '已结束', count: stats.ended },
          ]).map((item) => {
            const isActive = statusFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleStatusFilterClick(item.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-all cursor-pointer whitespace-nowrap ${isActive ? 'bg-primary-500 text-white font-semibold' : 'hover:bg-background-50/50 text-foreground-600'}`}
              >
                <span className={`font-bold ${isActive ? 'text-white' : 'text-foreground-800'}`}>{item.count}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Default Filters ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-foreground-400 text-sm"></i></div>
          <input type="text" placeholder="搜索候选人姓名、职位..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 pl-9 pr-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300" />
        </div>
        <button
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${showMoreFilters || moreFiltersActive ? 'bg-background-100 text-foreground-800' : 'bg-white border border-background-200 text-foreground-600 hover:bg-background-50'}`}
        >
          <i className={`text-sm ${showMoreFilters ? 'ri-filter-3-fill' : 'ri-filter-3-line'}`}></i>
          更多筛选
          {moreFiltersActive && activeMoreCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold">{activeMoreCount}</span>
          )}
        </button>
        {hasAnyFilter && (
          <button onClick={clearAllFilters} className="px-3 py-2 text-sm text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1">
            <i className="ri-close-circle-line"></i> 清除全部
          </button>
        )}
      </div>

      {/* ── Active Filter Tags ───────────────────────────── */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-2">
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-primary-50 text-primary-700 rounded-full">
              状态: {statusFilter === 'recruiting' ? '招聘流程中' : statusFilter === 'talentPool' ? '人才池' : '已结束'}
              <button onClick={() => setStatusFilter('all')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              搜索: {searchQuery}
              <button onClick={() => setSearchQuery('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {positionFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              岗位: {positionFilter}
              <button onClick={() => setPositionFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {sourceFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              来源: {sourceFilter}
              <button onClick={() => setSourceFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {ownerFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              负责人: {ownerFilter}
              <button onClick={() => setOwnerFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {deptFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              部门: {deptFilter}
              <button onClick={() => setDeptFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {expFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              年限: {expFilter}
              <button onClick={() => setExpFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {eduFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              学历: {eduFilter}
              <button onClick={() => setEduFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {genderFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              性别: {genderFilter}
              <button onClick={() => setGenderFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {tagFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              标签: {tagFilter}
              <button onClick={() => setTagFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
          {latestActivityFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-background-100 text-foreground-700 rounded-full">
              动态: {latestActivityFilter}
              <button onClick={() => setLatestActivityFilter('')} className="cursor-pointer hover:text-accent-600"><i className="ri-close-line"></i></button>
            </span>
          )}
        </div>
      )}

      {/* ── More Filters Panel ───────────────────────────── */}
      {showMoreFilters && (
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none cursor-pointer">
              <option value="">全部部门</option>
              <option value="技术一组">技术一组</option>
              <option value="技术二组">技术二组</option>
              <option value="产品一组">产品一组</option>
              <option value="产品二组">产品二组</option>
              <option value="设计一组">设计一组</option>
              <option value="数据一组">数据一组</option>
              <option value="人力一组">人力一组</option>
              <option value="市场一组">市场一组</option>
            </select>
            <select value={expFilter} onChange={(e) => setExpFilter(e.target.value)} className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none cursor-pointer">
              <option value="">工作年限</option>
              {['1年', '2年', '3年', '4年', '5年', '6年', '7年', '8年', '9年', '10年', '11年'].map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={eduFilter} onChange={(e) => setEduFilter(e.target.value)} className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none cursor-pointer">
              <option value="">学历</option>
              <option value="全日制本科">全日制本科</option>
              <option value="全日制硕士">全日制硕士</option>
              <option value="全日制博士">全日制博士</option>
              <option value="非全日制本科">非全日制本科</option>
              <option value="非全日制硕士">非全日制硕士</option>
              <option value="尚未明确">尚未明确</option>
            </select>
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none cursor-pointer">
              <option value="">性别</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none cursor-pointer">
              <option value="">全部标签</option>
              {['React', 'Vue', 'TypeScript', 'Java', 'Spring', 'Python', 'SQL', 'Go', 'Node.js', 'SaaS', 'B端', '自动化测试', 'Figma'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {moreFiltersActive && (
              <button onClick={() => { setSourceFilter(''); setOwnerFilter(''); setDeptFilter(''); setExpFilter(''); setEduFilter(''); setGenderFilter(''); setTagFilter(''); setLatestActivityFilter(''); }} className="px-3 py-2 text-sm text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                清除更多筛选
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Batch Action Bar ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl">
          <span className="text-sm font-medium text-primary-700">已选择 <span className="font-bold">{selectedIds.size}</span> 位候选人</span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => { const p = allProfiles.find((x) => selectedIds.has(x.candidateId)); if (p) { setAddToPositionProfile(p); } else { showToast('请选择候选人'); } }} className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1">
              <i className="ri-link"></i> 绑定岗位
            </button>
            <button
              onClick={() => {
                const targets = allProfiles
                  .filter((x) => selectedIds.has(x.candidateId))
                  .map((x) => ({
                    candidateId: x.candidateId,
                    candidateName: x.candidate.name,
                    position: x.displayPosition,
                    source: x.displaySource,
                  }));
                if (targets.length === 0) {
                  showToast('请先选择候选人');
                  return;
                }
                // Check for already-pushed candidates
                const alreadyPushed = targets.filter((t) => {
                  const existing = getActivePushRecord(t.candidateId);
                  return !!existing;
                });
                if (alreadyPushed.length > 0) {
                  showToast(`「${alreadyPushed.map((t) => t.candidateName).join('、')}」已推送过，请勿重复推送`);
                  return;
                }
                setPushModalTargets(targets);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <i className="ri-send-plane-line"></i> 推送面试官评审
            </button>
            <button onClick={() => openBatchAction('owner')} className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1">
              <i className="ri-user-shared-line"></i> 分配负责人
            </button>
            <button onClick={() => openBatchAction('tag')} className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1">
              <i className="ri-price-tag-3-line"></i> 加标签
            </button>
            <button onClick={handleExportCSV} className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1">
              <i className="ri-download-line"></i> 导出
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-foreground-500 hover:text-foreground-700 cursor-pointer whitespace-nowrap">
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* ── Count ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground-500">
          {hasAnyFilter ? (
            <>筛选结果 <span className="font-semibold text-foreground-800">{filteredProfiles.length}</span> 条，共<span className="font-semibold text-foreground-800">{allProfiles.length}</span>条</>
          ) : (
            <>共 <span className="font-semibold text-foreground-800">{allProfiles.length}</span> 条候选档案</>
          )}
        </span>
        {filteredProfiles.length === 0 && hasAnyFilter && (
          <button onClick={clearAllFilters} className="text-sm text-primary-600 hover:text-primary-700 cursor-pointer">清除所有筛选</button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200">
                <th className="pl-5 pr-3 py-3.5 w-10">
                  <input type="checkbox" checked={filteredProfiles.length > 0 && selectedIds.size === filteredProfiles.length && filteredProfiles.every((p) => selectedIds.has(p.candidateId))} onChange={toggleSelectAll} className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3.5 text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</th>
                <th className="text-left px-4 py-3.5 text-xs font-medium whitespace-nowrap relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderFilterOpen(headerFilterOpen === 'position' ? null : 'position'); }}
                    className={`flex items-center gap-1 transition-colors cursor-pointer ${positionFilter ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'}`}
                  >
                    当前/最近应聘岗位
                    <i className={`${positionFilter ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${positionFilter ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                  </button>
                  {headerFilterOpen === 'position' && (
                    <div ref={headerFilterRef} className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
                      {positionOptions.map((o) => (
                        <button key={o.value} onClick={(e) => { e.stopPropagation(); setPositionFilter(o.value); setHeaderFilterOpen(null); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${positionFilter === o.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  )}
                </th>
                <th className="text-left px-4 py-3.5 text-xs font-medium whitespace-nowrap relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderFilterOpen(headerFilterOpen === 'status' ? null : 'status'); }}
                    className={`flex items-center gap-1 transition-colors cursor-pointer ${statusFilter !== 'all' ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'}`}
                  >
                    候选人状态
                    <i className={`${statusFilter !== 'all' ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${statusFilter !== 'all' ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                  </button>
                  {headerFilterOpen === 'status' && (
                    <div ref={headerFilterRef} className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[140px] flex flex-col">
                      {[
                        { value: 'all', label: '全部状态' },
                        { value: 'recruiting', label: '招聘流程中' },
                        { value: 'talentPool', label: '人才池' },
                        { value: 'ended', label: '已结束' },
                      ].map((o) => (
                        <button key={o.value} onClick={(e) => { e.stopPropagation(); setStatusFilter(o.value as StatusFilter); setHeaderFilterOpen(null); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${statusFilter === o.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  )}
                </th>
                <th className="text-left px-4 py-3.5 text-xs font-medium whitespace-nowrap relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderFilterOpen(headerFilterOpen === 'source' ? null : 'source'); }}
                    className={`flex items-center gap-1 transition-colors cursor-pointer ${sourceFilter ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'}`}
                  >
                    来源
                    <i className={`${sourceFilter ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${sourceFilter ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                  </button>
                  {headerFilterOpen === 'source' && (
                    <div ref={headerFilterRef} className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[140px] flex flex-col">
                      {sourceOptions.map((o) => (
                        <button key={o.value} onClick={(e) => { e.stopPropagation(); setSourceFilter(o.value); setHeaderFilterOpen(null); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${sourceFilter === o.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  )}
                </th>
                <th className="text-left px-4 py-3.5 text-xs font-medium whitespace-nowrap relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderFilterOpen(headerFilterOpen === 'owner' ? null : 'owner'); }}
                    className={`flex items-center gap-1 transition-colors cursor-pointer ${ownerFilter ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'}`}
                  >
                    招聘负责人
                    <i className={`${ownerFilter ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${ownerFilter ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                  </button>
                  {headerFilterOpen === 'owner' && (
                    <div ref={headerFilterRef} className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[140px] max-h-[260px] overflow-y-auto flex flex-col">
                      {ownerOptions.map((o) => (
                        <button key={o.value} onClick={(e) => { e.stopPropagation(); setOwnerFilter(o.value); setHeaderFilterOpen(null); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${ownerFilter === o.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  )}
                </th>
                <th className="text-left px-4 py-3.5 text-xs font-medium whitespace-nowrap relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderFilterOpen(headerFilterOpen === 'activity' ? null : 'activity'); }}
                    className={`flex items-center gap-1 transition-colors cursor-pointer ${latestActivityFilter ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'}`}
                  >
                    最近动态
                    <i className={`${latestActivityFilter ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${latestActivityFilter ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                  </button>
                  {headerFilterOpen === 'activity' && (
                    <div ref={headerFilterRef} className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
                      {activityOptions.map((o) => (
                        <button key={o.value} onClick={(e) => { e.stopPropagation(); setLatestActivityFilter(o.value); setHeaderFilterOpen(null); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${latestActivityFilter === o.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  )}
                </th>
                <th className="text-left pl-4 pr-5 py-3.5 text-xs font-medium text-foreground-500 whitespace-nowrap w-[140px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {filteredProfiles.map((profile) => {
                const isSelected = selectedIds.has(profile.candidateId);
                const c = profile.candidate;
                const isPool = profile.status === 'talentPool';
                const isEnded = profile.status === 'ended';
                const isRecruiting = !isPool && !isEnded;

                return (
                  <tr
                    key={profile.candidateId}
                    className="hover:bg-background-50/60 transition-colors cursor-pointer group"
                    onClick={() => { setDetailInitialTab('current'); setDetailProfile(profile); }}
                  >
                    <td className="pl-5 pr-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(profile.candidateId)} className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-200 cursor-pointer" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{c.name.charAt(0)}</span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-primary-600 group-hover:text-primary-700 transition-colors whitespace-nowrap">{c.name}</span>
                          <p className="text-[11px] text-foreground-400 mt-0.5">{c.gender} · {c.age > 0 ? `${c.age}岁` : ''} {c.experienceYears !== '未知' ? `· ${c.experienceYears}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-foreground-700 whitespace-nowrap">{profile.displayPosition}</span>
                        {profile.displayPositionCount > 1 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-primary-50 text-primary-600 rounded whitespace-nowrap">
                            共{profile.displayPositionCount}个流程
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isRecruiting ? (
                        (() => {
                          const activeApps = profile.applications.filter((a) => !['已入职', '已淘汰'].includes(a.stage));
                          if (activeApps.length === 0) {
                            return <span className="text-xs text-foreground-400">暂未关联岗位</span>;
                          }
                          if (activeApps.length === 1) {
                            const app = activeApps[0];
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-foreground-700">{app.position}</span>
                                <span className="text-foreground-300">·</span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${stageColorMap[app.stage] || 'bg-background-200 text-foreground-400'}`}>
                                  {app.stage}
                                </span>
                              </div>
                            );
                          }
                          const isExpanded = expandedAppIds.has(profile.candidateId);
                          return (
                            <div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedAppIds((prev) => {
                                    const next = new Set(prev);
                                    isExpanded ? next.delete(profile.candidateId) : next.add(profile.candidateId);
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
                              >
                                {activeApps.length}个进行中岗位
                                <i className={`text-xs ${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5">
                                  {activeApps.map((app, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <span className="text-xs text-foreground-600">{app.position}</span>
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${stageColorMap[app.stage] || 'bg-background-200 text-foreground-400'}`}>
                                        {app.stage}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap ${statusTagColor[profile.status]}`}>
                          {statusLabel[profile.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground-600 whitespace-nowrap">{profile.displaySource}</td>
                    <td className="px-4 py-4 text-sm text-foreground-600 whitespace-nowrap">{profile.displayOwner}</td>
                    <td className="px-4 py-4 text-sm text-foreground-600 max-w-[240px] truncate" title={profile.latestActivity}>
                      {profile.latestActivity}
                    </td>
                    <td className="pl-4 pr-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {isRecruiting ? (
                          (() => {
                            const activeApps = profile.applications.filter((a) => !['已入职', '已淘汰'].includes(a.stage));
                            if (activeApps.length === 0) {
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddToPositionProfile(profile); }}
                                  className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  加入岗位
                                </button>
                              );
                            }
                            if (activeApps.length === 1) {
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const app = activeApps[0];
                                    navigate('/jobs', { state: { openTitle: app.reqTitle || app.position, candidateName: c.name } });
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  查看流程
                                </button>
                              );
                            }
                            return (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFlowDropdownId(flowDropdownId === profile.candidateId ? null : profile.candidateId);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                                >
                                  查看流程
                                  <i className="ri-arrow-down-s-line text-xs"></i>
                                </button>
                                {flowDropdownId === profile.candidateId && (
                                  <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-background-200 z-50 py-1 min-w-[200px]">
                                    {activeApps.map((app, i) => (
                                      <button
                                        key={i}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFlowDropdownId(null);
                                          navigate('/jobs', { state: { openTitle: app.reqTitle || app.position, candidateName: c.name } });
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer flex items-center gap-2"
                                      >
                                        <span>{app.position}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ml-auto ${stageColorMap[app.stage] || 'bg-background-200 text-foreground-400'}`}>
                                          {app.stage}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddToPositionProfile(profile); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            加入岗位
                          </button>
                        )}
                        <div className="relative" ref={dropdownId === profile.candidateId ? dropdownRef : undefined}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDropdownId(dropdownId === profile.candidateId ? null : profile.candidateId); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                          >
                            <i className="ri-more-fill text-base"></i>
                          </button>
                          {dropdownId === profile.candidateId && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-background-200 z-50 py-1">
                              <button onClick={() => { setResumeProfile(profile); setDropdownId(null); }} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                <i className="ri-file-text-line text-foreground-400"></i> 查看完整简历
                              </button>
                              <button onClick={() => { setDetailInitialTab('history'); setDetailProfile(profile); setDropdownId(null); }} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                <i className="ri-history-line text-foreground-400"></i> 查看应聘历史
                              </button>
                              <button onClick={() => openCandidateEditor(profile)} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                <i className="ri-edit-line text-foreground-400"></i> 编辑候选人档案
                              </button>
                              {isRecruiting && (
                                <button onClick={() => { setAddToPositionProfile(profile); setDropdownId(null); }} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                  <i className="ri-briefcase-line text-foreground-400"></i> 加入其他岗位
                                </button>
                              )}
                              {isEnded && (
                                <button onClick={() => { handleMoveToPool(profile); setDropdownId(null); }} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                  <i className="ri-archive-line text-foreground-400"></i> 加入人才池
                                </button>
                              )}
                              {isPool && (
                                <button onClick={() => { handleRemoveFromPool(profile); setDropdownId(null); }} className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer">
                                  <i className="ri-logout-box-r-line text-foreground-400"></i> 移出人才池
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredProfiles.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-user-search-line text-2xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500 font-medium">暂无符合条件的候选档案</p>
            <p className="text-xs text-foreground-400 mt-2 max-w-md mx-auto">尝试调整筛选条件或清除筛选查看全部候选人。</p>
            {hasAnyFilter && (
              <button onClick={clearAllFilters} className="mt-4 text-sm text-primary-600 hover:text-primary-700 cursor-pointer">清除所有筛选条件</button>
            )}
          </div>
        )}
      </div>

      {/* ── Modals & Panels ──────────────────────────────── */}
      <HeadhunterImportModal
        isOpen={hhModalOpen}
        onClose={() => setHhModalOpen(false)}
        onImport={(data) => {
          const newId = nextImportedIdRef.current++;
          const newCandidate: Candidate = {
            ...data,
            id: newId,
            stage: '待筛选',
            stageColor: stageColorMap['待筛选'],
            appliedAt: new Date().toISOString().split('T')[0],
            screeningStage: 'ai',
            source: '猎头公司推荐',
          } as Candidate;
          setNewCandidates((prev) => [...prev, newCandidate]);
          showToast(`猎头推荐候选人「${data.name}」已导入成功。是否需要绑定在招岗位？`);
        }}
      />

      <CandidateDetailDrawer
        profile={detailProfile}
        initialTab={detailInitialTab}
        onClose={() => setDetailProfile(null)}
        onViewResume={(p) => { setDetailProfile(null); setTimeout(() => setResumeProfile(p), 200); }}
        onAddToPosition={(p) => { setDetailProfile(null); setTimeout(() => setAddToPositionProfile(p), 200); }}
        onMoveToPool={(p) => { handleMoveToPool(p); setDetailProfile(null); }}
        onRemoveFromPool={(p) => { handleRemoveFromPool(p); setDetailProfile(null); }}
      />

      <AddToPositionModal
        profile={addToPositionProfile}
        onClose={() => setAddToPositionProfile(null)}
        onAdd={handleAddToPosition}
      />

      <ResumePanel
        candidate={resumeProfile?.candidate || null}
        onClose={() => setResumeProfile(null)}
      />

      {pushModalTargets && (
        <PushToReviewerModal
          targets={pushModalTargets}
          onClose={() => setPushModalTargets(null)}
          onPush={handlePushToReviewer}
        />
      )}

      {batchAction && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-6" role="presentation" onMouseDown={() => setBatchAction(null)}>
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-action-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
              <h2 id="batch-action-title" className="text-base font-semibold text-foreground-900">
                {batchAction === 'owner' ? '批量分配负责人' : '批量添加标签'}
              </h2>
              <button
                type="button"
                onClick={() => setBatchAction(null)}
                aria-label="关闭批量操作"
                title="关闭"
                className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-foreground-500">本次将更新已选择的 {selectedIds.size} 位候选人。</p>
              {batchAction === 'owner' ? (
                <label className="block text-sm font-medium text-foreground-700">
                  负责人
                  <select
                    value={batchValue}
                    onChange={(event) => setBatchValue(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-800 focus:border-primary-400 focus:outline-none"
                  >
                    {['李华', '张敏', '王磊', '赵晓月'].map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-sm font-medium text-foreground-700">
                  标签名称
                  <input
                    type="text"
                    value={batchValue}
                    onChange={(event) => setBatchValue(event.target.value)}
                    placeholder="例如：重点关注"
                    className="mt-2 w-full rounded-lg border border-background-300 px-3 py-2.5 text-sm text-foreground-800 focus:border-primary-400 focus:outline-none"
                  />
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-background-200 px-5 py-4">
              <button type="button" onClick={() => setBatchAction(null)} className="px-4 py-2 text-sm text-foreground-600 hover:bg-background-100 rounded-lg cursor-pointer">取消</button>
              <button type="button" onClick={handleConfirmBatchAction} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg cursor-pointer">确认更新</button>
            </div>
          </div>
        </div>
      )}

      {editingProfile && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-6" role="presentation" onMouseDown={() => setEditingProfile(null)}>
          <div
            className="w-full max-w-lg rounded-lg bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-background-200 px-5 py-4">
              <h2 id="candidate-editor-title" className="text-base font-semibold text-foreground-900">编辑候选人档案</h2>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                aria-label="关闭候选人编辑"
                title="关闭"
                className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-5">
              <label className="col-span-2 block text-sm font-medium text-foreground-700">
                姓名
                <input type="text" value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-2 w-full rounded-lg border border-background-300 px-3 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
              </label>
              <label className="block text-sm font-medium text-foreground-700">
                手机号
                <input type="text" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} className="mt-2 w-full rounded-lg border border-background-300 px-3 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
              </label>
              <label className="block text-sm font-medium text-foreground-700">
                邮箱
                <input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-background-300 px-3 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-background-200 px-5 py-4">
              <button type="button" onClick={() => setEditingProfile(null)} className="px-4 py-2 text-sm text-foreground-600 hover:bg-background-100 rounded-lg cursor-pointer">取消</button>
              <button type="button" onClick={handleSaveCandidate} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg cursor-pointer">保存档案</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
