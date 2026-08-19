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

    assert account_display_name(demo_recruiter) == "演示账号·招聘专员01"
    assert account_display_name(demo_interviewer) == "演示账号·面试官01"
    assert account_display_name(colleague) == "真实同事"
