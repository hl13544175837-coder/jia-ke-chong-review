import { useState, useEffect } from 'react';

interface ImportResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: {
    name: string;
    gender: string;
    age: string;
    phone: string;
    email: string;
    position: string;
    department: string;
    city: string;
    source: string;
    experienceYears: string;
    education: string;
    summary: string;
  }) => void;
}

const departmentOptions = [
  '技术一组', '技术二组', '产品一组', '产品二组',
  '设计一组', '数据一组', '人力一组', '市场一组',
];

const cityOptions = [
  '北京', '上海', '深圳', '广州', '杭州', '成都',
  '武汉', '南京', '苏州', '西安', '重庆', '天津',
];

const sourceOptions = [
  'PDF导入', '内部推荐', '猎头公司推荐', '外部收录',
];

const eduOptions = ['本科', '硕士', '博士'];

const initialForm = {
  name: '',
  gender: '男',
  age: '',
  phone: '',
  email: '',
  position: '',
  department: '技术一组',
  city: '北京',
  source: 'PDF导入',
  experienceYears: '',
  education: '本科',
  summary: '',
};

export default function ImportResumeModal({ isOpen, onClose, onImport }: ImportResumeModalProps) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(initialForm);
      setErrors({});
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '请输入姓名';
    if (!form.position.trim()) errs.position = '请输入应聘职位';
    if (!form.phone.trim()) errs.phone = '请输入电话';
    if (!form.email.trim()) {
      errs.email = '请输入邮箱';
    } else if (!/^[^\s@]+@[^\s@]+$/.test(form.email)) {
      errs.email = '邮箱格式不正确';
    }
    if (!form.age.trim()) errs.age = '请输入年龄';
    if (!form.experienceYears.trim()) errs.experienceYears = '请输入工作年限';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    setTimeout(() => {
      onImport(form);
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setForm({
          name: '', gender: '男', age: '', phone: '', email: '',
          position: '', department: '技术一组', city: '北京',
          source: 'PDF导入', experienceYears: '', education: '本科', summary: '',
        });
      }, 1000);
    }, 600);
  };

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/40 z-[60]" onClick={onClose}></div>
      <div className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[70]">
        <div className="bg-white w-full sm:w-[520px] sm:max-h-[85vh] sm:rounded-xl rounded-t-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
            <div>
              <h3 className="text-base font-bold text-foreground-900">导入简历</h3>
              <p className="text-xs text-foreground-400 mt-0.5">将新收录的简历快速录入并绑定到当前岗位</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {success ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mb-3">
                  <i className="ri-check-line text-2xl text-primary-500"></i>
                </div>
                <p className="text-sm font-medium text-foreground-700">简历导入成功</p>
                <p className="text-xs text-foreground-400 mt-1">候选人已加入当前岗位</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">姓名 <span className="text-accent-500">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder="候选人姓名"
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                    />
                    {errors.name && <p className="text-[11px] text-accent-500 mt-0.5">{errors.name}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-foreground-600 mb-1 block">性别</label>
                      <select
                        value={form.gender}
                        onChange={(e) => update('gender', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
                      >
                        <option value="男">男</option>
                        <option value="女">女</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground-600 mb-1 block">年龄 <span className="text-accent-500">*</span></label>
                      <input
                        type="text"
                        value={form.age}
                        onChange={(e) => update('age', e.target.value)}
                        placeholder="如：28"
                        className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                      />
                      {errors.age && <p className="text-[11px] text-accent-500 mt-0.5">{errors.age}</p>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">电话 <span className="text-accent-500">*</span></label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="候选人电话"
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                    />
                    {errors.phone && <p className="text-[11px] text-accent-500 mt-0.5">{errors.phone}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">邮箱 <span className="text-accent-500">*</span></label>
                    <input
                      type="text"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="候选人邮箱"
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                    />
                    {errors.email && <p className="text-[11px] text-accent-500 mt-0.5">{errors.email}</p>}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground-600 mb-1 block">应聘职位 <span className="text-accent-500">*</span></label>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => update('position', e.target.value)}
                    placeholder="如：前端开发工程师"
                    className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                  />
                  {errors.position && <p className="text-[11px] text-accent-500 mt-0.5">{errors.position}</p>}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">部门</label>
                    <select
                      value={form.department}
                      onChange={(e) => update('department', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
                    >
                      {departmentOptions.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">城市</label>
                    <select
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
                    >
                      {cityOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">来源</label>
                    <select
                      value={form.source}
                      onChange={(e) => update('source', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
                    >
                      {sourceOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">工作年限 <span className="text-accent-500">*</span></label>
                    <input
                      type="text"
                      value={form.experienceYears}
                      onChange={(e) => update('experienceYears', e.target.value)}
                      placeholder="如：3年"
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300"
                    />
                    {errors.experienceYears && <p className="text-[11px] text-accent-500 mt-0.5">{errors.experienceYears}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground-600 mb-1 block">学历</label>
                    <select
                      value={form.education}
                      onChange={(e) => update('education', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 cursor-pointer"
                    >
                      {eduOptions.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground-600 mb-1 block">个人简介</label>
                  <textarea
                    value={form.summary}
                    onChange={(e) => update('summary', e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="简要描述候选人的核心优势与经历..."
                    className="w-full px-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-300 focus:outline-none focus:border-primary-300 resize-none"
                  ></textarea>
                  <p className="text-[11px] text-foreground-400 text-right mt-0.5">{form.summary.length}/500</p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {!success && (
            <div className="px-6 py-4 border-t border-background-200 flex-shrink-0 flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-foreground-600 border border-background-200 rounded-lg hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    导入中...
                  </>
                ) : (
                  <>
                    <i className="ri-file-upload-line"></i>
                    确认导入并绑定当前岗位
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.25s ease-out;
        }
      `}</style>
    </>
  );
}