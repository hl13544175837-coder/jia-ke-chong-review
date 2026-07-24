import { useNavigate } from 'react-router-dom';

const cycleData = [
  { position: '高级前端工程师', department: '技术研发部', avgDays: 16, fastest: 8, slowest: 28, totalHired: 4 },
  { position: '产品经理', department: '产品部', avgDays: 22, fastest: 14, slowest: 35, totalHired: 2 },
  { position: '后端开发工程师', department: '技术研发部', avgDays: 19, fastest: 10, slowest: 30, totalHired: 6 },
  { position: 'UI/UX设计师', department: '设计部', avgDays: 18, fastest: 12, slowest: 25, totalHired: 3 },
  { position: '数据分析师', department: '数据部', avgDays: 15, fastest: 7, slowest: 24, totalHired: 2 },
  { position: '测试工程师', department: '技术研发部', avgDays: 14, fastest: 6, slowest: 22, totalHired: 5 },
  { position: 'HRBP', department: '人力资源部', avgDays: 20, fastest: 11, slowest: 32, totalHired: 1 },
  { position: '市场运营专员', department: '市场部', avgDays: 21, fastest: 15, slowest: 29, totalHired: 2 },
];

export default function CyclePage() {
  const navigate = useNavigate();

  const totalAvg = Math.round(cycleData.reduce((s, c) => s + c.avgDays, 0) / cycleData.length);
  const fastest = Math.min(...cycleData.map(c => c.fastest));
  const slowest = Math.max(...cycleData.map(c => c.slowest));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>
          返回工作台
        </button>
        <span className="text-foreground-300">/</span>
        <span className="text-sm font-medium text-foreground-900">平均招聘周期详情</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground-900">平均招聘周期</h1>
        <p className="text-sm text-foreground-500 mt-1">按岗位分析招聘周期，优化流程瓶颈</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center mb-3">
            <i className="ri-time-line text-accent-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{totalAvg}<span className="text-sm font-normal text-foreground-500 ml-1">天</span></p>
          <p className="text-xs text-foreground-500">整体平均周期</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center mb-3">
            <i className="ri-send-plane-line text-primary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{fastest}<span className="text-sm font-normal text-foreground-500 ml-1">天</span></p>
          <p className="text-xs text-foreground-500">最快入职</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-background-200 flex items-center justify-center mb-3">
            <i className="ri-hourglass-line text-foreground-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{slowest}<span className="text-sm font-normal text-foreground-500 ml-1">天</span></p>
          <p className="text-xs text-foreground-500">最慢入职</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center mb-3">
            <i className="ri-file-list-3-line text-secondary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{cycleData.length}</p>
          <p className="text-xs text-foreground-500">统计岗位数</p>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">各岗位招聘周期明细</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200">
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">岗位</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">部门</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">平均周期</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">最快</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">最慢</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">入职人数</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">周期分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-100">
            {cycleData.map((c, idx) => (
              <tr key={idx} className="hover:bg-background-50/50 transition-colors">
                <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{c.position}</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{c.department}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-sm font-semibold ${c.avgDays <= totalAvg ? 'text-primary-600' : 'text-accent-600'}`}>
                    {c.avgDays} 天
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{c.fastest} 天</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{c.slowest} 天</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{c.totalHired} 人</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    <div className="h-2 rounded-full bg-primary-200 w-full max-w-[120px]">
                      <div
                        className="h-2 rounded-full bg-primary-500"
                        style={{ width: `${Math.round((c.avgDays / slowest) * 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-foreground-400">{c.avgDays}d</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}