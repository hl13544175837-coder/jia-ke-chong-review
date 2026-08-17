import PageHeader from '@/components/ui/PageHeader';
import {
  recruitmentFlowConnections,
  recruitmentFlowNodes,
  recruitmentSwimlanes,
  type RecruitmentFlowNode,
} from '@/features/recruitmentFlow/flow';

const COLUMN_WIDTH = 136;
const LANE_HEIGHT = 116;
const diagramWidth = COLUMN_WIDTH * 8;
const diagramHeight = LANE_HEIGHT * recruitmentSwimlanes.length;

const nodeTone = {
  normal: 'border-blue-300 bg-white text-blue-950 shadow-sm',
  waiting: 'border-amber-300 bg-amber-50 text-amber-950 shadow-sm',
  terminal: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm',
  system: 'border-violet-300 bg-violet-50 text-violet-950 shadow-sm',
};

const laneIndex = new Map(recruitmentSwimlanes.map((lane, index) => [lane.id, index]));
const nodeById = new Map(recruitmentFlowNodes.map((node) => [node.id, node]));

function centerOf(node: RecruitmentFlowNode) {
  return {
    x: (node.column - 0.5) * COLUMN_WIDTH,
    y: ((laneIndex.get(node.lane) ?? 0) + 0.5) * LANE_HEIGHT,
  };
}

function connectorPath(from: RecruitmentFlowNode, to: RecruitmentFlowNode, loop?: boolean) {
  const start = centerOf(from);
  const end = centerOf(to);
  if (loop) return `M ${start.x + 64} ${start.y - 20} C ${start.x + 90} ${start.y - 82}, ${end.x - 90} ${end.y - 82}, ${end.x - 64} ${end.y - 20}`;
  const bend = Math.max(42, Math.abs(end.x - start.x) / 2);
  return `M ${start.x + 64} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x - 64} ${end.y}`;
}

export default function RecruitmentFlowPage() {
  return (
    <div className="space-y-5 p-4 sm:p-6" data-ui="recruitment-flow-overview">
      <PageHeader title="招聘流程总览" description="状态流转泳道图：按当前系统已落地的流程状态展示" />

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">当前系统状态口径</p>
        <p className="mt-1">图中只展示当前产品已有的状态与操作路径；当前页面不调用接口，也不会修改招聘数据。</p>
      </section>

      <section aria-label="状态图例" className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-blue-300 bg-white px-3 py-1 text-blue-800">正常流转</span>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-800">等待人工处理</span>
        <span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-violet-800">系统状态</span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-800">结束状态</span>
        <span className="rounded-full border border-dashed border-amber-400 bg-white px-3 py-1 text-amber-800">虚线：回到前一步</span>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-background-200 bg-white shadow-sm" aria-label="招聘状态流转泳道图">
        <div className="min-w-[1248px]">
          <div className="grid border-b border-background-200 bg-background-50 pl-40" style={{ gridTemplateColumns: `repeat(8, ${COLUMN_WIDTH}px)` }}>
            {['需求', '审批', '收录', '筛选', '面试', 'Offer 拟定', 'Offer 答复', '入职'].map((label) => <div key={label} className="border-r border-background-200 px-2 py-2 text-center text-xs font-medium text-foreground-500">{label}</div>)}
          </div>
          <div className="relative pl-40" style={{ height: diagramHeight }}>
            <div className="absolute inset-y-0 left-0 w-40 border-r border-background-200 bg-background-50">
              {recruitmentSwimlanes.map((lane) => (
                <div key={lane.id} className="flex h-[116px] flex-col justify-center border-b border-background-200 px-4">
                  <p className="text-sm font-semibold text-foreground-900">{lane.label}</p>
                  <p className="mt-1 text-xs leading-4 text-foreground-500">{lane.description}</p>
                </div>
              ))}
            </div>
            <div className="relative" style={{ width: diagramWidth, height: diagramHeight }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(8, ${COLUMN_WIDTH}px)`, gridTemplateRows: `repeat(7, ${LANE_HEIGHT}px)` }}>
                {Array.from({ length: 56 }, (_, index) => <div key={index} className="border-b border-r border-background-100" />)}
              </div>
              <svg className="pointer-events-none absolute inset-0 z-10" width={diagramWidth} height={diagramHeight} viewBox={`0 0 ${diagramWidth} ${diagramHeight}`} aria-hidden="true">
                <defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#64748b" /></marker></defs>
                {recruitmentFlowConnections.map((connection) => {
                  const from = nodeById.get(connection.from);
                  const to = nodeById.get(connection.to);
                  if (!from || !to) return null;
                  const start = centerOf(from);
                  const end = centerOf(to);
                  return <g key={`${connection.from}-${connection.to}`}>
                    <path d={connectorPath(from, to, connection.kind === 'loop')} fill="none" stroke={connection.kind === 'branch' ? '#e11d48' : connection.kind === 'loop' ? '#d97706' : '#64748b'} strokeWidth="2" strokeDasharray={connection.kind === 'loop' ? '6 5' : undefined} markerEnd="url(#flow-arrow)" />
                    {connection.label && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 8} textAnchor="middle" className="fill-foreground-600 text-[11px]">{connection.label}</text>}
                  </g>;
                })}
              </svg>
              {recruitmentFlowNodes.map((node) => (
                <article key={node.id} className={`absolute z-20 w-[122px] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-2.5 ${nodeTone[node.tone]}`} style={{ left: (node.column - 0.5) * COLUMN_WIDTH, top: ((laneIndex.get(node.lane) ?? 0) + 0.5) * LANE_HEIGHT }}>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wide opacity-65">{node.status}</p>
                  <h2 className="mt-1 text-sm font-semibold leading-5">{node.title}</h2>
                  <p className="mt-1 text-[11px] leading-4 opacity-75">{node.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <p className="text-xs text-foreground-500">提示：宽屏可查看完整流向；窄屏时左右滑动查看全部泳道和分支。</p>
    </div>
  );
}
