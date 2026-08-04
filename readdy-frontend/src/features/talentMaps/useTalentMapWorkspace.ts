import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { talentMapsApi } from '@/features/talentMaps/api';
import type {
  TalentBoard,
  TalentCompany,
  TalentDepartment,
  TalentMapCompany,
  TalentMapDetail,
  TalentMapSummary,
  TalentNode,
} from '@/features/talentMaps/types';

const emptyBoard = (): TalentBoard => ({
  departments: [],
  nodes: [],
  personMeta: {},
  hiddenPersonIds: [],
  companyShortNames: {},
});

function normalizeBoard(value: TalentMapDetail['board_json']): TalentBoard {
  const board = value && typeof value === 'object' ? value : {};
  return {
    departments: Array.isArray(board.departments) ? board.departments : [],
    nodes: Array.isArray(board.nodes) ? board.nodes : [],
    personMeta: board.personMeta && typeof board.personMeta === 'object' ? board.personMeta : {},
    hiddenPersonIds: Array.isArray(board.hiddenPersonIds)
      ? board.hiddenPersonIds.filter((id): id is number => Number.isInteger(id))
      : [],
    companyShortNames: board.companyShortNames && typeof board.companyShortNames === 'object'
      ? board.companyShortNames
      : {},
  };
}

function defaultDepartments(companyId: string): TalentDepartment[] {
  return [
    { id: `dept-${companyId}-technology`, companyId, name: '总部·技术中心', headcountConfirmed: 0, headcountEstimated: 4, description: '负责核心技术系统研发' },
    { id: `dept-${companyId}-product`, companyId, name: '总部·产品中心', headcountConfirmed: 0, headcountEstimated: 3, description: '负责产品规划与用户体验' },
    { id: `dept-${companyId}-operations`, companyId, name: '总部·运营中心', headcountConfirmed: 0, headcountEstimated: 3, description: '负责业务运营与增长' },
  ];
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

interface AddCompanyInput {
  name: string;
  shortName: string;
  industry: string;
  description: string;
}

interface SaveNodeOptions {
  editingNode: TalentNode | null;
  companyId: string;
  departmentId: string;
  parentNodeId: string | null;
  nodeData: Partial<TalentNode>;
}

export function useTalentMapWorkspace() {
  const [maps, setMaps] = useState<TalentMapSummary[]>([]);
  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TalentMapDetail | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);

  const loadMap = useCallback(async (mapId: number) => {
    const next = await talentMapsApi.get(mapId);
    setDetail(next);
    setActiveMapId(next.id);
    setActiveCompanyId((current) => (
      next.companies.some((company) => String(company.id) === current)
        ? current
        : String(next.companies[0]?.id ?? '')
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
        setActiveCompanyId('');
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

  const board = useMemo(() => normalizeBoard(detail?.board_json ?? {}), [detail?.board_json]);
  const industries = useMemo(() => maps.map((item) => item.name), [maps]);
  const activeIndustry = detail?.name ?? '';

  const companies = useMemo<TalentCompany[]>(() => (detail?.companies ?? []).map((company) => ({
    id: String(company.id),
    name: company.company_name,
    industry: detail?.name ?? company.industry,
    shortName: board.companyShortNames[String(company.id)] || company.company_name,
    description: company.note || '暂无描述，请补充公司概况。',
    mappedFrom: 0,
    totalHeadcount: 0,
    confirmedHeadcount: 0,
  })), [board.companyShortNames, detail]);

  const departments = useMemo(() => {
    const result = [...board.departments];
    for (const company of detail?.companies ?? []) {
      const companyId = String(company.id);
      if (!result.some((department) => department.companyId === companyId)) {
        result.push(...defaultDepartments(companyId));
      }
    }
    return result;
  }, [board.departments, detail?.companies]);

  const nodes = useMemo(() => {
    const hidden = new Set(board.hiddenPersonIds);
    const personNodes: TalentNode[] = (detail?.people ?? [])
      .filter((person) => person.company_id && !hidden.has(person.id))
      .map((person) => {
        const companyId = String(person.company_id);
        const meta = board.personMeta[String(person.id)];
        const fallbackDepartment = departments.find((department) => department.companyId === companyId)?.id ?? '';
        return {
          id: `person-${person.id}`,
          personId: person.id,
          companyId,
          departmentId: meta?.departmentId || fallbackDepartment,
          title: person.title || '待补充岗位',
          level: meta?.level || '',
          personName: person.name,
          personSource: person.source.includes('简历') ? 'resume' : 'manual',
          reportsTo: meta?.reportsTo ?? null,
          status: meta?.status || (person.contact_status === '未接触' ? 'estimated' : 'confirmed'),
          responsibilities: person.evaluation || person.tags.join('、'),
          notes: person.note,
        };
      });
    return [...board.nodes, ...personNodes];
  }, [board.hiddenPersonIds, board.nodes, board.personMeta, departments, detail?.people]);

  const industryCompanies = companies;
  const safeCompanyId = companies.some((company) => company.id === activeCompanyId)
    ? activeCompanyId
    : companies[0]?.id ?? '';
  const activeCompany = companies.find((company) => company.id === safeCompanyId);
  const companyDepartments = departments.filter((department) => department.companyId === safeCompanyId);

  const handleIndustryChange = async (industry: string) => {
    const selected = maps.find((item) => item.name === industry);
    if (!selected || selected.id === activeMapId) return;
    setLoading(true);
    setError(null);
    try {
      await loadMap(selected.id);
    } catch (loadError) {
      setError(messageFrom(loadError, '人才地图加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const saveBoard = async (mapId: number, nextBoard: TalentBoard) => {
    const nextDetail = await talentMapsApi.update(mapId, { board_json: nextBoard });
    setDetail(nextDetail);
    return nextDetail;
  };

  const addCompany = async ({ name, shortName, industry, description }: AddCompanyInput) => {
    const mapName = industry.trim() || activeIndustry || '通用人才地图';
    setSaving(true);
    setError(null);
    try {
      let target = maps.find((item) => item.name === mapName);
      let targetDetail: TalentMapDetail;
      if (target) targetDetail = target.id === detail?.id ? detail : await talentMapsApi.get(target.id);
      else {
        targetDetail = await talentMapsApi.create({ name: mapName, board_json: emptyBoard() });
        target = targetDetail;
      }
      const company = await talentMapsApi.createCompany(target.id, {
        company_name: name.trim(),
        industry: mapName,
        note: description.trim(),
      });
      const nextBoard = normalizeBoard(targetDetail.board_json);
      const companyId = String(company.id);
      nextBoard.departments = [
        ...nextBoard.departments.filter((department) => department.companyId !== companyId),
        ...defaultDepartments(companyId),
      ];
      nextBoard.companyShortNames = { ...nextBoard.companyShortNames, [companyId]: shortName.trim() };
      await saveBoard(target.id, nextBoard);
      await refresh(target.id);
      setActiveCompanyId(companyId);
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '公司保存失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  };

  const saveNode = async ({ editingNode, companyId, departmentId, parentNodeId, nodeData }: SaveNodeOptions) => {
    if (!detail) throw new Error('请先创建人才地图和公司');
    const title = nodeData.title?.trim() || '未命名岗位';
    const personName = nodeData.personName?.trim() || '';
    const nextBoard = normalizeBoard(detail.board_json);
    setSaving(true);
    setError(null);
    try {
      if (personName) {
        const payload = {
          company_id: Number(companyId),
          name: personName,
          title,
          contact_status: nodeData.status === 'confirmed' ? '已确认' : '未接触',
          evaluation: nodeData.responsibilities?.trim() || '',
          source: editingNode?.personSource === 'resume' ? '简历库' : '人工录入',
          note: nodeData.notes?.trim() || '',
        };
        const person = editingNode?.personId
          ? await talentMapsApi.updatePerson(editingNode.personId, payload)
          : await talentMapsApi.createPerson(detail.id, payload);
        nextBoard.personMeta = {
          ...nextBoard.personMeta,
          [String(person.id)]: {
            departmentId: nodeData.departmentId || departmentId,
            reportsTo: nodeData.reportsTo ?? parentNodeId,
            level: nodeData.level?.trim() || '',
            status: nodeData.status || 'estimated',
          },
        };
        nextBoard.hiddenPersonIds = nextBoard.hiddenPersonIds.filter((id) => id !== person.id);
        if (editingNode && !editingNode.personId) {
          nextBoard.nodes = nextBoard.nodes.filter((node) => node.id !== editingNode.id);
        }
      } else {
        if (editingNode?.personId) throw new Error('已有人选姓名不能清空，可使用“从地图移除”');
        const nodeId = editingNode?.id ?? `node-${crypto.randomUUID()}`;
        const structuralNode: TalentNode = {
          id: nodeId,
          companyId,
          departmentId: nodeData.departmentId || departmentId,
          title,
          level: nodeData.level?.trim() || '',
          reportsTo: nodeData.reportsTo ?? parentNodeId,
          status: nodeData.status || 'gap',
          responsibilities: nodeData.responsibilities?.trim() || '',
          notes: nodeData.notes?.trim() || '',
        };
        nextBoard.nodes = [
          ...nextBoard.nodes.filter((node) => node.id !== nodeId),
          structuralNode,
        ];
      }
      await saveBoard(detail.id, nextBoard);
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '岗位保存失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  };

  const removeNode = async (nodeId: string) => {
    if (!detail) return;
    const removed = new Set<string>();
    const collect = (id: string) => {
      if (removed.has(id)) return;
      removed.add(id);
      nodes.filter((node) => node.reportsTo === id).forEach((child) => collect(child.id));
    };
    collect(nodeId);
    const nextBoard = normalizeBoard(detail.board_json);
    const hiddenPeople = nodes
      .filter((node) => removed.has(node.id) && node.personId)
      .map((node) => node.personId as number);
    nextBoard.nodes = nextBoard.nodes.filter((node) => !removed.has(node.id));
    nextBoard.hiddenPersonIds = [...new Set([...nextBoard.hiddenPersonIds, ...hiddenPeople])];
    setSaving(true);
    setError(null);
    try {
      await saveBoard(detail.id, nextBoard);
    } catch (saveError) {
      const saveMessage = messageFrom(saveError, '从地图移除失败');
      setError(saveMessage);
      throw new Error(saveMessage, { cause: saveError });
    } finally {
      setSaving(false);
    }
  };

  const getCompanyStats = (companyId: string) => {
    const companyNodes = nodes.filter((node) => node.companyId === companyId);
    return {
      total: companyNodes.length,
      confirmed: companyNodes.filter((node) => node.status === 'confirmed').length,
      estimated: companyNodes.filter((node) => node.status === 'estimated').length,
      gap: companyNodes.filter((node) => node.status === 'gap').length,
    };
  };

  return {
    maps,
    detail,
    loading,
    saving,
    error,
    industries,
    activeIndustry,
    companies,
    departments,
    nodes,
    industryCompanies,
    activeCompanyId,
    setActiveCompanyId,
    safeCompanyId,
    activeCompany,
    companyDepartments,
    refresh,
    handleIndustryChange,
    addCompany,
    saveNode,
    removeNode,
    getCompanyStats,
  } as const;
}

export type TalentMapWorkspaceController = ReturnType<typeof useTalentMapWorkspace>;
