import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { requisitions as initialRequisitions, statusTransitions, statusExtraActions } from '@/mocks/jobs';
import { interviewerPool } from '@/mocks/interviews';
import { useToast } from '@/hooks/useToast';
import RequisitionTabs from './components/RequisitionTabs';
import RequisitionForm from './components/RequisitionForm';
import RequisitionTable from './components/RequisitionTable';
import JobDetailPanel from './components/JobDetailPanel';
import SelectCandidateDrawer from './components/SelectCandidateDrawer';

const CURRENT_INTERVIEWER_ID = 'iv5';
const CURRENT_INTERVIEWER = interviewerPool.find(i => i.id === CURRENT_INTERVIEWER_ID) || interviewerPool[0];

type ReqData = (typeof initialRequisitions)[0];

export default function JobsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { fromDashboard?: boolean; openTitle?: string; tab?: string } | null;
  const fromDashboard = !!navState?.fromDashboard;
  const [activeTab, setActiveTab] = useState(navState?.tab || 'all');
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [selectedReq, setSelectedReq] = useState<ReqData | null>(null);
  const [selectDrawerReq, setSelectDrawerReq] = useState<ReqData | null>(null);
  const [highlightCandidateName, setHighlightCandidateName] = useState<string>('');
  const [filters, setFilters] = useState({
    department: '',
    owner: '',
    city: '',
    status: '',
    stage: '',
  });
  const [sortField, setSortField] = useState('newest');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredData = useMemo(() => {
    let data = [...requisitions];

    if (activeTab !== 'all') {
      data = data.filter((r) => r.statusCode === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q)
      );
    }

    if (filters.department) {
      data = data.filter((r) => r.department === filters.department);
    }
    if (filters.owner) {
      data = data.filter((r) => r.owner === filters.owner);
    }

    if (filters.city) {
      data = data.filter((r) => r.city === filters.city);
    }
    if (filters.status) {
      data = data.filter((r) => r.statusCode === filters.status);
    }
    if (filters.stage) {
      switch (filters.stage) {
        case 'hasAny':
          data = data.filter((r) => r.stageAll > 0);
          break;
        case 'none':
          data = data.filter((r) => r.stageAll === 0);
          break;
        case 'feedback':
          data = data.filter((r) => r.stageFeedback > 0);
          break;
        case 'interview':
          data = data.filter((r) => r.stageInterview > 0);
          break;
        case 'offer':
          data = data.filter((r) => r.stageOffer > 0);
          break;
      }
    }

    data.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'newest':
          return (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * dir;
        case 'deadline': {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return (da - db) * dir;
        }
        case 'priority': {
          const pMap: Record<string, number> = { '紧急': 3, '高': 2, '普通': 1 };
          return ((pMap[b.priority] || 0) - (pMap[a.priority] || 0)) * dir;
        }
        case 'name':
          return a.name.localeCompare(b.name, 'zh-CN') * dir;
        default:
          return 0;
      }
    });

    return data;
  }, [activeTab, searchQuery, filters, requisitions, sortField, sortDirection]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSortChange = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Set sensible default directions per field
      setSortDirection(field === 'deadline' ? 'asc' : 'desc');
    }
  };

  const handleStatusChange = useCallback((id: string, newStatusCode: string) => {
    setRequisitions((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const statusLabelMap: Record<string, string> = {
          pending: '需求待确认',
          active: '招聘中',
          completed: '已完成',
          closed: '已关闭',
        };
        return { ...r, statusCode: newStatusCode, status: statusLabelMap[newStatusCode] || r.status };
      })
    );
  }, []);

  // Navigate to candidates filtered by requisition + stage
  const handleStageCountClick = (req: ReqData, stage: 'feedback' | 'interview' | 'offer') => {
    navigate('/candidates', {
      state: {
        fromJobs: true,
        jobTitle: req.title,
        jobName: req.name,
        jobId: req.id,
        targetStage: stage,
      },
    });
  };

  // Open select candidate drawer
  const handleSelectCandidates = (req: ReqData) => {
    setSelectDrawerReq(req);
  };

  // Navigate to candidates for completed/closed reqs (view only)
  const handleViewCandidates = (req: ReqData) => {
    navigate('/candidates', {
      state: {
        fromJobs: true,
        jobTitle: req.title,
        jobName: req.name,
        jobId: req.id,
        targetStage: 'all',
      },
    });
  };

  // Handle adding candidates from drawer
  const handleAddCandidates = (reqId: string, candidateIds: number[]) => {
    // Update stage counts locally to reflect the addition
    setRequisitions((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r;
        // Increment stageAll and stageFeedback counts
        return {
          ...r,
          stageAll: (r.stageAll || 0) + candidateIds.length,
          stageFeedback: (r.stageFeedback || 0) + candidateIds.length,
        };
      })
    );
    showToast(`已为招聘需求添加 ${candidateIds.length} 位候选人`);
  };

  // Handle adding candidates and pushing to reviewer (from page-level drawer)
  const handleAddAndPushFromPage = (reqId: string, candidateIds: number[], pushData: { reviewerIds: string[]; reviewerNames: string[]; reviewerTitles: string[]; deadline: string; keyRequirements: string }) => {
    handleAddCandidates(reqId, candidateIds);
    showToast(`已添加 ${candidateIds.length} 位候选人并推送至 ${pushData.reviewerNames.join('、')} 评审`);
    // The JobDetailPanel will pick up the push info when opened next
  };

  // 从工作台点击岗位跳转过来时，自动打开对应需求的详情面板
  useEffect(() => {
    const state = location.state as { openTitle?: string; candidateName?: string } | null;
    const openTitle = state?.openTitle;
    const candidateName = state?.candidateName;
    if (openTitle) {
      const match = initialRequisitions.find((r) => r.title === openTitle || r.name === openTitle);
      if (match) {
        setSelectedReq(match);
        if (candidateName) setHighlightCandidateName(candidateName);
      }
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-5">
      {/* 返回工作台面包屑 */}
      {fromDashboard && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-line"></i>
            返回工作台
          </button>
          {navState?.openTitle && (
            <>
              <span className="text-foreground-300">/</span>
              <span className="text-sm font-medium text-foreground-900">
                招聘需求：{navState.openTitle}
              </span>
            </>
          )}
        </div>
      )}

      {/* Interviewer identity banner */}
      {(() => {
        const role = localStorage.getItem('zhipin-current-role');
        if (role === 'interviewer') {
          return (
            <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-700">面试官：{CURRENT_INTERVIEWER.name}</p>
                <p className="text-xs text-primary-500">{CURRENT_INTERVIEWER.role} · {CURRENT_INTERVIEWER.department} · 查看岗位JD准备面试</p>
              </div>
              <span className="ml-auto text-xs px-2 py-1 bg-primary-100 text-primary-600 rounded-full font-medium">只读模式</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Tabs + Action button in one row */}
      <div className="flex items-center justify-between">
        <RequisitionTabs activeTab={activeTab} onTabChange={setActiveTab} />
        {(() => {
          const role = localStorage.getItem('zhipin-current-role');
          if (role !== 'interviewer') {
            return (
              <button
                onClick={() => setFormOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line text-base"></i>
                招聘需求
              </button>
            );
          }
          return null;
        })()}
      </div>

      {/* Table with built-in search, filter & sort */}
      <RequisitionTable
        data={filteredData}
        onRowClick={(req) => setSelectedReq(requisitions.find((item) => item.id === req.id) || null)}
        onStatusChange={handleStatusChange}
        statusTransitions={statusTransitions}
        statusExtraActions={statusExtraActions}
        onSelectCandidates={handleSelectCandidates}
        onViewCandidates={handleViewCandidates}
        onStageCountClick={handleStageCountClick}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filters}
        onFilterChange={handleFilterChange}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {/* Create Modal */}
      {formOpen && (
        <>
          <div
            className="fixed inset-0 bg-foreground-900/40 z-40"
            onClick={() => setFormOpen(false)}
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto animate-modal-in">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-background-100 flex-shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">创建招聘需求</h2>
                  <p className="text-xs text-foreground-400 mt-0.5">
                    填写岗位信息、JD 描述和招聘周期，完成后提交进入需求列表。
                  </p>
                </div>
                <button
                  onClick={() => setFormOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <RequisitionForm
                  expanded={true}
                  onSuccess={() => setFormOpen(false)}
                />
              </div>
            </div>
          </div>
          <style>{`
            @keyframes modalIn {
              from { opacity: 0; transform: scale(0.96) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .animate-modal-in {
              animation: modalIn 0.2s ease-out;
            }
          `}</style>
        </>
      )}

      {/* Detail Panel */}
      <JobDetailPanel req={selectedReq} onClose={() => { setSelectedReq(null); setHighlightCandidateName(''); }} highlightCandidateName={highlightCandidateName} />

      {/* Select Candidate Drawer */}
      <SelectCandidateDrawer
        isOpen={!!selectDrawerReq}
        onClose={() => setSelectDrawerReq(null)}
        req={selectDrawerReq ? { id: selectDrawerReq.id, name: selectDrawerReq.name, title: selectDrawerReq.title, city: selectDrawerReq.city, department: selectDrawerReq.department } : null}
        onAddCandidates={handleAddCandidates}
        onAddAndPush={handleAddAndPushFromPage}
      />
    </div>
  );
}
