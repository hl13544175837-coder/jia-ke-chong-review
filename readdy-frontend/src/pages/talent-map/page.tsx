import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/hooks/useToast';
import PersonEditModal from '@/pages/talent-map/components/PersonEditModal';
import AiImportWizard from '@/pages/talent-map/components/AiImportWizard';
import { useTalentMapWorkspace } from '@/features/talentMaps/useTalentMapWorkspace';
import type { TalentMapPerson, TalentMapPersonInput } from '@/features/talentMaps/types';

interface RoleGroup {
  title: string;
  people: TalentMapPerson[];
}

interface DepartmentGroup {
  department: string;
  roles: RoleGroup[];
}

function groupByDepartment(people: TalentMapPerson[]): DepartmentGroup[] {
  const map = new Map<string, TalentMapPerson[]>();
  for (const person of people) {
    const key = person.department || '未分部门';
    const list = map.get(key) ?? [];
    list.push(person);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
    .map(([department, list]) => {
      const roleMap = new Map<string, TalentMapPerson[]>();
      for (const person of list) {
        const key = person.title || '待补充岗位';
        const items = roleMap.get(key) ?? [];
        items.push(person);
        roleMap.set(key, items);
      }
      return {
        department,
        roles: [...roleMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
          .map(([title, people]) => ({ title, people })),
      };
    });
}

type RoleStatus = 'confirmed' | 'contacting' | 'pending' | 'vacant';

function roleStatus(people: TalentMapPerson[]): RoleStatus {
  if (people.some((p) => p.contact_status === '已确认')) return 'confirmed';
  if (people.some((p) => p.contact_status === '沟通中')) return 'contacting';
  if (people.some((p) => ['待联系', '未接触'].includes(p.contact_status))) return 'pending';
  return 'vacant';
}

const STATUS_BADGE: Record<RoleStatus, { className: string; label: string }> = {
  confirmed: { className: 'bg-primary-100 text-primary-700', label: '已确认' },
  contacting: { className: 'bg-secondary-100 text-secondary-700', label: '沟通中' },
  pending: { className: 'bg-background-200 text-foreground-600', label: '待联系' },
  vacant: { className: 'bg-accent-100 text-accent-700', label: '空缺' },
};

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300';

export default function TalentMapPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const workspace = useTalentMapWorkspace();
  const {
    detail,
    companies,
    activeCompany,
    activeCompanyId,
    setActiveCompanyId,
    companyPeople,
    stats,
    loading,
    saving,
    error,
    refresh,
    addCompany,
    createPerson,
    updatePerson,
  } = workspace;

  const [viewMode, setViewMode] = useState<'overview' | 'company'>('company');
  const [keyword, setKeyword] = useState('');
  const [companyKeyword, setCompanyKeyword] = useState('');
  const [activeRole, setActiveRole] = useState<{ department: string; title: string } | null>(null);
  const [personModal, setPersonModal] = useState<{
    open: boolean;
    person: TalentMapPerson | null;
    dept?: string;
    title?: string;
  }>({ open: false, person: null });
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', industry: '', note: '' });
  const [companyError, setCompanyError] = useState<string | null>(null);

  // 新增公司弹窗支持 Esc 关闭
  useEffect(() => {
    if (!addCompanyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setAddCompanyOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addCompanyOpen, saving]);

  // 人才抽屉支持 Esc 关闭
  useEffect(() => {
    if (!activeRole) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveRole(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeRole]);

  const filteredPeople = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return companyPeople;
    return companyPeople.filter((person) =>
      [person.name, person.title, person.department, person.level, person.module, person.phone].some((text) =>
        (text || '').includes(kw),
      ),
    );
  }, [companyPeople, keyword]);

  const filteredCompanies = useMemo(() => {
    const kw = companyKeyword.trim();
    if (!kw) return companies;
    return companies.filter((company) =>
      [company.company_name, company.industry, company.city].some((text) => (text || '').includes(kw)),
    );
  }, [companies, companyKeyword]);

  const departments = useMemo(() => groupByDepartment(filteredPeople), [filteredPeople]);

  const vacantCount = useMemo(() => {
    const all = groupByDepartment(companyPeople);
    return all.reduce(
      (sum, dept) => sum + dept.roles.filter((role) => role.people.length === 0).length,
      0,
    );
  }, [companyPeople]);

  const activeRolePeople = useMemo(() => {
    if (!activeRole) return [];
    const dept = departments.find((item) => item.department === activeRole.department);
    return dept?.roles.find((role) => role.title === activeRole.title)?.people ?? [];
  }, [departments, activeRole]);

  /** 全部公司的人才（跨公司总览用） */
  const allPeople = useMemo(() => detail?.people ?? [], [detail?.people]);

  /** 总览：每家公司的覆盖统计 */
  const overviewRows = useMemo(() => {
    return companies.map((company) => {
      const people = allPeople.filter((p) => p.company_id === company.id);
      const roles = new Set(people.map((p) => `${p.department}|${p.title}`).filter(Boolean)).size;
      const confirmed = people.filter((p) => p.contact_status === '已确认').length;
      const contacting = people.filter((p) => p.contact_status === '沟通中').length;
      const pending = people.filter((p) => ['待联系', '未接触'].includes(p.contact_status)).length;
      return { company, total: people.length, roles, confirmed, contacting, pending };
    });
  }, [companies, allPeople]);

  /** 总览：全部公司汇总统计 */
  const overviewStats = useMemo(() => {
    const roleSet = new Set<string>();
    let total = 0;
    let confirmed = 0;
    let contacting = 0;
    let pending = 0;
    allPeople.forEach((p) => {
      total += 1;
      roleSet.add(`${p.company_id}|${p.department}|${p.title}`);
      if (p.contact_status === '已确认') confirmed += 1;
      else if (p.contact_status === '沟通中') contacting += 1;
      else pending += 1;
    });
    return { roles: roleSet.size, total, confirmed, contacting, pending };
  }, [allPeople]);

  const handleAddCompany = async () => {
    if (!companyForm.name.trim()) return;
    setCompanyError(null);
    try {
      await addCompany(companyForm.name.trim(), companyForm.industry.trim(), companyForm.note.trim());
      setAddCompanyOpen(false);
      setCompanyForm({ name: '', industry: '', note: '' });
      showToast('目标公司已创建');
    } catch (saveError) {
      setCompanyError(saveError instanceof Error ? saveError.message : '公司保存失败');
    }
  };

  const handleSavePerson = async (payload: TalentMapPersonInput) => {
    try {
      if (personModal.person) {
        await updatePerson(personModal.person.id, payload);
        showToast('人才信息已更新');
      } else {
        await createPerson({ ...payload, company_id: payload.company_id ?? activeCompanyId });
        showToast('人才已录入，组织架构已更新');
      }
      setPersonModal({ open: false, person: null });
      setActiveRole(null);
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : '保存失败');
    }
  };

  const renderRoleCard = (role: RoleGroup) => {
    const status = roleStatus(role.people);
    const badge = STATUS_BADGE[status];
    const avatarCount = Math.min(role.people.length, 3);
    return (
      <button
        key={`${role.title}-${role.people.length}`}
        onClick={() => setActiveRole({ department: departments.find((d) => d.roles.includes(role))?.department ?? '', title: role.title })}
        className="w-full text-left bg-white rounded-xl border border-background-200 p-3.5 transition-all cursor-pointer hover:border-primary-300 hover:shadow-sm group"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground-900 leading-tight">{role.title}</p>
          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        {status === 'vacant' ? (
          <p className="text-xs text-accent-600 mt-1.5">岗位空缺，等待录入</p>
        ) : (
          <p className="text-xs text-foreground-400 mt-1.5">{role.people.length} 位已录入</p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center">
            {role.people.slice(0, avatarCount).map((person) => (
              <div
                key={person.id}
                className="w-6 h-6 rounded-full bg-primary-100 border-2 border-white flex items-center justify-center -ml-1.5 first:ml-0"
              >
                <span className="text-[10px] font-bold text-primary-700">{person.name.charAt(0)}</span>
              </div>
            ))}
            {role.people.length === 0 && <span className="text-[10px] text-foreground-300">—</span>}
          </div>
          <span className="text-[11px] text-foreground-400 group-hover:text-primary-600 flex items-center gap-0.5">
            查看详情 <i className="ri-arrow-right-s-line"></i>
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background-50">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 mb-6">
          <button
            onClick={() => navigate('/candidates')}
            className="px-4 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors whitespace-nowrap"
          >
            简历库
          </button>
          <i className="ri-arrow-right-s-line text-foreground-400"></i>
          <span className="px-4 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-md whitespace-nowrap">
            人才地图
          </span>
        </div>

        <PageHeader
          className="mb-6"
          title="人才地图"
          visuallyHiddenTitle
          description="按目标公司沉淀外部人才的组织信息，支持 AI 从简历库导入"
          actions={(
            <>
              <button
                onClick={() => setAiWizardOpen(true)}
                disabled={companies.length === 0}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <i className="ri-sparkling-2-line"></i>
                AI 从简历库导入
              </button>
              <button
                onClick={() => {
                  setCompanyError(null);
                  setAddCompanyOpen(true);
                }}
                disabled={saving}
                className="px-4 py-2 bg-background-100 hover:bg-background-200 text-foreground-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <i className="ri-building-2-line"></i>
                新增公司
              </button>
            </>
          )}
        />

        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()} className="font-medium underline">重试</button>
          </div>
        )}
        {loading && (
          <div className="mb-4 rounded-xl border border-background-200 bg-white px-4 py-6 text-center text-sm text-foreground-500">
            正在加载人才地图…
          </div>
        )}
        {!loading && !error && companies.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed border-background-300 bg-white px-6 py-10 text-center">
            <i className="ri-map-2-line text-3xl text-foreground-300"></i>
            <p className="mt-2 text-sm font-medium text-foreground-800">还没有目标公司</p>
            <p className="mt-1 text-xs text-foreground-500">先点右上角“新增公司”，再通过 AI 导入或手动录入人才。</p>
          </div>
        )}

        {!loading && !error && companies.length > 0 && (
          <>
            {/* Stats */}
            <div className="mb-4 bg-white rounded-xl border border-background-200 px-2 py-3 flex flex-wrap">
              {(() => {
                const items = viewMode === 'overview'
                  ? [
                      { label: '目标公司', value: companies.length, className: 'text-foreground-900' },
                      { label: '覆盖岗位', value: overviewStats.roles, className: 'text-foreground-900' },
                      { label: '人才总数', value: overviewStats.total, className: 'text-foreground-900' },
                      { label: '已确认', value: overviewStats.confirmed, className: 'text-primary-700' },
                      { label: '沟通中', value: overviewStats.contacting, className: 'text-secondary-700' },
                      { label: '待联系', value: overviewStats.pending, className: 'text-foreground-600' },
                    ]
                  : [
                      { label: '覆盖岗位', value: stats.roles, className: 'text-foreground-900' },
                      { label: '人才总数', value: stats.total, className: 'text-foreground-900' },
                      { label: '已确认', value: stats.confirmed, className: 'text-primary-700' },
                      { label: '沟通中', value: stats.contacting, className: 'text-secondary-700' },
                      { label: '待联系', value: stats.pending, className: 'text-foreground-600' },
                      { label: '空缺岗位', value: vacantCount, className: 'text-accent-600' },
                    ];
                return items.map((item) => (
                  <div key={item.label} className="flex-1 min-w-[96px] text-center border-r border-background-100 last:border-r-0">
                    <div className={`text-xl font-bold ${item.className}`}>{item.value}</div>
                    <div className="text-xs text-foreground-400 mt-0.5">{item.label}</div>
                  </div>
                ));
              })()}
            </div>

            {/* 视图切换 + 公司搜索 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="flex rounded-lg bg-background-100 p-0.5">
                <button
                  onClick={() => setViewMode('overview')}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                    viewMode === 'overview' ? 'bg-white shadow-sm text-foreground-900 font-medium' : 'text-foreground-500 hover:text-foreground-700'
                  }`}
                >
                  总览
                </button>
                <button
                  onClick={() => setViewMode('company')}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                    viewMode === 'company' ? 'bg-white shadow-sm text-foreground-900 font-medium' : 'text-foreground-500 hover:text-foreground-700'
                  }`}
                >
                  公司
                </button>
              </div>
              <div className="relative flex-1 max-w-xs">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
                <input
                  type="text"
                  value={companyKeyword}
                  onChange={(e) => setCompanyKeyword(e.target.value)}
                  placeholder="搜索目标公司（名称 / 行业 / 城市）"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                />
              </div>
              <span className="text-xs text-foreground-400 whitespace-nowrap">
                共 {filteredCompanies.length} 家 / {companies.length} 家
              </span>
            </div>
            {viewMode === 'overview' && (
              <div className="mb-4 bg-white rounded-xl border border-background-200 overflow-hidden">
                <div className="grid grid-cols-12 px-5 py-2.5 bg-background-50 border-b border-background-200 text-xs text-foreground-400 font-medium">
                  <div className="col-span-4">目标公司</div>
                  <div className="col-span-2 text-center">覆盖岗位</div>
                  <div className="col-span-2 text-center">人才</div>
                  <div className="col-span-2 text-center">已确认</div>
                  <div className="col-span-2 text-center">确认率</div>
                </div>
                {overviewRows.filter((row) => filteredCompanies.some((c) => c.id === row.company.id)).map((row) => {
                  const rate = row.total > 0 ? Math.round((row.confirmed / row.total) * 100) : 0;
                  return (
                    <button
                      key={row.company.id}
                      onClick={() => {
                        setActiveCompanyId(row.company.id);
                        setViewMode('company');
                      }}
                      className="w-full grid grid-cols-12 px-5 py-3 text-left border-b border-background-100 last:border-b-0 transition-colors cursor-pointer hover:bg-primary-50/40"
                    >
                      <div className="col-span-4 min-w-0">
                        <p className="text-sm font-semibold text-foreground-900 truncate">{row.company.company_name}</p>
                        <p className="text-xs text-foreground-400 truncate">
                          {[row.company.industry, row.company.city].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="col-span-2 flex items-center justify-center text-sm text-foreground-700">{row.roles}</div>
                      <div className="col-span-2 flex items-center justify-center text-sm text-foreground-700">{row.total}</div>
                      <div className="col-span-2 flex items-center justify-center">
                        <span className="text-sm text-primary-700 font-medium">{row.confirmed}</span>
                        <span className="text-[11px] text-foreground-400 ml-1">
                          {row.contacting > 0 ? `沟通中 ${row.contacting}` : ''}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-2">
                        <div className="flex-1 h-1.5 bg-background-200 rounded-full overflow-hidden max-w-[64px]">
                          <div className="h-full bg-primary-400 rounded-full" style={{ width: `${rate}%` }}></div>
                        </div>
                        <span className="text-xs text-foreground-500 w-9 text-right">{rate}%</span>
                      </div>
                    </button>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <div className="px-6 py-10 text-center">
                    <p className="text-sm text-foreground-600">没有找到匹配「{companyKeyword}」的目标公司</p>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'company' && (
              <>
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              {filteredCompanies.map((company) => {
                const people = companyPeople.filter((p) => p.company_id === company.id);
                const confirmed = people.filter((p) => p.contact_status === '已确认').length;
                const isActive = activeCompanyId === company.id;
                return (
                  <button
                    key={company.id}
                    onClick={() => setActiveCompanyId(company.id)}
                    className={`flex-shrink-0 px-5 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                      isActive
                        ? 'border-primary-300 bg-white shadow-sm ring-1 ring-primary-200'
                        : 'border-background-200 bg-white hover:border-background-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground-900 max-w-[180px] truncate">{company.company_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-foreground-500">{confirmed}/{people.length} 确认</span>
                      <div className="flex-1 h-1 bg-background-200 rounded-full overflow-hidden w-14">
                        <div
                          className="h-full bg-primary-400 rounded-full"
                          style={{ width: `${people.length > 0 ? (confirmed / people.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {filteredCompanies.length === 0 && (
              <div className="mb-4 rounded-xl border border-dashed border-background-300 bg-white px-6 py-8 text-center">
                <i className="ri-search-line text-2xl text-foreground-300"></i>
                <p className="mt-1 text-sm text-foreground-600">没有找到匹配「{companyKeyword}」的目标公司</p>
                <p className="mt-0.5 text-xs text-foreground-400">换个关键词试试，或点右上角「新增公司」</p>
              </div>
            )}

            {/* Company Description */}
            {activeCompany && (
              <div className="bg-white rounded-xl border border-background-200 p-4 mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <i className="ri-building-4-line text-xl text-primary-500"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-foreground-900">{activeCompany.company_name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-foreground-400 flex-wrap">
                      {activeCompany.industry && (
                        <span className="px-2 py-0.5 rounded bg-background-100">{activeCompany.industry}</span>
                      )}
                      {activeCompany.city && (
                        <span><i className="ri-map-pin-line mr-0.5"></i>{activeCompany.city}</span>
                      )}
                      <span><i className="ri-team-line mr-0.5"></i>{companyPeople.length} 位人才</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-xs">
              <span className="text-foreground-500">状态：</span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-primary-100 border border-primary-300"></span>
                <span className="text-foreground-600">已确认</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-secondary-100 border border-secondary-300"></span>
                <span className="text-foreground-600">沟通中</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-background-200 border border-background-300"></span>
                <span className="text-foreground-600">待联系</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-accent-100 border border-accent-300"></span>
                <span className="text-foreground-600">空缺</span>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-6 max-w-sm">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索姓名 / 岗位 / 部门 / 职级"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
              />
            </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Department Panels */}
      {!loading && !error && viewMode === 'company' && companies.length > 0 && (
        <div className="px-6 pb-10">
          {departments.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-background-300 px-6 py-12 text-center">
              <i className="ri-user-add-line text-3xl text-foreground-300"></i>
              <p className="mt-2 text-sm font-medium text-foreground-800">该公司还没有人才</p>
              <p className="mt-1 text-xs text-foreground-500">
                用右上角「AI 从简历库导入」批量灌入，或手动录入第一位人才。
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={() => setPersonModal({ open: true, person: null, dept: '', title: '' })}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  手动录入第一位人才
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {departments.map((dept) => (
                <div key={dept.department} className="bg-white rounded-xl border border-background-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground-900">{dept.department}</h3>
                      <p className="text-xs text-foreground-400 mt-0.5">{dept.roles.length} 个岗位</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {dept.roles.map((role) => renderRoleCard(role))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Person Drawer */}
      {activeRole && (
        <>
          <div className="fixed inset-0 bg-foreground-900/30 z-40" onClick={() => setActiveRole(null)}></div>
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-100">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground-900 truncate">{activeRole.title}</h3>
                <p className="text-xs text-foreground-400 mt-0.5">{activeRole.department}</p>
              </div>
              <button
                onClick={() => setActiveRole(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
                aria-label="关闭"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-foreground-500 mb-4">
                该岗位已录入 {activeRolePeople.length} 位人才，点击人才可编辑补充职级、任职、联系方式等信息。
              </p>
              <div className="space-y-3">
                {activeRolePeople.map((person) => {
                  const badge = STATUS_BADGE[roleStatus([person])];
                  return (
                    <button
                      key={person.id}
                      onClick={() => setPersonModal({ open: true, person })}
                      className="w-full text-left bg-background-50 rounded-xl border border-background-200 p-4 transition-colors cursor-pointer hover:border-primary-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary-700">{person.name.charAt(0)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground-900">{person.name}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-foreground-500 mt-0.5 truncate">
                            {[person.level, person.module].filter(Boolean).join(' · ') || '职级待补充'}
                          </p>
                        </div>
                        <i className="ri-edit-2-line text-foreground-300"></i>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-[11px] text-foreground-400 flex-wrap">
                        {person.phone && (
                          <span className="flex items-center gap-1"><i className="ri-phone-line"></i>{person.phone}</span>
                        )}
                        {person.source && (
                          <span className={`px-1.5 py-0.5 rounded ${person.source === 'AI导入' ? 'bg-secondary-50 text-secondary-700' : 'bg-background-100'}`}>
                            {person.source}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-0.5 text-primary-600">
                          编辑 <i className="ri-arrow-right-s-line"></i>
                        </span>
                      </div>
                    </button>
                  );
                })}
                {activeRolePeople.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-xs text-foreground-400">该岗位还没有人才</p>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-5 py-4 border-t border-background-100">
              <button
                onClick={() => setPersonModal({ open: true, person: null, dept: activeRole.department, title: activeRole.title })}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <i className="ri-user-add-line"></i>
                录入人才到该岗位
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Company Modal */}
      {addCompanyOpen && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => { if (!saving) setAddCompanyOpen(false); }}></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto flex flex-col animate-modal-in">
              <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">新增目标公司</h2>
                  <p className="text-xs text-foreground-400 mt-0.5">添加后即可通过 AI 导入或手动录入该公司人才</p>
                </div>
                <button
                  onClick={() => setAddCompanyOpen(false)}
                  disabled={saving}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="talent-company-name" className="block text-xs font-medium text-foreground-600 mb-1.5">
                    公司名称 <span className="text-accent-500">*</span>
                  </label>
                  <input
                    id="talent-company-name"
                    type="text"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="如：云启科技"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="talent-company-industry" className="block text-xs font-medium text-foreground-600 mb-1.5">所属行业</label>
                  <input
                    id="talent-company-industry"
                    type="text"
                    value={companyForm.industry}
                    onChange={(e) => setCompanyForm((prev) => ({ ...prev, industry: e.target.value }))}
                    placeholder="如：云计算"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="talent-company-note" className="block text-xs font-medium text-foreground-600 mb-1.5">备注</label>
                  <textarea
                    id="talent-company-note"
                    value={companyForm.note}
                    onChange={(e) => setCompanyForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="公司规模、业务特色等"
                    rows={3}
                    className={`${inputClass} resize-none`}
                  ></textarea>
                </div>
                {companyError && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{companyError}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-100">
                <button
                  onClick={() => setAddCompanyOpen(false)}
                  disabled={saving}
                  className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleAddCompany()}
                  disabled={saving || !companyForm.name.trim()}
                  className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  {saving ? '保存中…' : '创建公司'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Person Edit / Create Modal */}
      <PersonEditModal
        open={personModal.open}
        person={personModal.person}
        companies={companies}
        defaultCompanyId={personModal.person?.company_id ?? activeCompanyId}
        defaultDepartment={personModal.dept}
        defaultTitle={personModal.title}
        saving={saving}
        onClose={() => setPersonModal({ open: false, person: null })}
        onSave={handleSavePerson}
      />

      {/* AI Import Wizard */}
      <AiImportWizard
        open={aiWizardOpen}
        workspace={workspace}
        onClose={() => setAiWizardOpen(false)}
      />
    </div>
  );
}
