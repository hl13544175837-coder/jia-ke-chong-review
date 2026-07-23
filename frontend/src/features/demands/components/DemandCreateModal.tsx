import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Briefcase, CalendarDays, FileText, Info, X } from 'lucide-react';
import { Button, ErrorState, Spinner } from '../../../components/ui';
import type {
  CandidateOwnerOption,
  DemandPriority,
  InterviewerOption,
  RecruitmentDemandInput,
  Role,
} from '../../../types';

interface DemandCreateModalProps {
  open: boolean;
  owners: CandidateOwnerOption[];
  role: Role | null;
  currentUserId: number | null;
  currentUserName: string | null;
  interviewers: InterviewerOption[];
  loadingOptions: boolean;
  optionError?: string | null;
  onReloadOptions: () => void;
  busy: boolean;
  serverErrors?: Record<string, string>;
  message?: string | null;
  onFieldChange?: (field: string) => void;
  onClose: () => void;
  onSubmit: (payload: RecruitmentDemandInput) => void;
}

interface FormState {
  job_title: string;
  department: string;
  province: string;
  city: string;
  headcount: string;
  owner_hr_id: string;
  default_interviewer_id: string;
  requested_at: string;
  target_date: string;
  priority: DemandPriority;
  jd_text: string;
  note: string;
}

const DEPARTMENTS = ['技术研发部', '市场部', '人力资源部', '设计部', '产品部'];
const PROVINCES = ['浙江', '上海', '广东', '北京', '江苏', '四川'];
const CITY_OPTIONS: Record<string, string[]> = {
  浙江: ['杭州', '宁波'],
  上海: ['上海'],
  广东: ['深圳', '广州'],
  北京: ['北京'],
  江苏: ['南京', '苏州'],
  四川: ['成都'],
};

const JD_TEMPLATES: Record<string, string> = {
  blank: '',
  tech: '岗位职责：\n1. 负责核心业务系统的设计、开发与维护。\n2. 与产品、测试和业务团队协作，推动需求高质量交付。\n\n任职要求：\n1. 熟悉主流技术栈，有扎实的工程实践能力。\n2. 具备良好的问题拆解、沟通协作和持续学习能力。',
  product: '岗位职责：\n1. 负责产品需求调研、方案设计和上线跟进。\n2. 结合业务目标推动产品体验与转化效率提升。\n\n任职要求：\n1. 有完整产品项目经验，能独立输出 PRD 和原型。\n2. 对数据敏感，沟通推动能力强。',
  design: '岗位职责：\n1. 负责核心产品的界面设计、交互细节和体验规范。\n2. 与产品和研发协作，推动方案落地。\n\n任职要求：\n1. 有成熟的 B 端或工具类产品设计经验。\n2. 重视细节，有完整作品集和清晰表达能力。',
};

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function RequiredMark() {
  return <span className="ml-1 text-[#ff7f50]" aria-hidden="true">*</span>;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-[#303133]">
      {children}
      <RequiredMark />
    </span>
  );
}

export function DemandCreateModal({
  open,
  owners,
  role,
  currentUserId,
  currentUserName,
  interviewers,
  loadingOptions,
  optionError,
  busy,
  serverErrors = {},
  message,
  onFieldChange,
  onReloadOptions,
  onClose,
  onSubmit,
}: DemandCreateModalProps) {
  const ownerOptions = useMemo(() => {
    if (role === 'recruiter' && currentUserId) {
      return [{ id: currentUserId, name: currentUserName || '当前招聘专员', email: '' }];
    }
    return owners;
  }, [currentUserId, currentUserName, owners, role]);

  const [form, setForm] = useState<FormState>({
    job_title: '',
    department: '',
    province: '浙江',
    city: '杭州',
    headcount: '1',
    owner_hr_id: role === 'recruiter' && currentUserId ? String(currentUserId) : '',
    default_interviewer_id: '',
    requested_at: localDate(),
    target_date: localDate(30),
    priority: 'B',
    jd_text: '',
    note: '',
  });
  const [templateKey, setTemplateKey] = useState('blank');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (role === 'recruiter' && currentUserId) {
      setForm((current) => ({ ...current, owner_hr_id: String(currentUserId) }));
    }
  }, [currentUserId, role]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const error = (field: string) => localErrors[field] || serverErrors[field];

  function patch<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => {
      if (field === 'province') {
        const nextCities = CITY_OPTIONS[String(value)] ?? [];
        return { ...current, province: value, city: nextCities[0] ?? '' };
      }
      return { ...current, [field]: value };
    });
    onFieldChange?.(String(field));
    setLocalErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function applyTemplate(key: string) {
    setTemplateKey(key);
    patch('jd_text', JD_TEMPLATES[key] ?? '');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.job_title.trim()) errors.job_title = '请填写职位名称';
    if (!form.department.trim()) errors.requester_department = '请选择所属部门';
    if (!form.city.trim()) errors.city = '请选择招聘城市';
    if (!form.owner_hr_id) errors.owner_hr_id = '请选择招聘负责人';
    if (!form.headcount || Number(form.headcount) <= 0) errors.headcount = 'HC 必须大于 0';
    if (!form.requested_at) errors.requested_at = '请选择招聘起始日期';
    if (!form.target_date) errors.target_date = '请选择截止日期';
    if (!form.jd_text.trim()) errors.jd_text = '请填写岗位 JD';
    if (form.requested_at && form.target_date && form.target_date < form.requested_at) {
      errors.target_date = '截止日期不能早于起始日期';
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSubmit({
      job_title: form.job_title.trim(),
      jd_text: form.jd_text.trim(),
      owner_hr_id: Number(form.owner_hr_id),
      default_interviewer_id: form.default_interviewer_id ? Number(form.default_interviewer_id) : null,
      city: form.city.trim(),
      requester_department: form.department.trim(),
      hiring_manager_name: form.department.trim(),
      requester_name: '',
      requested_at: form.requested_at,
      target_date: form.target_date,
      priority: form.priority,
      headcount: Number(form.headcount),
      status: 'active',
      note: form.note.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/35 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="create-demand-title">
      <div className="mx-auto flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#eef0f2] px-8 py-6">
          <div>
            <h2 id="create-demand-title" className="text-2xl font-bold text-[#171a1f]">创建招聘需求</h2>
            <p className="mt-2 text-sm text-[#8a8f98]">填写岗位信息、JD 描述和招聘周期，完成后提交进入需求列表。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#7c8087] hover:bg-[#f4f5f6] hover:text-[#202328]"
            aria-label="关闭创建招聘需求弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-8 py-7">
          {loadingOptions ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
              <Spinner size="sm" />
              正在加载负责人和面试官…
            </div>
          ) : optionError ? (
            <ErrorState message={optionError} onRetry={onReloadOptions} />
          ) : (
            <form className="space-y-7" onSubmit={submit} noValidate>
              <section>
                <div className="mb-5 flex items-center gap-2 text-base font-bold text-[#303133]">
                  <Info className="h-5 w-5 text-[#7c8087]" />
                  基本信息
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                  <label className="block">
                    <FieldLabel>职位名称</FieldLabel>
                    <input
                      value={form.job_title}
                      onChange={(event) => patch('job_title', event.target.value)}
                      placeholder="如：Java 开发工程师"
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
                    />
                    {error('job_title') && <p className="mt-1 text-xs text-danger-600">{error('job_title')}</p>}
                  </label>
                  <label className="block">
                    <FieldLabel>所属部门</FieldLabel>
                    <select
                      value={form.department}
                      onChange={(event) => patch('department', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    >
                      <option value="">请选择部门</option>
                      {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                    {error('requester_department') && <p className="mt-1 text-xs text-danger-600">{error('requester_department')}</p>}
                  </label>
                  <div className="block">
                    <FieldLabel>招聘城市</FieldLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={form.province}
                        onChange={(event) => patch('province', event.target.value)}
                        className="h-12 rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                      >
                        {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                      </select>
                      <select
                        value={form.city}
                        onChange={(event) => patch('city', event.target.value)}
                        className="h-12 rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                      >
                        {(CITY_OPTIONS[form.province] ?? []).map((city) => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                    {error('city') && <p className="mt-1 text-xs text-danger-600">{error('city')}</p>}
                  </div>
                  <label className="block">
                    <FieldLabel>HC 人数</FieldLabel>
                    <input
                      type="number"
                      min={1}
                      value={form.headcount}
                      onChange={(event) => patch('headcount', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    />
                    {error('headcount') && <p className="mt-1 text-xs text-danger-600">{error('headcount')}</p>}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#303133]">招聘负责人</span>
                    <select
                      disabled={role === 'recruiter'}
                      value={form.owner_hr_id}
                      onChange={(event) => patch('owner_hr_id', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474] disabled:bg-[#f7f8f9]"
                    >
                      <option value="">请选择</option>
                      {ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                    </select>
                    {error('owner_hr_id') && <p className="mt-1 text-xs text-danger-600">{error('owner_hr_id')}</p>}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#303133]">默认面试官</span>
                    <select
                      value={form.default_interviewer_id}
                      onChange={(event) => patch('default_interviewer_id', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    >
                      <option value="">请选择</option>
                      {interviewers.map((interviewer) => <option key={interviewer.id} value={interviewer.id}>{interviewer.name}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-5 flex items-center gap-2 text-base font-bold text-[#303133]">
                  <CalendarDays className="h-5 w-5 text-[#7c8087]" />
                  招聘周期
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                  <label className="block">
                    <FieldLabel>招聘起始日期</FieldLabel>
                    <input
                      type="date"
                      value={form.requested_at}
                      onChange={(event) => patch('requested_at', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    />
                    {error('requested_at') && <p className="mt-1 text-xs text-danger-600">{error('requested_at')}</p>}
                  </label>
                  <label className="block">
                    <FieldLabel>截止日期</FieldLabel>
                    <input
                      type="date"
                      value={form.target_date}
                      onChange={(event) => patch('target_date', event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    />
                    {error('target_date') && <p className="mt-1 text-xs text-danger-600">{error('target_date')}</p>}
                  </label>
                  <label className="block">
                    <FieldLabel>紧急程度</FieldLabel>
                    <select
                      value={form.priority}
                      onChange={(event) => patch('priority', event.target.value as DemandPriority)}
                      className="h-12 w-full rounded-lg border border-[#edf0f2] bg-white px-4 text-sm outline-none focus:border-[#33a474]"
                    >
                      <option value="B">普通</option>
                      <option value="A">高</option>
                      <option value="C">低</option>
                    </select>
                    <p className="mt-2 text-xs text-[#9da2aa]">正常排期招聘，按常规流程推进</p>
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-5 flex items-center gap-2 text-base font-bold text-[#303133]">
                  <FileText className="h-5 w-5 text-[#7c8087]" />
                  岗位 JD
                </div>
                <div className="mb-4">
                  <p className="mb-3 text-sm font-semibold text-[#303133]">快速套用 JD 模板</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['blank', '空白自定义'],
                      ['tech', '技术岗模板'],
                      ['product', '产品岗模板'],
                      ['design', '设计岗模板'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyTemplate(key)}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                          templateKey === key
                            ? 'border-[#33a474] bg-[#e9f7f1] text-[#1d8d61]'
                            : 'border-[#edf0f2] bg-white text-[#5f646d] hover:border-[#cfd6dc]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <FieldLabel>岗位描述</FieldLabel>
                  <textarea
                    value={form.jd_text}
                    onChange={(event) => patch('jd_text', event.target.value)}
                    placeholder="请描述该岗位的职责、任职要求、加分项等。也可以先选择一个 JD 模板再修改..."
                    className="min-h-[220px] w-full rounded-xl border border-[#edf0f2] bg-white px-5 py-4 text-sm leading-6 outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
                  />
                  {error('jd_text') && <p className="mt-1 text-xs text-danger-600">{error('jd_text')}</p>}
                </label>
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-semibold text-[#303133]">补充说明</span>
                  <textarea
                    value={form.note}
                    onChange={(event) => patch('note', event.target.value)}
                    placeholder="记录协作约定、业务背景或特殊要求"
                    className="min-h-[80px] w-full rounded-xl border border-[#edf0f2] bg-white px-5 py-3 text-sm outline-none focus:border-[#33a474]"
                  />
                </label>
              </section>

              {message && <p className="text-sm text-danger-600">{message}</p>}

              <div className="sticky bottom-0 -mx-8 flex items-center justify-end gap-3 border-t border-[#eef0f2] bg-white px-8 py-5">
                <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
                <Button type="submit" loading={busy} disabled={busy || ownerOptions.length === 0}>
                  <Briefcase className="h-4 w-4" />
                  提交招聘需求
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
