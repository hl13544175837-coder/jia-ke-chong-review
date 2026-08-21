from app.models import User


def test_demo_users_have_clear_display_labels_without_rewriting_account_data():
    from app.services.account_display_service import account_display_name

    demo_recruiter = User(
        name="招聘专员01",
        email="hr01@mvp.local",
        role="recruiter",
    )
    demo_interviewer = User(
        name="面试官01",
        email="interviewer01@mvp.local",
        role="interviewer",
    )
    colleague = User(
        name="真实同事",
        email="employee@example.com",
        role="recruiter",
    )

    assert account_display_name(demo_recruiter) == "李亚辉"
    assert account_display_name(demo_interviewer) == "贵磊"
    assert account_display_name(colleague) == "真实同事"
