import { useState, useMemo } from 'react';
import { candidateList, type Candidate } from '@/mocks/candidates';

interface HeadhunterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (candidate: Omit<Candidate, 'id' | 'stage' | 'stageColor' | 'appliedAt'>) => void;
}

const positionOptions = Array.from(new Set(candidateList.map((c) => c.position))).sort();
const departmentOptions = Array.from(new Set(candidateList.map((c) => c.department))).sort();

export default function HeadhunterImportModal({ isOpen, onClose, onImport }: HeadhunterImportModalProps) {
  const [formData, setFormData] = useState({
    agencyName: '',
    name: '',
    phone: '',
    email: '',
    position: '',
    department: '',
    experienceYears: '',
    education: '',
    salaryExpectation: '',
    notes: '',
  });
  const [blockInfo, setBlockInfo] = useState<Candidate | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      agencyName: '',
      name: '',
      phone: '',
      email: '',
      position: '',
      department: '',
      experienceYears: '',
      education: '',
      salaryExpectation: '',
      notes: '',
    });
    setBlockInfo(null);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Duplicate check: name + phone (match last 4 digits)
  const checkDuplicate = (name: string, phone: string): Candidate | null => {
    if (!name.trim() || !phone.trim()) return null;
    const cleanPhone = phone.replace(/\D/g, '');
    const last4 = cleanPhone.slice(-4);
    return candidateList.find((c) => {
      const matchName = c.name === name.trim();
      const cleanStoredPhone = c.phone.replace(/\D/g, '');
      const matchPhone = cleanStoredPhone === cleanPhone || c.phone.includes(last4);
      return matchName || matchPhone;
    }) || null;
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = '请输入候选人姓名';
    if (!formData.phone.trim()) newErrors.phone = '请输入手机号';
    else if (!/^1[3-9]\d{9}$/.test(formData.phone.replace(/\D/g, ''))) newErrors.phone = '手机号格式不正确';
    if (!formData.position) newErrors.position = '请选择应聘职位';
    if (!formData.department) newErrors.department = '请选择所属部门';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const duplicate = checkDuplicate(formData.name, formData.phone);
    if (duplicate) {
      setBlockInfo(duplicate);
      return;
    }

    onImport({
      name: formData.name.trim(),
      gender: '',
      age: 0,
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      position: formData.position,
      department: formData.department,
      source: '猎头公司推荐',
      education: formData.education || '尚未明确',
      experience: formData.experienceYears ? `${formData.experienceYears}年` : '',
      experienceYears: formData.experienceYears ? `${formData.experienceYears}年` : '',
      tags: formData.notes ? [formData.notes.slice(0, 20)] : [],
      resumeUrl: '#',
      summary: `${formData.agencyName ? `猎头公司：${formData.agencyName}。` : ''}${formData.notes || ''}`,
      workHistory: [],
      educationHistory: [],
      skills: [],
      recruiter: '猎头推荐',
      salaryExpectation: formData.salaryExpectation,
      screeningStage: 'ai',
    });
    resetForm();
    onClose();
  };

  const isFormEmpty = useMemo(() => {
    return !formData.name && !formData.phone && !formData.position;
  }, [formData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-[560px] mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-background-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-accent-50 flex items-center justify-center">
              <i className="ri-briefcase-line text-accent-600 text-lg"></i>
            </div>
            <div>
              <h3 className="text-lg font-heading font-bold text-foreground-900">猎头公司推荐导入</h3>
              <p className="text-xs text-foreground-400">填写候选人信息，系统将自动查重拦截</p>
            </div>
          </div>
        </div>

        {/* Duplicate block alert */}
        {blockInfo && (
          <div className="mx-6 mt-4 p-4 bg-accent-50 border border-accent-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-error-warning-line text-accent-600"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-accent-800">该候选人已存在于简历库中</p>
                <p className="text-xs text-accent-600 mt-1">
                  系统检测到姓名为「{blockInfo.name}」的候选人已存在，无法重复导入。
                </p>
                <div className="mt-3 p-3 bg-white rounded-lg border border-accent-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-600">{blockInfo.name.charAt(0)}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground-800">{blockInfo.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-foreground-500">
                    <span>职位：{blockInfo.position}</span>
                    <span>来源：{blockInfo.source}</span>
                    <span>阶段：{blockInfo.stage}</span>
                    <span>手机：{blockInfo.phone}</span>
                  </div>
                </div>
                <button
                  onClick={() => setBlockInfo(null)}
                  className="mt-3 px-4 py-2 text-xs font-medium text-accent-700 bg-white border border-accent-200 rounded-lg hover:bg-accent-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  我知道了，重新填写
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Agency */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">
              猎头公司名称 <span className="text-foreground-300">（选填）</span>
            </label>
            <input
              type="text"
              value={formData.agencyName}
              onChange={(e) => setFormData((prev) => ({ ...prev, agencyName: e.target.value }))}
              placeholder="例如：科锐国际、猎聘网..."
              className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
            />
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                候选人姓名 <span className="text-accent-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="输入姓名"
                className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300 ${
                  errors.name ? 'border-accent-300' : 'border-background-200'
                }`}
              />
              {errors.name && <p className="text-xs text-accent-600 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                手机号 <span className="text-accent-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="11位手机号"
                className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300 ${
                  errors.phone ? 'border-accent-300' : 'border-background-200'
                }`}
              />
              {errors.phone && <p className="text-xs text-accent-600 mt-1">{errors.phone}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">
              邮箱 <span className="text-foreground-300">（选填）</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="candidate@example.com"
              className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
            />
          </div>

          {/* Position + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                应聘职位 <span className="text-accent-500">*</span>
              </label>
              <select
                value={formData.position}
                onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer ${
                  errors.position ? 'border-accent-300' : 'border-background-200'
                }`}
              >
                <option value="">请选择职位</option>
                {positionOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {errors.position && <p className="text-xs text-accent-600 mt-1">{errors.position}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                所属部门 <span className="text-accent-500">*</span>
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer ${
                  errors.department ? 'border-accent-300' : 'border-background-200'
                }`}
              >
                <option value="">请选择部门</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              {errors.department && <p className="text-xs text-accent-600 mt-1">{errors.department}</p>}
            </div>
          </div>

          {/* Experience + Education */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                工作年限 <span className="text-foreground-300">（选填）</span>
              </label>
              <select
                value={formData.experienceYears}
                onChange={(e) => setFormData((prev) => ({ ...prev, experienceYears: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
              >
                <option value="">请选择</option>
                {['应届生', '1年', '2年', '3年', '4年', '5年', '6年', '7年', '8年', '8年以上'].map((y) => (
                  <option key={y} value={y === '应届生' ? '0' : y.replace('年', '').replace('以上', '')}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                学历 <span className="text-foreground-300">（选填）</span>
              </label>
              <select
                value={formData.education}
                onChange={(e) => setFormData((prev) => ({ ...prev, education: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
              >
                <option value="">请选择</option>
                <option value="全日制本科">全日制本科</option>
                <option value="非全日制本科">非全日制本科</option>
                <option value="全日制硕士">全日制硕士</option>
                <option value="非全日制硕士">非全日制硕士</option>
                <option value="博士">博士</option>
                <option value="大专">大专</option>
              </select>
            </div>
          </div>

          {/* Salary expectation */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">
              期望薪资 <span className="text-foreground-300">（选填）</span>
            </label>
            <input
              type="text"
              value={formData.salaryExpectation}
              onChange={(e) => setFormData((prev) => ({ ...prev, salaryExpectation: e.target.value }))}
              placeholder="例如：25K-30K"
              className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">
              备注/推荐理由 <span className="text-foreground-300">（选填，最多500字）</span>
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value.slice(0, 500) }))}
              placeholder="猎头对该候选人的评价、推荐理由等..."
              rows={3}
              className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300 resize-none"
            />
            <p className="text-xs text-foreground-400 mt-1 text-right">{formData.notes.length}/500</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-background-100 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <div className="flex items-center gap-3">
            {!isFormEmpty && (
              <button
                onClick={resetForm}
                className="px-4 py-2.5 text-sm font-medium text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                清空
              </button>
            )}
            <button
              onClick={handleSubmit}
              className="px-5 py-2.5 text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <i className="ri-shield-check-line"></i>
              提交并查重
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
