"""Present fixed demo identities clearly without changing stored user accounts."""


DEMO_ACCOUNT_DISPLAY_NAMES = {
    "hr01@mvp.local": "演示账号·招聘专员01",
    "hr02@mvp.local": "演示账号·招聘专员02",
    "hr03@mvp.local": "演示账号·招聘专员03",
    "interviewer01@mvp.local": "演示账号·面试官01",
    "interviewer02@mvp.local": "演示账号·面试官02",
    "100000@gateway.local": "验收账号·面试官02",
    "100001@gateway.local": "验收账号·招聘主管",
    "100002@gateway.local": "验收账号·招聘专员",
    "100003@gateway.local": "验收账号·面试官01",
}


def account_display_name(user) -> str:
    if user is None:
        return ""
    return DEMO_ACCOUNT_DISPLAY_NAMES.get(user.email, user.name or user.email or "")
