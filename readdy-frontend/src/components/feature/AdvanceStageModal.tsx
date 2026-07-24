import { useState, useEffect } from 'react';
import { stageOptions, stageColorMap } from '@/mocks/candidates';

interface AdvanceStageModalProps {
  candidate: { id: number; name: string; stage: string } | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (candidateId: number, newStage: string, comment: string) => void;
}

export default function AdvanceStageModal({ candidate, isOpen, onClose, onConfirm }: AdvanceStageModalProps) {
  const [targetStage, setTargetStage] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (isOpen && candidate) {
      setTargetStage('');
      setComment('');
    }
  }, [isOpen, candidate]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !candidate) return null;

  const availableStages = stageOptions.filter((s) => s !== candidate.stage);

  const handleConfirm = () => {
    if (!targetStage) return;
    onConfirm(candidate.id, targetStage, comment);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/30 z-[80]" onClick={onClose}></div>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden">
          <div className="px-6 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground-900">推进流程</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-background-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary-600">{candidate.name.charAt(0)}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground-900">{candidate.name}</p>
                <p className="text-xs text-foreground-500">当前阶段：<span className="font-medium text-foreground-700">{candidate.stage}</span></p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-800 mb-2">选择目标阶段</label>
              <div className="flex flex-wrap gap-2">
                {availableStages.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setTargetStage(stage)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      targetStage === stage
                        ? stageColorMap[stage] + ' ring-2 ring-offset-1 ring-primary-300'
                        : 'bg-background-100 text-foreground-600 hover:bg-background-200'
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
              {targetStage === '' && (
                <p className="text-xs text-accent-600 mt-2">请选择一个目标阶段</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-800 mb-2">备注说明</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="填写推进原因或面试评价..."
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
              />
              <p className="text-xs text-foreground-400 mt-1 text-right">{comment.length}/500</p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-background-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!targetStage}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                targetStage
                  ? 'bg-primary-500 hover:bg-primary-600 text-white'
                  : 'bg-background-200 text-foreground-400 cursor-not-allowed'
              }`}
            >
              确认推进
            </button>
          </div>
        </div>
      </div>
    </>
  );
}