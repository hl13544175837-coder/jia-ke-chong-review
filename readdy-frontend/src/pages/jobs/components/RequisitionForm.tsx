import { useEffect, useMemo, useState } from 'react';
import { provinceCityData } from '@/mocks/options';
import type { ProductRole } from '@/auth/productRoleModel';
import type { DemandOwnerOption, RecruitmentDemandInput } from '@/features/demands/types';

interface RequisitionFormProps {
  expanded: boolean;
  owners: DemandOwnerOption[];
  role: ProductRole | null;
  currentUserId: number | null;
  currentUserName: string | null;
  submitting: boolean;
  serverErrors?: Record<string, string>;
  onSubmit: (payload: RecruitmentDemandInput) => void;
}

const priorityOptions = [
  { value: 'urgent', label: '紧急', desc: '3 天内需启动，已有候选人或紧急替补' },
  { value: 'high', label: '高', desc: '一周内启动，业务影响较大' },
  { value: 'normal', label: '普通', desc: '正常排期招聘，按常规流程推进' },
  { value: 'low', label: '低', desc: '储备型岗位，无明确时间压力' },
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

export default function RequisitionForm({
  expanded,
  owners,
  role,
  currentUserId,
  currentUserName,
  submitting,
  serverErrors = {},
  onSubmit,
}: RequisitionFormProps) {
  const [formData, setFormData] = useState({
    position: '',
    department: '',
    province: '',
    city: '',
    headcount: 1,
    startDate: localDateInputValue(),
    deadline: '',
    priority: 'normal',
    owner: '',
    hiringManagerName: '',
    description: '',
    jdTemplate: '',
  });
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (role === 'recruiter' && currentUserId) {
      setFormData((current) => ({ ...current, owner: String(currentUserId) }));
    }
  }, [currentUserId, role]);

  const cities = useMemo(() => {
    if (!formData.province) return [];
    const province = provinceCityData.find((p) => p.name === formData.province);
    return province ? province.cities : [];
  }, [formData.province]);

  if (!expanded) return null;

  const handleJdTemplateChange = (template: string) => {
    if (template) {
      setFormData({ ...formData, description: jdTemplates[template] || '', jdTemplate: template });
    } else {
      setFormData({ ...formData, description: '', jdTemplate: '' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.owner) {
      setLocalError('请选择招聘负责人');
      return;
    }
    if (!formData.hiringManagerName.trim()) {
      setLocalError('请填写用人负责人');
      return;
    }
    setLocalError('');
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

  const today = localDateInputValue();
  const fieldError = (field: string) => serverErrors[field];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row 1: 基本信息 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground-800 mb-3 flex items-center gap-1.5">
          <i className="ri-information-line text-base text-foreground-500"></i>
          基本信息
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              HC 人数 <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              required
              value={formData.headcount}
              onChange={(e) => setFormData({ ...formData, headcount: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              招聘负责人 <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={formData.owner}
              onChange={(e) => { setFormData({ ...formData, owner: e.target.value }); setLocalError(''); }}
              disabled={role === 'recruiter'}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer"
            >
              <option value="">请选择</option>
              {role === 'recruiter' && currentUserId ? (
                <option value={currentUserId}>{currentUserName || '当前招聘专员'}</option>
              ) : owners.map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.name}</option>
              ))}
            </select>
            {fieldError('owner_hr_id') && <p className="mt-1 text-xs text-red-500">{fieldError('owner_hr_id')}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              用人负责人 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.hiringManagerName}
              onChange={(e) => { setFormData({ ...formData, hiringManagerName: e.target.value }); setLocalError(''); }}
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
              招聘起始日期 <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              required
              min={today}
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all cursor-pointer"
            />
            <p className="text-xs text-foreground-400 mt-1">用人单位提出需求的起始时间</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              截止日期 <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              required
              min={formData.startDate || today}
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all cursor-pointer"
            />
            <p className="text-xs text-foreground-400 mt-1">预期到岗的最晚时间</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1">
              紧急程度 <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 cursor-pointer"
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
        <div className="mb-3">
          <label className="block text-sm font-medium text-foreground-700 mb-2">快速套用 JD 模板</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleJdTemplateChange('')}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                formData.jdTemplate === ''
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
                formData.jdTemplate === 'tech'
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
                formData.jdTemplate === 'product'
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
                formData.jdTemplate === 'design'
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-background-200 text-foreground-600 hover:bg-background-50'
              }`}
            >
              设计岗模板
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-700 mb-1">
            岗位描述 <span className="text-red-400">*</span>
          </label>
          <textarea
            required
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value, jdTemplate: '' })}
            placeholder="请描述该岗位的职责、任职要求、加分项等。也可以先选择一个 JD 模板再修改..."
            rows={8}
            maxLength={800}
            className="w-full px-3.5 py-3 bg-background-50 border border-background-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all resize-none placeholder:text-foreground-400 font-mono text-xs"
          />
          <p className="text-xs text-foreground-400 mt-1 text-right">{formData.description.length}/800</p>
        </div>
      </div>

      {/* Actions */}
      {localError && <p className="text-sm text-red-500" role="alert">{localError}</p>}
      {Object.keys(serverErrors).length > 0 && (
        <p className="text-sm text-red-500" role="alert">请检查标红或提示的需求信息后重试。</p>
      )}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-background-100">
        <button
          type="button"
          onClick={() => setFormData({
            position: '', department: '', province: '', city: '', headcount: 1, startDate: localDateInputValue(), deadline: '',
            priority: 'normal', owner: role === 'recruiter' && currentUserId ? String(currentUserId) : '', hiringManagerName: '', description: '', jdTemplate: '',
          })}
          className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          重置表单
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? '正在创建...' : '创建需求'}
        </button>
      </div>
    </form>
  );
}
