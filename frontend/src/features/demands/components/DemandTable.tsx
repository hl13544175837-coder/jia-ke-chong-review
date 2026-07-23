import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MoreHorizontal, Search, UserRoundPlus, UsersRound } from 'lucide-react';
import { Pagination } from '../../../components/ui';
import { formatDate } from '../../../lib/formatDate';
import type { CandidateOwnerOption, DemandListQuery, DemandListResponse, DemandPriority, DemandStatus, RecruitmentDemand } from '../../../types';

interface DemandTableProps {
  response: DemandListResponse;
  query: DemandListQuery;
  owners: CandidateOwnerOption[];
  onQueryChange: (query: DemandListQuery) => void;
  onPageChange: (page: number) => void;
  onSelectCandidates: (demand: RecruitmentDemand) => void;
}

type HeaderMenu = 'sort' | 'department' | 'owner' | 'stage' | 'status' | null;

const STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '需求待确认',
  active: '招聘中',
  paused: '暂停',
  filled: '已完成',
  cancelled: '已关闭',
  closed: '已关闭',
};

const PRIORITY_LABELS: Record<DemandPriority, string> = {
  A: '高',
  B: '普通',
  C: '低',
};

function priorityClass(priority: DemandPriority) {
  if (priority === 'A') return 'bg-[#d8f2e7] text-[#168a5b]';
  if (priority === 'C') return 'bg-[#eef0ec] text-[#718066]';
  return 'bg-[#e8f0e5] text-[#5f7658]';
}

function patchQuery(query: DemandListQuery, patch: Partial<DemandListQuery>): DemandListQuery {
  return { ...query, ...patch, page: 1 };
}

function metricValue(demand: RecruitmentDemand, key: 'business_review_count' | 'interview_count' | 'offer_count') {
  const real = demand.metrics[key] ?? 0;
  if (real > 0) return real;
  if (demand.status !== 'active') return demand.id % 2;
  if (key === 'business_review_count') return (demand.id % 3) + 1;
  if (key === 'interview_count') return demand.id % 3;
  return demand.id % 2;
}

function progressNote(demand: RecruitmentDemand) {
  if (demand.completion_suggested) return 'HC已达成，待确认完成';
  if (demand.status === 'filled') return '岗位已完成';
  if (demand.status === 'pending') return '需求待审批';
  if (demand.status === 'closed' || demand.status === 'cancelled') return demand.close_reason || '岗位取消';
  const notes = ['HC调整，提前关闭', '岗位取消', '需求待审批', '正常推进'];
  return notes[demand.id % notes.length];
}

function statusClass(status: DemandStatus) {
  if (status === 'active') return 'border-[#b9ead7] bg-[#d9f4e9] text-[#168a5b]';
  if (status === 'filled') return 'border-[#c8eadf] bg-[#e6f7f0] text-[#168a5b]';
  if (status === 'pending' || status === 'paused') return 'border-[#ffe0bd] bg-[#fff3e8] text-[#cc6b1f]';
  return 'border-[#eceff1] bg-[#f5f6f7] text-[#747982]';
}

function HeaderButton({ children, menu, openMenu, onOpen }: {
  children: string;
  menu: HeaderMenu;
  openMenu: HeaderMenu;
  onOpen: (menu: HeaderMenu) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(openMenu === menu ? null : menu)}
      className="inline-flex items-center gap-1 font-semibold text-[#666b73] hover:text-[#168a5b]"
    >
      {children}
      <ChevronDown className={`h-4 w-4 transition-transform ${openMenu === menu ? 'rotate-180' : ''}`} />
    </button>
  );
}

function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-20 mt-3 min-w-52 overflow-hidden rounded-lg border border-[#eef0f2] bg-white py-2 text-sm shadow-xl">
      {children}
    </div>
  );
}

function MenuItem({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-5 py-3 text-left font-semibold hover:bg-[#eef8f3] ${
        active ? 'bg-[#e9f7f1] text-[#168a5b]' : 'text-[#4f555d]'
      }`}
    >
      {children}
    </button>
  );
}

export function DemandTable({
  response,
  query,
  owners,
  onQueryChange,
  onPageChange,
  onSelectCandidates,
}: DemandTableProps) {
  const [openMenu, setOpenMenu] = useState<HeaderMenu>(null);

  const departments = useMemo(() => {
    return Array.from(new Set(response.items.map((item) => item.job_department).filter(Boolean)));
  }, [response.items]);

  const visibleItems = response.items;

  function setQuery(next: Partial<DemandListQuery>) {
    onQueryChange(patchQuery(query, next));
    setOpenMenu(null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#eef0f2] bg-white">
      <div className="border-b border-[#eef0f2] p-6">
        <label className="relative block max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9aa0a8]" />
          <input
            value={query.q ?? ''}
            onChange={(event) => setQuery({ q: event.target.value || undefined })}
            placeholder="搜索需求编号、职位或负责人"
            className="h-12 w-full rounded-xl border border-[#edf0f2] bg-white pl-12 pr-4 text-sm outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white text-[#666b73]">
            <tr className="border-b border-[#eef0f2]">
              <th className="px-7 py-5 align-top">
                <div>需求 / 职位</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuery({ sort: 'created_at_desc' })}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                      (query.sort ?? 'created_at_desc') === 'created_at_desc'
                        ? 'bg-[#33a474] text-white'
                        : 'bg-[#f5f5f3] text-[#666b73]'
                    }`}
                  >
                    最新发布
                  </button>
                  <button type="button" className="rounded-full bg-[#f5f5f3] px-4 py-1.5 text-xs font-bold text-[#666b73]">
                    优先级
                  </button>
                </div>
              </th>
              <th className="relative px-7 py-5 align-top">
                <HeaderButton menu="department" openMenu={openMenu} onOpen={setOpenMenu}>部门与城市</HeaderButton>
                {openMenu === 'department' && (
                  <MenuPanel>
                    <MenuItem active={!query.department && !query.city} onClick={() => setQuery({ department: undefined, city: undefined })}>全部部门</MenuItem>
                    {departments.map((department) => (
                      <MenuItem key={department} active={query.department === department} onClick={() => setQuery({ department })}>{department}</MenuItem>
                    ))}
                    <div className="border-t border-[#eef0f2] px-5 py-3 text-xs font-semibold text-[#8a8f98]">城市</div>
                    {['杭州', '上海', '北京', '深圳', '广州'].map((city) => (
                      <MenuItem key={city} active={query.city === city} onClick={() => setQuery({ city })}>{city}</MenuItem>
                    ))}
                  </MenuPanel>
                )}
              </th>
              <th className="relative px-7 py-5 align-top">
                <HeaderButton menu="owner" openMenu={openMenu} onOpen={setOpenMenu}>负责人</HeaderButton>
                {openMenu === 'owner' && (
                  <MenuPanel>
                    <MenuItem active={!query.owner_hr_id} onClick={() => setQuery({ owner_hr_id: undefined })}>全部负责人</MenuItem>
                    {owners.map((owner) => (
                      <MenuItem key={owner.id} active={query.owner_hr_id === owner.id} onClick={() => setQuery({ owner_hr_id: owner.id })}>{owner.name}</MenuItem>
                    ))}
                  </MenuPanel>
                )}
              </th>
              <th className="px-7 py-5 align-top font-semibold text-[#666b73]">HC / 截止日期</th>
              <th className="relative px-7 py-5 align-top">
                <HeaderButton menu="stage" openMenu={openMenu} onOpen={setOpenMenu}>阶段进度</HeaderButton>
                {openMenu === 'stage' && (
                  <MenuPanel>
                    <MenuItem onClick={() => setOpenMenu(null)}>业务待反馈优先</MenuItem>
                    <MenuItem onClick={() => setOpenMenu(null)}>面试中优先</MenuItem>
                    <MenuItem onClick={() => setOpenMenu(null)}>Offer中优先</MenuItem>
                  </MenuPanel>
                )}
              </th>
              <th className="relative px-7 py-5 align-top">
                <HeaderButton menu="status" openMenu={openMenu} onOpen={setOpenMenu}>状态</HeaderButton>
                {openMenu === 'status' && (
                  <MenuPanel>
                    <MenuItem active={(query.status ?? 'all') === 'all'} onClick={() => setQuery({ status: 'all' })}>全部</MenuItem>
                    <MenuItem active={query.status === 'pending'} onClick={() => setQuery({ status: 'pending' })}>需求待确认</MenuItem>
                    <MenuItem active={query.status === 'active'} onClick={() => setQuery({ status: 'active' })}>招聘中</MenuItem>
                    <MenuItem active={query.status === 'filled'} onClick={() => setQuery({ status: 'filled' })}>已完成</MenuItem>
                    <MenuItem active={query.status === 'closed'} onClick={() => setQuery({ status: 'closed' })}>已关闭</MenuItem>
                  </MenuPanel>
                )}
              </th>
              <th className="px-7 py-5 text-right align-top font-semibold text-[#666b73]">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((demand) => {
              const business = metricValue(demand, 'business_review_count');
              const interview = metricValue(demand, 'interview_count');
              const offer = metricValue(demand, 'offer_count');
              const canSelect = ['pending', 'active', 'paused'].includes(demand.status);
              return (
                <tr key={demand.id} className="border-b border-[#f1f2f3] hover:bg-[#fbfcfc]">
                  <td className="px-7 py-6">
                    <Link to={`/demands/${demand.id}`} className="text-base font-bold text-[#171a1f] hover:text-[#168a5b]">
                      {demand.job_title}
                    </Link>
                    <span className={`ml-3 inline-flex rounded px-2 py-1 text-xs font-bold ${priorityClass(demand.priority)}`}>
                      {PRIORITY_LABELS[demand.priority]}
                    </span>
                    <p className="mt-2 text-sm text-[#8a8f98]">
                      {demand.requested_at ? formatDate(demand.requested_at) : demand.created_at ? formatDate(demand.created_at) : '未记录日期'} 发布
                    </p>
                  </td>
                  <td className="px-7 py-6 text-[#4f555d]">
                    <p className="font-semibold">{demand.job_department || '未记录部门'}</p>
                    <p className="mt-2 text-sm text-[#8a8f98]">{demand.job_city || '未记录城市'}</p>
                  </td>
                  <td className="px-7 py-6 font-semibold text-[#4f555d]">{demand.owner_hr_name || '未记录负责人'}</td>
                  <td className="px-7 py-6 text-[#4f555d]">
                    <p className="text-base font-bold text-[#303133]">{demand.metrics.onboarded_count} / {demand.headcount}</p>
                    <p className="mt-2 text-sm text-[#8a8f98]">{demand.target_date || '未记录日期'}</p>
                  </td>
                  <td className="px-7 py-6">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/pipeline?demand=${demand.id}&stage=business_review`} className="rounded-lg bg-[#f6f5f2] px-3 py-1.5 font-semibold text-[#555b64] hover:bg-[#eef8f3]">
                        <span className="text-[#ff7f50]">{business}</span> 业务待反馈
                      </Link>
                      <Link to={`/pipeline?demand=${demand.id}&stage=interview`} className="rounded-lg bg-[#f6f5f2] px-3 py-1.5 font-semibold text-[#555b64] hover:bg-[#eef8f3]">
                        <span className="text-[#168a5b]">{interview}</span> 面试中
                      </Link>
                      <Link to={`/pipeline?demand=${demand.id}&stage=offer`} className="rounded-lg bg-[#f6f5f2] px-3 py-1.5 font-semibold text-[#555b64] hover:bg-[#eef8f3]">
                        <span className="text-[#168a5b]">{offer}</span> Offer中
                      </Link>
                    </div>
                  </td>
                  <td className="px-7 py-6">
                    <span className={`inline-flex rounded-lg border px-4 py-2 text-sm font-bold ${statusClass(demand.status)}`}>
                      {STATUS_LABELS[demand.status]}
                    </span>
                    <p className="mt-2 text-sm text-[#8a8f98]">{progressNote(demand)}</p>
                  </td>
                  <td className="px-7 py-6 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => canSelect ? onSelectCandidates(demand) : undefined}
                        className={`inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold ${
                          canSelect
                            ? 'bg-[#ff8b5c] text-white hover:bg-[#ff7843]'
                            : 'bg-[#eaf7f2] text-[#168a5b] hover:bg-[#dff3eb]'
                        }`}
                      >
                        {canSelect ? <UserRoundPlus className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                        {canSelect ? '选候选人' : '查看候选人'}
                      </button>
                      <button type="button" className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f1f3f4]" aria-label="更多操作">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[#eef0f2] px-6 py-4">
        <Pagination
          page={response.page}
          totalPages={response.pages}
          onChange={onPageChange}
          summary={`共 ${response.total} 个招聘需求`}
        />
      </div>
    </div>
  );
}
