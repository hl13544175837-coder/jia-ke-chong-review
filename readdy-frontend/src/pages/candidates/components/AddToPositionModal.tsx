import { useState, useEffect } from 'react';
import { getActiveRequisitions, type CandidateProfile } from '@/mocks/candidateProfiles';

interface AddToPositionModalProps {
  profile: CandidateProfile | null;
  onClose: () => void;
  onAdd: (profile: CandidateProfile, reqId: string, reqTitle: string) => void;
}

export default function AddToPositionModal({ profile, onClose, onAdd }: AddToPositionModalProps) {
  const [selectedReqId, setSelectedReqId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [, setShowConfirm] = useState(false);

  useEffect(() => {
    if (profile) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [profile]);

  useEffect(() => {
    setSelectedReqId('');
    setSearchQuery('');
    setShowConfirm(false);
  }, [profile]);

  if (!profile) return null;

  const activeReqs = getActiveRequisitions();
  const currentReqIds = new Set(profile.applications.map((a) => a.reqId).filter(Boolean));
  const availableReqs = activeReqs.filter((r) => !currentReqIds.has(r.reqId));

  const filteredReqs = searchQuery.trim()
    ? availableReqs.filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || r.department.toLowerCase().includes(searchQuery.toLowerCase()))
    : availableReqs;

  const selectedReq = availableReqs.find((r) => r.reqId === selectedReqId);

  const handleConfirm = () => {
    if (!selectedReq || !profile) return;
    onAdd(profile, selectedReq.reqId, selectedReq.title);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/25 z-[100]" onClick={onClose}></div>
      <div className="fixed inset-0 flex items-center justify-center z-[110] px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-background-200 flex-shrink-0">
            <div>
              <h3 className="text-base font-bold text-foreground-900">加入在招岗位</h3>
              <p className="text-xs text-foreground-400 mt-0.5">为「{profile.candidate.name}」选择应聘岗位</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer">
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-background-100 flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-foreground-400 text-sm"></i>
              </div>
              <input
                type="text"
                placeholder="搜索在招岗位..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredReqs.length > 0 ? (
              filteredReqs.map((req) => {
                const isSelected = selectedReqId === req.reqId;
                return (
                  <button
                    key={req.reqId}
                    onClick={() => setSelectedReqId(req.reqId)}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors cursor-pointer border ${isSelected ? 'bg-primary-50 border-primary-200' : 'bg-white border-transparent hover:bg-background-50 hover:border-background-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-semibold ${isSelected ? 'text-primary-700' : 'text-foreground-900'}`}>{req.title}</p>
                        <p className="text-xs text-foreground-400 mt-0.5">{req.department} · 负责人: {req.owner}</p>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                          <i className="ri-check-line text-white text-xs"></i>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
                  <i className="ri-briefcase-line text-xl text-foreground-400"></i>
                </div>
                <p className="text-sm text-foreground-500 font-medium">
                  {availableReqs.length === 0 ? '暂无可用岗位' : '未找到匹配的岗位'}
                </p>
                <p className="text-xs text-foreground-400 mt-1">
                  {currentReqIds.size > 0 ? '该候选人已绑定所有可用岗位' : '请尝试调整搜索条件'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-background-200 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-foreground-400">
              {selectedReq ? `将加入「${selectedReq.title}」，默认阶段为待筛选` : '请选择一个岗位'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedReqId}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${selectedReqId ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-background-100 text-foreground-400 cursor-not-allowed'}`}
              >
                确认加入
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}