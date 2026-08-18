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
3. 在线简历使用 POST ${api}/agent-imports/online-resumes。请严格使用包含 items 的 JSON 对象，不要直接发送数组：
   {
     "items": [
       {
         "demand_id": ${demand.id},
         "external_record_id": "boss:{BOSS候选人唯一ID}",
         "boss_account": ${JSON.stringify(bossAccount)},
         "name": "候选人姓名(必填)",
         "phone": "手机号(用于去重，尽量填)",
         "position": "目标岗位",
         "source_platform": "BOSS直聘",
         "resume_text": "从BOSS页面复制的候选人完整资料原文",
         "source_url": "候选人主页链接(可选)",
         "chat_json": [{"sender":"我或候选人","text":"消息内容","sent_at":"2026-08-08T12:00:00+08:00"}]
       }
     ]
   }
   - demand_id 必填，且本次固定为 ${demand.id}。缺失、填错或越权都会导入失败。
   - external_record_id 统一使用 boss:{BOSS候选人唯一ID}，重复执行时不得换编号。
   - 如候选人资料不完整，也可补充 age/gender/education_level/years_of_experience/salary_expectation/location 等字段。
4. 聊天记录每条包含 sender、text、sent_at；sent_at必须带时区。
5. 收到候选人完整PDF、DOCX或图片简历后，下载原始文件并提取完整结构化内容，使用 POST ${api}/agent-imports/full-resumes 上传原文件、target_demand_id=${demand.id}、boss_account、source_link和metadata_json。
6. 完整简历的 external_import_id 必须保持稳定，重复执行时不能换编号。
7. 完整简历成功导入后不要删除在线简历，两套简历库保持独立。
8. 不要在输出、聊天或日志中展示导入凭证。
9. 每次结束只汇报查看人数、在线简历导入数、完整简历导入数和失败原因。

resume_json 如需显式提供，必须按以下结构填写（缺失留空，不要编造）：
{
  "extracted_info": {
    "name": "姓名",
    "age": "年龄",
    "education_level": "学历",
    "years_of_experience": "工作年限",
    "salary_expectation": "期望薪资",
    "location": "城市",
    "target_position": "目标岗位",
    "summary": "个人介绍"
  },
  "raw_text": "在线简历完整原文"
}
推荐极简请求可以不传 resume_json，系统会从顶层字段和 resume_text 自动生成上述结构，并保存 raw_text 原文。

external_record_id 统一使用 boss:{BOSS候选人唯一ID} 格式，BOSS账号为 ${bossAccount}，重复执行时编号不得变化。`;
}
