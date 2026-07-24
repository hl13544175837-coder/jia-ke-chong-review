import { useState, useMemo } from 'react';
import { candidateList } from '@/mocks/candidates';

interface Props {
  show: boolean;
  preFill: { candidateName: string; candidateAvatar: string; position: string; department: string; reqId: string; reqName: string } | null;
  onClose: () => void;
  onCreate: (data: { salary: string; startDate: string; notes: string; candidateName: string; candidateAvatar: string; position: string; department: string; reqId: string; reqName: string }) => void;
}

const eligibleStages = ['终面', '谈薪中', '沟通中', 'Offer发放中', '正式到岗中'];

export default function CreateOfferModal({ show, preFill, onClose, onCreate }: Props) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [salary, setSalary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const eligibleCandidates = useMemo(() => {
    return candidateList.filter(c => eligibleStages.some(s => c.stage.includes(s)));
  }, []);

  const filteredCandidates = useMemo(() => {
    if (!searchTerm) return eligibleCandidates;
    return eligibleCandidates.filter(c =>
      c.name.includes(searchTerm) || c.position.includes(searchTerm)
    );
  }, [eligibleCandidates, searchTerm]);

  const selectedCandidate = useMemo(() => {
    return candidateList.find(c => c.id === selectedCandidateId) || null;
  }, [selectedCandidateId]);

  const handleCreate = () => {
    if (preFill) {
      onCreate({
        salary, startDate, notes,
        candidateName: preFill.candidateName,
        candidateAvatar: preFill.candidateAvatar,
        position: preFill.position,
        department: preFill.department,
        reqId: preFill.reqId,
        reqName: preFill.reqName,
      });
    } else if (selectedCandidate) {
      onCreate({
        salary, startDate, notes,
        candidateName: selectedCandidate.name,
        candidateAvatar: selectedCandidate.name.charAt(0),
        position: selectedCandidate.position,
        department: selectedCandidate.department,
        reqId: `REQ-${Date.now().toString(36).toUpperCase()}`,
        reqName: selectedCandidate.position,
      });
    }
  };

  const canSubmit = (preFill ? true : !!selectedCandidateId) && salary && startDate;

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-foreground-900/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground-900">发起 Offer</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {preFill ? (
            <div className="flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-lg p-3">
              <i className="ri-information-line text-primary-500 text-lg flex-shrink-0"></i>
              <div>
                <p className="text-sm font-medium text-primary-700">从面试结果推进</p>
                <p className="text-xs text-primary-600 mt-0.5">已自动填充候选人信息，请填写薪酬后发起</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-foreground-600 mb-1.5 block">选择候选人</label>
              <p className="text-[11px] text-foreground-400 mb-2">仅显示已通过终面或进入Offer阶段的候选人</p>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索候选人姓名或岗位..."
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 mb-2"
              />
              <div className="max-h-48 overflow-y-auto border border-background-200 rounded-lg">
                {filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCandidateId(c.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-background-50 transition-colors cursor-pointer border-b border-background-100 last:border-0 ${
                      selectedCandidateId === c.id ? 'bg-primary-50 border-l-2 border-l-primary-500' : ''
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary-600">{c.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-900">{c.name}</p>
                      <p className="text-xs text-foreground-400">{c.position} · {c.department} · {c.stage}</p>
                    </div>
                  </button>
                ))}
                {filteredCandidates.length === 0 && (
                  <p className="text-sm text-foreground-400 text-center py-4">暂无符合条件的候选人</p>
                )}
              </div>
            </div>
          )}

          {(preFill || selectedCandidate) && (
            <>
              <div className="flex items-center gap-3 bg-background-50 rounded-lg p-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-600">
                    {preFill ? preFill.candidateAvatar : selectedCandidate?.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground-900">
                    {preFill ? preFill.candidateName : selectedCandidate?.name}
                  </p>
                  <p className="text-xs text-foreground-400">
                    {preFill ? preFill.position : selectedCandidate?.position} · {preFill ? preFill.department : selectedCandidate?.department}
                  </p>
                  {preFill?.reqName && (
                    <p className="text-xs text-foreground-400">需求：{preFill.reqName}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-600 mb-1 block">税前月薪（元）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">¥</span>
                  <input
                    type="number"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="请输入税前月薪"
                    className="w-full pl-7 pr-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-600 mb-1 block">预计入职日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-600 mb-1 block">审批备注</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 resize-none"
                  placeholder="请输入薪酬建议、定薪理由等..."
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                canSubmit ? 'bg-primary-500 text-white hover:bg-primary-600' : 'bg-background-200 text-foreground-400 cursor-not-allowed'
              }`}
            >
              <i className="ri-send-plane-line mr-1.5"></i>发起 Offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}