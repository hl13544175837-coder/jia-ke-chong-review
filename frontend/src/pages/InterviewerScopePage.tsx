import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarClock, UserRoundSearch } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate } from '../lib/formatDate';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';
import type { InterviewAssignment } from '../types';

type InterviewerScopeView = 'candidates' | 'jobs';

interface InterviewerScopePageProps {
  view: InterviewerScopeView;
}

interface CandidateScopeItem {
  candidateId: number;
  name: string;
  jobs: string[];
  assignments: InterviewAssignment[];
}

interface JobScopeItem {
  jobId: number;
  title: string;
  candidateIds: number[];
  assignments: InterviewAssignment[];
}

function activeAssignments(assignments: InterviewAssignment[]) {
  return assignments.filter((item) => !['cancelled', 'canceled'].includes(item.status));
}

function nextScheduledAt(assignments: InterviewAssignment[]): string | null {
  const upcoming = assignments
    .map((item) => item.scheduled_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time) && item.time >= Date.now())
    .sort((left, right) => left.time - right.time);
  return upcoming[0]?.value ?? null;
}

function pendingCount(assignments: InterviewAssignment[]) {
  return assignments.filter((item) => !item.feedback_submitted).length;
}

export function InterviewerScopePage({ view }: InterviewerScopePageProps) {
  const assignmentsAsync = useAsync(() => api.listInterviewAssignments(), []);
  const assignments = useMemo(
    () => activeAssignments(assignmentsAsync.data ?? []),
    [assignmentsAsync.data],
  );

  const candidates = useMemo(() => {
    const grouped = new Map<number, CandidateScopeItem>();
    assignments.forEach((assignment) => {
      const current = grouped.get(assignment.candidate_id) ?? {
        candidateId: assignment.candidate_id,
        name: assignment.name_masked || `候选人 #${assignment.candidate_id}`,
        jobs: [],
        assignments: [],
      };
      const jobTitle = assignment.job_title || `岗位 #${assignment.job_id}`;
      if (!current.jobs.includes(jobTitle)) current.jobs.push(jobTitle);
      current.assignments.push(assignment);
      grouped.set(assignment.candidate_id, current);
    });
    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }, [assignments]);

  const jobs = useMemo(() => {
    const grouped = new Map<number, JobScopeItem>();
    assignments.forEach((assignment) => {
      const current = grouped.get(assignment.job_id) ?? {
        jobId: assignment.job_id,
        title: assignment.job_title || `岗位 #${assignment.job_id}`,
        candidateIds: [],
        assignments: [],
      };
      if (!current.candidateIds.includes(assignment.candidate_id)) {
        current.candidateIds.push(assignment.candidate_id);
      }
      current.assignments.push(assignment);
      grouped.set(assignment.job_id, current);
    });
    return [...grouped.values()].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  }, [assignments]);

  const isCandidatesView = view === 'candidates';
  const isJobsView = view === 'jobs';
  const title = isCandidatesView ? '候选人进展' : '参与岗位';
  const description = isCandidatesView
    ? '只展示已分配给我的面试候选人'
    : '只展示我实际参与面试的岗位';

  return (
    <div className="space-y-6" data-ui="readdy-interviewer-scope">
      <PageHeader
        title={title}
        description={description}
        actions={(
          <Link to="/interviewer/interviews">
            <Button size="sm" variant="secondary">
              <CalendarClock className="h-4 w-4" />
              查看我的面试
            </Button>
          </Link>
        )}
      />

      <div className="flex flex-wrap gap-2 border-b border-hairline bg-white px-3 py-2">
        <Link
          to="/interviewer/candidates"
          className={`rounded-md px-3 py-2 text-sm font-medium ${isCandidatesView ? 'bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand)]' : 'text-muted hover:bg-surface-soft'}`}
        >
          候选人进展
        </Link>
        <Link
          to="/interviewer/jobs"
          className={`rounded-md px-3 py-2 text-sm font-medium ${isJobsView ? 'bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand)]' : 'text-muted hover:bg-surface-soft'}`}
        >
          参与岗位
        </Link>
      </div>

      {assignmentsAsync.loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : assignmentsAsync.error ? (
        <ErrorState message={assignmentsAsync.error.message} onRetry={assignmentsAsync.reload} />
      ) : isCandidatesView && candidates.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserRoundSearch}
            title="暂无已分配候选人"
            description="HR 分配面试后，候选人才会出现在这里。"
          />
        </Card>
      ) : isJobsView && jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="暂无参与岗位"
            description="只有已分配面试的岗位会出现在这里。"
          />
        </Card>
      ) : isCandidatesView ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map((candidate) => {
            const nextAt = nextScheduledAt(candidate.assignments);
            const demandId = candidate.assignments.find((item) => item.demand_id)?.demand_id;
            return (
              <Card key={candidate.candidateId} variant="elevated">
                <CardBody className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        to={`/candidates/${candidate.candidateId}${demandId ? `?demand=${demandId}` : ''}`}
                        className="font-semibold text-ink hover:text-[var(--enterprise-brand)]"
                      >
                        {candidate.name}
                      </Link>
                      <p className="mt-1 text-sm text-muted">{candidate.jobs.join(' / ')}</p>
                    </div>
                    <Badge tone={pendingCount(candidate.assignments) > 0 ? 'warning' : 'success'}>
                      {pendingCount(candidate.assignments) > 0
                        ? `${pendingCount(candidate.assignments)} 项待反馈`
                        : '已反馈'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-surface-soft px-3 py-2">
                      <p className="text-xs text-muted">面试任务</p>
                      <p className="mt-1 font-semibold text-ink">{candidate.assignments.length} 个</p>
                    </div>
                    <div className="rounded-md bg-surface-soft px-3 py-2">
                      <p className="text-xs text-muted">下次面试</p>
                      <p className="mt-1 font-semibold text-ink">{nextAt ? formatDate(nextAt) : '暂无'}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => {
            const nextAt = nextScheduledAt(job.assignments);
            const demandId = job.assignments.find((item) => item.demand_id)?.demand_id;
            return (
              <Card key={job.jobId} variant="elevated">
                <CardBody className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-ink">{job.title}</h2>
                      <p className="mt-1 text-sm text-muted">已分配 {job.candidateIds.length} 位候选人</p>
                    </div>
                    <Badge tone={pendingCount(job.assignments) > 0 ? 'warning' : 'success'}>
                      {pendingCount(job.assignments)} 项待反馈
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">下次面试：{nextAt ? formatDate(nextAt) : '暂无'}</span>
                    <Link
                      to={`/interviewer/interviews?focus=pending${demandId ? `&demand=${demandId}` : ''}`}
                      className="font-medium text-[var(--enterprise-brand)] hover:underline"
                    >
                      查看任务
                    </Link>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
