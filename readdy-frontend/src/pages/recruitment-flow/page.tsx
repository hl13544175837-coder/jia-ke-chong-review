import PageHeader from '@/components/ui/PageHeader';
import { integrationStatusMeta, recruitmentFlowGroups } from '@/features/recruitmentFlow/flow';

const toneClass = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
  orange: 'border-orange-200 bg-orange-50 text-orange-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export default function RecruitmentFlowPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" data-ui="recruitment-flow-overview">
      <PageHeader title="招聘流程总览" description="从需求启动到入职闭环的只读流程说明" />

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">以飞书基准为准</p>
        <p className="mt-1">接口状态用于说明建设口径；当前页面不调用接口，也不会修改招聘数据。</p>
      </section>

      <section aria-label="接口准备情况图例" className="rounded-xl border border-background-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-foreground-900">接口准备情况</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(integrationStatusMeta).map(([key, meta]) => (
            <span key={key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
          ))}
        </div>
      </section>

      <section className="space-y-6" aria-label="连续招聘流程">
        {recruitmentFlowGroups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${toneClass[group.tone]}`}>{group.title}</h2>
            <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
              <div className="hidden grid-cols-[minmax(14rem,1.3fr)_minmax(9rem,.8fr)_minmax(16rem,1.4fr)_minmax(15rem,1.2fr)] gap-4 border-b border-background-200 bg-background-50 px-4 py-3 text-xs font-semibold text-foreground-600 lg:grid">
                <span>状态流转</span>
                <span>主责角色</span>
                <span>动作说明</span>
                <span>接口准备情况</span>
              </div>
              {group.steps.map((step) => (
                <article key={step.order} className="grid gap-3 border-b border-background-100 p-4 last:border-b-0 lg:grid-cols-[minmax(14rem,1.3fr)_minmax(9rem,.8fr)_minmax(16rem,1.4fr)_minmax(15rem,1.2fr)] lg:gap-4">
                  <div>
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">{step.order}</span>
                    <h3 className="mt-2 font-semibold text-foreground-900">{step.title}</h3>
                    <p className="mt-1 text-sm text-foreground-600">{step.transition}</p>
                    {step.branch && <p className="mt-2 rounded-md bg-background-50 px-2 py-1 text-xs text-foreground-700">{step.branch}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground-500 lg:hidden">主责角色</p>
                    <p className="mt-1 text-sm text-foreground-800">{step.owner}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground-500 lg:hidden">动作说明</p>
                    <p className="mt-1 text-sm leading-6 text-foreground-700">{step.action}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground-500 lg:hidden">接口准备情况</p>
                    <p className="mt-1 break-words font-mono text-xs text-foreground-700">{step.endpoint}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {step.statuses.map((status) => (
                        <span key={status} className={`rounded-full px-2 py-1 text-xs font-medium ${integrationStatusMeta[status].className}`}>{integrationStatusMeta[status].label}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}
