import type { RecruitmentDemand } from '@/features/demands/types';

export interface AgentImportTokenResponse {
  token: string;
  scope: 'agent_import';
  expires_at: string;
}

export interface AgentConnectionPromptInput {
  apiBaseUrl: string;
  token: string;
  bossAccount: string;
  demand: Pick<RecruitmentDemand, 'id' | 'request_no' | 'job_title' | 'jd_text'>;
}

export function buildAgentConnectionPrompt({
  apiBaseUrl,
  token,
  bossAccount,
  demand,
}: AgentConnectionPromptInput) {
  const api = apiBaseUrl.replace(/\/+$/, '');
  const jd = demand.jd_text?.trim() || '智聘暂未返回JD正文，请先向招聘专员确认后再筛选。';
  return `你是我的BOSS直聘招聘Agent。

本次固定招聘需求：
- 招聘需求ID：${demand.id}
- 需求编号：${demand.request_no}
- 岗位：${demand.job_title}
- 岗位JD：${jd}
- 智聘接口：${api}
- Agent导入凭证：${token}
- 我的BOSS账号：${bossAccount}

请固定执行：
1. 查看BOSS直聘中向我打招呼的候选人，按本次JD判断是否基本符合。
2. 只把值得继续联系的候选人导入智聘，不要求全部导入。
3. 在线简历使用 POST ${api}/agent-imports/online-resumes，提交稳定的 external_record_id、demand_id=${demand.id}、boss_account、source_url、在线简历全部可见内容和从最早到最新的完整聊天记录。
4. 聊天记录每条包含 sender、text、sent_at；sent_at必须带时区。
5. 收到候选人完整PDF、DOCX或图片简历后，下载原始文件并提取完整结构化内容，使用 POST ${api}/agent-imports/full-resumes 上传原文件、target_demand_id=${demand.id}、boss_account、source_link和metadata_json。
6. 完整简历的 external_import_id 必须保持稳定，重复执行时不能换编号。
7. 完整简历成功导入后不要删除在线简历，两套简历库保持独立。
8. 不要在输出、聊天或日志中展示导入凭证。
9. 每次结束只汇报查看人数、在线简历导入数、完整简历导入数和失败原因。`;
}

