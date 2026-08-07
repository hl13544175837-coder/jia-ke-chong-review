import OnlineResumeList from '@/features/onlineResumes/components/OnlineResumeList';
import AgentConnectionDialogEntry from '@/features/onlineResumes/components/AgentConnectionDialog';

export default function OnlineResumesPage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground-900">在线简历</h1>
          <p className="mt-1 text-sm text-foreground-500">查看外部Agent导入的在线简历和完整聊天记录</p>
        </div>
        <AgentConnectionDialogEntry />
      </header>
      <OnlineResumeList />
    </div>
  );
}
