# 2026-08-04 招聘产品优化核验记录

## 范围

- 包含：已批准的页面统一项，以及执行计划中的第 1、5、6、7、8、9 项。
- 排除：企微消息、企微日历、ZIP 解析。
- 基线：当前功能分支 `codex/sit-release-hardening-spec`，基于 `cfpd/test` 的 `a166d0c62c1327436f83e2a41014de5fcbf7fd8d`。
- 保护：开工时已有的未提交改动均保留；本轮不执行重置、回退、提交或推送。

## 改动前基线

| 检查 | 结果 |
|---|---|
| 前端 `node --test tests/*.test.mjs` | 112/112 通过 |
| 前端 `npm run type-check` | 通过 |
| 后端 `../.venv/bin/pytest -q` | 666/666 通过；5 条第三方 SWIG 弃用警告 |

## 分项核验

### 序号 1：本次需求 JD 可编辑

- RED：后端空 JD 用例返回 200，前端契约缺少更新字段并仍为只读，均按预期失败。
- GREEN：`../.venv/bin/pytest -q tests/test_demand_approval.py`，12/12 通过。
- GREEN：`node --test tests/interviewer-demand-detail-contract.test.mjs`，4/4 通过。
- GREEN：`npm run type-check`，通过。
- 数据边界：只写 `RecruitmentDemand.jd_text_snapshot`，测试确认 `Job.jd_text` 不变。

## 最终自动化结果

| 检查 | 最终结果 |
|---|---|
| 后端 `../.venv/bin/pytest -q` | 673/673 通过；5 条第三方 SWIG 弃用警告 |
| 前端 `node --test tests/*.test.mjs` | 119/119 通过 |
| 前端 `npm run type-check` | 通过 |
| 前端 `npm run lint` | 通过 |
| 前端 `npm run build` | 通过；1711 个模块完成构建 |
| `git diff --check` | 通过 |
| Alembic | 唯一 head 为 `20260804_14`；本地演示库已升级到该版本 |

全量后端第一次运行出现 15 个失败，全部是新增 revision 14 后旧测试和发布校验仍期待 revision 13。已同步构建信息、发布脚本、迁移校验和对应测试，再次全量运行后 673 项全部通过，没有跳过失败。

## 分项结果

| 序号 | 结果 | 核验依据 |
|---:|---|---|
| 1 | 只修改本次需求 JD 副本，不改公共模板 | 后端测试确认 `RecruitmentDemand.jd_text_snapshot` 更新且 `Job.jd_text` 不变；页面实际显示可编辑 JD 和“不改公共岗位模板”提示 |
| 5 | 历史评价一直可看 | 已移除 `feedback_locked`；面试官能看到同一需求当前轮及此前轮次完整评价，未来轮次和无关需求仍受权限保护 |
| 6 | 操作记录包含谁、何时、动作、原因 | 统一由 `candidate_activity_service.py` 组装；页面实际显示安排、评价、阶段变化及缺失原因占位 |
| 7 | 工作台有候选人级待沟通 | 页面实际出现“待沟通”，点击进入对应候选人和需求；发现前四条可能遮住后已修为默认至少展示一条，并支持当前页展开全部 |
| 8 | 所有候选人详情固定三个页签 | 候选人库、需求、面试管理、面试官筛选、面试官面试、Offer 姓名入口均接入同一页签组件；顺序固定为“面试信息 / 候选人简历 / 面试评价” |
| 9 | Offer 页面登记 OA 结果 | 页面固定“待登记 / 跟进中 / 已完成”，默认最近 7 天；弹窗包含 OA 编号、状态、备注，并明确不调用外部 OA |

## 现场冒烟中额外发现并修复

1. 待沟通任务虽已生成，但可能被前四条高优先级任务遮住；已保证默认至少展示一条，并把“查看全部”改成当前页展开。
2. 候选人已经进入 Offer、但尚无旧 `OfferRecord` 时，历史详情错误显示“暂未进入 Offer”；已增加当前阶段字段，改为“已进入 Offer，待登记 OA 结果”。
3. 新增 OA 迁移后，发布脚本和旧迁移测试仍期待 revision 13；已统一到 revision 14 并重跑全量。

## 数据保护

- 升级前备份：`runtime/backups/zhipin-demo.db.before-offer-oa-20260804.bak`。
- 企微消息、企微日历、ZIP 解析均未改动。
- 为展示“驳回后修改 JD”在本地演示库临时把 `DEMO-DEMAND-PENDING` 标为未通过；截图完成后已恢复为 `status=pending`、`approval_status=pending`，审核人、审核时间和驳回原因均已清空。

## 截图

截图目录：`docs/verification/2026-08-04-recruitment-six-optimizations/`。共 13 张，全部为 1280×720。

| 截图 | 核验内容 |
|---|---|
| `actual-01-demand-list.png` | 招聘需求查询控件、状态颜色、操作栏 |
| `actual-02-demand-detail.png` | 面试官需求详情和驳回原因 |
| `actual-03-candidate-detail.png` | 招聘专员候选人三个页签、完整历史评价 |
| `actual-04-interview-list.png` | 招聘专员面试查询控件、状态颜色、操作栏 |
| `actual-05-interview-detail.png` | 招聘专员面试详情三个页签、固定底部按钮、历史记录 |
| `actual-06-recruiter-dashboard.png` | 工作台候选人级“待沟通” |
| `actual-07-interviewer-screening.png` | 面试官候选人筛选查询控件和状态 |
| `actual-08-interviewer-candidate-detail.png` | 面试官候选人三个页签、固定底部按钮 |
| `actual-09-interviewer-interviews.png` | 面试官面试列表和操作按钮 |
| `actual-10-interviewer-interview-detail.png` | 面试官历史评价、操作者、时间、动作和原因 |
| `actual-11-offer-list.png` | Offer 待登记、跟进中、已完成三分类 |
| `actual-12-offer-oa-modal.png` | OA 编号、状态、备注登记弹窗 |
| `actual-13-interviewer-jd-edit.png` | 本次需求 JD 可编辑，公共岗位模板不可改 |

## 真实浏览器冒烟

- 招聘专员、面试官、招聘经理三种角色均完成登录、退出和重新登录。
- 候选人库、面试管理、面试官筛选、面试官面试和 Offer 入口均完成页面核验。
- 页面固定显示“面试信息 / 候选人简历 / 面试评价”三个页签；底部按钮随角色和状态变化。
- 历史评价和操作记录可见；未来轮次、其他需求、其他组织的数据边界继续由后端权限测试保护。
- Offer 三分类和 OA 登记弹窗正常；持久化和分类变化由后端、前端自动化测试验证。
- 工作台“待沟通”可见并能进入正确候选人；处理后消失由自动化测试验证。

现场 Mac 一直处于锁屏状态，Tabbit 无法被自动控制。本轮没有打开 Chrome，使用 Codex 内置真实浏览器完成了等价的真实页面冒烟和截图。这个限制只影响截图载体，不影响产品代码、自动化结果和页面核验结论。
