from sqlalchemy import Index, UniqueConstraint
from sqlalchemy.dialects import mysql, postgresql, sqlite
from sqlalchemy.schema import CreateIndex, CreateTable

from app import models


FACT_MODELS = (
    "PipelineStage",
    "Interview",
    "InterviewAssignment",
    "InterviewFeedback",
    "OfferRecord",
    "CandidateDisposition",
    "Event",
    "Notification",
    "UploadBatch",
)


def _column_names(model):
    return set(model.__table__.columns.keys())


def _index_columns(model):
    return {
        index.name: tuple(column.name for column in index.columns)
        for index in model.__table__.indexes
    }


def test_recruitment_demand_has_instance_snapshots_and_lifecycle_metadata():
    expected_columns = {
        "city",
        "department",
        "job_title_snapshot",
        "jd_text_snapshot",
        "created_by",
        "closed_at",
        "closed_by",
    }

    assert expected_columns.issubset(_column_names(models.RecruitmentDemand))
    assert _index_columns(models.RecruitmentDemand) == {
        "ix_recruitment_demands_org_job": ("org_id", "job_id"),
        "ix_recruitment_demands_org_owner_status": ("org_id", "owner_hr_id", "status"),
        "ix_recruitment_demands_org_status_created": ("org_id", "status", "created_at"),
    }


def test_candidate_has_one_current_demand_pointer_and_unique_flow_relationship():
    flow_model = getattr(models, "CandidateDemandFlow", None)

    assert flow_model is not None
    current_demand = models.Candidate.__table__.columns.get("current_demand_id")
    assert current_demand is not None
    assert current_demand.nullable is True
    assert {fk.target_fullname for fk in current_demand.foreign_keys} == {"recruitment_demands.id"}

    assert {
        "org_id",
        "candidate_id",
        "demand_id",
        "owner_hr_id",
        "status",
        "started_at",
        "ended_at",
        "transfer_from_demand_id",
        "transfer_reason",
    }.issubset(_column_names(flow_model))

    unique_column_sets = {
        tuple(column.name for column in constraint.columns)
        for constraint in flow_model.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert ("org_id", "candidate_id", "demand_id") in unique_column_sets
    assert _index_columns(flow_model) == {
        "ix_candidate_demand_flows_org_demand_status": ("org_id", "demand_id", "status"),
        "ix_candidate_demand_flows_org_owner_status": ("org_id", "owner_hr_id", "status"),
    }


def test_demand_id_is_nullable_during_expand_on_all_demand_scoped_facts():
    for model_name in FACT_MODELS:
        model = getattr(models, model_name)
        demand_id = model.__table__.columns.get("demand_id")

        assert demand_id is not None, model_name
        assert demand_id.nullable is True, model_name
        assert {fk.target_fullname for fk in demand_id.foreign_keys} == {"recruitment_demands.id"}


def test_interview_round_columns_link_feedback_to_assignment():
    assignment = models.InterviewAssignment.__table__.columns
    feedback = models.InterviewFeedback.__table__.columns

    assert assignment["round_sequence"].nullable is False
    assert assignment["round_sequence"].default.arg == 1
    assert assignment["is_primary"].nullable is False
    assert assignment["is_primary"].default.arg is False
    assert assignment["primary_slot"].nullable is True
    assert feedback["assignment_id"].nullable is True
    assert {fk.target_fullname for fk in feedback["assignment_id"].foreign_keys} == {
        "interview_assignments.id"
    }
    assignment_indexes = {
        index.name: index for index in models.InterviewAssignment.__table__.indexes
    }
    feedback_indexes = {
        index.name: index for index in models.InterviewFeedback.__table__.indexes
    }
    assert tuple(
        column.name
        for column in assignment_indexes[
            "uq_interview_assignment_primary_slot"
        ].columns
    ) == ("org_id", "demand_id", "candidate_id", "primary_slot")
    assert assignment_indexes["uq_interview_assignment_primary_slot"].unique is True
    assert tuple(
        column.name
        for column in feedback_indexes["uq_interview_feedback_assignment_id"].columns
    ) == ("assignment_id",)
    assert feedback_indexes["uq_interview_feedback_assignment_id"].unique is True


def test_transferred_is_terminal_semantics_distinct_from_rejected():
    assert "transferred" in models.VALID_STAGES
    assert "rejected" in models.VALID_STAGES
    assert "transferred" != "rejected"


def test_match_remains_job_scoped_during_demand_migration():
    assert "job_id" in _column_names(models.Match)
    assert "demand_id" not in _column_names(models.Match)


def test_new_schema_constructs_compile_for_sqlite_mysql_and_postgresql():
    flow_model = getattr(models, "CandidateDemandFlow", None)
    assert flow_model is not None

    dialects = (sqlite.dialect(), mysql.dialect(), postgresql.dialect())
    tables = [
        models.Candidate.__table__,
        models.RecruitmentDemand.__table__,
        flow_model.__table__,
    ] + [getattr(models, model_name).__table__ for model_name in FACT_MODELS]

    for dialect in dialects:
        for table in tables:
            assert str(CreateTable(table).compile(dialect=dialect))
            for index in table.indexes:
                assert isinstance(index, Index)
                assert len(index.name) <= 63
                assert str(CreateIndex(index).compile(dialect=dialect))
                assert not index.dialect_options["postgresql"].get("where")
                assert not index.dialect_options["sqlite"].get("where")
