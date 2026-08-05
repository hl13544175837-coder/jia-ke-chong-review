from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(relative_path):
    return (ROOT / relative_path).read_text(encoding="utf-8")


def _line_count(relative_path):
    return len(_read(relative_path).splitlines())


def test_large_api_modules_delegate_domain_route_groups_without_new_blueprints():
    interview = _read("backend/app/api/interview.py")
    resume = _read("backend/app/api/resume.py")
    candidates = _read("backend/app/api/candidates.py")
    route_modules = [
        "backend/app/api/interview_assignments.py",
        "backend/app/api/interview_reschedules.py",
        "backend/app/api/resume_history.py",
        "backend/app/api/candidate_actions.py",
        "backend/app/api/candidate_admin.py",
        "backend/app/api/candidate_journey.py",
    ]

    assert 'bp = Blueprint("interview", __name__)' in interview
    assert 'bp = Blueprint("resume", __name__)' in resume
    assert 'bp = Blueprint("candidates", __name__)' in candidates
    assert "register_interview_assignment_routes(bp)" in interview
    assert "register_interview_reschedule_routes(bp)" in interview
    assert "register_resume_history_routes(bp)" in resume
    assert "register_candidate_action_routes(bp)" in candidates
    assert "register_candidate_admin_routes(bp)" in candidates
    assert "register_candidate_journey_routes(bp)" in candidates
    for relative_path in route_modules:
        source = _read(relative_path)
        assert "Blueprint(" not in source
        assert "def register_" in source

    assert _line_count("backend/app/api/interview.py") < 1000
    assert _line_count("backend/app/api/resume.py") < 1150
    assert _line_count("backend/app/api/candidates.py") < 1000


def test_offer_lifecycle_is_separate_from_candidate_stage_transitions():
    pipeline = _read("backend/app/services/pipeline_service.py")
    offers = _read("backend/app/services/offer_service.py")

    assert "from ..services.offer_service import" in _read("backend/app/api/pipeline.py")
    assert "def transition_offer" not in pipeline
    assert "def transition_offer" in offers
    assert "def offer_payload" in offers
    assert _line_count("backend/app/services/pipeline_service.py") < 900


def test_candidate_activity_and_offer_workbench_stay_in_domain_services():
    journey_route = _read("backend/app/api/candidate_journey.py")
    activity_service = _read("backend/app/services/candidate_activity_service.py")
    pipeline_route = _read("backend/app/api/pipeline.py")
    offer_service = _read("backend/app/services/offer_service.py")

    assert "build_candidate_activity(" in journey_route
    assert "def build_candidate_activity" in activity_service
    assert "def list_offer_workbench" not in pipeline_route
    assert "def register_oa_result" not in pipeline_route
    assert "def list_offer_workbench" in offer_service
    assert "def register_oa_result" in offer_service


def test_services_do_not_import_api_layer():
    service_root = ROOT / "backend/app/services"
    offenders = []
    for path in service_root.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if (
            "api.access" in source
            or "from ..api" in source
            or "from ...api" in source
        ):
            offenders.append(str(path.relative_to(ROOT)))

    assert offenders == []


def test_access_policy_has_a_service_owner_and_api_is_only_a_facade():
    policy_path = ROOT / "backend/app/services/access_policy.py"
    assert policy_path.is_file(), "权限策略必须由 services 层拥有"

    policy = _read("backend/app/services/access_policy.py")
    facade = _read("backend/app/api/access.py")
    assert "def can_access_candidate" in policy
    assert "def visible_candidate_query" in policy
    assert "from ..services.access_policy import" in facade
    assert _line_count("backend/app/api/access.py") < 40
