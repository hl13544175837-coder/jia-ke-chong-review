import { useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  ChevronRight,
  GitFork,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../components/ui';

type TalentStatus = '已确认' | '推测中' | '待填充';

interface TalentNode {
  id: number;
  title: string;
  level: string;
  person: string;
  status: TalentStatus;
  source: string;
  note: string;
}

interface TalentDepartment {
  id: number;
  name: string;
  confirmed: number;
  target: number;
  scope: string;
  nodes: TalentNode[];
}

interface TalentCompany {
  id: number;
  name: string;
  category: string;
  confirmed: number;
  target: number;
  mappedJobs: number;
  intro: string;
  departments: TalentDepartment[];
}

const STATUS_STYLES: Record<TalentStatus, string> = {
  已确认: 'border-[#9bdcbc] bg-white text-[#168a5b]',
  推测中: 'border-dashed border-[#a8cf9b] bg-[#fbfef9] text-[#6a8d4f]',
  待填充: 'border-dashed border-[#e7e2d8] bg-white text-[#8a8f98]',
};

const INITIAL_COMPANIES: TalentCompany[] = [
  {
    id: 1,
    name: '中通快递',
    category: '物流/快递',
    confirmed: 18,
    target: 92,
    mappedJobs: 18,
    intro: '国内领先的快递物流企业，业务覆盖国内及海外，转运中心数量行业领先，智能化分拣系统为核心竞争力。',
    departments: [
      {
        id: 11,
        name: '总部·信息技术中心',
        confirmed: 2,
        target: 6,
        scope: '负责路由系统、分拣控制系统、物流中台、数据平台建设',
        nodes: [
          { id: 101, title: '信息技术中心总监', level: 'M3', person: '周建国', status: '推测中', source: '人工录入', note: '统筹中通全国物流信息系统建设，负责路由算法、分拣控制、数据中台等核心系统。' },
          { id: 102, title: '高级架构师', level: 'P7-P8', person: '候选人A', status: '已确认', source: '简历库来源', note: '曾负责高并发物流链路，熟悉实时调度与大规模消息系统。' },
        ],
      },
      {
        id: 12,
        name: '总部·运营管理部',
        confirmed: 0,
        target: 4,
        scope: '转运规划、干线调度、时效管理、产能测算',
        nodes: [
          { id: 103, title: '运营管理部总监', level: 'M3', person: '岗位空缺', status: '待填充', source: '部门缺口', note: '统筹全国运营管理，制定转运规划与产能标准。' },
          { id: 104, title: '转运规划主管', level: 'M2', person: '待访谈', status: '待填充', source: '部门缺口', note: '负责转运中心布局规划、产能测算与异常线路优化。' },
        ],
      },
    ],
  },
  {
    id: 2,
    name: '圆通速递',
    category: '物流/快递',
    confirmed: 0,
    target: 15,
    mappedJobs: 8,
    intro: '国内主流快递网络之一，直营网点与加盟体系并行，适合挖掘区域运营、转运规划和网点管理人才。',
    departments: [
      {
        id: 21,
        name: '华东·区域运营中心',
        confirmed: 1,
        target: 5,
        scope: '区域运营、网点质量、加盟商协同',
        nodes: [
          { id: 201, title: '区域运营负责人', level: 'M3', person: '王启明', status: '推测中', source: '公开资料', note: '负责华东区域网点运营质量与加盟商协同。' },
        ],
      },
    ],
  },
  {
    id: 3,
    name: '申通快递',
    category: '物流/快递',
    confirmed: 0,
    target: 12,
    mappedJobs: 6,
    intro: '快递网络覆盖广，近年持续补强信息化、转运效率和末端网点管理能力。',
    departments: [
      {
        id: 31,
        name: '技术研发中心',
        confirmed: 0,
        target: 4,
        scope: '订单系统、路由系统、智能客服',
        nodes: [
          { id: 301, title: '物流系统产品负责人', level: 'M2', person: '待填充', status: '待填充', source: '部门缺口', note: '负责运单、路由、客服等核心产品线。' },
        ],
      },
    ],
  },
  {
    id: 4,
    name: '韵达快递',
    category: '物流/快递',
    confirmed: 1,
    target: 15,
    mappedJobs: 7,
    intro: '干线网络成熟，适合重点观察时效运营、成本优化和分拣自动化人才。',
    departments: [
      {
        id: 41,
        name: '网络规划部',
        confirmed: 1,
        target: 4,
        scope: '干线网络、成本优化、时效规划',
        nodes: [
          { id: 401, title: '网络规划专家', level: 'P7', person: '陈峰', status: '已确认', source: '简历库来源', note: '有直营网点网络规划和干线成本优化经验。' },
        ],
      },
    ],
  },
  {
    id: 5,
    name: '百世/极兔',
    category: '物流/快递',
    confirmed: 1,
    target: 12,
    mappedJobs: 5,
    intro: '扩张速度快，适合观察区域开拓、加盟网络搭建和跨境物流人才。',
    departments: [
      {
        id: 51,
        name: '区域增长部',
        confirmed: 1,
        target: 3,
        scope: '区域开拓、加盟管理、网络搭建',
        nodes: [
          { id: 501, title: '区域增长负责人', level: 'M3', person: '刘雨欣', status: '已确认', source: '人工录入', note: '擅长新区域开拓，曾负责区域加盟商网络搭建。' },
        ],
      },
    ],
  },
  {
    id: 6,
    name: '顺丰',
    category: '物流/快递',
    confirmed: 0,
    target: 20,
    mappedJobs: 10,
    intro: '直营体系成熟，适合观察高标准运营、供应链、冷链和同城配送人才。',
    departments: [
      {
        id: 61,
        name: '供应链事业部',
        confirmed: 0,
        target: 5,
        scope: '供应链方案、客户交付、仓配一体',
        nodes: [
          { id: 601, title: '供应链方案总监', level: 'M3', person: '待填充', status: '待填充', source: '部门缺口', note: '负责KA客户供应链方案设计与交付管理。' },
        ],
      },
    ],
  },
  {
    id: 7,
    name: '字节跳动',
    category: '互联网/科技',
    confirmed: 0,
    target: 46,
    mappedJobs: 14,
    intro: '组织密度高，适合观察增长、推荐算法、商业化产品和组织管理人才。',
    departments: [
      {
        id: 71,
        name: '商业化产品部',
        confirmed: 2,
        target: 8,
        scope: '广告产品、增长策略、数据分析',
        nodes: [
          { id: 701, title: '商业化产品经理', level: 'P7', person: '赵晓月', status: '推测中', source: '公开资料', note: '负责广告投放效率和转化链路优化。' },
        ],
      },
    ],
  },
];

function ratio(company: Pick<TalentCompany, 'confirmed' | 'target'>) {
  return `${company.confirmed}/${company.target} 确认`;
}

function companyProgress(company: Pick<TalentCompany, 'confirmed' | 'target'>) {
  if (company.target <= 0) return 0;
  return Math.min(100, Math.round((company.confirmed / company.target) * 100));
}

function NodeCard({ node, onStatusChange }: { node: TalentNode; onStatusChange: (status: TalentStatus) => void }) {
  return (
    <div className={`rounded-xl border p-4 ${STATUS_STYLES[node.status]}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={node.status}
          onChange={(event) => onStatusChange(event.target.value as TalentStatus)}
          className="rounded-md border border-[#d7eadc] bg-white px-2 py-1 text-xs font-bold text-[#168a5b] outline-none"
        >
          <option value="已确认">已确认</option>
          <option value="推测中">推测中</option>
          <option value="待填充">待填充</option>
        </select>
        <span className="text-xs font-semibold text-[#9aa0a8]">{node.source}</span>
      </div>
      <h4 className="text-base font-bold text-[#171a1f]">{node.title}</h4>
      <span className="mt-2 inline-flex rounded-md bg-[#f6f5f2] px-2 py-1 text-xs font-bold text-[#8a8f98]">{node.level}</span>
      <div className="mt-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ddf4ea] text-sm font-bold text-[#168a5b]">
          {node.person.slice(0, 1)}
        </span>
        <span className="font-bold text-[#303133]">{node.person}</span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#5f646d]">{node.note}</p>
    </div>
  );
}

export function TalentMapPage() {
  const [companies, setCompanies] = useState<TalentCompany[]>(INITIAL_COMPANIES);
  const [activeCompanyId, setActiveCompanyId] = useState(INITIAL_COMPANIES[0].id);
  const [category, setCategory] = useState('物流/快递');
  const [keyword, setKeyword] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCategory, setNewCompanyCategory] = useState('物流/快递');
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodePerson, setNewNodePerson] = useState('');
  const [newNodeDepartmentId, setNewNodeDepartmentId] = useState<number | null>(null);

  const categories = useMemo(() => Array.from(new Set(companies.map((item) => item.category))), [companies]);
  const filteredCompanies = useMemo(
    () =>
      companies.filter((company) => {
        if (category !== '全部' && company.category !== category) return false;
        if (keyword.trim() && ![company.name, company.intro].join(' ').includes(keyword.trim())) return false;
        return true;
      }),
    [category, companies, keyword],
  );
  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? filteredCompanies[0] ?? companies[0];
  const activeCategoryCompanies = companies.filter((company) => company.category === activeCompany.category);
  const categoryConfirmed = activeCategoryCompanies.reduce((sum, item) => sum + item.confirmed, 0);
  const categoryTarget = activeCategoryCompanies.reduce((sum, item) => sum + item.target, 0);

  function addCompany(event: FormEvent) {
    event.preventDefault();
    if (!newCompanyName.trim()) return;
    const nextCompany: TalentCompany = {
      id: Date.now(),
      name: newCompanyName.trim(),
      category: newCompanyCategory,
      confirmed: 0,
      target: 10,
      mappedJobs: 0,
      intro: '新建目标公司，可继续补充部门、岗位节点和潜在人选。',
      departments: [
        {
          id: Date.now() + 1,
          name: '核心部门',
          confirmed: 0,
          target: 3,
          scope: '待补充业务范围',
          nodes: [],
        },
      ],
    };
    setCompanies((current) => [...current, nextCompany]);
    setActiveCompanyId(nextCompany.id);
    setCategory(newCompanyCategory);
    setNewCompanyName('');
  }

  function addNode(event: FormEvent) {
    event.preventDefault();
    if (!newNodeTitle.trim() || !activeCompany) return;
    const targetDepartmentId = newNodeDepartmentId ?? activeCompany.departments[0]?.id;
    if (!targetDepartmentId) return;
    setCompanies((current) =>
      current.map((company) =>
        company.id !== activeCompany.id
          ? company
          : {
              ...company,
              target: company.target + 1,
              departments: company.departments.map((department) =>
                department.id !== targetDepartmentId
                  ? department
                  : {
                      ...department,
                      target: department.target + 1,
                      nodes: [
                        ...department.nodes,
                        {
                          id: Date.now(),
                          title: newNodeTitle.trim(),
                          level: '待定',
                          person: newNodePerson.trim() || '待填充',
                          status: newNodePerson.trim() ? '推测中' : '待填充',
                          source: newNodePerson.trim() ? '人工录入' : '部门缺口',
                          note: '新增岗位节点，可继续补充候选人画像、来源和接触状态。',
                        },
                      ],
                    },
              ),
            },
      ),
    );
    setNewNodeTitle('');
    setNewNodePerson('');
  }

  function updateNodeStatus(departmentId: number, nodeId: number, status: TalentStatus) {
    setCompanies((current) =>
      current.map((company) =>
        company.id !== activeCompany.id
          ? company
          : {
              ...company,
              departments: company.departments.map((department) =>
                department.id !== departmentId
                  ? department
                  : {
                      ...department,
                      nodes: department.nodes.map((node) => (node.id === nodeId ? { ...node, status } : node)),
                    },
              ),
            },
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm font-bold text-[#5f646d]">
          <span>简历库</span>
          <ChevronRight className="h-4 w-4 text-[#9aa0a8]" />
          <span className="rounded-lg bg-[#e9f7f1] px-3 py-2 text-[#168a5b]">人才地图</span>
        </div>
        <form onSubmit={addCompany} className="flex flex-wrap items-center gap-2">
          <input
            value={newCompanyName}
            onChange={(event) => setNewCompanyName(event.target.value)}
            placeholder="新增公司名称"
            className="h-10 rounded-lg border border-[#edf0f2] bg-white px-3 text-sm outline-none focus:border-[#33a474]"
          />
          <select
            value={newCompanyCategory}
            onChange={(event) => setNewCompanyCategory(event.target.value)}
            className="h-10 rounded-lg border border-[#edf0f2] bg-white px-3 text-sm font-semibold outline-none"
          >
            {['物流/快递', '互联网/科技', '制造业', '零售消费'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <Button type="submit" className="h-10 bg-[#33a474] hover:bg-[#27895f]">
            <Building2 className="h-4 w-4" />
            新增目标公司
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-normal text-[#171a1f]">人才地图</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a8]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索公司、部门、岗位"
              className="h-10 w-64 rounded-lg border border-[#edf0f2] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#33a474]"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-10 rounded-lg border border-[#edf0f2] bg-white px-3 text-sm font-bold outline-none"
          >
            <option value="全部">全部行业</option>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#edf0f2] bg-white px-3 text-sm font-bold text-[#5f646d]">
            <SlidersHorizontal className="h-4 w-4" />
            动态筛选
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {categories.map((item) => {
          const list = companies.filter((company) => company.category === item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setCategory(item);
                setActiveCompanyId(list[0]?.id ?? activeCompanyId);
              }}
              className={`rounded-xl border px-5 py-4 text-left transition ${
                activeCompany.category === item ? 'border-[#8bd6b4] bg-white shadow-sm' : 'border-[#edf0f2] bg-white hover:border-[#c7e8d8]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#171a1f]">{item}</span>
                <span className="rounded-md bg-[#f6f5f2] px-2 py-1 text-xs font-bold text-[#8a8f98]">{list.length} 家</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#6a6f77]">
                <span>{item === activeCompany.category ? `${categoryConfirmed}/${categoryTarget}` : `${list.reduce((sum, company) => sum + company.confirmed, 0)}/${list.reduce((sum, company) => sum + company.target, 0)}`} 确认</span>
                <span className="h-1 w-24 overflow-hidden rounded-full bg-[#f0f1ed]">
                  <span className="block h-full rounded-full bg-[#33a474]" style={{ width: `${companyProgress({ confirmed: list.reduce((sum, company) => sum + company.confirmed, 0), target: list.reduce((sum, company) => sum + company.target, 0) })}%` }} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {filteredCompanies.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => setActiveCompanyId(company.id)}
            className={`rounded-xl border bg-white px-4 py-4 text-left transition ${
              company.id === activeCompany.id ? 'border-[#8bd6b4] shadow-sm' : 'border-[#edf0f2] hover:border-[#c7e8d8]'
            }`}
          >
            <p className="font-bold text-[#171a1f]">{company.name}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#6a6f77]">
              <span>{ratio(company)}</span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-[#f0f1ed]">
                <span className="block h-full rounded-full bg-[#33a474]" style={{ width: `${companyProgress(company)}%` }} />
              </span>
            </div>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-[#edf0f2] bg-white p-5">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#e9f7f1] text-[#168a5b]">
            <Building2 className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[#171a1f]">{activeCompany.name}</h2>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#5f646d]">{activeCompany.intro}</p>
            <div className="mt-3 flex flex-wrap gap-5 text-xs font-semibold text-[#8a8f98]">
              <span>来自简历库自动映射 {activeCompany.confirmed} 人</span>
              <span>当前映射 {activeCompany.mappedJobs} 个岗位节点</span>
              <span>目标盘点 {activeCompany.target} 人</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-5 text-sm font-semibold text-[#777c84]">
        <span>图例：</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded border border-[#9bdcbc] bg-white" />已确认（来自简历库）</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded border border-dashed border-[#a8cf9b] bg-white" />推测中（待验证）</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded border border-dashed border-[#e7e2d8] bg-white" />待填充（部门缺口）</span>
      </div>

      <form onSubmit={addNode} className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#edf0f2] bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#8a8f98]">新增岗位节点</span>
          <input
            value={newNodeTitle}
            onChange={(event) => setNewNodeTitle(event.target.value)}
            placeholder="例：信息技术中心总监"
            className="h-10 w-64 rounded-lg border border-[#edf0f2] px-3 text-sm outline-none focus:border-[#33a474]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#8a8f98]">候选人/代号</span>
          <input
            value={newNodePerson}
            onChange={(event) => setNewNodePerson(event.target.value)}
            placeholder="例：周建国"
            className="h-10 w-48 rounded-lg border border-[#edf0f2] px-3 text-sm outline-none focus:border-[#33a474]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#8a8f98]">放入部门</span>
          <select
            value={newNodeDepartmentId ?? activeCompany.departments[0]?.id ?? ''}
            onChange={(event) => setNewNodeDepartmentId(Number(event.target.value))}
            className="h-10 rounded-lg border border-[#edf0f2] bg-white px-3 text-sm font-bold outline-none"
          >
            {activeCompany.departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        <Button type="submit" className="h-10 bg-[#33a474] hover:bg-[#27895f]">
          <Plus className="h-4 w-4" />
          添加节点
        </Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        {activeCompany.departments.map((department) => (
          <section key={department.id} className="rounded-2xl border border-[#edf0f2] bg-white p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#171a1f]">{department.name}</h3>
                <p className="mt-1 text-sm font-semibold text-[#8a8f98]">
                  {department.confirmed}/{department.target} 人已确认 · {department.scope}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewNodeDepartmentId(department.id)}
                className="rounded-lg bg-[#f6f5f2] p-2 text-[#777c84] hover:bg-[#eef8f3] hover:text-[#168a5b]"
                aria-label={`向${department.name}添加节点`}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="relative space-y-4 pl-8 before:absolute before:bottom-0 before:left-4 before:top-0 before:w-px before:bg-[#edf0f2]">
              {department.nodes.map((node) => (
                <div key={node.id} className="relative before:absolute before:-left-4 before:top-8 before:h-px before:w-4 before:bg-[#edf0f2]">
                  <NodeCard node={node} onStatusChange={(status) => updateNodeStatus(department.id, node.id, status)} />
                </div>
              ))}
              {department.nodes.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#e7e2d8] bg-white p-6 text-sm font-semibold text-[#8a8f98]">
                  这个部门还没有节点，点击右上角加号或下方添加节点。
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-[#edf0f2] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <GitFork className="h-5 w-5 text-[#168a5b]" />
          <h3 className="font-bold text-[#171a1f]">人才地图使用逻辑</h3>
        </div>
        <p className="text-sm font-semibold leading-6 text-[#5f646d]">
          人才地图不是简历列表，而是把目标公司、关键部门、岗位层级和潜在人选按结构摆出来，方便招聘专员主动补全市场、确认人选和推进接触。
        </p>
      </div>
    </div>
  );
}
