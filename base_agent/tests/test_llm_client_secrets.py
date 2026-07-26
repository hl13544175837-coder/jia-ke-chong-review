import subprocess

from llm_client import LLMClient, resolve_secret_value


def test_resolve_keychain_secret(monkeypatch):
    def fake_run(cmd, check, capture_output, text):
        assert cmd == [
            "security",
            "find-generic-password",
            "-s",
            "zhipin-deepseek-api-key",
            "-w",
        ]
        return subprocess.CompletedProcess(cmd, 0, stdout="sk-from-keychain\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    assert resolve_secret_value("keychain:zhipin-deepseek-api-key") == "sk-from-keychain"


def test_llm_client_uses_resolved_keychain_env(monkeypatch):
    import llm_client

    def fake_run(cmd, check, capture_output, text):
        return subprocess.CompletedProcess(cmd, 0, stdout="sk-from-keychain\n", stderr="")

    class DummyAPIKeyManager:
        def __init__(self, keys):
            self.keys = keys

        def get_key(self):
            return self.keys[0]

    monkeypatch.setenv("OPENAI_API_KEY", "keychain:zhipin-deepseek-api-key")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(llm_client, "APIKeyManager", DummyAPIKeyManager)

    client = LLMClient()

    assert client._resolve_key() == "sk-from-keychain"


def test_image_resume_parser_uses_resolved_keychain_env(monkeypatch):
    from image_resume_parser import DashScopeVisionConfig

    def fake_run(cmd, check, capture_output, text):
        return subprocess.CompletedProcess(cmd, 0, stdout="sk-from-keychain\n", stderr="")

    monkeypatch.setenv("DASHSCOPE_API_KEY", "keychain:zhipin-dashscope-api-key")
    monkeypatch.setenv(
        "DASHSCOPE_BASE_URL",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    monkeypatch.setattr(subprocess, "run", fake_run)

    config = DashScopeVisionConfig.from_environment()

    assert config.api_key == "sk-from-keychain"
