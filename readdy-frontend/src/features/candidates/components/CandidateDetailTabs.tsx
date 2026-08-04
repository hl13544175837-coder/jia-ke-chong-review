export type CandidateDetailTab = 'interview' | 'resume' | 'feedback';

interface CandidateDetailTabsProps {
  value: CandidateDetailTab;
  onChange: (value: CandidateDetailTab) => void;
  className?: string;
}

const tabs: Array<{ key: CandidateDetailTab; label: string }> = [
  { key: 'interview', label: '面试信息' },
  { key: 'resume', label: '候选人简历' },
  { key: 'feedback', label: '面试评价' },
];

export default function CandidateDetailTabs({ value, onChange, className = '' }: CandidateDetailTabsProps) {
  return (
    <div
      data-ui="candidate-detail-tabs"
      role="tablist"
      aria-label="候选人详情内容"
      className={`flex items-center gap-1 border-b border-background-200 bg-white px-5 ${className}`.trim()}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative min-h-11 px-4 text-sm font-medium transition ${value === tab.key ? 'text-primary-700' : 'text-foreground-500 hover:text-foreground-800'}`}
        >
          {tab.label}
          {value === tab.key && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary-500" />}
        </button>
      ))}
    </div>
  );
}
