import type { Interview } from '@/mocks/interviews';

interface InterviewResultModalProps {
  interview: Interview;
  onClose: () => void;
  onNextRound: (interview: Interview) => void;
  onAddInterview: (interview: Interview) => void;
  onPushOffer: (interview: Interview) => void;
  onReject: (interview: Interview) => void;
}

export default function InterviewResultModal({
  interview,
  onClose,
  onNextRound,
  onAddInterview,
  onPushOffer,
  onReject,
}: InterviewResultModalProps) {
  const hasScores = interview.scores && interview.scores.some(s => s.score !== null);
  const avgScore = hasScores
    ? (interview.scores.filter(s => s.score !== null).reduce((sum, s) => sum + (s.score || 0), 0) / interview.scores.filter(s => s.score !== null).length).toFixed(1)
    : null;

  const resultActions = [
    {
      key: 'nextRound',
      label: '进入下一轮',
      icon: 'ri-arrow-right-circle-line',
      color: 'text-primary-600',
      bg: 'hover:bg-primary-50',
      description: '安排下一轮面试',
      onClick: () => onNextRound(interview),
    },
    {
      key: 'addInterview',
      label: '追加面试',
      icon: 'ri-add-circle-line',
      color: 'text-accent-600',
      bg: 'hover:bg-accent-50',
      description: '在当前轮次追加一场面试',
      onClick: () => onAddInterview(interview),
    },
    {
      key: 'pushOffer',
      label: '进入 Offer',
      icon: 'ri-send-plane-line',
      color: 'text-primary-600',
      bg: 'hover:bg-primary-50',
      description: '通过面试，推进 Offer 流程',
      onClick: () => onPushOffer(interview),
    },
    {
      key: 'reject',
      label: '淘汰',
      icon: 'ri-close-circle-line',
      color: 'text-red-600',
      bg: 'hover:bg-red-50',
      description: '面试不通过，结束流程',
      onClick: () => onReject(interview),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-4 p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary-600">{interview.candidateAvatar}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-heading font-bold text-foreground-900">处理面试结果</h3>
            <p className="text-sm text-foreground-500 mt-0.5">
              {interview.candidateName} · {interview.position} · {interview.stage}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer transition-colors flex-shrink-0">
            <i className="ri-close-line text-foreground-400"></i>
          </button>
        </div>

        {/* Score Summary */}
        {hasScores && (
          <div className="bg-background-50 rounded-xl p-3 mb-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground-900">{avgScore}</p>
              <p className="text-[10px] text-foreground-400">平均分</p>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-1">
                {interview.scores.filter(s => s.score !== null).slice(0, 4).map(s => (
                  <span key={s.dimension} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-background-200 text-foreground-600">
                    {s.dimension}: {s.score}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${interview.overall === '通过' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
                {interview.overall || '待定'}
              </span>
            </div>
          </div>
        )}

        {/* Result Actions */}
        <div className="space-y-1.5">
          {resultActions.map(action => (
            <button
              key={action.key}
              onClick={action.onClick}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${action.bg}`}
            >
              <div className="w-9 h-9 rounded-lg bg-background-100 flex items-center justify-center flex-shrink-0">
                <i className={`${action.icon} ${action.color} text-lg`}></i>
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-foreground-800">{action.label}</p>
                <p className="text-xs text-foreground-400">{action.description}</p>
              </div>
              <i className="ri-arrow-right-s-line text-foreground-300"></i>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2.5 text-sm text-foreground-500 hover:bg-background-100 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}