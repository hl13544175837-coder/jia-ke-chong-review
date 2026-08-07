"""Short-lived signed tickets for opening original resumes in a new tab."""

import hashlib
import hmac
from datetime import datetime, timezone

PREVIEW_TICKET_TTL_SECONDS = 60
_MAX_ACCEPTED_TICKET_AGE_SECONDS = 300


def build_preview_ticket(secret: str, org_id: int, candidate_id: int, exp: int) -> str:
    payload = f"{org_id}:{candidate_id}:{exp}"
    return hmac.new(
        str(secret).encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def validate_preview_ticket(
    secret: str,
    org_id: int,
    candidate_id: int,
    exp,
    ticket,
) -> bool:
    try:
        exp_ts = int(exp)
    except (TypeError, ValueError):
        return False
    now = int(datetime.now(timezone.utc).timestamp())
    if not now <= exp_ts <= now + _MAX_ACCEPTED_TICKET_AGE_SECONDS:
        return False
    expected = build_preview_ticket(secret, org_id, candidate_id, exp_ts)
    return hmac.compare_digest(expected, str(ticket or ""))
