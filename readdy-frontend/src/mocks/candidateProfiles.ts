import { candidateList, stageColorMap, type Candidate } from './candidates';
import { requisitionCandidates } from './requisitionCandidates';
import { requisitions } from './jobs';

// ── Types ────────────────────────────────────────────────

export type CandidateStatus = 'recruiting' | 'talentPool' | 'ended';

export interface CandidateApplication {
  reqId: string;
  reqTitle: string;
  position: string;
  stage: string;
  stageColor: string;
  owner: string;
  source: string;
  appliedAt: string;
  progress: string;
}

export interface TalentPoolInfo {
  reason: string;
  tags: string[];
  contactable: string;
  addedAt: string;
}

export interface CandidateProfile {
  candidateId: number;
  candidate: Candidate;
  status: CandidateStatus;
  applications: CandidateApplication[];
  talentPoolInfo: TalentPoolInfo | null;
  latestActivity: string;
  displayPosition: string;
  displayPositionCount: number;
  displayOwner: string;
  displaySource: string;
}

// ── Status Designation ──────────────────────────────────

export const talentPoolIds = new Set([15, 20, 24, 31]);
const endedIds = new Set([10, 11, 22, 27, 33]);

const talentPoolData: Record<number, TalentPoolInfo> = {
  15: { reason: '前端经验与当前在招岗位要求不完全匹配，候选人同意进入公司人才库等待合适机会', tags: ['前端', 'Vue'], contactable: '工作日 14:00-18:00', addedAt: '2026-07-16' },
  20: { reason: '工作经验偏少（1年），目前暂无匹配的初级岗位，待有新岗位开放后优先联系', tags: ['数据分析', '初级'], contactable: '随时', addedAt: '2026-07-15' },
  24: { reason: '候选人主动表示暂不急于换工作，愿意进入公司人才库等待更匹配的高级岗位机会', tags: ['前端', 'Vue'], contactable: '周末 10:00-16:00', addedAt: '2026-07-16' },
  31: { reason: '市场运营岗位已满编，候选人背景良好，待岗位重新开放后优先推荐', tags: ['运营', '新媒体'], contactable: '工作日 10:00-17:00', addedAt: '2026-07-15' },
};

// ── Status helpers ──────────────────────────────────────

export function getCandidateStatus(candidate: Candidate): CandidateStatus {
  if (talentPoolIds.has(candidate.id)) return 'talentPool';
  if (endedIds.has(candidate.id)) return 'ended';
  if (candidate.stage === '已入职' || candidate.stage === '已淘汰') return 'ended';
  return 'recruiting';
}

export const statusLabel: Record<CandidateStatus, string> = {
  recruiting: '招聘流程中',
  talentPool: '公司人才库',
  ended: '已结束',
};

export const statusTagColor: Record<CandidateStatus, string> = {
  recruiting: 'bg-primary-100 text-primary-700',
  talentPool: 'bg-accent-100 text-accent-700',
  ended: 'bg-background-200 text-foreground-400',
};

// ── Applications builder ────────────────────────────────

function buildApplications(candidate: Candidate): CandidateApplication[] {
  const apps: CandidateApplication[] = [];

  Object.entries(requisitionCandidates).forEach(([reqId, cands]) => {
    const match = cands.find((c) => c.name === candidate.name);
    if (match) {
      const req = requisitions.find((r) => r.id === reqId);
      const appStage = match.stage;
      const mappedStage = mapReqStageToStandard(appStage, candidate);
      apps.push({
        reqId,
        reqTitle: req?.title || req?.name || candidate.position,
        position: req?.title || req?.name || candidate.position,
        stage: mappedStage,
        stageColor: stageColorMap[mappedStage] || 'bg-background-200 text-foreground-400',
        owner: candidate.recruiter || '未分配',
        source: match.source || candidate.source,
        appliedAt: match.appliedAt,
        progress: buildAppProgress(candidate, mappedStage, match.nextAction),
      });
    }
  });

  if (apps.length === 0) {
    const status = getCandidateStatus(candidate);
    if (status === 'recruiting') {
      apps.push({
        reqId: '',
        reqTitle: candidate.position,
        position: candidate.position,
        stage: candidate.stage,
        stageColor: stageColorMap[candidate.stage] || 'bg-background-200 text-foreground-400',
        owner: candidate.recruiter || '未分配',
        source: candidate.source,
        appliedAt: candidate.appliedAt,
        progress: buildAppProgress(candidate, candidate.stage),
      });
    }
  }

  return apps;
}

function mapReqStageToStandard(reqStage: string, _candidate: Candidate): string {
  const map: Record<string, string> = {
    '已推送简历': '待筛选',
    '面试官反馈': '面试官评审中',
    '已面试': '一面',
    'Offer': 'Offer发放中',
    '已淘汰': '已淘汰',
  };
  return map[reqStage] || reqStage;
}

function buildAppProgress(candidate: Candidate, stage: string, nextAction?: string): string {
  const now = new Date('2026-07-19');
  const appDate = new Date(candidate.appliedAt);
  const daysAgo = Math.floor((now.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));

  if (stage === '待筛选') return nextAction || `投递${daysAgo}天，待HR初筛`;
  if (stage === '初筛通过') return '已通过初筛，待分配面试官';
  if (stage === '面试官评审中') return `面试官(${candidate.assignedReviewer || '待分配'})评审中`;
  if (stage === '一面') return nextAction || '一面进行中，等待面试反馈';
  if (stage === '二面') return '二面进行中，持续推进';
  if (stage === '终面') return '终面阶段，即将出结果';
  if (stage === '谈薪中') return '薪资沟通中，双方协商';
  if (stage === '沟通中') return '入职细节沟通中';
  if (stage === 'Offer发放中') return 'Offer已发出，等待候选人确认';
  if (stage === '正式到岗中') return '候选人已接受Offer，即将到岗';
  if (stage === '已入职') return `已于近期顺利入职`;
  if (stage === '已淘汰') return candidate.blockReason || '已结束';
  return '进展正常';
}

// ── Activity builder ────────────────────────────────────

function buildLatestActivity(candidate: Candidate, status: CandidateStatus, apps: CandidateApplication[]): string {
  if (status === 'talentPool') {
    const info = talentPoolData[candidate.id];
    return info?.reason?.slice(0, 40) + '…' || '进入公司人才库';
  }
  if (status === 'ended') {
    if (candidate.stage === '已入职') return '已完成入职';
    return candidate.blockReason?.slice(0, 30) || '招聘流程已结束';
  }
  if (apps.length > 0) {
    const latest = apps[0];
    return `「${latest.position}」${latest.progress}`;
  }
  return '暂无动态';
}

// ── Build all profiles ──────────────────────────────────

export const allCandidateProfiles: CandidateProfile[] = candidateList.map((candidate) => {
  const status = getCandidateStatus(candidate);
  const apps = buildApplications(candidate);

  // Display position: primary from applications, or candidate.position
  const activeApps = apps.filter((a) => !['已入职', '已淘汰'].includes(a.stage));
  const displayApps = activeApps.length > 0 ? activeApps : apps;
  const primaryApp = displayApps[0];

  return {
    candidateId: candidate.id,
    candidate,
    status,
    applications: apps,
    talentPoolInfo: talentPoolData[candidate.id] || null,
    latestActivity: buildLatestActivity(candidate, status, apps),
    displayPosition: primaryApp?.position || candidate.position || '待定',
    displayPositionCount: apps.length,
    displayOwner: candidate.recruiter || '未分配',
    displaySource: candidate.source,
  };
});

// ── Active requisitions for binding ─────────────────────

export function getActiveRequisitions(): Array<{ reqId: string; title: string; department: string; owner: string }> {
  return requisitions
    .filter((r) => r.statusCode === 'active' && (r.headcount - r.filled) > 0)
    .map((r) => ({
      reqId: r.id,
      title: r.title,
      department: r.department,
      owner: r.owner,
    }));
}
