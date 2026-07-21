import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Map, Plus, Search, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { RecruitmentManagementTabs } from '../components/recruitment/RecruitmentManagementTabs';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';
import type { JobListItem, TalentMap, TalentMapCompany, TalentMapPerson } from '../types';
import { parseTalentMapSelectValue, resolveActiveTalentMapId } from './talentMapState';

const DEFAULT_COLUMNS = ['目标公司', '潜在人选', '重点关注', '已接触', '暂不合适'] as const;
const CONTACT_STATUSES = ['未接触', '重点关注', '已接触', '暂不合适'] as const;

function formatJobOption(job: JobListItem) {
  const code = job.job_code || `JOB-${job.id}`;
  const meta = [job.city, job.department].filter(Boolean).join(' · ');
  return `${code}｜${job.title}${meta ? `｜${meta}` : ''}`;
}

function tagsFromText(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function peopleForColumn(talentMap: TalentMap | null, column: string) {
  if (!talentMap) return [];
  if (column === '潜在人选') {
    return talentMap.people.filter(
      (person) => !['重点关注', '已接触', '暂不合适'].includes(person.contact_status),
    );
  }
  return talentMap.people.filter((person) => person.contact_status === column);
}

function PersonCard({
  person,
  busy,
  onStatusChange,
}: {
  person: TalentMapPerson;
  busy: boolean;
  onStatusChange: (person: TalentMapPerson, status: string) => void;
}) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3 shadow-apple-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {person.company_name || '未关联公司'} · {person.title || '未填写岗位'}
          </p>
        </div>
        <select
          aria-label={`更新${person.name}的接触状态`}
          value={person.contact_status}
          disabled={busy}
          onChange={(event) => onStatusChange(person, event.target.value)}
          className="h-7 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink"
        >
          {CONTACT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {person.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} tone="brand">
            {tag}
          </Badge>
        ))}
      </div>
      {person.evaluation && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{person.evaluation}</p>
      )}
    </div>
  );
}

export function TalentMapPage() {
  const jobsAsync = useAsync(() => api.listJobs(), []);
  const mapsAsync = useAsync(() => api.listTalentMaps(), []);
  const maps = useMemo(() => mapsAsync.data ?? [], [mapsAsync.data]);
  const jobs = useMemo(() => jobsAsync.data ?? [], [jobsAsync.data]);

  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [companyFilter, setCompanyFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [composer, setComposer] = useState<'map' | 'company' | 'person' | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);

  const [mapName, setMapName] = useState('省总人才地图');
  const [mapJobId, setMapJobId] = useState('');
  const [mapDepartment, setMapDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyPriority, setCompanyPriority] = useState('high');
  const [personName, setPersonName] = useState('');
  const [personTitle, setPersonTitle] = useState('');
  const [personCompanyId, setPersonCompanyId] = useState('');
  const [personCity, setPersonCity] = useState('');
  const [personTags, setPersonTags] = useState('');
  const [personStatus, setPersonStatus] = useState('未接触');
  const [personEvaluation, setPersonEvaluation] = useState('');
  const [personSalary, setPersonSalary] = useState('');

  const filters = useMemo(
    () => ({
      company: companyFilter,
      city: cityFilter,
      status: statusFilter,
      keyword: keywordFilter,
    }),
    [companyFilter, cityFilter, statusFilter, keywordFilter],
  );

  const resolvedActiveMapId = useMemo(
    () => resolveActiveTalentMapId(maps, activeMapId),
    [activeMapId, maps],
  );

  useEffect(() => {
    if (activeMapId !== resolvedActiveMapId) {
      setActiveMapId(resolvedActiveMapId);
    }
  }, [activeMapId, resolvedActiveMapId]);

  const mapAsync = useAsync(
    () =>
      resolvedActiveMapId
        ? api.getTalentMap(resolvedActiveMapId, filters)
        : Promise.resolve(null),
    [resolvedActiveMapId, filters.company, filters.city, filters.status, filters.keyword],
  );
  const talentMap = mapAsync.data;
  const activeCompany = useMemo(() => {
    if (!talentMap || talentMap.companies.length === 0) return null;
    return talentMap.companies.find((company) => company.id === activeCompanyId)
      ?? talentMap.companies[0];
  }, [activeCompanyId, talentMap]);

  useEffect(() => {
    if (activeCompany?.id !== activeCompanyId) {
      setActiveCompanyId(activeCompany?.id ?? null);
    }
  }, [activeCompany, activeCompanyId]);

  async function handleCreateMap(event: FormEvent) {
    event.preventDefault();
    if (!mapName.trim()) return;
    setMessage(null);
    setMutationError(null);
    setBusyKey('map:create');
    try {
      const created = await api.createTalentMap({
        name: mapName.trim(),
        job_id: mapJobId ? Number(mapJobId) : null,
        department: mapDepartment.trim(),
        board_json: { columns: [...DEFAULT_COLUMNS] },
      });
      setActiveMapId(created.id);
      setMapName('省总人才地图');
      setMapJobId('');
      setMapDepartment('');
      setMessage('人才地图已创建');
      setComposer(null);
      mapsAsync.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '创建人才地图失败');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddCompany(event: FormEvent) {
    event.preventDefault();
    if (!talentMap || !companyName.trim()) return;
    setMessage(null);
    setMutationError(null);
    setBusyKey('company:create');
    try {
      await api.createTalentMapCompany(talentMap.id, {
        company_name: companyName.trim(),
        city: companyCity.trim(),
        priority: companyPriority,
      });
      setCompanyName('');
      setCompanyCity('');
      setCompanyPriority('high');
      setMessage('目标公司已保存');
      setComposer(null);
      mapsAsync.reload();
      mapAsync.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '保存目标公司失败');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddPerson(event: FormEvent) {
    event.preventDefault();
    if (!talentMap || !personName.trim()) return;
    setMessage(null);
    setMutationError(null);
    setBusyKey('person:create');
    try {
      await api.createTalentMapPerson(talentMap.id, {
        company_id: personCompanyId ? Number(personCompanyId) : null,
        name: personName.trim(),
        title: personTitle.trim(),
        city: personCity.trim(),
        tags: tagsFromText(personTags),
        contact_status: personStatus,
        evaluation: personEvaluation.trim(),
        salary_range: personSalary.trim(),
      });
      setPersonName('');
      setPersonTitle('');
      setPersonCompanyId('');
      setPersonCity('');
      setPersonTags('');
      setPersonStatus('未接触');
      setPersonEvaluation('');
      setPersonSalary('');
      setMessage('潜在人选已保存');
      setComposer(null);
      mapsAsync.reload();
      mapAsync.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '保存潜在人选失败');
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePersonStatusChange(person: TalentMapPerson, contact_status: string) {
    setMessage(null);
    setMutationError(null);
    setBusyKey(`person:${person.id}`);
    try {
      await api.updateTalentMapPerson(person.id, { contact_status });
      setMessage(`${person.name}的接触状态已保存`);
      mapsAsync.reload();
      mapAsync.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '更新人选状态失败');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCompanyPriorityChange(company: TalentMapCompany, priority: string) {
    setMessage(null);
    setMutationError(null);
    setBusyKey(`company:${company.id}`);
    try {
      await api.updateTalentMapCompany(company.id, { priority });
      setMessage(`${company.company_name}的优先级已保存`);
      mapAsync.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '更新公司优先级失败');
    } finally {
      setBusyKey(null);
    }
  }

  function clearFilters() {
    setCompanyFilter('');
    setCityFilter('');
    setStatusFilter('');
    setKeywordFilter('');
  }

  const loading = jobsAsync.loading || mapsAsync.loading || mapAsync.loading;
  const detailError = resolvedActiveMapId ? mapAsync.error : null;
  const errorState = jobsAsync.error
    ? { label: '岗位列表', error: jobsAsync.error, onRetry: jobsAsync.reload }
    : mapsAsync.error
      ? { label: '人才地图列表', error: mapsAsync.error, onRetry: mapsAsync.reload }
      : detailError
        ? { label: '人才地图详情', error: detailError, onRetry: mapAsync.reload }
        : null;

  return (
    <div className="space-y-6" data-ui="figma-talent-map">
      <RecruitmentManagementTabs />

      <PageHeader
        title="人才地图"
        description="围绕岗位沉淀目标公司、潜在人选和市场挖掘状态"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setComposer('map')}>
              <Map className="h-4 w-4" />
              新建地图
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!talentMap}
              onClick={() => setComposer('person')}
            >
              <Users className="h-4 w-4" />
              新增人选
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!talentMap}
              onClick={() => setComposer('company')}
            >
              <Building2 className="h-4 w-4" />
              新增公司
            </Button>
          </div>
        )}
      />

      {message && (
        <div className="rounded-md border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700">
          {message}
        </div>
      )}

      {mutationError && <ErrorState message={`保存失败：${mutationError}`} />}

      {errorState && (
        <ErrorState
          message={`${errorState.label}：${errorState.error.message}`}
          onRetry={errorState.onRetry}
        />
      )}

      <section aria-label="地图范围" className="space-y-2">
        <p className="text-xs font-medium text-muted">地图范围</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {maps.map((item) => {
            const active = item.id === resolvedActiveMapId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveMapId(item.id)}
                className={`min-w-[158px] rounded-xl border bg-white px-5 py-3 text-left transition-colors ${active ? 'border-[#a0dabe] shadow-[0_0_0_1px_#bde6d3]' : 'border-[#f3f2ed] hover:border-[#d8e9df]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[#171616]">{item.name}</span>
                  <span className="rounded bg-[#f8f7f4] px-1.5 py-0.5 text-[11px] text-[#959190]">
                    {item.companies_count} 家
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] text-[#747170]">{item.people_count} 位人选已收录</p>
              </button>
            );
          })}
          {!mapsAsync.loading && maps.length === 0 && (
            <button
              type="button"
              onClick={() => setComposer('map')}
              className="min-w-[158px] rounded-xl border border-dashed border-[#a0dabe] bg-[#f4fbf7] px-5 py-3 text-left text-sm font-medium text-[#1d6b42]"
            >
              <Plus className="mb-2 h-4 w-4" />
              创建第一张地图
            </button>
          )}
        </div>
      </section>

      {talentMap && (
        <section aria-label="目标公司视图" className="space-y-3">
          <p className="text-xs font-medium text-muted">目标公司视图</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {talentMap.companies.map((company) => {
              const active = company.id === activeCompany?.id;
              const mappedPeople = talentMap.people.filter((person) => person.company_id === company.id).length;
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setActiveCompanyId(company.id)}
                  className={`min-w-[158px] rounded-xl border bg-white px-5 py-3 text-left transition-colors ${active ? 'border-[#a0dabe] shadow-[0_0_0_1px_#bde6d3]' : 'border-[#f3f2ed] hover:border-[#d8e9df]'}`}
                >
                  <p className="truncate text-sm font-semibold text-[#171616]">{company.company_name}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#747170]">
                    <span>{mappedPeople} 位人选</span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-[#f3f2ed]">
                      <span
                        className="block h-full rounded-full bg-[#81caa6]"
                        style={{ width: `${Math.min(100, mappedPeople * 12)}%` }}
                      />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeCompany && (
            <div className="flex items-start gap-4 rounded-xl border border-[#f3f2ed] bg-white p-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e9f5f0] text-[#1d6b42]">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[#171616]">{activeCompany.company_name}</h2>
                <p className="mt-1 text-sm text-[#575454]">
                  {activeCompany.note || [activeCompany.city, activeCompany.region, activeCompany.industry].filter(Boolean).join(' · ') || '暂无公司摘要'}
                </p>
                <p className="mt-2 text-xs text-[#959190]">
                  来自真实人才地图 · 已映射 {talentMap.people.filter((person) => person.company_id === activeCompany.id).length} 位人选
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="space-y-4">
        <Card variant="elevated">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>人才地图工作台</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  先把目标公司和潜在人选摆出来，后续再做能力矩阵和区域热力
                </p>
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Spinner size="sm" />
                  加载中…
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Select
                label="当前地图"
                value={resolvedActiveMapId ?? ''}
                onChange={(event) => setActiveMapId(parseTalentMapSelectValue(event.target.value))}
              >
                <option value="">选择人才地图</option>
                {maps.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Input
                label="公司筛选"
                placeholder="例：竞品科技"
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
              />
              <Input
                label="城市筛选"
                placeholder="例：深圳"
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
              />
              <Select
                label="接触状态"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">全部状态</option>
                {CONTACT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px] flex-1">
                <Input
                  label="关键词"
                  placeholder="搜姓名、岗位、评价"
                  value={keywordFilter}
                  onChange={(event) => setKeywordFilter(event.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" onClick={clearFilters} className="mt-6">
                <Search className="h-4 w-4" />
                清空筛选
              </Button>
            </div>

            {!talentMap ? (
              <EmptyState
                icon={Map}
                title="还没有人才地图"
                description="先创建一张地图，再把目标公司和潜在人选保存下来"
              />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
                    <p className="text-xs text-muted">关联岗位</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {talentMap.job_title || '暂未关联'}
                    </p>
                  </div>
                  <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
                    <p className="text-xs text-muted">目标公司</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {talentMap.companies_count} 家
                    </p>
                  </div>
                  <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
                    <p className="text-xs text-muted">当前人选</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {talentMap.people_count} 位
                    </p>
                  </div>
                </div>

                <section aria-label="人才地图白板" className="overflow-x-auto pb-2">
                  <div className="grid min-w-[920px] grid-cols-5 gap-3">
                    {DEFAULT_COLUMNS.map((column) => (
                      <div
                        key={column}
                        className="min-h-[260px] rounded-md border border-hairline bg-surface-soft p-3"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-ink">{column}</h3>
                          <Badge tone="glass">
                            {column === '目标公司'
                              ? talentMap.companies.length
                              : peopleForColumn(talentMap, column).length}
                          </Badge>
                        </div>
                        {column === '目标公司' ? (
                          <div className="space-y-2">
                            {talentMap.companies.map((company) => (
                              <div
                                key={company.id}
                                className="rounded-md border border-hairline bg-canvas p-3 shadow-apple-xs"
                              >
                                <p className="truncate text-sm font-semibold text-ink">
                                  {company.company_name}
                                </p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {[company.city, company.region, company.industry]
                                    .filter(Boolean)
                                    .join(' · ') || '暂无区域信息'}
                                </p>
                                <select
                                  aria-label={`更新${company.company_name}的优先级`}
                                  value={company.priority || 'medium'}
                                  disabled={busyKey === `company:${company.id}`}
                                  onChange={(event) =>
                                    handleCompanyPriorityChange(company, event.target.value)
                                  }
                                  className="mt-2 h-7 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink"
                                >
                                  <option value="high">高优先级</option>
                                  <option value="medium">中优先级</option>
                                  <option value="low">低优先级</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {peopleForColumn(talentMap, column).map((person) => (
                              <PersonCard
                                key={person.id}
                                person={person}
                                busy={busyKey === `person:${person.id}`}
                                onStatusChange={handlePersonStatusChange}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-left text-xs text-muted">
                        <th className="py-2 pr-3 font-medium">姓名/代号</th>
                        <th className="py-2 pr-3 font-medium">公司</th>
                        <th className="py-2 pr-3 font-medium">岗位</th>
                        <th className="py-2 pr-3 font-medium">城市</th>
                        <th className="py-2 pr-3 font-medium">标签</th>
                        <th className="py-2 pr-3 font-medium">状态</th>
                        <th className="py-2 font-medium">综合评价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {talentMap.people.map((person) => (
                        <tr key={person.id} className="border-b border-hairline-soft">
                          <td className="py-3 pr-3 font-medium text-ink">{person.name}</td>
                          <td className="py-3 pr-3 text-body">{person.company_name || '未关联'}</td>
                          <td className="py-3 pr-3 text-body">{person.title || '-'}</td>
                          <td className="py-3 pr-3 text-body">{person.city || '-'}</td>
                          <td className="py-3 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {person.tags.map((tag) => (
                                <Badge key={tag} tone="glass">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              aria-label={`更新${person.name}的表格接触状态`}
                              value={person.contact_status}
                              disabled={busyKey === `person:${person.id}`}
                              onChange={(event) =>
                                handlePersonStatusChange(person, event.target.value)
                              }
                              className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink"
                            >
                              {CONTACT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 text-muted">{person.evaluation || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </CardBody>
        </Card>

        {composer && (
          <section className="rounded-xl border border-[#d8e9df] bg-[#f4fbf7] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#171616]">
                  {composer === 'map' ? '新建人才地图' : composer === 'company' ? '新增目标公司' : '新增潜在人选'}
                </p>
                <p className="mt-1 text-xs text-[#747170]">保存后立即写入后端数据库</p>
              </div>
              <button
                type="button"
                aria-label="关闭新增面板"
                onClick={() => setComposer(null)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-white hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-w-3xl">
          {composer === 'map' && (
          <Card>
            <CardHeader>
              <CardTitle>新建人才地图</CardTitle>
            </CardHeader>
            <CardBody>
              <form className="space-y-3" onSubmit={handleCreateMap}>
                <Input
                  label="地图名称"
                  value={mapName}
                  onChange={(event) => setMapName(event.target.value)}
                />
                <Select
                  label="关联岗位"
                  value={mapJobId}
                  onChange={(event) => setMapJobId(event.target.value)}
                >
                  <option value="">暂不关联岗位</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {formatJobOption(job)}
                    </option>
                  ))}
                </Select>
                <Input
                  label="所属部门"
                  placeholder="例：销售中心"
                  value={mapDepartment}
                  onChange={(event) => setMapDepartment(event.target.value)}
                />
                <Button type="submit" size="sm" loading={busyKey === 'map:create'}>
                  <Plus className="h-4 w-4" />
                  创建地图
                </Button>
              </form>
            </CardBody>
          </Card>
          )}

          {composer === 'company' && (
          <Card>
            <CardHeader>
              <CardTitle>新增目标公司</CardTitle>
            </CardHeader>
            <CardBody>
              <form className="space-y-3" onSubmit={handleAddCompany}>
                <Input
                  label="公司名称"
                  placeholder="例：竞品科技"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
                <Input
                  label="城市"
                  placeholder="例：深圳"
                  value={companyCity}
                  onChange={(event) => setCompanyCity(event.target.value)}
                />
                <Select
                  label="优先级"
                  value={companyPriority}
                  onChange={(event) => setCompanyPriority(event.target.value)}
                >
                  <option value="high">高优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="low">低优先级</option>
                </Select>
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!talentMap}
                  loading={busyKey === 'company:create'}
                >
                  <Building2 className="h-4 w-4" />
                  保存公司
                </Button>
              </form>
            </CardBody>
          </Card>
          )}

          {composer === 'person' && (
          <Card>
            <CardHeader>
              <CardTitle>新增潜在人选</CardTitle>
            </CardHeader>
            <CardBody>
              <form className="space-y-3" onSubmit={handleAddPerson}>
                <Input
                  label="姓名或代号"
                  placeholder="例：张三"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                />
                <Select
                  label="目标公司"
                  value={personCompanyId}
                  onChange={(event) => setPersonCompanyId(event.target.value)}
                >
                  <option value="">暂不关联公司</option>
                  {talentMap?.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.company_name}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="当前职位"
                    placeholder="例：省区负责人"
                    value={personTitle}
                    onChange={(event) => setPersonTitle(event.target.value)}
                  />
                  <Input
                    label="城市"
                    placeholder="例：深圳"
                    value={personCity}
                    onChange={(event) => setPersonCity(event.target.value)}
                  />
                </div>
                <Input
                  label="能力标签"
                  placeholder="例：大客户销售，团队管理"
                  value={personTags}
                  onChange={(event) => setPersonTags(event.target.value)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Select
                    label="接触状态"
                    value={personStatus}
                    onChange={(event) => setPersonStatus(event.target.value)}
                  >
                    {CONTACT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="薪酬区间"
                    placeholder="例：40-60万"
                    value={personSalary}
                    onChange={(event) => setPersonSalary(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    综合评价
                  </label>
                  <textarea
                    rows={3}
                    value={personEvaluation}
                    onChange={(event) => setPersonEvaluation(event.target.value)}
                    className="w-full resize-y rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    placeholder="例：销售团队管理经验强，建议优先接触"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!talentMap}
                  loading={busyKey === 'person:create'}
                >
                  <Users className="h-4 w-4" />
                  保存人选
                </Button>
              </form>
            </CardBody>
          </Card>
          )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
