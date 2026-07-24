import { recruitmentFunnel } from '@/mocks/dashboard';

export default function FunnelChart() {
  const maxCount = recruitmentFunnel[0]?.count || 1;

  const colors = [
    'bg-primary-400',
    'bg-primary-500',
    'bg-accent-400',
    'bg-accent-500',
    'bg-secondary-400',
    'bg-secondary-500',
  ];

  return (
    <div className="bg-white rounded-xl border border-background-200 p-5">
      <h3 className="font-semibold text-foreground-900 text-sm mb-4">招聘漏斗</h3>
      <div className="space-y-3">
        {recruitmentFunnel.map((item, index) => (
          <div key={item.stage} className="flex items-center gap-3">
            <span className="text-xs text-foreground-600 w-16 text-right whitespace-nowrap flex-shrink-0">{item.stage}</span>
            <div className="flex-1 h-7 bg-background-100 rounded-md overflow-hidden relative">
              <div
                className={`h-full rounded-md ${colors[index]} transition-all duration-700`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              ></div>
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-bold text-white drop-shadow-sm">
                {item.count}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-background-100 flex items-center justify-between text-xs text-foreground-500">
        <span>简历投递转化率</span>
        <span className="font-semibold text-primary-600">{Math.round((recruitmentFunnel[5].count / recruitmentFunnel[0].count) * 100)}%</span>
      </div>
    </div>
  );
}