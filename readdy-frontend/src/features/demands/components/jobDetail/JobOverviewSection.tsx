interface JobOverviewSectionProps {
  department: string;
  city: string;
  owner: string;
  salaryRange?: string;
  headcount: number;
  filled: number;
  startDate?: string;
  createdAt: string;
  deadline?: string;
  displayTitle: string;
}

export default function JobOverviewSection(props: JobOverviewSectionProps) {
  const rows = [
    ['所属部门', props.department],
    ['工作城市', props.city],
    ['招聘负责人', props.owner],
    ['薪资范围', props.salaryRange || '未设置'],
    ['计划招聘', `${props.headcount}人`],
    ['已入职', `${props.filled}人`],
    ['剩余HC', `${props.headcount - props.filled}人`],
    ['招聘开始日期', props.startDate || props.createdAt],
    ['计划关闭日期', props.deadline || '未设置'],
  ];

  return (
    <section data-ui="job-overview-section">
      <h3 className="mb-3 text-sm font-semibold text-foreground-900">基本信息</h3>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-background-50 p-3">
            <p className="mb-1 text-xs text-foreground-400">{label}</p>
            <p className="text-sm font-medium text-foreground-900">{value}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-lg bg-background-50 p-3">
          <p className="mb-1 text-xs text-foreground-400">关联招聘需求</p>
          <p className="text-sm font-medium text-foreground-900">{props.displayTitle}招聘需求</p>
        </div>
      </div>
    </section>
  );
}
