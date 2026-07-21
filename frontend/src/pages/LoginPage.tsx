// Readdy 最终登录界面，业务行为仍使用公司网关 OAuth 和后端真实角色。

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  AlertCircle,
  Briefcase,
  FileSearch,
  LayoutDashboard,
  LockKeyhole,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { ApiError, clearToken } from '../lib/api';
import { loginViaGateway } from '../lib/gatewayAuth';
import { useAuth } from '../lib/auth';
import { defaultRouteForRole } from '../lib/nav';

const PRODUCT_POINTS = [
  { icon: LayoutDashboard, label: '可视化工作台，实时掌握招聘进度' },
  { icon: FileSearch, label: '智能简历解析，候选人管理一目了然' },
  { icon: UsersRound, label: '多角色协作，面试官与招聘主管无缝配合' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      clearToken();
      const result = await loginViaGateway(account.trim(), password);
      login(result);
      navigate(defaultRouteForRole(), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#fbfaf7] text-[#292b2a]">
      <section className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-[#3d7b6b] via-[#2f695c] to-[#1f4d43] lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(141,207,181,0.32),transparent_60%)]" />
        <div className="absolute left-16 top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute bottom-32 right-20 h-48 w-48 rounded-full border border-white/10" />

        <div className="relative z-10 flex w-full flex-col justify-center px-16 xl:px-24">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white">
            <Briefcase className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">TalentFlow</h1>
          <p className="mt-4 max-w-lg text-lg leading-8 text-white/70">
            智能招聘管理系统 — 让招聘流程更高效、更透明。从需求到入职，一站式协作平台。
          </p>

          <div className="mt-16 space-y-4">
            {PRODUCT_POINTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-white/65">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-white/85" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3d7b6b] text-white">
              <Briefcase className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">TalentFlow</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold">欢迎回来</h2>
            <p className="mt-1 text-[#777b78]">使用公司账号登录智聘招聘管理系统</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#efb49f] bg-[#fff3ed] px-4 py-3 text-sm text-[#9b4a2f]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <label className="block" htmlFor="account">
              <span className="mb-1.5 block text-sm font-medium text-[#555a57]">公司账号</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a0a39f]" aria-hidden="true" />
                <input
                  id="account"
                  name="account"
                  type="text"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="工号 / 账号"
                  autoComplete="username"
                  required
                  className="w-full rounded-lg border border-[#deded9] bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b907f] focus:ring-2 focus:ring-[#dcebe5]"
                />
              </span>
            </label>

            <label className="block" htmlFor="password">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-[#555a57]">
                密码
                <span className="text-xs font-normal text-[#6c8f82]">忘记密码请联系 IT 支持</span>
              </span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a0a39f]" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-[#deded9] bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b907f] focus:ring-2 focus:ring-[#dcebe5]"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3d7b6b] py-3 text-sm font-medium text-white transition hover:bg-[#326b5d] focus:outline-none focus:ring-2 focus:ring-[#a9cfc1] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-[#9a9d99]">
            仅限公司内部人员使用 · 请使用管理员分配的账号
          </p>
        </div>
      </main>
    </div>
  );
}
