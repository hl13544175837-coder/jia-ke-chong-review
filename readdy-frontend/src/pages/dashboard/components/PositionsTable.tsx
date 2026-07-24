import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { myPositionProgress } from '@/mocks/dashboard';

export default function PositionsTable() {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const stageLabels: Record<string, string> = {
    screening: '待筛选',
    passed: '初筛通过',
    interview1: '一面',
    interview2: '二面',
    final: '终面',
    salary: '谈薪中',
    communicating: '沟通中',
    offer: 'Offer发放中',
    onboarding: '正式到岗中',
    hired: '已入职',
  };

  const stageOrder = ['screening', 'passed', 'interview1', 'interview2', 'final', 'salary', 'offer', 'hired'];

  const handleRowClick = (title: string) => {
    sessionStorage.setItem('dashboard_scrollPosition', String(window.scrollY));
    navigate('/jobs', { state: { fromDashboard: true, openTitle: title } });
  };

  return (
    <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
      <div className="flex items-stretch border-b border-background-200 hover:bg-background-50/50 transition-colors">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="我的岗位进展 查看全部"
          className="flex flex-1 items-center justify-between px-5 py-4 cursor-pointer text-left"
        >
          <h3 className="font-semibold text-foreground-900 text-sm">我的岗位进展</h3>
          <i className={`${isCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-sm text-foreground-400`}></i>
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem('dashboard_scrollPosition', String(window.scrollY));
            navigate('/jobs');
          }}
          className="px-5 text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap cursor-pointer"
        >
          查看全部 <i className="ri-arrow-right-line ml-0.5"></i>
        </button>
      </div>
      {!isCollapsed && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200 bg-background-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">岗位名称</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">部门</th>
                <th className="text-center px-2 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">HC</th>
                {stageOrder.map(key => (
                  <th key={key} className="text-center px-2 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">{stageLabels[key]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myPositionProgress.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => handleRowClick(job.title)}
                  className="border-b border-background-100 hover:bg-background-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-foreground-900 hover:text-primary-600 transition-colors whitespace-nowrap">
                      {job.title}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600 whitespace-nowrap">{job.department}</td>
                  <td className="px-2 py-3.5 text-center">
                    <span className="text-sm font-medium text-foreground-800">{job.filled}/{job.headcount}</span>
                  </td>
                  {stageOrder.map((key) => {
                    const count = (job.stages as Record<string, number>)[key] || 0;
                    return (
                      <td key={key} className="px-2 py-3.5 text-center">
                        <span className={`text-sm font-medium ${count > 0 ? 'text-foreground-800' : 'text-foreground-300'}`}>
                          {count}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
