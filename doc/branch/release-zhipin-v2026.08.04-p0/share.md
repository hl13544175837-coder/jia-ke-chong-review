# 分支工作记录：release/zhipin-v2026.08.04 一期 P0 修复

## 本轮工作摘要（2026-08-05）

在 `release/zhipin-v2026.08.04` 分支完成一期试用 8 项 P0 修复，全部已提交：

1. **候选人详情统一**：详情页签固定为「简历 + 招聘流程」两页签（CandidateDetailTabs），候选人库/需求/面试管理/业务筛选/看板全部接入统一外壳 CandidateDetailWorkspace；看板历史抽屉改为统一详情（含简历与流程历史），操作按钮移入右下角 DetailActionBar。
2. **操作按钮统一**：看板卡片内联「更新阶段」按钮移除，统一为右下角实心主操作 + 空心关闭；危险操作为红色。
3. **状态显示统一**：新建 `candidateStagePresentation.ts` 统一候选人阶段名与色（候选人库/需求/看板三处此前各写各的）；修复业务筛选 `need_more_info`→`needs_info` key 拼写 bug（此前该状态落灰）；面试状态双轨收敛到共享 `interviewStatusPresentation`；`statusToneClasses` 移入 recruitmentPresentation.ts 作为单一真源。
4. **查询筛选**：候选人库/需求/面试工作台三处搜索框加「搜索」按钮并改为显式触发；需求列表新增 HC 状态与截止时间筛选（后端 `apply_list_filters` 新增 `deadline` 参数，兼容前端命名 overdue/dueSoon/unset 与规格别名）；删除 RequisitionFilter/InterviewFilterPopover 死组件。
5. **工作台待办**：新增「待确认改约」（后端 GET /api/interview/reschedule-requests/pending）、「待处理简历」、「安排下一轮」三类待办，点击深链直达；清理 TodoPanel 等 5 个 mock 死组件与 mocks/dashboard.ts。
6. **面试流程**：主面试官提交评价且推荐 next_round 时，反馈提交成功后自动创建下一轮主面试任务（独立事务，失败静默降级），通知 HR 待安排；响应新增 next_round_created/next_round_sequence。
7. **简历解析**：前后端完全移除 ZIP 支持（前端 accept/文案、后端 ALLOWED/_process_zip），保留 PDF/DOCX/图片；失败保留原文件 + 重新解析/手动补录维持既有能力。
8. **需求入口权限**：面试官提交/重提需求复用招聘专员的 RequisitionForm（迁移至 features/demands/components 以满足模块边界），JD 可编辑且仅作用于本次需求；审核按钮与权限维持既有（manager/admin/本人 recruiter）。

## 验证

- 前端：type-check 0 错误、eslint 0 警告、vite build 成功、契约测试 130/130（含按新规范更新的 5 项断言）。
- 后端：本机无 Python 运行时，pytest 未能执行；已做全量 diff 静态审查（自动创建下一轮、改约待办接口、deadline 筛选、去 ZIP 链路），新增/更新 4 个测试文件待环境就绪后运行。

## 待办

- 有 Python 环境后运行：backend/tests 中 test_demand_interview_rounds、test_demand_p0_contract、test_interview_reschedule_workflow、test_security_hardening_next。
