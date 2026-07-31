import importlib


def _resume_ai_enabled(monkeypatch, *, channel, image_value, sit_value):
    monkeypatch.setenv("BUILD_CHANNEL", channel)
    monkeypatch.setenv("RESUME_AI_ENABLED", image_value)
    monkeypatch.setenv("SIT_RESUME_AI_ENABLED", sit_value)

    import app.config as config_module

    config_module = importlib.reload(config_module)
    return config_module.Config.RESUME_AI_ENABLED


def test_sit_can_explicitly_enable_resume_ai_over_rc_image_default(monkeypatch):
    assert _resume_ai_enabled(
        monkeypatch,
        channel="RC",
        image_value="false",
        sit_value="true",
    ) is True


def test_sit_override_does_not_enable_resume_ai_in_ga(monkeypatch):
    assert _resume_ai_enabled(
        monkeypatch,
        channel="GA",
        image_value="false",
        sit_value="true",
    ) is False
