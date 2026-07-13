import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { SearchableInterviewerField } from '../../../components/interviewRecords/SearchableInterviewerField';
import { Button, Input } from '../../../components/ui';
import type {
  CandidateOwnerOption,
  DemandPriority,
  InterviewerOption,
  JobListItem,
  RecruitmentDemandInput,
  Role,
} from '../../../types';

interface DemandFormProps {
  jobs: JobListItem[];
  owners: CandidateOwnerOption[];
  role: Role | null;
  currentUserId: number | null;
  currentUserName: string | null;
  interviewers: InterviewerOption[];
  interviewersLoading?: boolean;
  interviewersError?: string | null;
  onReloadInterviewers?: () => void;
  onFieldChange?: (field: string) => void;
  busy: boolean;
  serverErrors?: Record<string, string>;
  onSubmit: (payload: RecruitmentDemandInput) => void;
}

interface FormState {
  job_id: string;
  owner_hr_id: string;
  default_interviewer_id: number | null;
  request_no: string;
  requester_name: string;
  requester_department: string;
  city: string;
  hiring_manager_name: string;
  requested_at: string;
  accepted_at: string;
  target_date: string;
  priority: DemandPriority;
  headcount: string;
  note: string;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      <span className="ml-1 text-danger-600" aria-hidden="true">*</span>
    </span>
  );
}

function jobLabel(job: JobListItem) {
  return [job.title, job.city, job.department, job.job_code].filter(Boolean).join(' · ');
}

export function DemandForm({
  jobs,
  owners,
  role,
  currentUserId,
  currentUserName,
  interviewers,
  interviewersLoading = false,
  interviewersError = null,
  onReloadInterviewers,
  onFieldChange,
  busy,
  serverErrors = {},
  onSubmit,
}: DemandFormProps) {
  const ownerOptions = useMemo(() => {
    if (role === 'recruiter' && currentUserId) {
      return [{ id: currentUserId, name: currentUserName || '当前招聘专员', email: '' }];
    }
    return owners;
  }, [currentUserId, currentUserName, owners, role]);

  const [form, setForm] = useState<FormState>(() => ({
    job_id: '',
    owner_hr_id: role === 'recruiter' && currentUserId ? String(currentUserId) : '',
    default_interviewer_id: null,
    request_no: '',
    requester_name: '',
    requester_department: '',
    city: '',
    hiring_manager_name: '',
    requested_at: localDateInputValue(),
    accepted_at: '',
    target_date: '',
    priority: 'B',
    headcount: '1',
    note: '',
  }));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (role === 'recruiter' && currentUserId) {
      setForm((current) => ({ ...current, owner_hr_id: String(currentUserId) }));
    }
  }, [currentUserId, role]);

  useEffect(() => {
    if (interviewersLoading || interviewersError || form.default_interviewer_id === null) return;
    const selectedIsAvailable = interviewers.some(
      (interviewer) => interviewer.id === form.default_interviewer_id,
    );
    if (!selectedIsAvailable) {
      setForm((current) => ({ ...current, default_interviewer_id: null }));
      onFieldChange?.('default_interviewer_id');
    }
  }, [form.default_interviewer_id, interviewers, interviewersError, interviewersLoading, onFieldChange]);

  function patch<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    onFieldChange?.(String(field));
    setLocalErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function selectJob(value: string) {
    const selected = jobs.find((job) => String(job.id) === value);
    const changedFields: Array<keyof FormState> = [
      'job_id',
      'city',
      'requester_department',
    ];
    setForm((current) => ({
      ...current,
      job_id: value,
      city: selected?.city || '',
      requester_department: selected?.department || '',
    }));
    changedFields.forEach((field) => onFieldChange?.(String(field)));
    setLocalErrors((current) => {
      if (!changedFields.some((field) => current[field])) return current;
      const next = { ...current };
      changedFields.forEach((field) => delete next[field]);
      return next;
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.job_id) errors.job_id = '请选择职位 / JD';
    if (!form.requester_department.trim()) errors.requester_department = '请填写用人部门';
    if (!form.city.trim()) errors.city = '请填写招聘城市';
    if (!form.headcount || Number(form.headcount) <= 0) errors.headcount = 'HC 必须大于 0';
    if (!form.requested_at) errors.requested_at = '请选择提需求日期';
    if (!form.hiring_manager_name.trim()) errors.hiring_manager_name = '请填写用人负责人';
    if (!form.owner_hr_id) errors.owner_hr_id = '请选择招聘负责人';
    if (!form.target_date) errors.target_date = '请选择期望完成日期';
    if (form.requested_at && form.target_date && form.target_date < form.requested_at) {
      errors.target_date = '期望完成日期不能早于提需求日期';
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSubmit({
      job_id: Number(form.job_id),
      owner_hr_id: Number(form.owner_hr_id),
      default_interviewer_id: form.default_interviewer_id,
      city: form.city.trim(),
      request_no: form.request_no.trim() || undefined,
      requester_name: form.requester_name.trim(),
      requester_department: form.requester_department.trim(),
      hiring_manager_name: form.hiring_manager_name.trim(),
      requested_at: form.requested_at,
      accepted_at: form.accepted_at || undefined,
      target_date: form.target_date,
      priority: form.priority,
      headcount: Number(form.headcount),
      status: 'active',
      note: form.note.trim(),
    });
  }

  const error = (field: string) => localErrors[field] || serverErrors[field];

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block">
          <RequiredLabel>职位 / JD</RequiredLabel>
          <select
            name="job_id"
            required
            aria-required="true"
            aria-invalid={Boolean(error('job_id')) || undefined}
            value={form.job_id}
            onChange={(event) => selectJob(event.target.value)}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          >
            <option value="">请选择职位模板</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
          </select>
          {error('job_id') && <p className="mt-1 text-xs text-danger-600">{error('job_id')}</p>}
        </label>

        <Input
          name="requester_department"
          label="用人部门"
          required
          value={form.requester_department}
          error={error('requester_department')}
          onChange={(event) => patch('requester_department', event.target.value)}
        />
        <Input
          name="city"
          label="招聘城市"
          required
          value={form.city}
          error={error('city')}
          onChange={(event) => patch('city', event.target.value)}
        />
        <Input
          name="headcount"
          label="HC"
          type="number"
          min={1}
          required
          value={form.headcount}
          error={error('headcount')}
          onChange={(event) => patch('headcount', event.target.value)}
        />
        <Input
          name="requested_at"
          label="提需求日期"
          type="date"
          required
          value={form.requested_at}
          error={error('requested_at')}
          onChange={(event) => patch('requested_at', event.target.value)}
        />
        <Input
          name="target_date"
          label="期望完成日期"
          type="date"
          required
          value={form.target_date}
          error={error('target_date')}
          onChange={(event) => patch('target_date', event.target.value)}
        />
        <Input
          name="hiring_manager_name"
          label="用人负责人"
          required
          value={form.hiring_manager_name}
          error={error('hiring_manager_name')}
          onChange={(event) => patch('hiring_manager_name', event.target.value)}
        />
        <label className="block">
          <RequiredLabel>招聘负责人</RequiredLabel>
          <select
            name="owner_hr_id"
            required
            aria-required="true"
            aria-invalid={Boolean(error('owner_hr_id')) || undefined}
            disabled={role === 'recruiter'}
            value={form.owner_hr_id}
            onChange={(event) => patch('owner_hr_id', event.target.value)}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink disabled:bg-surface-soft"
          >
            <option value="">请选择招聘负责人</option>
            {ownerOptions.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}{owner.email ? ` · ${owner.email}` : ''}
              </option>
            ))}
          </select>
          {error('owner_hr_id') && <p className="mt-1 text-xs text-danger-600">{error('owner_hr_id')}</p>}
        </label>
        <SearchableInterviewerField
          label="默认面试官（可选）"
          options={interviewers}
          value={form.default_interviewer_id}
          onChange={(value) => patch('default_interviewer_id', value)}
          disabled={busy || interviewersLoading || Boolean(interviewersError)}
          error={error('default_interviewer_id')}
          helperText={interviewersLoading
            ? '正在加载可选面试官…'
            : interviewersError
              ? <span>面试官列表暂时无法加载：{interviewersError}</span>
              : interviewers.length === 0
                ? '暂无可选账号，可先留空；需要时请管理员创建或启用面试官账号。'
                : '可以留空；正式安排面试时仍可更换。'}
        />
        {interviewersError && onReloadInterviewers && (
          <div className="flex items-end">
            <Button type="button" size="sm" variant="secondary" onClick={onReloadInterviewers}>
              重新加载面试官
            </Button>
          </div>
        )}
        <Input
          name="request_no"
          label="需求编号（可选）"
          placeholder="不填由系统自动生成"
          value={form.request_no}
          error={error('request_no')}
          onChange={(event) => patch('request_no', event.target.value)}
        />
        <Input
          name="requester_name"
          label="需求发起人（可选）"
          value={form.requester_name}
          onChange={(event) => patch('requester_name', event.target.value)}
        />
        <Input
          name="accepted_at"
          label="HR 接手日期（可选）"
          type="date"
          value={form.accepted_at}
          onChange={(event) => patch('accepted_at', event.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">优先级</span>
          <select
            value={form.priority}
            onChange={(event) => patch('priority', event.target.value as DemandPriority)}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
          >
            <option value="A">A 级</option>
            <option value="B">B 级</option>
            <option value="C">C 级</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">备注（可选）</span>
        <textarea
          value={form.note}
          onChange={(event) => patch('note', event.target.value)}
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
          placeholder="记录业务背景、风险或协作约定"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={busy || jobs.length === 0 || ownerOptions.length === 0}>
          创建需求
        </Button>
        <p className="text-xs text-muted-soft">提交后立即锁定按钮；成功后进入该需求详情。</p>
      </div>
    </form>
  );
}
