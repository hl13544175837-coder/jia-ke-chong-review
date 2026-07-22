import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardBody, PageHeader } from '../components/ui';
import { defaultRouteForRole } from '../lib/nav';
import type { Role } from '../types';

const ROLE_LABELS: Record<Role, string> = {
  recruiter: '招聘专员',
  manager: '招聘主管',
  admin: '系统管理员',
  interviewer: '面试官',
};

interface AccessDeniedPageProps {
  currentRole: Role | null;
  allowedRoles: Role[];
  requestedPath: string;
}

export function AccessDeniedPage({
  currentRole,
  allowedRoles,
  requestedPath,
}: AccessDeniedPageProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center py-10 sm:py-16">
      <Card className="w-full overflow-hidden border-[#ead8cc] shadow-apple-sm">
        <div className="h-1 bg-[#c47b55]" />
        <CardBody className="px-6 py-8 sm:px-10 sm:py-10">
          <PageHeader
            eyebrow={<Badge tone="warning">访问受限</Badge>}
            title="无权访问"
            description="你的账号已登录，但当前角色没有打开此页面的权限。页面地址已保留，你可以返回工作台继续处理已有任务。"
          />

          <div className="mt-8 flex flex-col gap-5 rounded-xl border border-[#ebeae5] bg-[#fbfaf7] p-5 sm:flex-row sm:items-start">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff3ed] text-[#b9623e]">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <dl className="min-w-0 flex-1 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-[#858a86]">当前角色</dt>
                <dd className="mt-1 font-semibold text-[#292b2a]">
                  {currentRole ? ROLE_LABELS[currentRole] : '当前账号'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#858a86]">允许角色</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {allowedRoles.map((role) => (
                    <Badge key={role} tone="neutral">{ROLE_LABELS[role]}</Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#858a86]">请求页面</dt>
                <dd className="mt-1 truncate font-mono text-xs text-[#626763]">{requestedPath}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-8">
            <Button onClick={() => navigate(defaultRouteForRole())}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回工作台
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
