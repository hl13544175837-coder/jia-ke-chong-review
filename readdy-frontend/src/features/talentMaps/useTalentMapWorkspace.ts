import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { talentMapsApi } from '@/features/talentMaps/api';
import type {
  ImportConfirmItem,
  ImportPreviewResult,
  ResumeCandidateItem,
  TalentMapCompany,
  TalentMapDetail,
  TalentMapPerson,
  TalentMapSummary,
} from '@/features/talentMaps/types';

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** 联系人状态（岗位维度） */
export const CONTACT_STATUS_OPTIONS = ['未接触', '待联系', '沟通中', '已确认', '不合适'] as const;

export type ContactStatus = (typeof CONTACT_STATUS_OPTIONS)[number];

/** 组织树：公司 → 部门 → 岗位 → 人才 */
export interface RoleGroup {
  title: string;
  people: TalentMapPerson[];
}

export interface DepartmentGroup {
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

export function useTalentMapWorkspace() {
  const [maps, setMaps] = useState<TalentMapSummary[]>([]);
  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TalentMapDetail | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);

  const loadMap = useCallback(async (mapId: number) => {
    const next = await talentMapsApi.get(mapId);
    setDetail(next);
    setActiveMapId(next.id);
    setActiveCompanyId((current) => (
      current !== null && next.companies.some((company) => company.id === current)
        ? current
        : next.companies[0]?.id ?? null
    ));
    return next;
  }, []);

  const refresh = useCallback(async (preferredMapId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const nextMaps = await talentMapsApi.list();
      setMaps(nextMaps);
      const nextMapId = preferredMapId
        ?? (activeMapId && nextMaps.some((item) => item.id === activeMapId) ? activeMapId : nextMaps[0]?.id);
      if (nextMapId) await loadMap(nextMapId);
      else {
        setActiveMapId(null);
        setDetail(null);
        setActiveCompanyId(null);
      }
    } catch (loadError) {
      setError(messageFrom(loadError, '人才地图加载失败'));
    } finally {
      setLoading(false);
    }
  }, [activeMapId, loadMap]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void refresh();
  }, [refresh]);

  const handleMapChange = useCallback(async (mapId: number) => {
    if (mapId === activeMapId) return;
    setLoading(true);
    setError(null);
    try {
      await loadMap(mapId);
    } catch (loadError) {
      setError(messageFrom(loadError, '人才地图加载失败'));
    } finally {
      setLoading(false);
    }
  }, [activeMapId, loadMap]);

  const companies = useMemo<TalentMapCompany[]>(() => detail?.companies ?? [], [detail?.companies]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const companyPeople = useMemo(
    () => (detail?.people ?? []).filter((person) => person.company_id === activeCompanyId),
    [detail?.people, activeCompanyId],
  );

  const departments = useMemo(() => groupByDepartment(companyPeople), [companyPeople]);

  const stats = useMemo(() => {
    const people = companyPeople;
    return {
      roles: new Set(people.map((p) => p.title).filter(Boolean)).size,
      total: people.length,
      confirmed: people.filter((p) => p.contact_status === '已确认').length,
      contacting: people.filter((p) => p.contact_status === '沟通中').length,
      pending: people.filter((p) => ['待联系', '未接触'].includes(p.contact_status)).length,
      vacant: 0,
    };
  }, [companyPeople]);

  const addCompany = useCallback(async (companyName: string, industry?: string, note?: string) => {
    if (!detail) throw new Error('请先选择人才地图');
    setSaving(true);
    setError(null);
    try {
      const company = await talentMapsApi.createCompany(detail.id, {
        company_name: companyName.trim(),
        industry: industry?.trim() || '',
        note: note?.trim() || '',
      });
      await refresh(detail.id);
      setActiveCompanyId(company.id);
      return company;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '公司保存失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail, refresh]);

  const createPerson = useCallback(async (payload: Parameters<typeof talentMapsApi.createPerson>[1]) => {
    if (!detail) throw new Error('请先选择人才地图');
    setSaving(true);
    setError(null);
    try {
      const person = await talentMapsApi.createPerson(detail.id, payload);
      await refresh(detail.id);
      return person;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '人才保存失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail, refresh]);

  const bulkCreateCompanies = useCallback(async (items: Array<{ company_name: string; industry?: string; city?: string; note?: string }>) => {
    if (!detail) throw new Error('请先选择人才地图');
    setSaving(true);
    setError(null);
    try {
      const result = await talentMapsApi.bulkCreateCompanies(detail.id, items);
      await refresh(detail.id);
      return result;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '批量创建公司失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail, refresh]);

  const addContactLog = useCallback(async (personId: number, payload: { content: string }) => {
    if (!detail) throw new Error('请先选择人才地图');
    setSaving(true);
    setError(null);
    try {
      const updated = await talentMapsApi.addContactLog(personId, payload);
      await refresh(detail.id);
      return updated;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '保存联系记录失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail, refresh]);

  const updatePerson = useCallback(async (personId: number, payload: Partial<ImportConfirmItem>) => {
    setSaving(true);
    setError(null);
    try {
      const person = await talentMapsApi.updatePerson(personId, payload);
      await refresh(detail?.id);
      return person;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '人才更新失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail?.id, refresh]);

  /* ---------- AI 从简历库导入 ---------- */
  const loadResumeCandidates = useCallback((keyword = ''): Promise<{ items: ResumeCandidateItem[]; total: number }> => {
    if (!detail) return Promise.resolve({ items: [], total: 0 });
    return talentMapsApi.resumeCandidates(detail.id, keyword);
  }, [detail]);

  const previewImport = useCallback((candidateIds: number[]): Promise<ImportPreviewResult> => {
    if (!detail) return Promise.reject(new Error('请先选择人才地图'));
    return talentMapsApi.previewImport(detail.id, candidateIds);
  }, [detail]);

  const confirmImport = useCallback(async (items: ImportConfirmItem[]) => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const result = await talentMapsApi.confirmImport(detail.id, items);
      await refresh(detail.id);
      return result;
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '导入失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  }, [detail, refresh]);

  return {
    maps,
    detail,
    loading,
    saving,
    error,
    activeMapId,
    handleMapChange,
    companies,
    activeCompany,
    activeCompanyId,
    setActiveCompanyId,
    companyPeople,
    departments,
    stats,
    refresh,
    addCompany,
    createPerson,
    updatePerson,
    addContactLog,
    bulkCreateCompanies,
    loadResumeCandidates,
    previewImport,
    confirmImport,
  } as const;
}

export type TalentMapWorkspaceController = ReturnType<typeof useTalentMapWorkspace>;
