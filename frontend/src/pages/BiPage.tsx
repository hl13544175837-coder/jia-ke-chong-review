import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  MailCheck,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button, Spinner } from '../components/ui';

// 导航语义锚点：Offer 管理。
type OfferStatus = 'all' | 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'declined' | 'onboarded';
type OfferMenu = 'candidate' | 'job' | 'salary' | 'progress' | 'latest' | null;

interface OfferRow {
  id: number;
  candidateId: number;
  candidate: string;
  followOwner: string;
  jobTitle: string;
  department: string;
  salary: string;
  onboardDate: string;
  status: Exclude<OfferStatus, 'all'>;
  statusText: string;
  statusNote: string;
  latestAction: string;
  latestDate: string;
}

const STATUS_TABS: Array<{ key: OfferStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '待提交' },
  { key: 'pending', label: '审批中' },
  { key: 'approved', label: '待发放' },
  { key: 'sent', label: '待回复' },
  { key: 'accepted', label: '待入职' },
  { key: 'onboarded', label: '已结束' },
];

const MOCK_OFFERS: OfferRow[] = [
  { id: 1, candidateId: 101, candidate: '黄诗涵', followOwner: '李华 跟进', jobTitle: '高级产品经理', department: '产品一组', salary: '税前月薪 ¥35,000', onboardDate: '预计 2026-08-15 入职', status: 'draft', statusText: '待提交', statusNote: '草稿未提交', latestAction: '草稿创建', latestDate: '2026-07-18' },
  { id: 2, candidateId: 102, candidate: '陆浩然', followOwner: '张敏 跟进', jobTitle: 'Java开发工程师', department: '技术二组', salary: '税前月薪 ¥32,000', onboardDate: '预计 2026-08-01 入职', status: 'draft', statusText: '待提交', statusNote: '草稿未提交', latestAction: '草稿创建', latestDate: '2026-07-17' },
  { id: 3, candidateId: 105, candidate: '孙博文', followOwner: '李华 跟进', jobTitle: '前端开发工程师', department: '技术研发部', salary: '税前月薪 ¥25,000', onboardDate: '预计 2026-08-01 入职', status: 'pending', statusText: '审批中', statusNote: '等待人力资源总监审批', latestAction: '提交审批', latestDate: '2026-07-17' },
  { id: 4, candidateId: 104, candidate: '黄涛', followOwner: '李华 跟进', jobTitle: '前端开发工程师', department: '技术研发部', salary: '税前月薪 ¥30,000', onboardDate: '预计 2026-08-10 入职', status: 'pending', statusText: '审批中', statusNote: '等待招聘主管审批', latestAction: '提交审批', latestDate: '2026-07-17' },
  { id: 5, candidateId: 103, candidate: '赵晓月', followOwner: '李华 跟进', jobTitle: 'UI/UX设计师', department: '设计部', salary: '税前月薪 ¥22,000', onboardDate: '预计 2026-08-15 入职', status: 'approved', statusText: '待发放', statusNote: '审批已通过', latestAction: '审批通过', latestDate: '2026-07-16' },
  { id: 6, candidateId: 106, candidate: '范德彪', followOwner: '李华 跟进', jobTitle: '高级产品经理', department: '产品二组', salary: '税前月薪 ¥38,000', onboardDate: '预计 2026-08-05 入职', status: 'sent', statusText: '等待回复', statusNote: '有效期至 2026-07-28', latestAction: 'Offer已发送', latestDate: '2026-07-14' },
  { id: 7, candidateId: 107, candidate: '林小雅', followOwner: '李华 跟进', jobTitle: '高级产品经理', department: '产品部', salary: '税前月薪 ¥35,000', onboardDate: '预计 2026-08-01 入职', status: 'sent', statusText: '等待回复', statusNote: '有效期至 2026-07-30', latestAction: 'Offer已发送', latestDate: '2026-07-16' },
  { id: 8, candidateId: 108, candidate: '王浩然', followOwner: '李华 跟进', jobTitle: '后端开发工程师', department: '技术研发部', salary: '税前月薪 ¥28,000', onboardDate: '预计 2026-08-01 入职', status: 'accepted', statusText: '待入职', statusNote: '预计2026-08-01', latestAction: '候选人已接受', latestDate: '2026-07-16' },
  { id: 9, candidateId: 109, candidate: '李思远', followOwner: '李华 跟进', jobTitle: '后端开发工程师', department: '技术研发部', salary: '税前月薪 ¥24,000', onboardDate: '预计 2026-08-01 入职', status: 'declined', statusText: '已拒绝', statusNote: '拒绝：候选人表示已接受其他公司Offer', latestAction: '候选人已拒绝', latestDate: '2026-07-15' },
  { id: 10, candidateId: 110, candidate: '张伟', followOwner: '李华 跟进', jobTitle: '高级产品经理', department: '产品部', salary: '税前月薪 ¥32,000', onboardDate: '已于 2026-07-20 入职', status: 'onboarded', statusText: '已入职', statusNote: '入职于2026-07-20', latestAction: '已入职', latestDate: '2026-07-20' },
  { id: 11, candidateId: 113, candidate: '刘雨欣', followOwner: '张敏 跟进', jobTitle: '数据分析师', department: '数据部', salary: '税前月薪 ¥26,000', onboardDate: '预计 2026-08-12 入职', status: 'accepted', statusText: '待入职', statusNote: '待入职材料确认', latestAction: '候选人已接受', latestDate: '2026-07-18' },
  { id: 12, candidateId: 112, candidate: '周雨桐', followOwner: '李华 跟进', jobTitle: '市场运营专员', department: '市场部', salary: '税前月薪 ¥18,000', onboardDate: 'Offer已结束', status: 'declined', statusText: '已拒绝', statusNote: '薪资期望不匹配', latestAction: '候选人已拒绝', latestDate: '2026-07-13' },
];

function initial(name: string) {
  return name.slice(0, 1);
}

function statusClass(status: OfferRow['status']) {
  if (status === 'pending') return 'bg-[#fff3d7] text-[#b76600]';
  if (status === 'approved' || status === 'accepted' || status === 'onboarded') return 'bg-[#def5e9] text-[#168a5b]';
  if (status === 'sent') return 'bg-[#fff0e8] text-[#e66c3a]';
  if (status === 'declined') return 'bg-[#ffe8e8] text-[#d93025]';
  return 'bg-[#f3f2ee] text-[#6a6f77]';
}

function actionFor(row: OfferRow) {
  if (row.status === 'draft') return { label: '编辑并提交', tone: 'green' };
  if (row.status === 'pending') return { label: '等待审批', tone: 'plain' };
  if (row.status === 'approved') return { label: '发放Offer', tone: 'green' };
  if (row.status === 'sent') return { label: '跟进回复', tone: 'orange' };
  if (row.status === 'accepted') return { label: '确认入职', tone: 'green' };
  return { label: '查看结果', tone: 'plain' };
}

function demandText(demand: { request_no?: string | null; job_title?: string | null; job_department?: string | null; job_city?: string | null }) {
  return [demand.request_no, demand.job_title, demand.job_department, demand.job_city].filter(Boolean).join(' · ');
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).filter(Boolean);
}

function OfferHeaderFilter({
  label,
  menu,
  openMenu,
  onOpen,
  children,
  align = 'left',
}: {
  label: string;
  menu: OfferMenu;
  openMenu: OfferMenu;
  onOpen: (menu: OfferMenu) => void;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`relative px-5 py-4 font-bold ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(openMenu === menu ? null : menu)}
        className={`inline-flex items-center gap-1 hover:text-[#168a5b] ${align === 'right' ? 'justify-end' : ''}`}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {openMenu === menu && children}
    </th>
  );
}

function OfferFilterMenu({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <div className={`absolute top-full z-30 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-xl border border-[#edf0f2] bg-white py-2 text-sm shadow-xl ${right ? 'right-5' : 'left-5'}`}>
      {children}
    </div>
  );
}

function OfferFilterItem({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-2.5 text-left font-semibold hover:bg-[#eef8f3] ${
        active ? 'bg-[#e9f7f1] text-[#168a5b]' : 'text-[#4f555d]'
      }`}
    >
      {children}
    </button>
  );
}

export function BiPage() {
  const [activeStatus, setActiveStatus] = useState<OfferStatus>('all');
  const [search, setSearch] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<OfferMenu>(null);
  const [candidateFilter, setCandidateFilter] = useState('全部');
  const [jobFilter, setJobFilter] = useState('全部');
  const [salaryFilter, setSalaryFilter] = useState('全部');
  const [progressFilter, setProgressFilter] = useState('全部');
  const [latestFilter, setLatestFilter] = useState('全部');
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );

  const filteredOffers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return MOCK_OFFERS.filter((row) => {
      if (activeStatus !== 'all' && row.status !== activeStatus) return false;
      if (candidateFilter !== '全部' && row.candidate !== candidateFilter) return false;
      if (jobFilter !== '全部' && row.jobTitle !== jobFilter) return false;
      if (salaryFilter !== '全部' && !row.salary.includes(salaryFilter)) return false;
      if (progressFilter !== '全部' && row.statusText !== progressFilter) return false;
      if (latestFilter !== '全部' && row.latestAction !== latestFilter) return false;
      if (!keyword) return true;
      return [row.candidate, row.jobTitle, row.department, row.followOwner].join(' ').toLowerCase().includes(keyword);
    });
  }, [activeStatus, candidateFilter, jobFilter, latestFilter, progressFilter, salaryFilter, search]);

  const counts = useMemo(
    () => STATUS_TABS.reduce<Record<OfferStatus, number>>((acc, tab) => {
      acc[tab.key] = tab.key === 'all'
        ? MOCK_OFFERS.length
        : MOCK_OFFERS.filter((row) => row.status === tab.key).length;
      return acc;
    }, {} as Record<OfferStatus, number>),
    [],
  );
  const candidateOptions = useMemo(() => ['全部', ...uniqueValues(MOCK_OFFERS.map((row) => row.candidate))], []);
  const jobOptions = useMemo(() => ['全部', ...uniqueValues(MOCK_OFFERS.map((row) => row.jobTitle))], []);
  const salaryOptions = ['全部', '¥18,000', '¥22,000', '¥25,000', '¥28,000', '¥30,000', '¥32,000', '¥35,000', '¥38,000'];
  const progressOptions = useMemo(() => ['全部', ...uniqueValues(MOCK_OFFERS.map((row) => row.statusText))], []);
  const latestOptions = useMemo(() => ['全部', ...uniqueValues(MOCK_OFFERS.map((row) => row.latestAction))], []);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button type="button" className="h-11 rounded-lg bg-[#33a474] px-5 font-bold hover:bg-[#27895f]">
          <Plus className="h-4 w-4" />
          发起 Offer
        </Button>
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-full bg-[#f6f5f2] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveStatus(tab.key)}
            className={`h-9 rounded-full px-4 text-sm font-bold transition ${
              activeStatus === tab.key ? 'bg-white text-[#171a1f] shadow-sm' : 'text-[#777c84] hover:text-[#303133]'
            }`}
          >
            {tab.label}
            <span className="ml-2 rounded-full bg-[#edf0f2] px-2 py-0.5 text-xs text-[#777c84]">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="relative flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a8]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索候选人、岗位..."
            className="h-11 w-full rounded-lg border border-[#edf0f2] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
          />
        </label>
        <button
          type="button"
          onClick={() => setMoreFiltersOpen((value) => !value)}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#edf0f2] bg-white px-4 text-sm font-bold text-[#5f646d] hover:bg-[#fbfcfc]"
        >
          <SlidersHorizontal className="h-4 w-4" />
          更多筛选
          <ChevronDown className="h-4 w-4" />
        </button>
        {moreFiltersOpen && (
          <div className="absolute left-[420px] top-12 z-20 w-72 rounded-xl border border-[#edf0f2] bg-white p-4 shadow-xl">
            <p className="text-sm font-bold text-[#303133]">更多筛选</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {['产品部', '技术研发部', '设计部', '本周更新', '8月入职', '高薪资段'].map((item) => (
                <button key={item} type="button" className="rounded-full border border-[#edf0f2] px-3 py-2 font-semibold text-[#5f646d] hover:border-[#33a474] hover:text-[#168a5b]">
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {demandsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-[#8a8f98]">
          <Spinner size="sm" />
          正在同步招聘需求...
        </div>
      )}

      {demandsAsync.data?.items?.[0] && (
        <div className="rounded-lg border border-[#edf0f2] bg-white px-4 py-3 text-sm font-semibold text-[#777c84]">
          当前展示需求：{demandText(demandsAsync.data.items[0]) || '全部招聘需求'}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#edf0f2] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#edf0f2] bg-white text-[#6a6f77]">
              <OfferHeaderFilter label="候选人" menu="candidate" openMenu={openMenu} onOpen={setOpenMenu}>
                <OfferFilterMenu>
                  {candidateOptions.map((item) => (
                    <OfferFilterItem key={item} active={candidateFilter === item} onClick={() => { setCandidateFilter(item); setOpenMenu(null); }}>
                      {item}
                    </OfferFilterItem>
                  ))}
                </OfferFilterMenu>
              </OfferHeaderFilter>
              <OfferHeaderFilter label="应聘岗位" menu="job" openMenu={openMenu} onOpen={setOpenMenu}>
                <OfferFilterMenu>
                  {jobOptions.map((item) => (
                    <OfferFilterItem key={item} active={jobFilter === item} onClick={() => { setJobFilter(item); setOpenMenu(null); }}>
                      {item}
                    </OfferFilterItem>
                  ))}
                </OfferFilterMenu>
              </OfferHeaderFilter>
              <OfferHeaderFilter label="薪酬 / 入职日期" menu="salary" openMenu={openMenu} onOpen={setOpenMenu}>
                <OfferFilterMenu>
                  {salaryOptions.map((item) => (
                    <OfferFilterItem key={item} active={salaryFilter === item} onClick={() => { setSalaryFilter(item); setOpenMenu(null); }}>
                      {item}
                    </OfferFilterItem>
                  ))}
                </OfferFilterMenu>
              </OfferHeaderFilter>
              <OfferHeaderFilter label="当前进度" menu="progress" openMenu={openMenu} onOpen={setOpenMenu}>
                <OfferFilterMenu>
                  {progressOptions.map((item) => (
                    <OfferFilterItem key={item} active={progressFilter === item} onClick={() => { setProgressFilter(item); setOpenMenu(null); }}>
                      {item}
                    </OfferFilterItem>
                  ))}
                </OfferFilterMenu>
              </OfferHeaderFilter>
              <OfferHeaderFilter label="最新动态" menu="latest" openMenu={openMenu} onOpen={setOpenMenu}>
                <OfferFilterMenu>
                  {latestOptions.map((item) => (
                    <OfferFilterItem key={item} active={latestFilter === item} onClick={() => { setLatestFilter(item); setOpenMenu(null); }}>
                      {item}
                    </OfferFilterItem>
                  ))}
                </OfferFilterMenu>
              </OfferHeaderFilter>
              <th className="px-5 py-4 text-right font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredOffers.map((row) => {
              const action = actionFor(row);
              return (
                <tr key={row.id} className="border-b border-[#f1f2f3] last:border-b-0 hover:bg-[#fbfcfc]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ddf4ea] text-sm font-bold text-[#168a5b]">{initial(row.candidate)}</span>
                      <div>
                        <Link to={`/candidates/${row.candidateId}`} className="font-bold text-[#171a1f] hover:text-[#168a5b] hover:underline">
                          {row.candidate}
                        </Link>
                        <p className="mt-0.5 text-xs font-semibold text-[#8a8f98]">{row.followOwner}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-[#171a1f]">{row.jobTitle}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#8a8f98]">{row.department}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-[#171a1f]">{row.salary}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#8a8f98]">{row.onboardDate}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${statusClass(row.status)}`}>{row.statusText}</span>
                    <p className="mt-1 text-xs font-semibold text-[#8a8f98]">{row.statusNote}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#5f646d]">{row.latestAction}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#8a8f98]">{row.latestDate}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className={`inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-bold ${
                          action.tone === 'green'
                            ? 'bg-[#33a474] text-white hover:bg-[#27895f]'
                            : action.tone === 'orange'
                              ? 'bg-[#f59e0b] text-white hover:bg-[#d97706]'
                              : 'bg-[#f7f7f5] text-[#5f646d] hover:bg-[#eeeeeb]'
                        }`}
                      >
                        {action.label === '发放Offer' ? <MailCheck className="h-4 w-4" /> : action.label === '确认入职' ? <CheckCircle2 className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
                        {action.label}
                      </button>
                      <button type="button" className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f1f3f4]" aria-label={`${row.candidate} 更多操作`}>
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredOffers.length === 0 && (
          <div className="py-16 text-center text-sm font-semibold text-[#8a8f98]">当前筛选下暂无 Offer，可调整筛选条件。</div>
        )}
      </div>
    </div>
  );
}
