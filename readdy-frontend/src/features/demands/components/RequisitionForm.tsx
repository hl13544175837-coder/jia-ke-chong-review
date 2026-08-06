import { useEffect, useMemo, useState } from 'react';
import { provinceCityData } from '@/mocks/options';
import type { ProductRole } from '@/auth/productRoleModel';
import { jobsApi } from '@/features/jobs/api';
import type { JobTemplateDetail, JobTemplateSummary } from '@/features/jobs/types';
import type {
  BusinessDemandInput,
  DemandOwnerOption,
  DemandPriority,
  RecruitmentDemandInput,
} from '@/features/demands/types';

/** 表单字段值；面试官重提需求时通过 initialValues 预填原需求字段 */
export interface RequisitionFormValues {
  /** 职位名称（recruiter 模式自由填写） */
  position: string;
  /** 岗位模板 id（interviewer 模式必选） */
  jobId: string;
  /** 用人部门 */
  department: string;
  /** 招聘省份（仅 recruiter 模式的省市区联动使用） */
  province?: string;
  /** 招聘城市 */
  city: string;
  headcount: number;
  /** 招聘负责人 id */
  owner: string;
  hiringManagerName: string;
  /** 需求起始日期 yyyy-MM-dd */
  startDate: string;
  /** 截止 / 期望到岗日期 yyyy-MM-dd */
  deadline: string;
  /** recruiter：urgent/high/normal/low；interviewer：A/B/C */
  priority: string;
  /** 岗位 JD（jd_text，必填可编辑） */
  description: string;
  /** 面试关注点（interviewer 模式，每行一项） */
  focusPoints: string;
  /** 补充备注（interviewer 模式） */
  note: string;
}

interface RequisitionFormProps {
  expanded: boolean;
  owners: DemandOwnerOption[];
  role?: ProductRole | null;
  submitting: boolean;
  serverErrors?: Record<string, string>;
  onSubmit: (payload: RecruitmentDemandInput) => void;
  /** 表单场景：recruiter=招聘专员创建（默认）；interviewer=面试官提交/重提需求 */
  mode?: 'recruiter' | 'interviewer';
  /** 提交按钮文案；默认按模式：创建需求 / 提交审核 */
  submitLabel?: string;
  /** 提交中按钮文案；默认按模式：正在创建... / 正在提交... */
  submittingLabel?: string;
  /** 预填值：面试官被拒需求重提时传入原需求字段 */
  initialValues?: Partial<RequisitionFormValues>;
  /** interviewer 模式：可选岗位模板列表（由页面加载后传入） */
  templates?: JobTemplateSummary[];
  /** 重提需求：锁定岗位模板 / 招聘负责人 / 优先级 */
  isResubmit?: boolean;
}

const recruiterPriorityOptions = [
  { value: 'urgent', label: '紧急', desc: '3 天内需启动，已有候选人或紧急替补' },
  { value: 'high', label: '高', desc: '一周内启动，业务影响较大' },
  { value: 'normal', label: '普通', desc: '正常排期招聘，按常规流程推进' },
  { value: 'low', label: '低', desc: '储备型岗位，无明确时间压力' },
];

const interviewerPriorityOptions = [
  { value: 'A', label: 'A 紧急', desc: '3 天内需启动，已有候选人或紧急替补' },
  { value: 'B', label: 'B 高', desc: '一周内启动，业务影响较大' },
  { value: 'C', label: 'C 普通', desc: '正常排期招聘，按常规流程推进' },
];

const jdTemplates: Record<string, string> = {
  tech: `【岗位职责】
1. 负责公司核心业务系统的后端/前端设计与开发；
2. 参与系统架构设计和技术选型，编写高质量、可维护的代码；
3. 与产品、测试团队紧密协作，推进需求落地与上线；
4. 对线上系统进行监控、优化和问题排查。

【任职要求】
1. 本科及以上学历，计算机相关专业；
2. 3 年以上相关开发经验，有大型项目经验优先；
3. 具备良好的沟通能力和团队协作精神；
4. 有较强的自驱力和学习能力。`,
  product: `【岗位职责】
1. 负责产品线的需求分析、功能规划和迭代管理；
2. 深入理解用户场景，输出高质量 PRD 和交互方案；
3. 协调研发、设计、运营等团队，推动产品按时高质量交付；
4. 通过数据分析和用户反馈持续优化产品体验。

【任职要求】
1. 本科及以上学历，3 年以上产品经理经验；
2. 有 B 端或 SaaS 产品经验优先；
3. 优秀的数据分析能力和逻辑思维；
4. 出色的跨团队沟通和项目推动能力。`,
  design: `【岗位职责】
1. 负责产品的 UI/UX 设计，输出高质量视觉稿和交互方案；
2. 参与设计规范制定，维护组件库和设计系统；
3. 与产品和研发紧密配合，确保设计落地质量；
4. 持续关注设计趋势，推动产品体验升级。

【任职要求】
1. 本科及以上学历，设计相关专业优先；
2. 3 年以上 UI/UX 设计经验，有成熟上线作品；
3. 熟练使用 Figma、Sketch 等设计工具；
4. 优秀的审美能力和用户体验思维。`,
};

function localDateInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      const text = record.label ?? record.name ?? record.title ?? record.skill ?? record.requirement;
      return typeof text === 'string' ? text.trim() : '';
    })
    .filter(Boolean);
}

function extractFocusPoints(structured: Record<string, unknown>): string[] {
  for (const key of ['focus_points', 'interview_focus', 'key_requirements', 'must_have', 'required_skills']) {
    const points = stringList(structured[key]);
    if (points.length > 0) return points;
  }

  const rawTags = structured.skill_tags_raw;
  if (typeof rawTags === 'string' && rawTags.trim()) {
    return rawTags.split('|').map((tag) => tag.split(',')[0].trim()).filter(Boolean);
  }
  return [];
}

function buildInitialFormData(
  mode: 'recruiter' | 'interviewer',
  owners: DemandOwnerOption[],
  role: ProductRole | null | undefined,
  initialValues?: Partial<RequisitionFormValues>,
) {
  const singleRecruiterOwner =
    mode === 'recruiter' && role === 'recruiter' && owners.length === 1
      ? String(owners[0].id)
      : '';
  return {
    position: initialValues?.position ?? '',
    jobId: initialValues?.jobId != null ? String(initialValues.jobId) : '',
    department: initialValues?.department ?? '',
    province: initialValues?.province ?? '',
    city: initialValues?.city ?? '',
    headcount: initialValues?.headcount ?? 1,
    owner: initialValues?.owner ?? singleRecruiterOwner,
    hiringManagerName: initialValues?.hiringManagerName ?? '',
    startDate: initialValues?.startDate ?? localDateInputValue(),
    deadline: initialValues?.deadline ?? '',
    priority: initialValues?.priority ?? (mode === 'interviewer' ? 'B' : 'normal'),
    description: initialValues?.description ?? '',
    focusPoints: initialValues?.focusPoints ?? '',
    note: initialValues?.note ?? '',
  };
}

export default function RequisitionForm({
  expanded,
  owners,
  role,
  submitting,
  serverErrors = {},
  onSubmit,
  mode = 'recruiter',
  submitLabel,
  submittingLabel,
  initialValues,
  templates = [],
  isResubmit = false,
}: RequisitionFormProps) {
  const [formData, setFormData] = useState(() => buildInitialFormData(mode, owners, role, initialValues));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [jdTemplate, setJdTemplate] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplateDetail | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'recruiter' || role !== 'recruiter' || owners.length !== 1) return;
    const ownerId = String(owners[0].id);
    setFormData((current) => (current.owner === ownerId ? current : { ...current, owner: ownerId }));
  }, [mode, owners, role]);

  const cities = useMemo(() => {
    if (!formData.province) return [];
    const province = provinceCityData.find((p) => p.name === formData.province);
    return province ? province.cities : [];
  }, [formData.province]);

  /** interviewer 重提时若原模板/负责人已停用，补一个只读回显项，避免下拉框空白 */
  const templateOptions = useMemo<JobTemplateSummary[]>(() => {
    if (!isResubmit || !initialValues?.jobId) return templates;
    if (templates.some((template) => String(template.id) === String(initialValues.jobId))) return templates;
    return [
      {
        id: Number(initialValues.jobId),
        title: initialValues.position || `模板 #${initialValues.jobId}`,
        department: initialValues.department || '',
        city: initialValues.city || '',
        job_code: '',
        status: 'active',
        created_at: '',
      },
      ...templates,
    ];
  }, [initialValues, isResubmit, templates]);

  const ownerOptions = useMemo<DemandOwnerOption[]>(() => {
    if (!isResubmit || !initialValues?.owner) return owners;
    if (owners.some((owner) => String(owner.id) === String(initialValues.owner))) return owners;
    return [
      ...owners,
      { id: Number(initialValues.owner), name: `原招聘专员 #${initialValues.owner}`, email: '' },
    ];
  }, [initialValues, isResubmit, owners]);

  const templateInfo = useMemo(() => {
    if (mode !== 'interviewer') return null;
    const summary = templateOptions.find((template) => String(template.id) === formData.jobId);
    if (isResubmit || !summary) return summary ?? null;
    return selectedTemplate ?? summary;
  }, [formData.jobId, isResubmit, mode, selectedTemplate, templateOptions]);

  if (!expanded) return null;

  const loadTemplate = async (jobId: number) => {
    setTemplateLoading(true);
    try {
      const detail = await jobsApi.getTemplate(jobId);
      setSelectedTemplate(detail);
      setFormData((current) => ({
        ...current,
        jobId: String(detail.id),
        department: detail.department || current.department || '',
        city: detail.city || current.city || '',
        description: detail.jd_text,
        focusPoints: extractFocusPoints(detail.structured).join('\n'),
      }));
    } catch (error) {
      setSelectedTemplate(null);
      setLocalErrors((current) => ({
        ...current,
        job_id: error instanceof Error ? error.message : '岗位模板加载失败',
      }));
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleJdTemplateChange = (template: string) => {
    if (template) {
      setFormData({ ...formData, description: jdTemplates[template] || '' });
      setJdTemplate(template);
    } else {
      setFormData({ ...formData, description: '' });
      setJdTemplate('');
    }
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (mode === 'interviewer') {
      if (!formData.jobId) errors.job_id = '请选择岗位模板';
      if (!isResubmit && !formData.owner) errors.owner_hr_id = '请选择招聘负责人';
      if (!formData.department.trim()) errors.requester_department = '请填写用人部门';
      if (!formData.city.trim()) errors.city = '请填写招聘城市';
      if (!formData.hiringManagerName.trim()) errors.hiring_manager_name = '请填写用人负责人';
      if (!formData.startDate) errors.requested_at = '请选择需求日期';
      if (!formData.deadline) errors.target_date = '请选择期望到岗日期';
      else if (formData.startDate && formData.deadline < formData.startDate) errors.target_date = '期望到岗日期不能早于需求日期';
      if (!Number.isInteger(formData.headcount) || formData.headcount < 1) errors.headcount = 'HC 必须大于 0';
      if (!formData.description.trim()) errors.jd_text = '所选模板缺少完整 JD';
    } else {
      if (!formData.owner) errors.owner_hr_id = '请选择招聘负责人';
      if (!formData.hiringManagerName.trim()) errors.hiring_manager_name = '请填写用人负责人';
    }
    return errors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || templateLoading) return;
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }
    setLocalErrors({});

    if (mode === 'interviewer') {
      const payload: BusinessDemandInput = {
        job_id: Number(formData.jobId),
        jd_text: formData.description.trim(),
        owner_hr_id: Number(formData.owner),
        city: formData.city.trim(),
        requester_department: formData.department.trim(),
        hiring_manager_name: formData.hiringManagerName.trim(),
        requested_at: formData.startDate,
        target_date: formData.deadline,
        priority: formData.priority as DemandPriority,
        headcount: formData.headcount,
        status: 'pending',
        note: formData.note.trim(),
        focus_points: formData.focusPoints.split('\n').map((item) => item.trim()).filter(Boolean),
      };
      onSubmit(payload);
      return;
    }

    const priorityMap = { urgent: 'A', high: 'A', normal: 'B', low: 'C' } as const;
    onSubmit({
      job_title: formData.position.trim(),
      jd_text: formData.description.trim(),
      owner_hr_id: Number(formData.owner),
      city: formData.city.trim(),
      requester_department: formData.department.trim(),
      hiring_manager_name: formData.hiringManagerName.trim(),
      requested_at: formData.startDate,
      target_date: formData.deadline,
      priority: priorityMap[formData.priority as keyof typeof priorityMap],
      headcount: formData.headcount,
      status: 'active',
    });
  };

  const resetForm = () => {
    setFormData(buildInitialFormData(mode, owners, role, initialValues));
    setJdTemplate('');
    setSelectedTemplate(null);
    setLocalErrors({});
  };

  const today = localDateInputValue();
  const fieldError = (field: string) => serverErrors[field] || localErrors[field];
  const priorityOptions = mode === 'interviewer' ? interviewerPriorityOptions : recruiterPriorityOptions;
  const ownerRequired = mode === 'recruiter' || !isResubmit;
  const submitDisabled = submitting || templateLoading || (ownerRequired && owners.length === 0);
  // 岗位模板 JD 来自公司公共模板（后端 db.Text 无长度限制），面试官模式放宽上限避免截断
  const jdMaxLength = mode === 'interviewer' ? 10000 : 800;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row 1: 基本信息 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
          <i className="ri-information-line text-base text-foreground-500"></i>
          基本信息
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mode === 'interviewer' ? (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                岗位模板 <span className="text-red-400">*</span>
              </label>
              <select
                required
                disabled={isResubmit || templateLoading}
                value={formData.jobId}
                onChange={(event) => {
                  const value = event.target.value;
                  setFormData((current) => ({ ...current, jobId: value }));
                  setLocalErrors((current) => ({ ...current, job_id: '' }));
                  if (value) void loadTemplate(Number(value));
                  else setSelectedTemplate(null);
                }}
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">请选择岗位模板</option>
                {templateOptions.map((template) => (
                  <option key={template.id} value={template.id}>{template.title}</option>
                ))}
              </select>
              {fieldError('job_id') && <p className="mt-1 text-xs text-red-500">{fieldError('job_id')}</p>}
              {templateInfo && (
                <p className="mt-1 text-xs text-foreground-400">
                  模板：{templateInfo.title} · {templateInfo.department || '未设置部门'} · {templateInfo.city || '未设置城市'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                职位名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="如：Java 开发工程师"
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all placeholder:text-foreground-400"
              />
            </div>
          )}
          {mode === 'interviewer' ? (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                用人部门 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.department}
                onChange={(e) => {
                  setFormData({ ...formData, department: e.target.value });
                  setLocalErrors((current) => ({ ...current, requester_department: '' }));
                }}
                placeholder="如：销售部"
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
              />
              {fieldError('requester_department') && <p className="mt-1 text-xs text-red-500">{fieldError('requester_department')}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                所属部门 <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer"
              >
                <option value="">请选择部门</option>
                <option value="技术研发部">技术研发部</option>
                <option value="产品部">产品部</option>
                <option value="设计部">设计部</option>
                <option value="数据部">数据部</option>
                <option value="市场部">市场部</option>
                <option value="人力资源部">人力资源部</option>
              </select>
            </div>
          )}
          {mode === 'interviewer' ? (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                招聘城市 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => {
                  setFormData({ ...formData, city: e.target.value });
                  setLocalErrors((current) => ({ ...current, city: '' }));
                }}
                placeholder="如：上海"
                className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
              />
              {fieldError('city') && <p className="mt-1 text-xs text-red-500">{fieldError('city')}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                招聘城市 <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value, city: '' })}
                  className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer"
                >
                  <option value="">选择省份</option>
                  {provinceCityData.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                <select
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  disabled={!formData.province}
                  className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">选择城市</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              HC 人数 <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              required
              value={formData.headcount}
              onChange={(e) => {
                setFormData({ ...formData, headcount: parseInt(e.target.value) || 1 });
                setLocalErrors((current) => ({ ...current, headcount: '' }));
              }}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
            {mode === 'interviewer' && fieldError('headcount') && <p className="mt-1 text-xs text-red-500">{fieldError('headcount')}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              招聘负责人 <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={formData.owner}
              onChange={(e) => {
                setFormData({ ...formData, owner: e.target.value });
                setLocalErrors((current) => ({ ...current, owner_hr_id: '' }));
              }}
              disabled={submitting || (mode === 'interviewer' && isResubmit)}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">请选择</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.name}</option>
              ))}
            </select>
            {fieldError('owner_hr_id') && <p className="mt-1 text-xs text-red-500">{fieldError('owner_hr_id')}</p>}
            {!fieldError('owner_hr_id') && owners.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">暂无可选招聘专员，请管理员先启用招聘专员账号。</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              用人负责人 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.hiringManagerName}
              onChange={(e) => {
                setFormData({ ...formData, hiringManagerName: e.target.value });
                setLocalErrors((current) => ({ ...current, hiring_manager_name: '' }));
              }}
              placeholder="如：技术部负责人"
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300"
            />
            {fieldError('hiring_manager_name') && <p className="mt-1 text-xs text-red-500">{fieldError('hiring_manager_name')}</p>}
          </div>
        </div>
      </div>

      {/* Row 2: 招聘时间 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
          <i className="ri-calendar-line text-base text-foreground-500"></i>
          招聘周期
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              {mode === 'interviewer' ? '需求日期' : '招聘起始日期'} <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              required
              min={mode === 'recruiter' ? today : undefined}
              value={formData.startDate}
              onChange={(e) => {
                setFormData({ ...formData, startDate: e.target.value });
                setLocalErrors((current) => ({ ...current, requested_at: '' }));
              }}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all cursor-pointer"
            />
            {mode === 'interviewer' && fieldError('requested_at') && <p className="mt-1 text-xs text-red-500">{fieldError('requested_at')}</p>}
            {mode === 'recruiter' && <p className="text-xs text-foreground-400 mt-1">用人单位提出需求的起始时间</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              {mode === 'interviewer' ? '期望到岗日期' : '截止日期'} <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              required
              min={formData.startDate || (mode === 'recruiter' ? today : undefined)}
              value={formData.deadline}
              onChange={(e) => {
                setFormData({ ...formData, deadline: e.target.value });
                setLocalErrors((current) => ({ ...current, target_date: '' }));
              }}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all cursor-pointer"
            />
            {mode === 'interviewer' && fieldError('target_date') && <p className="mt-1 text-xs text-red-500">{fieldError('target_date')}</p>}
            {mode === 'recruiter' && <p className="text-xs text-foreground-400 mt-1">预期到岗的最晚时间</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              {mode === 'interviewer' ? '优先级' : '紧急程度'} <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              disabled={mode === 'interviewer' && isResubmit}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {priorityOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <p className="text-xs text-foreground-400 mt-1">
              {priorityOptions.find((p) => p.value === formData.priority)?.desc}
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: 岗位 JD */}
      <div>
        <h4 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
          <i className="ri-file-text-line text-base text-foreground-500"></i>
          岗位 JD
        </h4>
        {mode === 'recruiter' ? (
          <div className="mb-3">
            <label className="block text-sm font-medium text-foreground-700 mb-2">快速套用 JD 模板</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleJdTemplateChange('')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  jdTemplate === ''
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-background-200 text-foreground-600 hover:bg-background-50'
                }`}
              >
                空白自定义
              </button>
              <button
                type="button"
                onClick={() => handleJdTemplateChange('tech')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  jdTemplate === 'tech'
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-background-200 text-foreground-600 hover:bg-background-50'
                }`}
              >
                技术岗模板
              </button>
              <button
                type="button"
                onClick={() => handleJdTemplateChange('product')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  jdTemplate === 'product'
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-background-200 text-foreground-600 hover:bg-background-50'
                }`}
              >
                产品岗模板
              </button>
              <button
                type="button"
                onClick={() => handleJdTemplateChange('design')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  jdTemplate === 'design'
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-background-200 text-foreground-600 hover:bg-background-50'
                }`}
              >
                设计岗模板
              </button>
            </div>
          </div>
        ) : (
          <p className="mb-3 text-xs text-foreground-400">JD 内容随所选岗位模板自动带入，可在此基础上修改；修改仅作用于本次需求，不影响公共岗位模板。</p>
        )}
        <div className={mode === 'interviewer' ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : ''}>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              岗位描述 <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={mode === 'interviewer' && templateLoading ? '正在加载岗位模板...' : formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value });
                setJdTemplate('');
                setLocalErrors((current) => ({ ...current, jd_text: '' }));
              }}
              placeholder="请描述该岗位的职责、任职要求、加分项等。也可以先选择一个 JD 模板再修改..."
              rows={8}
              maxLength={jdMaxLength}
              className="w-full px-3.5 py-3 bg-background-50 border border-background-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all resize-none placeholder:text-foreground-400 font-mono text-xs"
            />
            <p className="text-xs text-foreground-400 mt-1 text-right">{formData.description.length}/{jdMaxLength}</p>
            {mode === 'interviewer' && fieldError('jd_text') && <p className="mt-1 text-xs text-red-500">{fieldError('jd_text')}</p>}
          </div>
          {mode === 'interviewer' && (
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">面试关注点</label>
              <textarea
                rows={8}
                value={formData.focusPoints}
                onChange={(e) => setFormData({ ...formData, focusPoints: e.target.value })}
                placeholder="每行一项"
                className="w-full px-3.5 py-3 bg-background-50 border border-background-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all resize-none placeholder:text-foreground-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* 补充说明（interviewer 模式） */}
      {mode === 'interviewer' && (
        <div>
          <h4 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
            <i className="ri-sticky-note-line text-base text-foreground-500"></i>
            补充说明
          </h4>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">补充备注</label>
            <textarea
              rows={4}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="补充说明本次招聘的特殊要求等（可选）"
              className="w-full px-3.5 py-3 bg-background-50 border border-background-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all resize-none placeholder:text-foreground-400"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {mode === 'recruiter' && Object.keys(localErrors).length > 0 && (
        <p className="text-sm text-red-500" role="alert">{Object.values(localErrors)[0]}</p>
      )}
      {Object.keys(serverErrors).length > 0 && (
        <p className="text-sm text-red-500" role="alert">请检查标红或提示的需求信息后重试。</p>
      )}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-background-100">
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          重置表单
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? (submittingLabel ?? (mode === 'interviewer' ? '正在提交...' : '正在创建...'))
            : (submitLabel ?? (mode === 'interviewer' ? '提交审核' : '创建需求'))}
        </button>
      </div>
    </form>
  );
}
