import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsOverview } from '@/features/analytics/types';

type TrendMonths = 3 | 6 | 7;

interface ManagementAnalyticsPanelsProps {
  data: AnalyticsOverview;
  trendMonths: TrendMonths;
}

const chartColors = {
  primary: 'oklch(var(--primary-500))',
  primarySoft: 'oklch(var(--primary-300))',
  secondary: 'oklch(var(--secondary-500))',
  accent: 'oklch(var(--accent-500))',
  accentSoft: 'oklch(var(--accent-300))',
  grid: 'oklch(var(--background-200))',
  text: 'oklch(var(--foreground-500))',
};

const stageColors = [
  chartColors.primary,
  chartColors.primarySoft,
  chartColors.accent,
  chartColors.secondary,
];

function roundedAverage(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1));
}

export default function ManagementAnalyticsPanels({
  data,
  trendMonths,
}: ManagementAnalyticsPanelsProps) {
  const trendData = useMemo(
    () => data.monthly_trends.slice(-trendMonths),
    [data.monthly_trends, trendMonths],
  );

  const stageShare = useMemo(() => {
    const totals = data.demands.reduce((result, demand) => {
      const funnel = demand.funnel;
      result.screening += funnel.pending + funnel.ai_screen + funnel.business_review;
      result.interview += funnel.interview;
      result.offer += funnel.offer;
      result.onboarded += funnel.onboarded;
      return result;
    }, { screening: 0, interview: 0, offer: 0, onboarded: 0 });

    return [
      { label: '筛选', value: totals.screening },
      { label: '面试', value: totals.interview },
      { label: 'Offer', value: totals.offer },
      { label: '入职', value: totals.onboarded },
    ];
  }, [data.demands]);

  const bottleneckRows = useMemo(() => {
    const candidates = data.demands.flatMap((demand) => demand.candidates);
    const definitions = [
      { label: '业务筛选', stage: 'business_review' },
      { label: '面试', stage: 'interview' },
      { label: 'Offer', stage: 'offer' },
    ];

    return definitions.map((definition) => {
      const ages = candidates
        .filter((candidate) => candidate.stage === definition.stage)
        .map((candidate) => candidate.age_days)
        .filter((age) => Number.isFinite(age) && age >= 0);
      return {
        label: definition.label,
        averageDays: roundedAverage(ages),
        candidateCount: ages.length,
      };
    });
  }, [data.demands]);

  const largestBottleneck = useMemo(
    () => bottleneckRows.reduce((largest, item) => (
      item.averageDays > largest.averageDays ? item : largest
    ), bottleneckRows[0]),
    [bottleneckRows],
  );
  const stageTotal = stageShare.reduce((total, item) => total + item.value, 0);
  const hasBottleneckData = bottleneckRows.some((item) => item.candidateCount > 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <section
        data-ui="management-trend-comparison"
        className="min-w-0 rounded-xl border border-background-200 bg-white p-5 xl:col-span-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold text-foreground-900">招聘趋势对比</h2>
            <p className="mt-0.5 text-xs text-foreground-500">近 {trendMonths} 个月入职与 Offer 发放</p>
          </div>
          <p className="text-[11px] text-foreground-400">数据来自已发 Offer 和实际入职记录</p>
        </div>
        <div role="img" aria-label="入职人数和 Offer 数量趋势对比" className="h-56 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: chartColors.text, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: chartColors.text, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="hires"
                name="入职人数"
                stroke={chartColors.primary}
                strokeWidth={2.5}
                dot={{ r: 3, fill: chartColors.primary }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="offers"
                name="Offer 数量"
                stroke={chartColors.accent}
                strokeWidth={2.5}
                dot={{ r: 3, fill: chartColors.accent }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section
        data-ui="management-stage-share"
        className="min-w-0 rounded-xl border border-background-200 bg-white p-5 xl:col-span-3"
      >
        <h2 className="font-heading font-bold text-foreground-900">候选人阶段占比</h2>
        <p className="mt-0.5 text-xs text-foreground-500">当前在招需求中的实时阶段分布</p>
        {stageTotal > 0 ? (
          <div className="mt-3 grid grid-cols-[minmax(120px,1fr)_auto] items-center gap-2">
            <div role="img" aria-label="候选人阶段占比环形图" className="relative h-48 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageShare}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="52%"
                    outerRadius="78%"
                    paddingAngle={2}
                  >
                    {stageShare.map((item, index) => (
                      <Cell key={item.label} fill={stageColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-foreground-900">{stageTotal}</span>
                <span className="text-[11px] text-foreground-400">人</span>
              </div>
            </div>
            <ul className="space-y-3">
              {stageShare.map((item, index) => (
                <li key={item.label} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageColors[index] }} />
                  <span className="w-8 text-foreground-600">{item.label}</span>
                  <span className="font-semibold text-foreground-900">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-16 text-center text-sm text-foreground-500">当前没有可统计的在途候选人</p>
        )}
      </section>

      <section
        data-ui="management-bottleneck-analysis"
        className="min-w-0 rounded-xl border border-background-200 bg-white p-5 xl:col-span-3"
      >
        <h2 className="font-heading font-bold text-foreground-900">流程卡点分析</h2>
        <p className="mt-0.5 text-xs text-foreground-500">按候选人在当前阶段的停留时间计算</p>
        {hasBottleneckData ? (
          <>
            <div className="mt-4 rounded-lg border border-accent-100 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-800">
              最大卡点：{largestBottleneck.label}，平均停留 {largestBottleneck.averageDays} 天
            </div>
            <div role="img" aria-label="各招聘阶段平均停留天数" className="mt-3 h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bottleneckRows} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals domain={[0, 'dataMax + 1']} tick={{ fill: chartColors.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={58} tick={{ fill: chartColors.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="averageDays" name="平均停留（天）" radius={[0, 6, 6, 0]} barSize={14}>
                    {bottleneckRows.map((item) => (
                      <Cell
                        key={item.label}
                        fill={item.label === largestBottleneck.label ? chartColors.accent : chartColors.primarySoft}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="mt-16 text-center text-sm text-foreground-500">当前没有可计算的阶段停留数据</p>
        )}
      </section>
    </div>
  );
}
