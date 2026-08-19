"""Present fixed demo identities clearly without changing stored user accounts."""


DEMO_ACCOUNT_DISPLAY_NAMES = {
    "hr01@mvp.local": "演示账号·招聘专员01",
    "hr02@mvp.local": "演示账号·招聘专员02",
    "hr03@mvp.local": "演示账号·招聘专员03",
    "interviewer01@mvp.local": "演示账号·面试官01",
    "interviewer02@mvp.local": "演示账号·面试官02",
}


def account_display_name(user) -> str:
    if user is None:
        return ""
    return DEMO_ACCOUNT_DISPLAY_NAMES.get(user.email, user.name or user.email or "")
