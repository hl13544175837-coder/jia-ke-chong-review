export interface TalentNode {
  id: string;
  companyId: string;
  departmentId: string;
  title: string;
  level: string;
  personName?: string;
  personSource?: 'resume' | 'manual';
  candidateId?: number;
  reportsTo: string | null;
  status: 'confirmed' | 'estimated' | 'gap';
  responsibilities?: string;
  notes?: string;
}

export interface TalentDepartment {
  id: string;
  companyId: string;
  name: string;
  headcountConfirmed: number;
  headcountEstimated: number;
  parentDeptId?: string;
  description?: string;
}

export interface TalentCompany {
  id: string;
  name: string;
  industry: string;
  shortName: string;
  description: string;
  mappedFrom: number;
  totalHeadcount: number;
  confirmedHeadcount: number;
}

export const talentCompanies: TalentCompany[] = [
  // ===== 物流/快递 =====
  {
    id: 'co-zto',
    name: '中通快递',
    industry: '物流/快递',
    shortName: '中通快递',
    description: '国内领先的快递物流企业，业务覆盖国内及海外，转运中心数量行业领先，智能化分拣系统为核心竞争力。',
    mappedFrom: 0,
    totalHeadcount: 18,
    confirmedHeadcount: 2,
  },
  {
    id: 'co-yto',
    name: '圆通速递',
    industry: '物流/快递',
    shortName: '圆通速递',
    description: '综合性快递物流运营商，拥有航空货运能力，国际业务布局较早，数字化运营能力持续提升中。',
    mappedFrom: 0,
    totalHeadcount: 15,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-sto',
    name: '申通快递',
    industry: '物流/快递',
    shortName: '申通快递',
    description: '国内最早成立的民营快递企业之一，深耕电商快递领域，近年来加速产能升级与网络扁平化改造。',
    mappedFrom: 0,
    totalHeadcount: 12,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-yunda',
    name: '韵达快递',
    industry: '物流/快递',
    shortName: '韵达快递',
    description: '以电商快递为核心，覆盖快运、供应链等多元化业务，自动化分拣与路由优化为技术特色。',
    mappedFrom: 0,
    totalHeadcount: 15,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-best',
    name: '百世快递（极兔速递）',
    industry: '物流/快递',
    shortName: '百世/极兔',
    description: '整合百世国内快递业务后的新兴快递网络，以东南亚跨境物流起家，快速切入国内市场。',
    mappedFrom: 0,
    totalHeadcount: 12,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-sf',
    name: '顺丰速运',
    industry: '物流/快递',
    shortName: '顺丰',
    description: '国内高端快递与综合物流服务商，拥有自有航空货运机队，冷链、医药、国际等新业务增速显著。',
    mappedFrom: 0,
    totalHeadcount: 20,
    confirmedHeadcount: 0,
  },
  // ===== 互联网/科技 =====
  {
    id: 'co-bytedance',
    name: '字节跳动',
    industry: '互联网/科技',
    shortName: '字节跳动',
    description: '全球领先的移动互联网公司，旗下拥有抖音、TikTok、今日头条等核心产品，在推荐算法与AI大模型领域持续投入。',
    mappedFrom: 0,
    totalHeadcount: 16,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-alibaba',
    name: '阿里巴巴集团',
    industry: '互联网/科技',
    shortName: '阿里巴巴',
    description: '全球最大的零售与云计算公司之一，业务横跨电商、金融科技、云计算、物流、本地生活等多元领域。',
    mappedFrom: 0,
    totalHeadcount: 16,
    confirmedHeadcount: 0,
  },
  {
    id: 'co-tencent',
    name: '腾讯',
    industry: '互联网/科技',
    shortName: '腾讯',
    description: '中国最大的社交与游戏公司，微信生态、企业服务、云计算与AI为近年重点战略方向。',
    mappedFrom: 0,
    totalHeadcount: 14,
    confirmedHeadcount: 0,
  },
];

export const talentDepartments: TalentDepartment[] = [
  // === 中通快递 ===
  { id: 'dept-zto-1', companyId: 'co-zto', name: '总部·信息技术中心', headcountConfirmed: 2, headcountEstimated: 6, description: '负责路由系统、分拣控制系统、物流中台、数据平台建设' },
  { id: 'dept-zto-2', companyId: 'co-zto', name: '总部·运营管理部', headcountConfirmed: 0, headcountEstimated: 4, description: '转运规划、干线调度、时效管理、产能测算' },
  { id: 'dept-zto-3', companyId: 'co-zto', name: '华东转运中心', headcountConfirmed: 0, headcountEstimated: 4, description: '上海及周边区域转运枢纽，日均处理能力行业前列' },
  { id: 'dept-zto-4', companyId: 'co-zto', name: '华南转运中心', headcountConfirmed: 0, headcountEstimated: 4, description: '广州及周边区域转运枢纽' },

  // === 圆通速递 ===
  { id: 'dept-yto-1', companyId: 'co-yto', name: '总部·信息中心', headcountConfirmed: 0, headcountEstimated: 5, description: '物流信息系统、航空运力系统、国际业务系统' },
  { id: 'dept-yto-2', companyId: 'co-yto', name: '总部·运营中心', headcountConfirmed: 0, headcountEstimated: 4, description: '全网运营管理、路由优化、车辆调度' },
  { id: 'dept-yto-3', companyId: 'co-yto', name: '华东转运中心', headcountConfirmed: 0, headcountEstimated: 3, description: '杭州及周边区域转运枢纽' },
  { id: 'dept-yto-4', companyId: 'co-yto', name: '华北转运中心', headcountConfirmed: 0, headcountEstimated: 3, description: '北京及周边区域转运枢纽' },

  // === 申通快递 ===
  { id: 'dept-sto-1', companyId: 'co-sto', name: '总部·网络管理中心', headcountConfirmed: 0, headcountEstimated: 4, description: '网点管理、网络规划、加盟商体系运营' },
  { id: 'dept-sto-2', companyId: 'co-sto', name: '总部·运营中心', headcountConfirmed: 0, headcountEstimated: 3, description: '转运中心管理、干线运输、产能规划' },
  { id: 'dept-sto-3', companyId: 'co-sto', name: '华东转运中心', headcountConfirmed: 0, headcountEstimated: 3, description: '上海及周边区域转运枢纽' },
  { id: 'dept-sto-4', companyId: 'co-sto', name: '总部·信息技术部', headcountConfirmed: 0, headcountEstimated: 2, description: 'IT系统运维、数字化工具开发' },

  // === 韵达快递 ===
  { id: 'dept-yunda-1', companyId: 'co-yunda', name: '总部·信息技术中心', headcountConfirmed: 0, headcountEstimated: 5, description: '路由算法、自动化分拣控制、物流数据中台' },
  { id: 'dept-yunda-2', companyId: 'co-yunda', name: '总部·运营中心', headcountConfirmed: 0, headcountEstimated: 4, description: '全网运营调度、时效管控、成本优化' },
  { id: 'dept-yunda-3', companyId: 'co-yunda', name: '华东转运中心', headcountConfirmed: 0, headcountEstimated: 3, description: '上海及周边区域转运枢纽' },
  { id: 'dept-yunda-4', companyId: 'co-yunda', name: '快运事业部', headcountConfirmed: 0, headcountEstimated: 3, description: '大件快运业务运营与网络建设' },

  // === 百世快递（极兔） ===
  { id: 'dept-best-1', companyId: 'co-best', name: '总部·技术中心', headcountConfirmed: 0, headcountEstimated: 4, description: '快递系统、跨境系统、移动端应用' },
  { id: 'dept-best-2', companyId: 'co-best', name: '总部·运营中心', headcountConfirmed: 0, headcountEstimated: 3, description: '转运网络运营、末端网点管理' },
  { id: 'dept-best-3', companyId: 'co-best', name: '跨境物流事业部', headcountConfirmed: 0, headcountEstimated: 3, description: '东南亚及国际线路运营' },
  { id: 'dept-best-4', companyId: 'co-best', name: '华东转运中心', headcountConfirmed: 0, headcountEstimated: 2, description: '上海及周边区域转运枢纽' },

  // === 顺丰速运 ===
  { id: 'dept-sf-1', companyId: 'co-sf', name: '总部·科技与数字化中心', headcountConfirmed: 0, headcountEstimated: 6, description: '顺丰科技核心部门，负责智慧物流、AI调度、丰巢智能柜等系统研发' },
  { id: 'dept-sf-2', companyId: 'co-sf', name: '总部·运营指挥中心', headcountConfirmed: 0, headcountEstimated: 5, description: '全网运营调度、航空资源管理、时效保障体系' },
  { id: 'dept-sf-3', companyId: 'co-sf', name: '航空事业部', headcountConfirmed: 0, headcountEstimated: 5, description: '自有货机机队运营、航线规划、航空枢纽管理' },
  { id: 'dept-sf-4', companyId: 'co-sf', name: '冷链与医药事业部', headcountConfirmed: 0, headcountEstimated: 4, description: '冷链物流网络建设、医药供应链解决方案' },

  // === 字节跳动 ===
  { id: 'dept-bytedance-1', companyId: 'co-bytedance', name: '抖音·推荐算法团队', headcountConfirmed: 0, headcountEstimated: 5, description: '负责抖音核心推荐引擎研发，涵盖召回、排序、多样性优化' },
  { id: 'dept-bytedance-2', companyId: 'co-bytedance', name: 'AI Lab·大模型研究院', headcountConfirmed: 0, headcountEstimated: 4, description: '大语言模型与多模态模型研发，支撑豆包等AI产品' },
  { id: 'dept-bytedance-3', companyId: 'co-bytedance', name: '基础架构部', headcountConfirmed: 0, headcountEstimated: 4, description: '负责字节跳动全球数据中心、网络架构、存储与计算平台' },
  { id: 'dept-bytedance-4', companyId: 'co-bytedance', name: '飞书·企业协作', headcountConfirmed: 0, headcountEstimated: 3, description: '飞书办公套件研发，涵盖文档、多维表格、即时通讯' },

  // === 阿里巴巴 ===
  { id: 'dept-alibaba-1', companyId: 'co-alibaba', name: '淘宝天猫·技术部', headcountConfirmed: 0, headcountEstimated: 5, description: '负责淘天集团核心电商系统，搜索推荐、营销平台、商家工具' },
  { id: 'dept-alibaba-2', companyId: 'co-alibaba', name: '阿里云·智能计算', headcountConfirmed: 0, headcountEstimated: 4, description: '云计算基础设施与AI平台研发，通义系列大模型产品' },
  { id: 'dept-alibaba-3', companyId: 'co-alibaba', name: '菜鸟网络·技术部', headcountConfirmed: 0, headcountEstimated: 4, description: '智慧物流网络建设，仓储自动化、末端配送数字化' },
  { id: 'dept-alibaba-4', companyId: 'co-alibaba', name: '本地生活·高德', headcountConfirmed: 0, headcountEstimated: 3, description: '高德地图、饿了么等本地生活产品技术研发' },

  // === 腾讯 ===
  { id: 'dept-tencent-1', companyId: 'co-tencent', name: '微信·事业群', headcountConfirmed: 0, headcountEstimated: 5, description: '微信生态产品研发，涵盖小程序、视频号、支付与企业微信' },
  { id: 'dept-tencent-2', companyId: 'co-tencent', name: '互动娱乐·IEG', headcountConfirmed: 0, headcountEstimated: 4, description: '游戏研发与发行，天美、光子等工作室群' },
  { id: 'dept-tencent-3', companyId: 'co-tencent', name: '云与智慧产业·CSIG', headcountConfirmed: 0, headcountEstimated: 3, description: '腾讯云、企业服务、行业解决方案' },
  { id: 'dept-tencent-4', companyId: 'co-tencent', name: '技术工程·TEG', headcountConfirmed: 0, headcountEstimated: 2, description: 'AI Lab、数据平台、基础研发技术' },
];

export const talentNodes: TalentNode[] = [
  // ==================== 中通快递 ====================
  // 总部·信息技术中心
  {
    id: 'node-zto-1-1', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: '信息技术中心总监', level: 'M3',
    personName: '周建国', personSource: 'manual',
    reportsTo: null,
    status: 'estimated',
    responsibilities: '统筹中通全国物流信息系统建设，负责路由算法、分拣控制、数据中台等核心技术方向',
    notes: '推测存在，具体人选待确认',
  },
  {
    id: 'node-zto-1-2', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: '高级架构师', level: 'P7-P8',
    personName: '李明辉', personSource: 'resume', candidateId: 9,
    reportsTo: 'node-zto-1-1',
    status: 'confirmed',
    responsibilities: '负责物流系统架构设计与微服务改造，支撑日均千万级订单处理',
    notes: '来自简历库：候选人李明辉曾有某物流公司Java开发经历，负责订单调度系统开发',
  },
  {
    id: 'node-zto-1-3', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: 'Java开发工程师', level: 'P5-P6',
    reportsTo: 'node-zto-1-2',
    status: 'gap',
    responsibilities: '负责路由系统日常开发与分拣控制系统维护',
  },
  {
    id: 'node-zto-1-4', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: '分拣系统工程师', level: 'P5-P6',
    reportsTo: 'node-zto-1-2',
    status: 'gap',
    responsibilities: '负责自动化分拣设备控制软件开发与设备联调',
  },
  {
    id: 'node-zto-1-5', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: '数据分析工程师', level: 'P5-P6',
    reportsTo: 'node-zto-1-1',
    status: 'gap',
    responsibilities: '负责全网时效数据监控、路由优化数据分析',
  },
  {
    id: 'node-zto-1-6', companyId: 'co-zto', departmentId: 'dept-zto-1',
    title: '前端开发工程师', level: 'P5-P6',
    personName: '陈伟', personSource: 'resume', candidateId: 1,
    reportsTo: 'node-zto-1-1',
    status: 'confirmed',
    responsibilities: '负责物流可视化大屏、运营管理后台前端开发',
    notes: '来自简历库：候选人陈伟有可视化引擎与低代码平台经验，推测可匹配物流数据可视化需求',
  },

  // 总部·运营管理部
  {
    id: 'node-zto-2-1', companyId: 'co-zto', departmentId: 'dept-zto-2',
    title: '运营管理部总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹全网运营管理，制定转运规划与产能标准',
  },
  {
    id: 'node-zto-2-2', companyId: 'co-zto', departmentId: 'dept-zto-2',
    title: '转运规划主管', level: 'M2',
    reportsTo: 'node-zto-2-1',
    status: 'gap',
    responsibilities: '负责转运中心布局规划、产能测算与投产节奏',
  },
  {
    id: 'node-zto-2-3', companyId: 'co-zto', departmentId: 'dept-zto-2',
    title: '干线调度专员', level: 'P4-P5',
    reportsTo: 'node-zto-2-1',
    status: 'gap',
    responsibilities: '负责干线车辆调度、路由优化与异常处理',
  },
  {
    id: 'node-zto-2-4', companyId: 'co-zto', departmentId: 'dept-zto-2',
    title: '时效分析专员', level: 'P4-P5',
    reportsTo: 'node-zto-2-1',
    status: 'gap',
    responsibilities: '负责全网时效数据分析、异常线路诊断',
  },

  // 华东转运中心
  {
    id: 'node-zto-3-1', companyId: 'co-zto', departmentId: 'dept-zto-3',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华东转运中心日常运营管理，保障分拣效率与准点率',
  },
  {
    id: 'node-zto-3-2', companyId: 'co-zto', departmentId: 'dept-zto-3',
    title: '分拣班组长', level: 'P3-P4',
    reportsTo: 'node-zto-3-1',
    status: 'gap',
    responsibilities: '负责分拣现场管理、人员排班与设备巡检',
  },
  {
    id: 'node-zto-3-3', companyId: 'co-zto', departmentId: 'dept-zto-3',
    title: '设备维护工程师', level: 'P4-P5',
    reportsTo: 'node-zto-3-1',
    status: 'gap',
    responsibilities: '负责自动化分拣设备维护与故障处理',
  },
  {
    id: 'node-zto-3-4', companyId: 'co-zto', departmentId: 'dept-zto-3',
    title: '运营数据专员', level: 'P4-P5',
    reportsTo: 'node-zto-3-1',
    status: 'gap',
    responsibilities: '负责转运中心运营数据采集与日报输出',
  },

  // 华南转运中心
  {
    id: 'node-zto-4-1', companyId: 'co-zto', departmentId: 'dept-zto-4',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华南转运中心日常运营管理',
  },
  {
    id: 'node-zto-4-2', companyId: 'co-zto', departmentId: 'dept-zto-4',
    title: '分拣班组长', level: 'P3-P4',
    reportsTo: 'node-zto-4-1',
    status: 'gap',
    responsibilities: '负责分拣现场管理',
  },
  {
    id: 'node-zto-4-3', companyId: 'co-zto', departmentId: 'dept-zto-4',
    title: '操作员', level: 'P2-P3',
    reportsTo: 'node-zto-4-2',
    status: 'gap',
    responsibilities: '负责快件分拣、扫描、装卸操作',
  },
  {
    id: 'node-zto-4-4', companyId: 'co-zto', departmentId: 'dept-zto-4',
    title: '客服协调员', level: 'P3-P4',
    reportsTo: 'node-zto-4-1',
    status: 'gap',
    responsibilities: '负责异常件处理与客户投诉协调',
  },

  // ==================== 圆通速递 ====================
  {
    id: 'node-yto-1-1', companyId: 'co-yto', departmentId: 'dept-yto-1',
    title: '信息中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹圆通物流信息系统与航空运力系统建设',
  },
  {
    id: 'node-yto-1-2', companyId: 'co-yto', departmentId: 'dept-yto-1',
    title: '系统架构师', level: 'P7-P8',
    reportsTo: 'node-yto-1-1',
    status: 'gap',
    responsibilities: '负责物流系统架构设计与高并发系统优化',
  },
  {
    id: 'node-yto-1-3', companyId: 'co-yto', departmentId: 'dept-yto-1',
    title: 'Java开发工程师', level: 'P5-P6',
    reportsTo: 'node-yto-1-2',
    status: 'gap',
    responsibilities: '负责核心物流系统开发与维护',
  },
  {
    id: 'node-yto-1-4', companyId: 'co-yto', departmentId: 'dept-yto-1',
    title: '移动端开发工程师', level: 'P5-P6',
    reportsTo: 'node-yto-1-1',
    status: 'gap',
    responsibilities: '负责快递员端APP与网点端小程序开发',
  },
  {
    id: 'node-yto-1-5', companyId: 'co-yto', departmentId: 'dept-yto-1',
    title: '测试工程师', level: 'P5-P6',
    reportsTo: 'node-yto-1-1',
    status: 'gap',
    responsibilities: '负责物流系统自动化测试与质量保障',
  },

  {
    id: 'node-yto-2-1', companyId: 'co-yto', departmentId: 'dept-yto-2',
    title: '运营中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹全网运营管理，保障服务质量与时效',
  },
  {
    id: 'node-yto-2-2', companyId: 'co-yto', departmentId: 'dept-yto-2',
    title: '路由优化主管', level: 'M2',
    reportsTo: 'node-yto-2-1',
    status: 'gap',
    responsibilities: '负责全网路由优化与干线规划',
  },
  {
    id: 'node-yto-2-3', companyId: 'co-yto', departmentId: 'dept-yto-2',
    title: '车辆调度专员', level: 'P4-P5',
    reportsTo: 'node-yto-2-1',
    status: 'gap',
    responsibilities: '负责干线车辆日常调度与运力协调',
  },
  {
    id: 'node-yto-2-4', companyId: 'co-yto', departmentId: 'dept-yto-2',
    title: '服务质量专员', level: 'P4-P5',
    reportsTo: 'node-yto-2-1',
    status: 'gap',
    responsibilities: '负责服务质量指标监控与网点考核',
  },

  {
    id: 'node-yto-3-1', companyId: 'co-yto', departmentId: 'dept-yto-3',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华东转运中心日常运营管理',
  },
  {
    id: 'node-yto-3-2', companyId: 'co-yto', departmentId: 'dept-yto-3',
    title: '现场主管', level: 'P4-P5',
    reportsTo: 'node-yto-3-1',
    status: 'gap',
    responsibilities: '负责分拣现场作业管理与安全管控',
  },
  {
    id: 'node-yto-3-3', companyId: 'co-yto', departmentId: 'dept-yto-3',
    title: '自动化设备工程师', level: 'P4-P5',
    reportsTo: 'node-yto-3-1',
    status: 'gap',
    responsibilities: '负责自动化分拣设备运维与调优',
  },

  {
    id: 'node-yto-4-1', companyId: 'co-yto', departmentId: 'dept-yto-4',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华北转运中心日常运营管理',
  },
  {
    id: 'node-yto-4-2', companyId: 'co-yto', departmentId: 'dept-yto-4',
    title: '分拣组长', level: 'P3-P4',
    reportsTo: 'node-yto-4-1',
    status: 'gap',
    responsibilities: '负责分拣班组管理与效率提升',
  },
  {
    id: 'node-yto-4-3', companyId: 'co-yto', departmentId: 'dept-yto-4',
    title: '安检员', level: 'P2-P3',
    reportsTo: 'node-yto-4-2',
    status: 'gap',
    responsibilities: '负责快件安检与违禁品排查',
  },

  // ==================== 申通快递 ====================
  {
    id: 'node-sto-1-1', companyId: 'co-sto', departmentId: 'dept-sto-1',
    title: '网络管理中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹申通全国网点管理，推动网络扁平化与加盟商体系优化',
  },
  {
    id: 'node-sto-1-2', companyId: 'co-sto', departmentId: 'dept-sto-1',
    title: '网点开发主管', level: 'M2',
    reportsTo: 'node-sto-1-1',
    status: 'gap',
    responsibilities: '负责新网点开发选址与加盟招商',
  },
  {
    id: 'node-sto-1-3', companyId: 'co-sto', departmentId: 'dept-sto-1',
    title: '加盟商管理专员', level: 'P4-P5',
    reportsTo: 'node-sto-1-1',
    status: 'gap',
    responsibilities: '负责加盟商日常管理与考核评估',
  },
  {
    id: 'node-sto-1-4', companyId: 'co-sto', departmentId: 'dept-sto-1',
    title: '网络规划专员', level: 'P4-P5',
    reportsTo: 'node-sto-1-1',
    status: 'gap',
    responsibilities: '负责转运网络拓扑优化与盲区覆盖规划',
  },

  {
    id: 'node-sto-2-1', companyId: 'co-sto', departmentId: 'dept-sto-2',
    title: '运营中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹转运中心管理与干线运输运营',
  },
  {
    id: 'node-sto-2-2', companyId: 'co-sto', departmentId: 'dept-sto-2',
    title: '转运主管', level: 'M2',
    reportsTo: 'node-sto-2-1',
    status: 'gap',
    responsibilities: '负责转运中心作业标准制定与执行监督',
  },
  {
    id: 'node-sto-2-3', companyId: 'co-sto', departmentId: 'dept-sto-2',
    title: '运力调度专员', level: 'P4-P5',
    reportsTo: 'node-sto-2-1',
    status: 'gap',
    responsibilities: '负责干线运力资源调配与车辆管理',
  },

  {
    id: 'node-sto-3-1', companyId: 'co-sto', departmentId: 'dept-sto-3',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华东转运中心日常运营',
  },
  {
    id: 'node-sto-3-2', companyId: 'co-sto', departmentId: 'dept-sto-3',
    title: '分拣主管', level: 'P4-P5',
    reportsTo: 'node-sto-3-1',
    status: 'gap',
    responsibilities: '负责分拣现场管理与效率达标',
  },
  {
    id: 'node-sto-3-3', companyId: 'co-sto', departmentId: 'dept-sto-3',
    title: '装卸组长', level: 'P3-P4',
    reportsTo: 'node-sto-3-1',
    status: 'gap',
    responsibilities: '负责装卸班组管理与车辆对接',
  },

  {
    id: 'node-sto-4-1', companyId: 'co-sto', departmentId: 'dept-sto-4',
    title: 'IT部经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责申通IT系统建设与运维',
  },
  {
    id: 'node-sto-4-2', companyId: 'co-sto', departmentId: 'dept-sto-4',
    title: '系统运维工程师', level: 'P5-P6',
    reportsTo: 'node-sto-4-1',
    status: 'gap',
    responsibilities: '负责核心系统运维与故障响应',
  },

  // ==================== 韵达快递 ====================
  {
    id: 'node-yunda-1-1', companyId: 'co-yunda', departmentId: 'dept-yunda-1',
    title: '信息技术中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹韵达路由算法、自动化分拣控制与物流中台建设',
  },
  {
    id: 'node-yunda-1-2', companyId: 'co-yunda', departmentId: 'dept-yunda-1',
    title: '算法工程师', level: 'P6-P7',
    reportsTo: 'node-yunda-1-1',
    status: 'gap',
    responsibilities: '负责路由算法优化与预测模型开发',
  },
  {
    id: 'node-yunda-1-3', companyId: 'co-yunda', departmentId: 'dept-yunda-1',
    title: '软件开发工程师', level: 'P5-P6',
    reportsTo: 'node-yunda-1-1',
    status: 'gap',
    responsibilities: '负责物流系统软件开发与功能迭代',
  },
  {
    id: 'node-yunda-1-4', companyId: 'co-yunda', departmentId: 'dept-yunda-1',
    title: '数据中台工程师', level: 'P5-P6',
    reportsTo: 'node-yunda-1-1',
    status: 'gap',
    responsibilities: '负责物流数据平台建设与实时数据处理',
  },
  {
    id: 'node-yunda-1-5', companyId: 'co-yunda', departmentId: 'dept-yunda-1',
    title: '数据分析师', level: 'P5-P6',
    personName: '刘强', personSource: 'resume', candidateId: 5,
    reportsTo: 'node-yunda-1-1',
    status: 'confirmed',
    responsibilities: '负责全网运营数据分析、路由效率评估与成本分析',
    notes: '来自简历库：候选人刘强有数据分析师经验，精通数据建模与业务分析，推测可匹配物流数据分析需求',
  },

  {
    id: 'node-yunda-2-1', companyId: 'co-yunda', departmentId: 'dept-yunda-2',
    title: '运营中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹全网运营调度与时效管控',
  },
  {
    id: 'node-yunda-2-2', companyId: 'co-yunda', departmentId: 'dept-yunda-2',
    title: '调度主管', level: 'M2',
    reportsTo: 'node-yunda-2-1',
    status: 'gap',
    responsibilities: '负责全网日常调度指挥与异常处理',
  },
  {
    id: 'node-yunda-2-3', companyId: 'co-yunda', departmentId: 'dept-yunda-2',
    title: '成本分析专员', level: 'P4-P5',
    reportsTo: 'node-yunda-2-1',
    status: 'gap',
    responsibilities: '负责运输成本分析与优化方案输出',
  },
  {
    id: 'node-yunda-2-4', companyId: 'co-yunda', departmentId: 'dept-yunda-2',
    title: '时效管控专员', level: 'P4-P5',
    reportsTo: 'node-yunda-2-1',
    status: 'gap',
    responsibilities: '负责时效指标监控与延误线路诊断',
  },

  {
    id: 'node-yunda-3-1', companyId: 'co-yunda', departmentId: 'dept-yunda-3',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华东转运中心日常运营',
  },
  {
    id: 'node-yunda-3-2', companyId: 'co-yunda', departmentId: 'dept-yunda-3',
    title: '自动化主管', level: 'P4-P5',
    reportsTo: 'node-yunda-3-1',
    status: 'gap',
    responsibilities: '负责自动化分拣设备管理与人效提升',
  },
  {
    id: 'node-yunda-3-3', companyId: 'co-yunda', departmentId: 'dept-yunda-3',
    title: '班组长', level: 'P3-P4',
    reportsTo: 'node-yunda-3-1',
    status: 'gap',
    responsibilities: '负责班组日常管理与任务分配',
  },

  {
    id: 'node-yunda-4-1', companyId: 'co-yunda', departmentId: 'dept-yunda-4',
    title: '快运事业部负责人', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹韵达快运业务运营与网络建设',
  },
  {
    id: 'node-yunda-4-2', companyId: 'co-yunda', departmentId: 'dept-yunda-4',
    title: '快运运营主管', level: 'M2',
    reportsTo: 'node-yunda-4-1',
    status: 'gap',
    responsibilities: '负责快运网络运营管理与服务质量',
  },
  {
    id: 'node-yunda-4-3', companyId: 'co-yunda', departmentId: 'dept-yunda-4',
    title: '网点开发专员', level: 'P4-P5',
    reportsTo: 'node-yunda-4-1',
    status: 'gap',
    responsibilities: '负责快运网点开发与加盟商管理',
  },

  // ==================== 百世快递（极兔） ====================
  {
    id: 'node-best-1-1', companyId: 'co-best', departmentId: 'dept-best-1',
    title: '技术中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹百世/极兔技术系统建设，支撑国内与跨境双网运营',
  },
  {
    id: 'node-best-1-2', companyId: 'co-best', departmentId: 'dept-best-1',
    title: '后端开发工程师', level: 'P5-P6',
    reportsTo: 'node-best-1-1',
    status: 'gap',
    responsibilities: '负责快递核心系统后端开发与跨境系统对接',
  },
  {
    id: 'node-best-1-3', companyId: 'co-best', departmentId: 'dept-best-1',
    title: '前端开发工程师', level: 'P5-P6',
    reportsTo: 'node-best-1-1',
    status: 'gap',
    responsibilities: '负责运营后台与移动端应用前端开发',
  },
  {
    id: 'node-best-1-4', companyId: 'co-best', departmentId: 'dept-best-1',
    title: '测试工程师', level: 'P5-P6',
    personName: '周杰', personSource: 'resume', candidateId: 6,
    reportsTo: 'node-best-1-1',
    status: 'confirmed',
    responsibilities: '负责自动化测试体系建设与质量保障',
    notes: '来自简历库：候选人周杰有自动化测试平台搭建经验，覆盖率从40%提升到85%，可匹配物流系统质量保障需求',
  },

  {
    id: 'node-best-2-1', companyId: 'co-best', departmentId: 'dept-best-2',
    title: '运营中心总监', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹转运网络运营与末端网点管理',
  },
  {
    id: 'node-best-2-2', companyId: 'co-best', departmentId: 'dept-best-2',
    title: '转运规划主管', level: 'M2',
    reportsTo: 'node-best-2-1',
    status: 'gap',
    responsibilities: '负责转运网络规划与产能布局',
  },
  {
    id: 'node-best-2-3', companyId: 'co-best', departmentId: 'dept-best-2',
    title: '末端管理专员', level: 'P4-P5',
    reportsTo: 'node-best-2-1',
    status: 'gap',
    responsibilities: '负责末端网点管理与服务质量监控',
  },

  {
    id: 'node-best-3-1', companyId: 'co-best', departmentId: 'dept-best-3',
    title: '跨境事业部负责人', level: 'M3',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹东南亚及国际线路运营，支撑跨境电商物流',
  },
  {
    id: 'node-best-3-2', companyId: 'co-best', departmentId: 'dept-best-3',
    title: '国际运营主管', level: 'M2',
    reportsTo: 'node-best-3-1',
    status: 'gap',
    responsibilities: '负责国际线路运营与清关协调',
  },
  {
    id: 'node-best-3-3', companyId: 'co-best', departmentId: 'dept-best-3',
    title: '海外网点开发', level: 'P4-P5',
    reportsTo: 'node-best-3-1',
    status: 'gap',
    responsibilities: '负责海外末端网点开发与合作伙伴管理',
  },

  {
    id: 'node-best-4-1', companyId: 'co-best', departmentId: 'dept-best-4',
    title: '转运中心经理', level: 'M2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责华东转运中心日常运营',
  },
  {
    id: 'node-best-4-2', companyId: 'co-best', departmentId: 'dept-best-4',
    title: '现场主管', level: 'P4-P5',
    reportsTo: 'node-best-4-1',
    status: 'gap',
    responsibilities: '负责分拣现场管理与作业安全',
  },

  // ==================== 顺丰速运 ====================
  {
    id: 'node-sf-1-1', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: '科技与数字化中心负责人', level: 'M4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹顺丰科技战略，智慧物流、AI调度、数据中台等核心方向',
  },
  {
    id: 'node-sf-1-2', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: 'AI算法总监', level: 'P8-P9',
    reportsTo: 'node-sf-1-1',
    status: 'gap',
    responsibilities: '负责智能路由调度、运力预测、最后一公里优化算法',
  },
  {
    id: 'node-sf-1-3', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: '丰巢技术负责人', level: 'M3',
    reportsTo: 'node-sf-1-1',
    status: 'gap',
    responsibilities: '丰巢智能快递柜系统研发、IoT终端管理与用户产品迭代',
  },
  {
    id: 'node-sf-1-4', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: '大数据平台工程师', level: 'P6-P7',
    reportsTo: 'node-sf-1-2',
    status: 'gap',
    responsibilities: '负责实时数据Pipeline建设与运力数据湖治理',
  },
  {
    id: 'node-sf-1-5', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: '前端架构师', level: 'P7-P8',
    reportsTo: 'node-sf-1-1',
    status: 'gap',
    responsibilities: '负责顺丰科技前端技术体系建设，运营管理平台与可视化产品',
  },
  {
    id: 'node-sf-1-6', companyId: 'co-sf', departmentId: 'dept-sf-1',
    title: '测试开发工程师', level: 'P5-P6',
    reportsTo: 'node-sf-1-1',
    status: 'gap',
    responsibilities: '负责核心系统自动化测试与精准测试体系建设',
  },

  {
    id: 'node-sf-2-1', companyId: 'co-sf', departmentId: 'dept-sf-2',
    title: '运营指挥中心总监', level: 'M4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹全网运营调度，航空+陆运双网协同，保障时效承诺',
  },
  {
    id: 'node-sf-2-2', companyId: 'co-sf', departmentId: 'dept-sf-2',
    title: '时效管理中心经理', level: 'M2',
    reportsTo: 'node-sf-2-1',
    status: 'gap',
    responsibilities: '负责时效指标管控、异常线路诊断与服务补救机制',
  },
  {
    id: 'node-sf-2-3', companyId: 'co-sf', departmentId: 'dept-sf-2',
    title: '运力规划高级专员', level: 'P5-P6',
    reportsTo: 'node-sf-2-1',
    status: 'gap',
    responsibilities: '负责全网运力资源测算、航线与陆运线路协同优化',
  },
  {
    id: 'node-sf-2-4', companyId: 'co-sf', departmentId: 'dept-sf-2',
    title: '中转场规划主管', level: 'M2',
    reportsTo: 'node-sf-2-1',
    status: 'gap',
    responsibilities: '负责全国中转场布局规划与产能评估',
  },
  {
    id: 'node-sf-2-5', companyId: 'co-sf', departmentId: 'dept-sf-2',
    title: '服务质量分析专员', level: 'P4-P5',
    reportsTo: 'node-sf-2-2',
    status: 'gap',
    responsibilities: '负责全网服务质量数据监控与区域改善方案制定',
  },

  {
    id: 'node-sf-3-1', companyId: 'co-sf', departmentId: 'dept-sf-3',
    title: '航空事业部总经理', level: 'M4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '负责顺丰自有货机机队运营与航空枢纽建设',
  },
  {
    id: 'node-sf-3-2', companyId: 'co-sf', departmentId: 'dept-sf-3',
    title: '航线网络规划经理', level: 'M2',
    reportsTo: 'node-sf-3-1',
    status: 'gap',
    responsibilities: '负责国内及国际航线网络设计与时刻资源获取',
  },
  {
    id: 'node-sf-3-3', companyId: 'co-sf', departmentId: 'dept-sf-3',
    title: '鄂州枢纽运营总监', level: 'M3',
    reportsTo: 'node-sf-3-1',
    status: 'gap',
    responsibilities: '负责鄂州花湖机场货运枢纽全面运营管理',
  },
  {
    id: 'node-sf-3-4', companyId: 'co-sf', departmentId: 'dept-sf-3',
    title: '机务维修主管', level: 'M2',
    reportsTo: 'node-sf-3-1',
    status: 'gap',
    responsibilities: '负责货机机队日常维护计划与适航管理',
  },
  {
    id: 'node-sf-3-5', companyId: 'co-sf', departmentId: 'dept-sf-3',
    title: '航空安全专员', level: 'P5-P6',
    reportsTo: 'node-sf-3-1',
    status: 'gap',
    responsibilities: '负责航空安全体系建设与SMS安全管理',
  },

  {
    id: 'node-sf-4-1', companyId: 'co-sf', departmentId: 'dept-sf-4',
    title: '冷链事业部负责人', level: 'M4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹冷链物流网络建设，医药、生鲜双赛道布局',
  },
  {
    id: 'node-sf-4-2', companyId: 'co-sf', departmentId: 'dept-sf-4',
    title: '医药供应链总监', level: 'M3',
    reportsTo: 'node-sf-4-1',
    status: 'gap',
    responsibilities: '负责医药冷链合规体系与GSP质量管理',
  },
  {
    id: 'node-sf-4-3', companyId: 'co-sf', departmentId: 'dept-sf-4',
    title: '生鲜供应链经理', level: 'M2',
    reportsTo: 'node-sf-4-1',
    status: 'gap',
    responsibilities: '负责生鲜冷链产品设计与产地直发网络建设',
  },
  {
    id: 'node-sf-4-4', companyId: 'co-sf', departmentId: 'dept-sf-4',
    title: '温控技术工程师', level: 'P5-P6',
    reportsTo: 'node-sf-4-2',
    status: 'gap',
    responsibilities: '负责冷链温控设备研发与IoT实时监控系统',
  },

  // ==================== 字节跳动 ====================
  {
    id: 'node-bytedance-1-1', companyId: 'co-bytedance', departmentId: 'dept-bytedance-1',
    title: '推荐算法负责人', level: '3-2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹抖音推荐引擎研发，覆盖召回、粗排、精排、重排全链路优化',
  },
  {
    id: 'node-bytedance-1-2', companyId: 'co-bytedance', departmentId: 'dept-bytedance-1',
    title: '资深推荐算法工程师', level: '2-2',
    reportsTo: 'node-bytedance-1-1',
    status: 'gap',
    responsibilities: '负责召回模型优化与多目标排序策略',
  },
  {
    id: 'node-bytedance-1-3', companyId: 'co-bytedance', departmentId: 'dept-bytedance-1',
    title: '推荐系统架构师', level: '2-2',
    reportsTo: 'node-bytedance-1-1',
    status: 'gap',
    responsibilities: '负责推荐引擎架构设计，支撑千亿级特征实时推理',
  },
  {
    id: 'node-bytedance-1-4', companyId: 'co-bytedance', departmentId: 'dept-bytedance-1',
    title: '机器学习平台工程师', level: '2-1',
    reportsTo: 'node-bytedance-1-3',
    status: 'gap',
    responsibilities: '负责训练平台与特征平台建设',
  },
  {
    id: 'node-bytedance-1-5', companyId: 'co-bytedance', departmentId: 'dept-bytedance-1',
    title: '数据分析师', level: '2-1',
    reportsTo: 'node-bytedance-1-1',
    status: 'gap',
    responsibilities: '负责推荐效果分析与AB实验评估',
  },

  {
    id: 'node-bytedance-2-1', companyId: 'co-bytedance', departmentId: 'dept-bytedance-2',
    title: '大模型研究负责人', level: '3-2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹豆包大模型研发，NLP、多模态、对齐技术方向',
  },
  {
    id: 'node-bytedance-2-2', companyId: 'co-bytedance', departmentId: 'dept-bytedance-2',
    title: 'NLP研究员', level: '2-2',
    reportsTo: 'node-bytedance-2-1',
    status: 'gap',
    responsibilities: '负责预训练模型架构创新与长文本理解能力提升',
  },
  {
    id: 'node-bytedance-2-3', companyId: 'co-bytedance', departmentId: 'dept-bytedance-2',
    title: '多模态研究员', level: '2-2',
    reportsTo: 'node-bytedance-2-1',
    status: 'gap',
    responsibilities: '负责视觉-语言多模态大模型研发',
  },
  {
    id: 'node-bytedance-2-4', companyId: 'co-bytedance', departmentId: 'dept-bytedance-2',
    title: 'RLHF对齐工程师', level: '2-1',
    reportsTo: 'node-bytedance-2-1',
    status: 'gap',
    responsibilities: '负责人类反馈强化学习对齐与安全护栏建设',
  },

  {
    id: 'node-bytedance-3-1', companyId: 'co-bytedance', departmentId: 'dept-bytedance-3',
    title: '基础架构负责人', level: '3-2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹全球数据中心、网络、存储、计算平台建设',
  },
  {
    id: 'node-bytedance-3-2', companyId: 'co-bytedance', departmentId: 'dept-bytedance-3',
    title: 'SRE总监', level: '3-1',
    reportsTo: 'node-bytedance-3-1',
    status: 'gap',
    responsibilities: '负责全球服务稳定性保障与容灾体系建设',
  },
  {
    id: 'node-bytedance-3-3', companyId: 'co-bytedance', departmentId: 'dept-bytedance-3',
    title: '容器平台架构师', level: '2-2',
    reportsTo: 'node-bytedance-3-1',
    status: 'gap',
    responsibilities: '负责大规模Kubernetes集群与弹性调度平台建设',
  },
  {
    id: 'node-bytedance-3-4', companyId: 'co-bytedance', departmentId: 'dept-bytedance-3',
    title: '存储系统工程师', level: '2-1',
    reportsTo: 'node-bytedance-3-1',
    status: 'gap',
    responsibilities: '负责分布式存储系统研发与优化',
  },

  {
    id: 'node-bytedance-4-1', companyId: 'co-bytedance', departmentId: 'dept-bytedance-4',
    title: '飞书技术负责人', level: '3-2',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹飞书产品技术研发，文档协同、多维表格、开放平台',
  },
  {
    id: 'node-bytedance-4-2', companyId: 'co-bytedance', departmentId: 'dept-bytedance-4',
    title: '文档编辑器架构师', level: '2-2',
    reportsTo: 'node-bytedance-4-1',
    status: 'gap',
    responsibilities: '负责飞书文档协同编辑引擎与OT/CRDT算法优化',
  },
  {
    id: 'node-bytedance-4-3', companyId: 'co-bytedance', departmentId: 'dept-bytedance-4',
    title: '前端技术专家', level: '2-2',
    reportsTo: 'node-bytedance-4-1',
    status: 'gap',
    responsibilities: '负责飞书前端架构与性能优化',
  },

  // ==================== 阿里巴巴 ====================
  {
    id: 'node-alibaba-1-1', companyId: 'co-alibaba', departmentId: 'dept-alibaba-1',
    title: '搜索推荐技术负责人', level: 'P9',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹淘宝天猫搜索推荐算法体系，千亿级商品库实时个性化',
  },
  {
    id: 'node-alibaba-1-2', companyId: 'co-alibaba', departmentId: 'dept-alibaba-1',
    title: '搜索算法专家', level: 'P8',
    reportsTo: 'node-alibaba-1-1',
    status: 'gap',
    responsibilities: '负责电商搜索相关性排序与语义理解优化',
  },
  {
    id: 'node-alibaba-1-3', companyId: 'co-alibaba', departmentId: 'dept-alibaba-1',
    title: '推荐系统架构师', level: 'P8',
    reportsTo: 'node-alibaba-1-1',
    status: 'gap',
    responsibilities: '负责推荐引擎架构升级与深度个性化模型落地',
  },
  {
    id: 'node-alibaba-1-4', companyId: 'co-alibaba', departmentId: 'dept-alibaba-1',
    title: '营销平台技术负责人', level: 'P8',
    reportsTo: 'node-alibaba-1-1',
    status: 'gap',
    responsibilities: '负责大促营销技术平台，支撑双11级别高并发场景',
  },
  {
    id: 'node-alibaba-1-5', companyId: 'co-alibaba', departmentId: 'dept-alibaba-1',
    title: '前端技术专家', level: 'P7',
    reportsTo: 'node-alibaba-1-1',
    status: 'gap',
    responsibilities: '负责淘宝天猫C端核心链路前端架构',
  },

  {
    id: 'node-alibaba-2-1', companyId: 'co-alibaba', departmentId: 'dept-alibaba-2',
    title: '智能计算负责人', level: 'P9',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹阿里云AI平台与通义大模型产品线',
  },
  {
    id: 'node-alibaba-2-2', companyId: 'co-alibaba', departmentId: 'dept-alibaba-2',
    title: '大模型训练平台架构师', level: 'P8',
    reportsTo: 'node-alibaba-2-1',
    status: 'gap',
    responsibilities: '负责万卡级GPU集群训练平台与分布式训练优化',
  },
  {
    id: 'node-alibaba-2-3', companyId: 'co-alibaba', departmentId: 'dept-alibaba-2',
    title: '云计算产品经理', level: 'P7',
    reportsTo: 'node-alibaba-2-1',
    status: 'gap',
    responsibilities: '负责AI计算产品规划与商业化',
  },
  {
    id: 'node-alibaba-2-4', companyId: 'co-alibaba', departmentId: 'dept-alibaba-2',
    title: '大模型安全研究员', level: 'P7',
    reportsTo: 'node-alibaba-2-1',
    status: 'gap',
    responsibilities: '负责大模型安全对齐与红队测试',
  },

  {
    id: 'node-alibaba-3-1', companyId: 'co-alibaba', departmentId: 'dept-alibaba-3',
    title: '菜鸟技术负责人', level: 'P9',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹菜鸟智慧物流技术，仓储自动化与末端配送数字化',
  },
  {
    id: 'node-alibaba-3-2', companyId: 'co-alibaba', departmentId: 'dept-alibaba-3',
    title: 'WMS系统架构师', level: 'P8',
    reportsTo: 'node-alibaba-3-1',
    status: 'gap',
    responsibilities: '负责仓储管理系统架构设计与多仓协同调度',
  },
  {
    id: 'node-alibaba-3-3', companyId: 'co-alibaba', departmentId: 'dept-alibaba-3',
    title: '无人配送算法工程师', level: 'P7',
    reportsTo: 'node-alibaba-3-1',
    status: 'gap',
    responsibilities: '负责无人车路径规划与末端配送调度算法',
  },
  {
    id: 'node-alibaba-3-4', companyId: 'co-alibaba', departmentId: 'dept-alibaba-3',
    title: 'IoT硬件工程师', level: 'P7',
    reportsTo: 'node-alibaba-3-1',
    status: 'gap',
    responsibilities: '负责仓储IoT设备研发与边缘计算节点部署',
  },

  {
    id: 'node-alibaba-4-1', companyId: 'co-alibaba', departmentId: 'dept-alibaba-4',
    title: '高德技术负责人', level: 'P9',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹高德地图技术研发，导航引擎、位置服务与出行生态',
  },
  {
    id: 'node-alibaba-4-2', companyId: 'co-alibaba', departmentId: 'dept-alibaba-4',
    title: '导航引擎架构师', level: 'P8',
    reportsTo: 'node-alibaba-4-1',
    status: 'gap',
    responsibilities: '负责高德导航核心引擎与实时路况算法',
  },
  {
    id: 'node-alibaba-4-3', companyId: 'co-alibaba', departmentId: 'dept-alibaba-4',
    title: '数据可视化前端专家', level: 'P7',
    reportsTo: 'node-alibaba-4-1',
    status: 'gap',
    responsibilities: '负责高德地图Web端与可视化平台前端研发',
  },

  // ==================== 腾讯 ====================
  {
    id: 'node-tencent-1-1', companyId: 'co-tencent', departmentId: 'dept-tencent-1',
    title: '微信技术负责人', level: 'T4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹微信后台架构，支撑十亿级用户消息与支付系统',
  },
  {
    id: 'node-tencent-1-2', companyId: 'co-tencent', departmentId: 'dept-tencent-1',
    title: '视频号技术总监', level: 'T3-3',
    reportsTo: 'node-tencent-1-1',
    status: 'gap',
    responsibilities: '负责视频号推荐算法与直播技术架构',
  },
  {
    id: 'node-tencent-1-3', companyId: 'co-tencent', departmentId: 'dept-tencent-1',
    title: '小程序平台架构师', level: 'T3-2',
    reportsTo: 'node-tencent-1-1',
    status: 'gap',
    responsibilities: '负责微信小程序运行时架构与开发者生态',
  },
  {
    id: 'node-tencent-1-4', companyId: 'co-tencent', departmentId: 'dept-tencent-1',
    title: '企业微信技术负责人', level: 'T3-3',
    reportsTo: 'node-tencent-1-1',
    status: 'gap',
    responsibilities: '统筹企业微信产品技术，连接微信生态与企业服务',
  },
  {
    id: 'node-tencent-1-5', companyId: 'co-tencent', departmentId: 'dept-tencent-1',
    title: '支付安全架构师', level: 'T3-2',
    reportsTo: 'node-tencent-1-1',
    status: 'gap',
    responsibilities: '负责微信支付安全体系与风控引擎',
  },

  {
    id: 'node-tencent-2-1', companyId: 'co-tencent', departmentId: 'dept-tencent-2',
    title: '天美工作室技术总监', level: 'T4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹天美游戏引擎、渲染技术与服务器架构',
  },
  {
    id: 'node-tencent-2-2', companyId: 'co-tencent', departmentId: 'dept-tencent-2',
    title: '游戏引擎开发专家', level: 'T3-2',
    reportsTo: 'node-tencent-2-1',
    status: 'gap',
    responsibilities: '负责自研游戏引擎底层渲染与物理系统研发',
  },
  {
    id: 'node-tencent-2-3', companyId: 'co-tencent', departmentId: 'dept-tencent-2',
    title: '游戏服务器架构师', level: 'T3-2',
    reportsTo: 'node-tencent-2-1',
    status: 'gap',
    responsibilities: '负责大规模游戏服务器架构与帧同步方案设计',
  },
  {
    id: 'node-tencent-2-4', companyId: 'co-tencent', departmentId: 'dept-tencent-2',
    title: 'AI游戏研究员', level: 'T3-1',
    reportsTo: 'node-tencent-2-1',
    status: 'gap',
    responsibilities: '负责游戏AI Bot与智能NPC行为模型研发',
  },

  {
    id: 'node-tencent-3-1', companyId: 'co-tencent', departmentId: 'dept-tencent-3',
    title: '腾讯云技术VP', level: 'T4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹腾讯云IaaS/PaaS产品线技术研发',
  },
  {
    id: 'node-tencent-3-2', companyId: 'co-tencent', departmentId: 'dept-tencent-3',
    title: '数据库产品架构师', level: 'T3-2',
    reportsTo: 'node-tencent-3-1',
    status: 'gap',
    responsibilities: '负责腾讯云数据库产品线技术规划与分布式数据库研发',
  },
  {
    id: 'node-tencent-3-3', companyId: 'co-tencent', departmentId: 'dept-tencent-3',
    title: '音视频技术专家', level: 'T3-2',
    reportsTo: 'node-tencent-3-1',
    status: 'gap',
    responsibilities: '负责腾讯云TRTC实时音视频引擎研发',
  },

  {
    id: 'node-tencent-4-1', companyId: 'co-tencent', departmentId: 'dept-tencent-4',
    title: 'AI Lab负责人', level: 'T4',
    reportsTo: null,
    status: 'gap',
    responsibilities: '统筹腾讯AI基础研究，NLP、CV、语音多方向前沿探索',
  },
  {
    id: 'node-tencent-4-2', companyId: 'co-tencent', departmentId: 'dept-tencent-4',
    title: '数据平台技术总监', level: 'T3-3',
    reportsTo: 'node-tencent-4-1',
    status: 'gap',
    responsibilities: '负责腾讯数据中台与实时计算平台建设',
  },
];