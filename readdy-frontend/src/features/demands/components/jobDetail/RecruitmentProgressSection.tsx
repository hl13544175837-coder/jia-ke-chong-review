interface RecruitmentProgressSectionProps {
  pendingCount: number;
  interviewCount: number;
  offerCount: number;
  hiredCount: number;
  onAddCandidate: () => void;
  onEdit: () => void;
}

export default function RecruitmentProgressSection({
  pendingCount,
  interviewCount,
  offerCount,
  hiredCount,
  onAddCandidate,
  onEdit,
}: RecruitmentProgressSectionProps) {
  const metrics = [
    ['待筛选', pendingCount, 'bg-secondary-50 border-secondary-200', 'text-secondary-700'],
    ['面试中', interviewCount, 'bg-accent-50 border-accent-200', 'text-accent-700'],
    ['Offer中', offerCount, 'bg-primary-50 border-primary-200', 'text-primary-600'],
    ['已入职', hiredCount, 'bg-primary-50 border-primary-200', 'text-primary-700'],
  ];
  return (
    <section data-ui="recruitment-progress-section" className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground-900">招聘进展</h3>
        <div className="grid grid-cols-4 gap-3">
          {metrics.map(([label, value, boxClass, valueClass]) => (
            <div key={String(label)} className={`rounded-lg border p-3 text-center ${boxClass}`}>
              <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
              <p className="mt-0.5 text-xs text-foreground-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={onAddCandidate} className="flex-1 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"><i className="ri-user-add-line mr-1.5"></i>添加候选人</button>
        <button onClick={onEdit} className="flex-1 whitespace-nowrap rounded-lg border border-background-200 bg-white px-4 py-2.5 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-50"><i className="ri-edit-line mr-1.5"></i>编辑岗位</button>
      </div>
    </section>
  );
}
