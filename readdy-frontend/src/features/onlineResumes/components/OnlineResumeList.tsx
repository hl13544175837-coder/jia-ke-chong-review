import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { onlineResumesApi } from '../api';
import type { OnlineResumeItem, OnlineResumeOwnerOption } from '../types';
import OnlineResumeDetailDrawer from './OnlineResumeDetailDrawer';

interface OpenResume {
  id: number;
  edit: boolean;
}

interface Filters {
  demandId: number;
  gender: string;
  ageFrom: string;
  ageTo: string;
  timeRange: string;
  dateFrom: string;
  dateTo: string;
  sourcePlatform: string;
  educationLevel: string;
  location: string;
  keyword: string;
  ownerHrId: number;
}

const PAGE_SIZE = 20;

const PLATFORM_OPTIONS = ['BOSS直聘', '猎聘', '58同城'];
const EDUCATION_OPTIONS = ['本科', '硕士', '博士', '大专'];
const CITY_OPTIONS = ['上海', '北京', '深圳', '广州', '杭州', '苏州', '南京', '武汉', '成都', '西安'];

const EMPTY_FILTERS: Filters = {
  demandId: 0,
  gender: '',
  ageFrom: '',
  ageTo: '',
  timeRange: '',
  dateFrom: '',
  dateTo: '',
  sourcePlatform: '',
  educationLevel: '',
  location: '',
  keyword: '',
  ownerHrId: 0,
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

const INPUT_CLASS = 'h-9 rounded-lg border border-background-300 bg-white px-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

export default function OnlineResumeList() {
  const [items, setItems] = useState<OnlineResumeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openResume, setOpenResume] = useState<OpenResume | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OnlineResumeOwnerOption[]>([]);
  const debouncedFilters = useDebouncedValue(filters, 300);
  const latestRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    const loadDemands = async () => {
      try {
        const response = await demandsApi.listDemands();
        if (!active) return;
        setDemands(response.items ?? []);
      } catch {
        if (active) setDemands([]);
      }
    };
    void loadDemands();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadOwners = async () => {
      try {
        const response = await onlineResumesApi.listRecruiterOwners();
        if (!active) return;
        setOwnerOptions(response);
      } catch {
        if (active) setOwnerOptions([]);
      }
    };
    void loadOwners();
    return () => { active = false; };
  }, []);

  const hasActiveFilters = useMemo(() => {
    const f = filters;
    return (
      f.demandId > 0 ||
      f.gender !== '' ||
      f.ageFrom !== '' ||
      f.ageTo !== '' ||
      f.timeRange !== '' ||
      f.dateFrom !== '' ||
      f.dateTo !== '' ||
      f.sourcePlatform !== '' ||
      f.educationLevel !== '' ||
      f.location !== '' ||
      f.keyword !== '' ||
      f.ownerHrId > 0
    );
  }, [filters]);

  const applyTimeRange = (range: string) => {
    setFilters((current) => {
      const next = { ...current, timeRange: range, dateFrom: '', dateTo: '' };
      return next;
    });
  };

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    let keepLoadingForPageCorrection = false;
    setLoading(true);
    setError('');
    const f = debouncedFilters;
    let createdFrom: string | undefined;
    let createdTo: string | undefined;
    if (f.timeRange === '7d') {
      createdFrom = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    } else if (f.timeRange === '30d') {
      createdFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    } else if (f.dateFrom || f.dateTo) {
      if (f.dateFrom) createdFrom = new Date(`${f.dateFrom}T00:00:00`).toISOString();
      if (f.dateTo) createdTo = new Date(`${f.dateTo}T23:59:59`).toISOString();
    }
    try {
      const result = await onlineResumesApi.list({
        page,
        perPage: PAGE_SIZE,
        demandId: f.demandId > 0 ? f.demandId : undefined,
        gender: f.gender || undefined,
        ageFrom: f.ageFrom !== '' ? Number(f.ageFrom) : undefined,
        ageTo: f.ageTo !== '' ? Number(f.ageTo) : undefined,
        createdFrom,
        createdTo,
        sourcePlatform: f.sourcePlatform || undefined,
        educationLevel: f.educationLevel || undefined,
        location: f.location || undefined,
        keyword: f.keyword || undefined,
        ownerHrId: f.ownerHrId > 0 ? f.ownerHrId : undefined,
      });
      if (requestId !== latestRequestId.current) return;
      const validLastPage = Math.max(1, result.pages);
      if (page > validLastPage) {
        keepLoadingForPageCorrection = true;
        setPage(validLastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setPages(validLastPage);
    } catch (loadError) {
      if (requestId !== latestRequestId.current) return;
      setError(loadError instanceof Error ? loadError.message : '在线简历加载失败');
    } finally {
      if (
        requestId === latestRequestId.current &&
        !keepLoadingForPageCorrection
      ) {
        setLoading(false);
      }
    }
  }, [page, debouncedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <>
      <section className="rounded-xl border border-background-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-background-100 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs font-medium text-foreground-500">
              招聘需求
              <select
                value={filters.demandId}
                onChange={(event) => { setFilters((c) => ({ ...c, demandId: Number(event.target.value) })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[180px]`}
              >
                <option value={0}>全部需求</option>
                {demands.filter((d) => d.status === 'active').map((d) => (
                  <option key={d.id} value={d.id}>{d.job_title} · {d.request_no}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              性别
              <select
                value={filters.gender}
                onChange={(event) => { setFilters((c) => ({ ...c, gender: event.target.value })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[90px]`}
              >
                <option value="">全部</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              来源平台
              <select
                value={filters.sourcePlatform}
                onChange={(event) => { setFilters((c) => ({ ...c, sourcePlatform: event.target.value })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[110px]`}
              >
                <option value="">全部平台</option>
                {PLATFORM_OPTIONS.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              学历
              <select
                value={filters.educationLevel}
                onChange={(event) => { setFilters((c) => ({ ...c, educationLevel: event.target.value })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[90px]`}
              >
                <option value="">全部学历</option>
                {EDUCATION_OPTIONS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              城市
              <select
                value={filters.location}
                onChange={(event) => { setFilters((c) => ({ ...c, location: event.target.value })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[90px]`}
              >
                <option value="">全部城市</option>
                {CITY_OPTIONS.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              导入人
              <select
                value={filters.ownerHrId}
                onChange={(event) => { setFilters((c) => ({ ...c, ownerHrId: Number(event.target.value) })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[110px]`}
              >
                <option value={0}>全部导入人</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              关键词
              <input
                type="search"
                placeholder="姓名/岗位/技能"
                value={filters.keyword}
                onChange={(event) => { setFilters((c) => ({ ...c, keyword: event.target.value })); setPage(1); }}
                className={`mt-1 ${INPUT_CLASS} min-w-[160px]`}
              />
            </label>
            <label className="block text-xs font-medium text-foreground-500">
              年龄
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={80}
                  placeholder="最小"
                  value={filters.ageFrom}
                  onChange={(event) => { setFilters((c) => ({ ...c, ageFrom: event.target.value })); setPage(1); }}
                  className={`${INPUT_CLASS} w-[72px]`}
                />
                <span className="text-foreground-400">-</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  placeholder="最大"
                  value={filters.ageTo}
                  onChange={(event) => { setFilters((c) => ({ ...c, ageTo: event.target.value })); setPage(1); }}
                  className={`${INPUT_CLASS} w-[72px]`}
                />
                <span className="text-xs text-foreground-400">岁</span>
              </div>
            </label>
            <div className="block text-xs font-medium text-foreground-500">
              导入时间
              <div className="mt-1 flex items-center gap-1.5">
                {[
                  { key: '', label: '全部' },
                  { key: '7d', label: '7天内' },
                  { key: '30d', label: '30天内' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => { applyTimeRange(option.key); setPage(1); }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      filters.timeRange === option.key && !filters.dateFrom && !filters.dateTo
                        ? 'bg-primary-600 text-white'
                        : 'border border-background-300 bg-white text-foreground-600 hover:bg-background-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => { setFilters((c) => ({ ...c, dateFrom: event.target.value, timeRange: '' })); setPage(1); }}
                  className={`${INPUT_CLASS} w-[150px]`}
                />
                <span className="text-foreground-400">至</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => { setFilters((c) => ({ ...c, dateTo: event.target.value, timeRange: '' })); setPage(1); }}
                  className={`${INPUT_CLASS} w-[150px]`}
                />
              </div>
            </div>
            {hasActiveFilters && (
              <ActionButton size="sm" onClick={resetFilters}>清空筛选</ActionButton>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-background-100 px-4 py-3">
          <p className="text-sm text-foreground-600">共 {total} 份在线简历</p>
          <ActionButton size="sm" onClick={() => void load()}>刷新</ActionButton>
        </div>

        {loading ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm text-foreground-500">正在加载在线简历...</p>
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <ActionButton className="mt-4" onClick={() => void load()}>重新加载</ActionButton>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-base font-medium text-foreground-700">
              {hasActiveFilters ? '没有符合筛选条件的在线简历' : '暂无Agent导入的在线简历'}
            </p>
            <p className="mt-2 text-sm text-foreground-500">
              {hasActiveFilters ? '尝试调整或清空筛选条件' : '外部Agent导入后会显示在这里'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-background-50 text-xs font-medium text-foreground-500">
                <tr>
                  <th className="px-4 py-3">候选人</th>
                  <th className="px-4 py-3">招聘需求</th>
                  <th className="px-4 py-3">年龄/性别</th>
                  <th className="px-4 py-3">学历/年限</th>
                  <th className="px-4 py-3">薪资/城市</th>
                  <th className="px-4 py-3">导入人</th>
                  <th className="px-4 py-3">BOSS账号</th>
                  <th className="px-4 py-3">最新聊天</th>
                  <th className="px-4 py-3">导入时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-background-50/60">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setOpenResume({ id: item.id, edit: false })}
                        className="font-medium text-foreground-900 hover:text-primary-700"
                      >
                        {item.display_name}
                      </button>
                      <p className="mt-1 text-xs text-foreground-400">{item.source_platform}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground-800" title={item.demand.request_no}>{item.demand.title}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground-700">
                      {item.extracted.age ? <span>{item.extracted.age}</span> : <span className="text-foreground-400">-</span>}
                      {item.extracted.gender && <span className="ml-1.5">{item.extracted.gender}</span>}
                    </td>
                    <td className="px-4 py-4 text-foreground-700">
                      {item.extracted.education_level || item.extracted.years_of_experience ? (
                        <span>
                          {item.extracted.education_level || '-'}
                          {item.extracted.years_of_experience && <span className="text-foreground-400"> · {item.extracted.years_of_experience}</span>}
                        </span>
                      ) : (
                        <span className="text-foreground-400">-</span>
                      )}
                      {item.extracted.availability && (
                        <p className="mt-1 text-xs text-foreground-500">{item.extracted.availability}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-foreground-700">
                      {item.extracted.salary_expectation || item.extracted.location ? (
                        <span>
                          {item.extracted.salary_expectation || '-'}
                          {item.extracted.location && <span className="text-foreground-400"> · {item.extracted.location}</span>}
                        </span>
                      ) : (
                        <span className="text-foreground-400">-</span>
                      )}
                      {item.extracted.target_position && (
                        <p className="mt-1 text-xs text-foreground-500">{item.extracted.target_position}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-foreground-700">{item.owner_name || '-'}</td>
                    <td className="px-4 py-4 text-foreground-700">{item.boss_account}</td>
                    <td className="max-w-[260px] px-4 py-4">
                      {item.latest_chat ? (
                        <>
                          <p className="line-clamp-2 whitespace-pre-wrap break-words text-foreground-700">{item.latest_chat.text}</p>
                          <time className="mt-1 block text-xs text-foreground-400" dateTime={item.latest_chat.sent_at}>
                            {formatDate(item.latest_chat.sent_at)}
                          </time>
                        </>
                      ) : (
                        <span className="text-foreground-400">暂无聊天</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground-500" title={formatDate(item.created_at)}>
                      {formatShortDate(item.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <ActionButton size="sm" onClick={() => setOpenResume({ id: item.id, edit: false })}>查看</ActionButton>
                        <ActionButton size="sm" onClick={() => setOpenResume({ id: item.id, edit: true })}>编辑</ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-background-100 px-4 py-3">
            <p className="text-xs text-foreground-500">第 {page} / {pages} 页</p>
            <div className="flex gap-2">
              <ActionButton size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                上一页
              </ActionButton>
              <ActionButton size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
                下一页
              </ActionButton>
            </div>
          </div>
        )}
      </section>

      {openResume && (
        <OnlineResumeDetailDrawer
          key={`${openResume.id}-${openResume.edit ? 'edit' : 'view'}`}
          resumeId={openResume.id}
          initialEdit={openResume.edit}
          onClose={() => setOpenResume(null)}
          onSaved={(updated) => {
            setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
          }}
          onDeleted={(deletedId) => {
            setItems((current) => current.filter((item) => item.id !== deletedId));
            setTotal((current) => Math.max(0, current - 1));
            setOpenResume(null);
            if (items.length === 1 && page > 1) {
              setPage((current) => current - 1);
            } else {
              void load();
            }
          }}
        />
      )}
    </>
  );
}
