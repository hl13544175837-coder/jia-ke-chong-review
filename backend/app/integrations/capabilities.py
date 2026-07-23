from dataclasses import dataclass


@dataclass(frozen=True)
class IntegrationCapabilityDefinition:
    code: str
    name: str
    owner: str
    description: str
    required_inputs: tuple[str, ...]


CAPABILITY_DEFINITIONS = (
    IntegrationCapabilityDefinition(
        code="recruitment_demand_oa",
        name="OA 招聘需求",
        owner="OA / NES 负责人",
        description="承接审批通过的招聘需求、JD、HC、部门和附件，并回写招聘结果。",
        required_inputs=(
            "nesSendOaWorkflow 负责人、NES 与 PGS 关系",
            "接口地址、鉴权方式和 MQ 配置",
            "申请编号、JD、HC、部门、申请人和审批状态字段",
            "附件下载协议",
            "已招人数、剩余 HC 和需求关闭结果回写协议",
        ),
    ),
    IntegrationCapabilityDefinition(
        code="wecom_material_delivery",
        name="企业微信候选人资料发送",
        owner="企业微信超级管理员",
        description="向面试官发送结构化候选人资料和安全简历入口。",
        required_inputs=(
            "CorpID、AgentID 和 Secret",
            "员工 UserID 映射",
            "消息与卡片权限",
            "可信 IP / 固定出口 IP",
        ),
    ),
    IntegrationCapabilityDefinition(
        code="wecom_calendar",
        name="企业微信日程",
        owner="企业微信超级管理员",
        description="创建、修改和取消面试官的企业微信面试日程。",
        required_inputs=(
            "CorpID、AgentID 和 Secret",
            "日程接口权限",
            "员工 UserID 映射",
            "回调域名与可信 IP",
        ),
    ),
    IntegrationCapabilityDefinition(
        code="wecom_scorecard_delivery",
        name="企业微信评分卡发送",
        owner="企业微信超级管理员",
        description="面试开始 30 分钟后发送 JD 评分卡，评价结果回到智聘。",
        required_inputs=(
            "CorpID、AgentID 和 Secret",
            "卡片消息协议",
            "回调域名与可信 IP",
            "回调签名与加密配置",
        ),
    ),
    IntegrationCapabilityDefinition(
        code="meeting_arrangement",
        name="会议平台 / 会议室",
        owner="会议系统负责人",
        description="创建、修改、取消线上会议或查询、预订线下会议室。",
        required_inputs=("会议系统名称与负责人", "接口地址", "鉴权方式", "会议类型与状态字典"),
    ),
    IntegrationCapabilityDefinition(
        code="offer_oa",
        name="Offer OA 审批",
        owner="Offer OA 流程负责人",
        description="发起和查询 Offer 审批，承接通过、驳回、撤回和重提状态。",
        required_inputs=(
            "流程定义",
            "接口地址",
            "鉴权方式",
            "申请字段",
            "审批文件 / 附件协议",
            "状态字典",
            "回调协议",
        ),
    ),
    IntegrationCapabilityDefinition(
        code="offer_delivery",
        name="Offer 发放 / 电子签",
        owner="Offer 发放系统负责人",
        description="在 Offer OA 通过后发放、签署 Offer，并回传接受、拒绝和过期结果。",
        required_inputs=("现有系统名称与负责人", "接口地址", "鉴权方式", "Offer 模板与字段", "状态与回调协议"),
    ),
    IntegrationCapabilityDefinition(
        code="hris_onboarding",
        name="HRIS 入职",
        owner="HRIS / 入职系统负责人",
        description="承接待入职、正式入职、放弃和延期结果，正式入职后才更新 HC。",
        required_inputs=("接口地址", "鉴权方式", "候选人映射主键", "入职状态字典", "HC 字段与回调协议"),
    ),
)
