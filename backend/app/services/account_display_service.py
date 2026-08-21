"""Present fixed demo identities clearly without changing stored user accounts."""


DEMO_ACCOUNT_DISPLAY_NAMES = {
    "hr01@mvp.local": "李亚辉",
    "hr02@mvp.local": "杨阳",
    "hr03@mvp.local": "演示账号·招聘专员03",
    "manager01@mvp.local": "洪通",
    "interviewer01@mvp.local": "贵磊",
    "interviewer02@mvp.local": "演示账号·面试官02",
    "100000@gateway.local": "贵磊",
    "100001@gateway.local": "洪通",
    "100002@gateway.local": "李亚辉",
    "100003@gateway.local": "王杰",
}

SIT_GATEWAY_ACCOUNT_EMAILS = frozenset({
    "100000@gateway.local",
    "100001@gateway.local",
    "100002@gateway.local",
    "100003@gateway.local",
})


def account_display_name(user) -> str:
    if user is None:
        return ""
    return DEMO_ACCOUNT_DISPLAY_NAMES.get(user.email, user.name or user.email or "")
