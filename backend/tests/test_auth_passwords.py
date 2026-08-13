import hashlib
import pytest

from app.api.auth import _hash, _verify


def test_verify_accepts_bcrypt_password_hash():
    hashed = _hash("demo1234")

    assert _verify("demo1234", hashed)
    assert not _verify("wrong-password", hashed)


def test_verify_accepts_legacy_sha256_seed_hash():
    legacy_hash = hashlib.sha256("demo1234".encode()).hexdigest()

    assert _verify("demo1234", legacy_hash)
    assert not _verify("wrong-password", legacy_hash)


def test_verify_rejects_malformed_stored_hash():
    assert not _verify("demo1234", "not-a-password-hash")


def test_verify_does_not_hide_unexpected_bcrypt_failures(monkeypatch):
    def fail_unexpectedly(*_args, **_kwargs):
        raise RuntimeError("bcrypt runtime unavailable")

    monkeypatch.setattr("app.api.auth.bcrypt.checkpw", fail_unexpectedly)

    with pytest.raises(RuntimeError, match="bcrypt runtime unavailable"):
        _verify("demo1234", "$2b$12$placeholder")
