from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_seed_uses_neutral_mvp_trial_accounts():
    seed_text = (ROOT / "backend" / "seed_dev.py").read_text(encoding="utf-8")

    assert "@demo.com" not in seed_text
    assert "demo1234" not in seed_text
    assert "Zhipin2026" in seed_text

    for email in [
        "admin01@mvp.local",
        "manager01@mvp.local",
        "lead01@mvp.local",
        "hr01@mvp.local",
        "hr02@mvp.local",
        "hr03@mvp.local",
        "interviewer01@mvp.local",
        "interviewer02@mvp.local",
        "director01@mvp.local",
    ]:
        assert email in seed_text
