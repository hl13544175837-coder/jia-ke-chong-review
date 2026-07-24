import { useNavigate, useLocation } from 'react-router-dom';

const hiredList = [
  { id: 1, name: '赵晓月', position: 'UI/UX设计师', department: '设计部', hiredDate: '2026-07-12', daysToHire: 22, source: 'PDF导入' },
  { id: 2, name: '黄涛', position: 'Java开发工程师', department: '技术研发部', hiredDate: '2026-07-10', daysToHire: 18, source: '内部推荐' },
  { id: 3, name: '李思雨', position: '市场运营专员', department: '市场部', hiredDate: '2026-07-08', daysToHire: 25, source: '外部收录' },
  { id: 4, name: '张伟豪', position: '数据分析师', department: '数据部', hiredDate: '2026-07-05', daysToHire: 14, source: 'PDF导入' },
  { id: 5, name: '孙悦', position: '产品经理', department: '产品部', hiredDate: '2026-07-03', daysToHire: 20, source: '内部推荐' },
  { id: 6, name: '周明哲', position: '高级前端工程师', department: '技术研发部', hiredDate: '2026-07-02', daysToHire: 16, source: '外部收录' },
  { id: 7, name: '林芳菲', position: 'HRBP', department: '人力资源部', hiredDate: '2026-07-01', daysToHire: 12, source: 'PDF导入' },
  { id: 8, name: '吴凯', position: '测试工程师', department: '技术研发部', hiredDate: '2026-07-01', daysToHire: 19, source: '内部推荐' },
];

export default function HiredPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { fromDashboard?: boolean; candidateName?: string; candidateId?: number } | null;
  const fromDashboard = !!navState?.fromDashboard;

  const avgDays = Math.round(hiredList.reduce((sum, h) => sum + h.daysToHire, 0) / hiredList.length);

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
        {fromDashboard && navState?.candidateName && (
          <>
            <span className="text-foreground-300">/</span>
            <span className="text-sm font-medium text-foreground-900">
              处理候选人：{navState.candidateName}
            </span>
          </>
        )}
        {!fromDashboard && (
          <>
            <span className="text-foreground-300">/</span>
            <span className="text-sm font-medium text-foreground-900">本月已入职详情</span>
          </>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground-900">本月已入职</h1>
        <p className="text-sm text-foreground-500 mt-1">本月共 {hiredList.length} 人入职，平均招聘周期 {avgDays} 天</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center mb-3">
            <i className="ri-team-line text-primary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{hiredList.length}</p>
          <p className="text-xs text-foreground-500">本月入职人数</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center mb-3">
            <i className="ri-time-line text-accent-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{avgDays}</p>
          <p className="text-xs text-foreground-500">平均招聘周期（天）</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center mb-3">
            <i className="ri-user-heart-line text-secondary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">3</p>
          <p className="text-xs text-foreground-500">内部推荐入职</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center mb-3">
            <i className="ri-file-pdf-line text-primary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{hiredList.filter(h => h.source === 'PDF导入').length}</p>
          <p className="text-xs text-foreground-500">PDF导入入职</p>
        </div>
      </div>

      {/* Hired list */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">入职记录</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200">
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">姓名</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">职位</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">部门</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">来源</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">入职日期</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">招聘周期（天）</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-100">
            {hiredList.map((h) => (
              <tr key={h.id} className="hover:bg-background-50/50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-600">{h.name.charAt(0)}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground-900">{h.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{h.position}</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{h.department}</td>
                <td className="px-5 py-3.5">
                  <span className="text-xs px-2 py-1 rounded bg-background-100 text-foreground-600">{h.source}</span>
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground-700">{h.hiredDate}</td>
                <td className="px-5 py-3.5 text-sm text-foreground-700">{h.daysToHire}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}