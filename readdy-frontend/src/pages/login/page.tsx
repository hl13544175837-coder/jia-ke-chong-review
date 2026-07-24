import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    // Simulate login - will be replaced with Supabase auth later
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard');
    }, 800);
  };

  return (
    <div className="min-h-screen flex bg-background-50">
      {/* Left - Brand side */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,oklch(var(--primary-400)/0.3),transparent_60%)]"></div>
        <div className="absolute top-20 left-16 w-64 h-64 rounded-full border border-white/10"></div>
        <div className="absolute bottom-32 right-20 w-48 h-48 rounded-full border border-white/10"></div>
        <div className="absolute top-1/3 right-1/4 w-2 h-2 rounded-full bg-white/20"></div>
        <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 rounded-full bg-white/15"></div>

        <div className="relative z-10 flex flex-col justify-center px-16 w-full">
          <div className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center mb-8">
              <i className="ri-briefcase-line text-white text-2xl"></i>
            </div>
            <h1 className="text-4xl font-heading font-bold text-white leading-tight mb-4">
              TalentFlow
            </h1>
            <p className="text-lg text-white/70 leading-relaxed max-w-md">
              智能招聘管理系统 — 让招聘流程更高效、更透明。从需求到入职，一站式协作平台。
            </p>
          </div>

          <div className="mt-16 space-y-4">
            <div className="flex items-center gap-3 text-white/60 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <i className="ri-dashboard-line text-white/80"></i>
              </div>
              <span>可视化工作台，实时掌握招聘进度</span>
            </div>
            <div className="flex items-center gap-3 text-white/60 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <i className="ri-file-list-3-line text-white/80"></i>
              </div>
              <span>智能简历解析，候选人管理一目了然</span>
            </div>
            <div className="flex items-center gap-3 text-white/60 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <i className="ri-team-line text-white/80"></i>
              </div>
              <span>多角色协作，面试官 & 主管无缝配合</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right - Login form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary-500 flex items-center justify-center mx-auto mb-4">
              <i className="ri-briefcase-line text-white text-2xl"></i>
            </div>
            <h1 className="text-3xl font-heading font-bold text-foreground-900">TalentFlow</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground-900 mb-1">欢迎回来</h2>
            <p className="text-foreground-500">登录您的招聘管理系统</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-accent-100/60 border border-accent-300 text-accent-800 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                <i className="ri-error-warning-line"></i>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground-700 mb-1.5">
                企业邮箱
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <i className="ri-mail-line text-foreground-400 text-lg"></i>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 bg-background-100 border border-background-300 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground-700">
                  密码
                </label>
                <button
                  type="button"
                  onClick={() => showToast('请联系 IT 支持重置密码')}
                  className="text-xs text-primary-600 hover:text-primary-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  忘记密码？
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <i className="ri-lock-line text-foreground-400 text-lg"></i>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  className="w-full pl-10 pr-4 py-3 bg-background-100 border border-background-300 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  登录中...
                </>
              ) : (
                <>
                  登 录
                  <i className="ri-arrow-right-line"></i>
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-foreground-400">
            仅限公司内部人员使用 · 如有问题请联系 IT 支持
          </p>
        </div>
      </div>
    </div>
  );
}