// 每个需求下关联的候选人（来源 / 标签 / 当前进度 / 下一步动作 / 简历详情）
export interface CandidateResume {
  id: number;
  name: string;
  gender: string;
  age: number;
  phone: string;
  email: string;
  position?: string;
  source: string;
  tags: string[];
  stage: string;
  stageCode?: 'pushed' | 'feedback' | 'interviewed' | 'offer' | 'rejected';
  nextAction?: string;
  owner?: string;
  appliedAt: string;
  education: string;
  experienceYears: string;
  summary: string;
  workHistory: Array<{ company: string; role: string; period: string; highlights: string[] }>;
  educationHistory: Array<{ school: string; degree: string; major: string; period: string }>;
  skills: string[];
  projects?: Array<{ name: string; role: string; desc: string }>;
  languages?: string[];
  certifications?: string[];
}

export const requisitionCandidates: Record<string, CandidateResume[]> = {
  'REQ-20260712-ABCDE123': [
    {
      id: 101, name: '林小雅', gender: '女', age: 26, phone: '139****5678', email: 'linxiaoya@example.com',
      source: '内部推荐', tags: ['SaaS', 'B端'],
      stage: '已面试', stageCode: 'interviewed', nextAction: '等待二面反馈', owner: '招聘专员01',
      appliedAt: '2026-07-14', education: '硕士 · 复旦大学', experienceYears: '3年',
      summary: '3 年 B 端产品经理经验，主导过 2 个中大型企业 SaaS 项目从 0 到 1，擅长需求分析与数据驱动决策。沟通能力突出，能快速理解业务场景并转化为产品方案。',
      workHistory: [
        { company: '某知名 SaaS 公司', role: '高级产品经理', period: '2023.03 - 至今', highlights: ['主导 CRM 系统重构，DAU 提升 40%', '设计数据看板功能，客户续费率提升 15%'] },
        { company: '某互联网科技公司', role: '产品经理', period: '2021.07 - 2023.02', highlights: ['负责 B 端项目管理工具，服务 200+ 企业客户', '主导用户权限系统升级，降低客服工单 30%'] },
      ],
      educationHistory: [
        { school: '复旦大学', degree: '硕士', major: '管理科学与工程', period: '2019.09 - 2021.06' },
        { school: '上海大学', degree: '本科', major: '信息管理与信息系统', period: '2015.09 - 2019.06' },
      ],
      skills: ['需求分析', '数据分析', 'Axure', 'SQL', '用户研究', '敏捷开发'],
      projects: [
        { name: '企业 CRM 系统重构', role: '产品负责人', desc: '带领 5 人团队完成 CRM 核心模块重构，重构后客户数据录入效率提升 60%。' },
      ],
      languages: ['普通话', '英语（CET-6）'],
    },
    {
      id: 102, name: '郑一鸣', gender: '男', age: 28, phone: '137****1234', email: 'zhengyiming@example.com',
      source: 'PDF导入', tags: ['数据产品', 'AI'],
      stage: '面试官反馈', stageCode: 'feedback', nextAction: '安排复试', owner: '招聘专员01',
      appliedAt: '2026-07-13', education: '硕士 · 浙江大学', experienceYears: '4年',
      summary: '4 年数据产品经验，精通数据建模与 AI 应用落地。曾主导数据中台建设，熟悉从数据采集到应用的全链路。',
      workHistory: [
        { company: '某 AI 独角兽公司', role: '数据产品经理', period: '2024.01 - 至今', highlights: ['主导企业知识库 AI 助手，日均调用量 50 万+', '搭建数据标注平台，标注效率提升 3 倍'] },
        { company: '某电商平台', role: '数据分析师 → 数据产品经理', period: '2021.06 - 2023.12', highlights: ['搭建用户增长分析体系，GMV 提升 20%', '设计推荐策略评估平台，A/B 测试效率提升 50%'] },
      ],
      educationHistory: [
        { school: '浙江大学', degree: '硕士', major: '计算机科学与技术', period: '2018.09 - 2021.06' },
        { school: '华中科技大学', degree: '本科', major: '软件工程', period: '2014.09 - 2018.06' },
      ],
      skills: ['Python', 'SQL', '机器学习', '数据可视化', 'Tableau', '产品思维'],
      certifications: ['PMP 项目管理', '阿里云大数据工程师'],
    },
    {
      id: 103, name: '许文', gender: '男', age: 27, phone: '135****9999', email: 'xuwen@example.com',
      source: '外部收录', tags: ['C端', '增长'],
      stage: '已推送简历', stageCode: 'pushed', nextAction: '等待用人部门反馈', owner: '招聘专员01',
      appliedAt: '2026-07-12', education: '本科 · 武汉大学', experienceYears: '4年',
      summary: '4 年 C 端产品经验，擅长用户增长和裂变玩法设计。曾负责千万级用户产品的增长策略，DAU 提升经验丰富。',
      workHistory: [
        { company: '某头部内容平台', role: '增长产品经理', period: '2023.05 - 至今', highlights: ['设计裂变拉新活动，单月新增 50 万用户', '优化留存策略，7 日留存率从 35% 提升至 48%'] },
        { company: '某社交 App 公司', role: '产品经理', period: '2021.07 - 2023.04', highlights: ['负责社区功能模块，月活提升 25%', '设计积分体系，用户粘性提升 20%'] },
      ],
      educationHistory: [
        { school: '武汉大学', degree: '本科', major: '市场营销', period: '2017.09 - 2021.06' },
      ],
      skills: ['用户增长', '裂变设计', 'A/B 测试', '数据分析', 'Axure', 'Figma'],
    },
    {
      id: 104, name: '高倩', gender: '女', age: 30, phone: '133****7777', email: 'gaoqian@example.com',
      source: '内部推荐', tags: ['B端', '策略'],
      stage: 'Offer', stageCode: 'offer', nextAction: '发送 Offer 审批', owner: '招聘专员01',
      appliedAt: '2026-07-10', education: '硕士 · 北京大学', experienceYears: '5年',
      summary: '5 年 B 端策略产品经验，擅长商业策略与定价体系设计。曾在多家头部企业服务 SaaS 公司任职，业绩突出。',
      workHistory: [
        { company: '某企业服务独角兽', role: '策略产品负责人', period: '2022.03 - 至今', highlights: ['设计定价策略体系，ARPU 提升 30%', '搭建客户分级运营体系，大客户续费率 95%'] },
        { company: '某云计算公司', role: '高级产品经理', period: '2019.07 - 2022.02', highlights: ['负责云资源计费系统，服务 1 万+ 企业', '设计资源优化建议功能，客户成本降低 20%'] },
      ],
      educationHistory: [
        { school: '北京大学', degree: '硕士', major: '工商管理', period: '2017.09 - 2019.06' },
        { school: '中国人民大学', degree: '本科', major: '经济学', period: '2013.09 - 2017.06' },
      ],
      skills: ['商业策略', '定价设计', '客户成功', '数据分析', 'B2B SaaS', 'CRM'],
      certifications: ['CPA 注册会计师'],
    },
    {
      id: 105, name: '范鹏', gender: '男', age: 32, phone: '131****5555', email: 'fanpeng@example.com',
      source: 'PDF导入', tags: ['SaaS'],
      stage: '已淘汰', stageCode: 'rejected', nextAction: '归档', owner: '招聘专员01',
      appliedAt: '2026-07-08', education: '本科 · 重庆大学', experienceYears: '8年',
      summary: '8 年产品经验，偏技术型产品经理，熟悉前后端技术栈。因期望薪资超出岗位预算被淘汰。',
      workHistory: [
        { company: '某金融科技公司', role: '技术产品经理', period: '2020.05 - 至今', highlights: ['主导核心交易系统重构', '技术方案评审通过率 100%'] },
        { company: '某硬件公司', role: '产品经理', period: '2016.07 - 2020.04', highlights: ['负责 IoT 管理平台'] },
      ],
      educationHistory: [
        { school: '重庆大学', degree: '本科', major: '软件工程', period: '2012.09 - 2016.06' },
      ],
      skills: ['技术架构', '产品设计', 'Java', 'Spring Boot', 'MySQL'],
    },
  ],
  'REQ-20260710-XYZ789': [
    {
      id: 201, name: '孙明', gender: '男', age: 31, phone: '132****9753', email: 'sunming@example.com',
      source: 'PDF导入', tags: ['React', 'Next.js'],
      stage: '已面试', stageCode: 'interviewed', nextAction: '安排终面', owner: '招聘专员02',
      appliedAt: '2026-07-16', education: '本科 · 华中科技大学', experienceYears: '6年',
      summary: '6 年前端开发经验，精通 React 生态，有大型项目架构设计经验。热爱技术，积极参与开源社区贡献。',
      workHistory: [
        { company: '某头部电商平台', role: '高级前端工程师', period: '2022.03 - 至今', highlights: ['主导核心交易链路前端重构，加载速度提升 50%', '搭建前端监控体系，线上故障定位时间缩短 80%'] },
        { company: '某在线教育公司', role: '前端工程师', period: '2019.07 - 2022.02', highlights: ['负责直播课堂系统前端，支持 10 万+ 并发', '推动前端工程化建设，构建效率提升 40%'] },
      ],
      educationHistory: [
        { school: '华中科技大学', degree: '本科', major: '计算机科学与技术', period: '2015.09 - 2019.06' },
      ],
      skills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Webpack', 'Docker'],
      projects: [
        { name: '电商核心交易链路重构', role: '前端技术负责人', desc: '负责订单、支付、物流全链路前端重构，采用 Next.js + SSR 方案，首屏时间从 3s 降至 1.2s。' },
      ],
      languages: ['普通话'],
    },
    {
      id: 202, name: '陈伟', gender: '男', age: 28, phone: '138****1234', email: 'chenwei@example.com',
      source: 'PDF导入', tags: ['React', 'TypeScript'],
      stage: '面试官反馈', stageCode: 'feedback', nextAction: '确认一面结果', owner: '招聘专员02',
      appliedAt: '2026-07-15', education: '本科 · 华东师范大学', experienceYears: '5年',
      summary: '5 年前端开发经验，专注于可视化与交互设计。有丰富的数据可视化大屏和低代码平台开发经验。',
      workHistory: [
        { company: '某数据可视化公司', role: '高级前端工程师', period: '2023.06 - 至今', highlights: ['主导数据可视化引擎开发，渲染性能提升 3 倍', '设计低代码表单引擎，配置效率提升 60%'] },
        { company: '某金融科技公司', role: '前端工程师', period: '2020.07 - 2023.05', highlights: ['负责风控数据大屏，支持实时数据 10 万+ 点位', '推动组件库建设，代码复用率提升 50%'] },
      ],
      educationHistory: [
        { school: '华东师范大学', degree: '本科', major: '软件工程', period: '2016.09 - 2020.06' },
      ],
      skills: ['React', 'Vue', 'TypeScript', 'D3.js', 'ECharts', 'Canvas'],
      projects: [
        { name: '实时风控数据大屏', role: '前端负责人', desc: '设计并实现支持 10 万+ 数据点位实时渲染的可视化大屏，采用 WebGL + Canvas 混合渲染方案。' },
      ],
    },
    {
      id: 203, name: '李娜', gender: '女', age: 26, phone: '136****3333', email: 'lina@example.com',
      source: '内部推荐', tags: ['Vue', '可视化'],
      stage: '已推送简历', stageCode: 'pushed', nextAction: '等待用人部门反馈', owner: '招聘专员02',
      appliedAt: '2026-07-14', education: '本科 · 电子科技大学', experienceYears: '3年',
      summary: '3 年前端开发经验，擅长 Vue 生态和可视化开发。有 BI 工具开发经验，熟悉数据图表渲染。',
      workHistory: [
        { company: '某 BI 工具公司', role: '前端工程师', period: '2024.02 - 至今', highlights: ['负责图表编辑器核心模块', '优化大数据量图表渲染，支持百万级数据'] },
        { company: '某 SaaS 公司', role: '前端工程师', period: '2022.07 - 2024.01', highlights: ['负责后台管理系统开发'] },
      ],
      educationHistory: [
        { school: '电子科技大学', degree: '本科', major: '计算机科学与技术', period: '2018.09 - 2022.06' },
      ],
      skills: ['Vue', 'TypeScript', 'ECharts', 'AntV', 'Vite'],
    },
    {
      id: 204, name: '黄涛', gender: '男', age: 30, phone: '134****8888', email: 'huangtao@example.com',
      source: '外部收录', tags: ['React', 'Node.js'],
      stage: 'Offer', stageCode: 'offer', nextAction: '跟进 Offer 接受', owner: '招聘专员02',
      appliedAt: '2026-07-11', education: '硕士 · 上海交通大学', experienceYears: '5年',
      summary: '5 年全栈开发经验，精通 React 前端 + Node.js 后端。有大型微服务架构经验，技术视野广。',
      workHistory: [
        { company: '某互联网大厂', role: '高级前端工程师', period: '2022.05 - 至今', highlights: ['主导微前端架构升级，团队效率提升 30%', '负责 BFF 层设计，接口响应时间降低 60%'] },
        { company: '某创业公司', role: '全栈工程师', period: '2019.07 - 2022.04', highlights: ['从 0 搭建技术栈，支撑 50 万用户', '全栈开发 MVP 产品，2 个月上线'] },
      ],
      educationHistory: [
        { school: '上海交通大学', degree: '硕士', major: '计算机科学与技术', period: '2017.09 - 2019.06' },
        { school: '四川大学', degree: '本科', major: '软件工程', period: '2013.09 - 2017.06' },
      ],
      skills: ['React', 'Next.js', 'Node.js', 'TypeScript', 'GraphQL', 'Docker', 'K8s'],
      certifications: ['AWS 云架构师助理级'],
    },
  ],
  'REQ-20260714-210F2DC0A0FB44C7': [
    {
      id: 301, name: '周建国', gender: '男', age: 35, phone: '139****6666', email: 'zhoujianguo@example.com',
      source: 'PDF导入', tags: ['Java', 'Spring'],
      stage: 'Offer', stageCode: 'offer', nextAction: '已入职，待关闭需求', owner: '招聘专员01',
      appliedAt: '2026-07-14', education: '本科 · 东北大学', experienceYears: '10年',
      summary: '10 年 Java 开发经验，精通分布式系统设计与微服务架构。曾在多家大型互联网公司任职，技术功底深厚。',
      workHistory: [
        { company: '某头部互联网公司', role: '技术专家', period: '2020.03 - 至今', highlights: ['主导分布式调度平台，日调度任务 1000 万+', '设计异地多活架构，可用性达到 99.99%'] },
        { company: '某金融科技公司', role: '高级 Java 工程师', period: '2016.07 - 2020.02', highlights: ['负责核心交易系统开发，日交易额 10 亿+', '设计消息中间件，延迟降低 80%'] },
      ],
      educationHistory: [
        { school: '东北大学', degree: '本科', major: '计算机科学与技术', period: '2010.09 - 2014.06' },
      ],
      skills: ['Java', 'Spring Boot', 'Spring Cloud', 'MySQL', 'Redis', 'Kafka', 'Docker'],
      certifications: ['阿里云高级架构师'],
    },
  ],
  'REQ-20260713-CDBBD95F': [
    {
      id: 401, name: '周杰', gender: '男', age: 27, phone: '134****2468', email: 'zhoujie@example.com',
      source: 'PDF导入', tags: ['自动化测试', 'Selenium'],
      stage: 'Offer', stageCode: 'offer', nextAction: '跟进 Offer 接受', owner: '招聘专员02',
      appliedAt: '2026-07-14', education: '本科 · 上海交通大学', experienceYears: '3年',
      summary: '3 年测试开发经验，擅长自动化测试体系建设。有 CI/CD 流水线测试经验，质量意识强。',
      workHistory: [
        { company: '某金融科技公司', role: '测试开发工程师', period: '2023.08 - 至今', highlights: ['搭建自动化测试平台，覆盖率从 40% 提升到 85%', '设计接口自动化框架，回归效率提升 70%'] },
        { company: '某电商公司', role: '测试工程师', period: '2021.07 - 2023.07', highlights: ['负责订单模块测试', '推动测试左移，缺陷发现率提升 30%'] },
      ],
      educationHistory: [
        { school: '上海交通大学', degree: '本科', major: '软件工程', period: '2017.09 - 2021.06' },
      ],
      skills: ['自动化测试', 'Selenium', 'Python', 'Jira', 'CI/CD', 'Jenkins'],
    },
  ],
  'REQ-20260708-FF123': [
    {
      id: 501, name: '赵晓月', gender: '女', age: 25, phone: '137****3456', email: 'zhaoxiaoyue@example.com',
      source: '内部推荐', tags: ['Figma', '设计系统'],
      stage: '已推送简历', stageCode: 'pushed', nextAction: '等待用人部门反馈', owner: '招聘专员01',
      appliedAt: '2026-07-10', education: '本科 · 中央美术学院', experienceYears: '2年',
      summary: '2 年 UI/UX 设计经验，擅长设计系统搭建和组件库设计。有从 0 到 1 设计系统经验，注重设计规范。',
      workHistory: [
        { company: '某设计咨询公司', role: 'UI/UX 设计师', period: '2024.03 - 至今', highlights: ['为 3 家客户搭建设计系统', '设计组件库 200+ 组件'] },
        { company: '某互联网公司', role: 'UI 设计师', period: '2023.07 - 2024.02', highlights: ['负责 App 改版设计'] },
      ],
      educationHistory: [
        { school: '中央美术学院', degree: '本科', major: '视觉传达设计', period: '2019.09 - 2023.06' },
      ],
      skills: ['Figma', 'Sketch', '设计系统', '交互设计', '原型设计', '用户研究'],
      projects: [
        { name: 'B 端产品 Design System', role: '设计负责人', desc: '从 0 搭建涵盖 200+ 组件的设计系统，覆盖色彩、字体、图标、组件、模式完整规范。' },
      ],
      languages: ['普通话'],
    },
    {
      id: 502, name: '钱多多', gender: '女', age: 28, phone: '135****2222', email: 'qianduoduo@example.com',
      source: 'PDF导入', tags: ['Sketch', '交互'],
      stage: '已推送简历', stageCode: 'pushed', nextAction: '等待用人部门反馈', owner: '招聘专员01',
      appliedAt: '2026-07-09', education: '本科 · 浙江大学', experienceYears: '4年',
      summary: '4 年 UI 设计经验，擅长移动端设计和交互设计。有多款 App 从 0 到 1 设计经验。',
      workHistory: [
        { company: '某社交 App 公司', role: '高级 UI 设计师', period: '2023.05 - 至今', highlights: ['负责核心社交功能设计，日活提升 15%', '设计新用户引导流程，转化率提升 25%'] },
        { company: '某工具类 App', role: 'UI 设计师', period: '2020.07 - 2023.04', highlights: ['负责全产品 UI 设计'] },
      ],
      educationHistory: [
        { school: '浙江大学', degree: '本科', major: '数字媒体艺术', period: '2016.09 - 2020.06' },
      ],
      skills: ['Sketch', 'Figma', 'After Effects', '交互设计', '动效设计', '用户研究'],
    },
  ],
  'REQ-20260705-DD456': [
    {
      id: 601, name: '刘强', gender: '男', age: 30, phone: '135****7890', email: 'liuqiang@example.com',
      source: '外部收录', tags: ['Python', 'SQL'],
      stage: '面试官反馈', stageCode: 'feedback', nextAction: '需求暂停，暂缓推进', owner: '系统管理员',
      appliedAt: '2026-07-13', education: '硕士 · 清华大学', experienceYears: '4年',
      summary: '4 年数据分析师经验，擅长业务数据分析和数据建模。有电商、金融多行业数据分析经验。',
      workHistory: [
        { company: '某电商平台', role: '高级数据分析师', period: '2023.02 - 至今', highlights: ['搭建用户增长分析体系，GMV 提升 20%', '设计推荐策略评估平台，A/B 测试效率提升 50%'] },
        { company: '某银行', role: '数据分析师', period: '2021.07 - 2023.01', highlights: ['负责信贷风控模型', '优化审批流程，通过率提升 10%'] },
      ],
      educationHistory: [
        { school: '清华大学', degree: '硕士', major: '统计学', period: '2019.09 - 2021.06' },
        { school: '中央财经大学', degree: '本科', major: '金融学', period: '2015.09 - 2019.06' },
      ],
      skills: ['Python', 'SQL', 'Tableau', '机器学习', '数据建模', '统计学'],
      certifications: ['CFA 一级'],
    },
  ],
};

export const stageCodeStyles: Record<string, string> = {
  pushed: 'bg-background-200 text-foreground-600',
  feedback: 'bg-accent-100 text-accent-700',
  interviewed: 'bg-primary-100 text-primary-700',
  offer: 'bg-primary-500 text-white',
  rejected: 'bg-background-200 text-foreground-400',
};
