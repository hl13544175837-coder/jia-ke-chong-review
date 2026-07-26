"""Demand headcount availability derived from onboarding and accepted Offers."""

from ..models import OfferRecord


def build_headcount_state(demand, *, onboarded_count):
    """Return one shared HC view used by workflow guards and read models."""

    accepted_offer_count = OfferRecord.query.filter_by(
        org_id=demand.org_id,
        demand_id=demand.id,
        approval_status="accepted",
    ).count()
    headcount = max(1, int(demand.headcount or 1))
    onboarded_count = int(onboarded_count or 0)
    locked_headcount = onboarded_count + accepted_offer_count
    return {
        "headcount": headcount,
        "onboarded_count": onboarded_count,
        "accepted_offer_count": accepted_offer_count,
        "locked_headcount": locked_headcount,
        "remaining_headcount": max(0, headcount - locked_headcount),
        "over_headcount": max(0, locked_headcount - headcount),
    }
