import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCompanyAuth, type CompanyRole } from './companyAuth';

export function RequireCompanyAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCompanyAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function RequireCompanyGuest({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCompanyAuth();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireCompanyRole({
  allow,
  children,
}: {
  allow: CompanyRole[];
  children: ReactNode;
}) {
  const { role } = useCompanyAuth();
  const location = useLocation();
  if (role && !allow.includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-50 px-6">
        <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-accent-700">
            <i className="ri-shield-keyhole-line text-xl" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground-900">无权访问此页面</h1>
          <p className="mt-2 text-sm text-foreground-500">
            当前公司角色为 {role}，不能访问 {location.pathname}。
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-flex rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            返回工作台
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function CompanyHomeRedirect() {
  const { isAuthenticated } = useCompanyAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}
