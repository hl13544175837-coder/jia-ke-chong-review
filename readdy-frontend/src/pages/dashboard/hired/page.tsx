import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { offersApi } from '@/features/offers/api';
import type { OfferRecord } from '@/features/offers/types';

function isCurrentMonth(value: string | null) {
  if (!value) return false;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  const now = new Date();
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth();
}

export default function HiredPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { fromDashboard?: boolean; candidateName?: string; candidateId?: number } | null;
  const fromDashboard = !!navState?.fromDashboard;
  const [records, setRecords] = useState<OfferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await offersApi.listOffers({ status: ['onboarded'] });
      setRecords(response.items.filter((item) => isCurrentMonth(item.onboard_date || item.onboarded_at)));
    } catch {
      setError('本月入职记录暂时无法读取，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const cycleValues = useMemo(
    () => records.flatMap((item) => item.recruitment_days === null ? [] : [item.recruitment_days]),
    [records],
  );
  const avgDays = cycleValues.length
    ? Math.round(cycleValues.reduce((sum, value) => sum + value, 0) / cycleValues.length)
    : null;
  const referralCount = records.filter((item) => /内推|内部推荐/.test(item.source_channel)).length;
  const sourcedCount = records.filter((item) => item.source_channel !== '未记录来源').length;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1 text-sm text-foreground-500 transition-colors hover:text-foreground-800"
        >
          <i className="ri-arrow-left-line"></i>
          返回工作台
        </button>
        {fromDashboard && navState?.candidateName ? (
          <>
            <span className="text-foreground-300">/</span>
            <span className="text-sm font-medium text-foreground-900">处理候选人：{navState.candidateName}</span>
          </>
        ) : (
          <>
            <span className="text-foreground-300">/</span>
            <span className="text-sm font-medium text-foreground-900">本月已入职详情</span>
          </>
        )}
      </div>

      <PageHeader
        title="本月已入职"
        description={`本月共 ${records.length} 人入职，平均招聘周期 ${avgDays === null ? '暂无有效数据' : `${avgDays} 天`}`}
        actions={<button type="button" onClick={() => void loadRecords()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button>}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadRecords()} className="font-medium underline">重新加载</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['ri-team-line', '本月入职人数', records.length, 'bg-primary-50 text-primary-600'],
          ['ri-time-line', '平均招聘周期（天）', avgDays ?? '—', 'bg-accent-50 text-accent-600'],
          ['ri-user-heart-line', '内部推荐入职', referralCount, 'bg-secondary-50 text-secondary-600'],
          ['ri-file-list-3-line', '来源已记录', sourcedCount, 'bg-primary-50 text-primary-600'],
        ].map(([icon, label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-background-200 bg-white p-5">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}><i className={String(icon)}></i></div>
            <p className="text-2xl font-bold text-foreground-900">{value}</p>
            <p className="text-xs text-foreground-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
        <div className="border-b border-background-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground-900">入职记录</h2>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-foreground-500">正在读取本地入职记录...</div>
        ) : records.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-foreground-500">本月还没有已确认入职的记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr className="border-b border-background-200">
                {['姓名', '职位', '部门', '来源', '入职日期', '招聘周期（天）'].map((label) => <th key={label} className="px-5 py-3 text-left text-xs font-medium text-foreground-500">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-background-100">
                {records.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-background-50/50">
                    <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50"><span className="text-xs font-semibold text-primary-600">{record.candidate_name.charAt(0)}</span></div><span className="text-sm font-medium text-foreground-900">{record.candidate_name}</span></div></td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{record.position || '未填写'}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{record.department || '未填写'}</td>
                    <td className="px-5 py-3.5"><span className="rounded bg-background-100 px-2 py-1 text-xs text-foreground-600">{record.source_channel}</span></td>
                    <td className="px-5 py-3.5 text-sm text-foreground-700">{record.onboard_date || '未记录'}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-700">{record.recruitment_days ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
