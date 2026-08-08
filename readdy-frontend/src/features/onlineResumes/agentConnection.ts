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
3. 在线简历使用 POST ${api}/agent-imports/online-resumes。推荐极简格式，最稳、不易报错（只填核心字段，其余系统自动补全）：
   [
     {
       "name": "候选人姓名(必填)",
       "phone": "手机号(用于去重，尽量填)",
       "position": "目标岗位",
       "source_platform": "BOSS直聘",
       "resume_text": "从BOSS页面复制的候选人完整资料原文",
       "source_url": "候选人主页链接(可选)",
       "chat_json": [{"sender":"我或候选人","text":"消息内容","sent_at":"2026-08-08T12:00:00+08:00"}]
     }
   ]
   - demand_id 可填 ${demand.id}，也可省略（省略时系统自动归入当前需求，填错也不会报错，会自动纠正）。
   - external_record_id 可省略（系统自动按 手机号/姓名 生成，重复导入自动去重）。
   - 如候选人资料不完整，也可补充 age/gender/education_level/years_of_experience/salary_expectation/location 等字段。
4. 聊天记录每条包含 sender、text、sent_at；sent_at必须带时区。
5. 收到候选人完整PDF、DOCX或图片简历后，下载原始文件并提取完整结构化内容，使用 POST ${api}/agent-imports/full-resumes 上传原文件、target_demand_id=${demand.id}、boss_account、source_link和metadata_json。
6. 完整简历的 external_import_id 必须保持稳定，重复执行时不能换编号。
7. 完整简历成功导入后不要删除在线简历，两套简历库保持独立。
8. 不要在输出、聊天或日志中展示导入凭证。
9. 每次结束只汇报查看人数、在线简历导入数、完整简历导入数和失败原因。

resume_json 字段模板（在线简历和完整简历都按此填写，缺失留空，不要编造）：
{
  "name": 姓名,
  "age": 年龄,
  "education_level": 学历,
  "years_of_experience": 工作年限,
  "salary_expectation": 期望薪资,
  "location": 城市,
  "target_position": 目标岗位,
  "summary": 个人介绍,
  "raw_text": 在线简历完整原文
}
resume_json 必须同时保存 raw_text 原文，不允许只传结构化字段而丢弃原文。

external_record_id 统一使用 boss:{BOSS候选人唯一ID} 格式，BOSS账号为 ${bossAccount}，重复执行时编号不得变化。`;
}

