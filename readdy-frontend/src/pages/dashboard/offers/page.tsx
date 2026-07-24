import { useNavigate, useLocation } from 'react-router-dom';

const offersData = [
  { id: 1, candidate: '陈伟', position: '高级前端工程师', department: '技术研发部', offerSentAt: '2026-07-15', offerAmount: '35K', status: '已接受', expectedOnboard: '2026-08-01' },
  { id: 2, candidate: '赵晓月', position: 'UI/UX设计师', department: '设计部', offerSentAt: '2026-07-10', offerAmount: '28K', status: '已接受', expectedOnboard: '2026-07-12' },
  { id: 3, candidate: '吴芳', position: 'HRBP', department: '人力资源部', offerSentAt: '2026-07-14', offerAmount: '22K', status: '待确认', expectedOnboard: '—' },
  { id: 4, candidate: '孙明', position: '前端开发工程师', department: '技术研发部', offerSentAt: '2026-07-16', offerAmount: '30K', status: '待确认', expectedOnboard: '—' },
  { id: 5, candidate: '刘强', position: '数据分析师', department: '数据部', offerSentAt: '2026-07-13', offerAmount: '32K', status: '已拒绝', expectedOnboard: '—' },
  { id: 6, candidate: '马晓东', position: 'Java开发工程师', department: '技术研发部', offerSentAt: '2026-07-09', offerAmount: '33K', status: '已接受', expectedOnboard: '2026-07-20' },
  { id: 7, candidate: '杨思', position: '市场运营专员', department: '市场部', offerSentAt: '2026-07-11', offerAmount: '20K', status: '已拒绝', expectedOnboard: '—' },
];

const statusStyle: Record<string, string> = {
  '已接受': 'bg-primary-100 text-primary-700',
  '待确认': 'bg-accent-100 text-accent-700',
  '已拒绝': 'bg-background-200 text-foreground-500',
};

export default function OffersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { fromDashboard?: boolean; candidateName?: string; candidateId?: number } | null;
  const fromDashboard = !!navState?.fromDashboard;

  const accepted = offersData.filter(o => o.status === '已接受').length;
  const sent = offersData.length;
  const rate = Math.round((accepted / sent) * 100);

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
            <span className="text-sm font-medium text-foreground-900">Offer接受率详情</span>
          </>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground-900">Offer 接受率</h1>
        <p className="text-sm text-foreground-500 mt-1">追踪 Offer 发放与候选人反馈情况</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center mb-3">
            <i className="ri-send-plane-line text-primary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{sent}</p>
          <p className="text-xs text-foreground-500">已发 Offer 总数</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center mb-3">
            <i className="ri-check-double-line text-accent-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{accepted}</p>
          <p className="text-xs text-foreground-500">已接受</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center mb-3">
            <i className="ri-thumb-up-line text-secondary-600"></i>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{rate}%</p>
          <p className="text-xs text-foreground-500">接受率</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">Offer 记录</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200">
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">候选人</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">职位</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">部门</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">Offer 薪资</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">发放日期</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">状态</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">预计入职</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-100">
            {offersData.map((o) => (
              <tr key={o.id} className="hover:bg-background-50/50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-600">{o.candidate.charAt(0)}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground-900">{o.candidate}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{o.position}</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{o.department}</td>
                <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{o.offerAmount}</td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{o.offerSentAt}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${statusStyle[o.status] || ''}`}>{o.status}</span>
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground-600">{o.expectedOnboard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}