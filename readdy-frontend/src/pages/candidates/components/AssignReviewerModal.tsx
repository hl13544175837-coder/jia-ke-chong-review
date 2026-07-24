import { useState } from 'react';
import { interviewers } from '@/mocks/candidates';

interface AssignReviewerModalProps {
  isOpen: boolean;
  candidateName: string;
  candidatePosition: string;
  onClose: () => void;
  onAssign: (reviewerName: string) => void;
}

export default function AssignReviewerModal({ isOpen, candidateName, candidatePosition, onClose, onAssign }: AssignReviewerModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  const handleConfirm = () => {
    const reviewer = interviewers.find((r) => r.id === selectedId);
    if (reviewer) {
      onAssign(reviewer.name);
      setSelectedId(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-background-100 flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-user-shared-line text-primary-600 text-lg"></i>
            </div>
            <div>
              <h3 className="text-lg font-heading font-bold text-foreground-900">选择面试官</h3>
              <p className="text-xs text-foreground-400">将初筛通过的简历发送给面试官进行评审</p>
            </div>
          </div>
          <div className="mt-3 px-3 py-2 bg-background-50 rounded-lg flex items-center gap-2 text-xs">
            <span className="text-foreground-400">候选人：</span>
            <span className="font-medium text-foreground-800">{candidateName}</span>
            <span className="text-foreground-300">·</span>
            <span className="text-foreground-500">{candidatePosition}</span>
          </div>
        </div>

        {/* Interviewer list */}
        <div className="px-6 py-4 overflow-y-auto flex-shrink" style={{ maxHeight: '400px' }}>
          <p className="text-xs font-medium text-foreground-500 mb-3">请选择一位面试官进行简历评审</p>
          <div className="space-y-2">
            {interviewers.map((reviewer) => {
              const isSelected = selectedId === reviewer.id;
              return (
                <button
                  key={reviewer.id}
                  onClick={() => setSelectedId(reviewer.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'border-primary-300 bg-primary-50/60 shadow-sm'
                      : 'border-background-200 bg-white hover:border-background-300 hover:bg-background-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-primary-200' : 'bg-background-100'
                  }`}>
                    <span className={`text-sm font-semibold ${
                      isSelected ? 'text-primary-700' : 'text-foreground-600'
                    }`}>{reviewer.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isSelected ? 'text-primary-700' : 'text-foreground-800'
                    }`}>{reviewer.name}</p>
                    <p className="text-xs text-foreground-400 truncate">{reviewer.department} · {reviewer.title}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected ? 'border-primary-500 bg-primary-500' : 'border-background-300'
                  }`}>
                    {isSelected && <i className="ri-check-line text-white text-xs"></i>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-background-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedId
                ? 'bg-primary-500 hover:bg-primary-600 text-white'
                : 'bg-background-100 text-foreground-300 cursor-not-allowed'
            }`}
          >
            <i className="ri-send-plane-line"></i>
            发送评审
          </button>
        </div>
      </div>
    </div>
  );
}