import type { RecruitmentDemand } from '@/features/demands/types';

export type AiRecruitPlatformKey = 'BOSS直聘' | '猎聘' | '58同城';

export const AI_RECRUIT_PLATFORMS: Array<{ key: AiRecruitPlatformKey; label: string }> = [
  { key: 'BOSS直聘', label: 'BOSS直聘' },
  { key: '猎聘', label: '猎聘' },
  { key: '58同城', label: '58同城' },
];

export const DEFAULT_GREETING_TEMPLATE = '您好，我是{公司}的HR，正在招聘「{岗位}」岗位。看到您的经历和岗位很匹配，想和您详细聊一聊，方便吗？';

export interface AiRecruitTaskInput {
  demand: Pick<RecruitmentDemand, 'id' | 'request_no' | 'job_title' | 'jd_text'>;
  platforms: Array<{ key: AiRecruitPlatformKey; account: string }>;
  greeting: string;
  apiBaseUrl: string;
  token: string;
  skillName: string;
}

export function defaultApiBaseUrl(): string {
  const { hostname } = window.location;
  return `http://${hostname}:5010/api`;
}

export function buildAiRecruitTask(input: AiRecruitTaskInput): string {
  const jd = (input.demand.jd_text || '').trim() || '（智聘暂未返回 JD 正文，请先向招聘专员确认后再筛选）';
  const platformLines = input.platforms
    .map((item) => `- ${item.key}：${item.account.trim() || '（未填写账号）'}`)
    .join('\n');
  const greeting = input.greeting.trim() || DEFAULT_GREETING_TEMPLATE;
  return [
    `【智聘AI找人·任务单】`,
    `请执行「${input.skillName}」Skill，按以下任务单去市场找人并导入智聘。`,
    ``,
    `需求编号：${input.demand.request_no}`,
    `需求ID：${input.demand.id}`,
    `岗位：${input.demand.job_title}`,
    ``,
    `JD：`,
    jd,
    ``,
    `目标平台与账号：`,
    platformLines,
    ``,
    `打招呼话术：`,
    greeting,
    ``,
    `智聘接口地址：${input.apiBaseUrl}`,
    `导入凭证：${input.token}（仅调用智聘接口时使用，不要写入输出、聊天或日志）`,
  ].join('\n');
}

export const SKILL_INSTALL_HINT = `Skill 安装说明（只需一次）：
把下面这份 SKILL.md 保存到你的 AI 工具技能目录：
- WorkBuddy：~/.workbuddy/skills/zhipin-ai-recruit/SKILL.md
- Claude Desktop：~/Library/Application Support/Claude/skills/zhipin-ai-recruit/SKILL.md

然后在对话里输入「智聘AI找人」，粘贴本弹窗生成的任务单即可执行。`;
