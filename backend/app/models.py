from sqlalchemy import event, inspect

from . import db
from .time_utils import utc_now


def _default_demand_request_no():
    """Keep direct ORM inserts valid without duplicating identifier rules."""
    from .services.demand_service import generate_request_no

    return generate_request_no()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    role = db.Column(db.String(20), nullable=False, default="recruiter")  # admin/manager/recruiter/interviewer/hr_director
    department = db.Column(db.String(120), default="", nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    token_version = db.Column(db.Integer, default=0, nullable=False)


class Candidate(db.Model):
    __tablename__ = "candidates"
    __table_args__ = (
        db.Index(
            "ix_candidates_org_resume_sha256",
            "org_id",
            "resume_sha256",
        ),
    )
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    current_demand_id = db.Column(
        db.Integer,
        db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"),
        index=True,
    )
    upload_batch_id = db.Column(db.Integer, db.ForeignKey("upload_batches.id"))
    name_masked = db.Column(db.String(100))
    email_masked = db.Column(db.String(100))
    phone_masked = db.Column(db.String(30))
    resume_json = db.Column(db.JSON, nullable=False)
    raw_file_path = db.Column(db.Text)
    resume_sha256 = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=utc_now)
    deleted_at = db.Column(db.DateTime)
    deleted_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    anonymized_at = db.Column(db.DateTime)
    parse_status = db.Column(db.String(20), default="ok", nullable=False)
    parse_error = db.Column(db.Text)
    tags = db.relationship("CandidateTag", backref="candidate", cascade="all,delete-orphan")
    stages = db.relationship("PipelineStage", backref="candidate")
    current_demand = db.relationship("RecruitmentDemand", foreign_keys=[current_demand_id])
    demand_flows = db.relationship("CandidateDemandFlow", back_populates="candidate")
    resume_versions = db.relationship(
        "CandidateResumeVersion",
        backref="candidate",
        cascade="all,delete-orphan",
        order_by="CandidateResumeVersion.version_no.desc()",
    )


class CandidateResumeVersion(db.Model):
    """A read-only snapshot retained before the current resume is replaced."""

    __tablename__ = "candidate_resume_versions"
    __table_args__ = (
        db.UniqueConstraint(
            "org_id",
            "candidate_id",
            "version_no",
            name="uq_candidate_resume_versions_org_candidate_no",
        ),
        db.Index(
            "ix_candidate_resume_versions_org_candidate_created",
            "org_id",
            "candidate_id",
            "created_at",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_no = db.Column(db.Integer, nullable=False)
    name_masked = db.Column(db.String(100))
    email_masked = db.Column(db.String(100))
    phone_masked = db.Column(db.String(30))
    resume_json = db.Column(db.JSON, nullable=False, default=dict)
    raw_file_path = db.Column(db.Text)
    resume_sha256 = db.Column(db.String(64))
    parse_status = db.Column(db.String(20), nullable=False, default="ok")
    parse_error = db.Column(db.Text)
    reason = db.Column(db.String(80), nullable=False, default="manual_replace")
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class UploadBatch(db.Model):
    __table_args__ = (
        db.Index("ix_upload_batches_org_demand", "org_id", "demand_id"),
    )

    __tablename__ = "upload_batches"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    source_channel = db.Column(db.String(120), default="")
    source_link = db.Column(db.Text)
    referrer = db.Column(db.String(120), default="")
    target_job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)


class CandidateTag(db.Model):
    __tablename__ = "candidate_tags"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    tag = db.Column(db.String(100), nullable=False)
    score = db.Column(db.Integer)  # 1-5


class CandidateFavorite(db.Model):
    __tablename__ = "candidate_favorites"
    __table_args__ = (
        db.UniqueConstraint(
            "org_id",
            "user_id",
            "candidate_id",
            name="uq_candidate_favorites_org_user_candidate",
        ),
        db.Index(
            "ix_candidate_favorites_org_candidate",
            "org_id",
            "candidate_id",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class CandidateMerge(db.Model):
    __tablename__ = "candidate_merges"
    __table_args__ = (
        db.UniqueConstraint(
            "org_id",
            "duplicate_candidate_id",
            name="uq_candidate_merges_org_duplicate",
        ),
        db.Index(
            "ix_candidate_merges_org_primary",
            "org_id",
            "primary_candidate_id",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    primary_candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    duplicate_candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    merged_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    reason = db.Column(db.String(240), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class Job(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    city = db.Column(db.String(80), default="")
    department = db.Column(db.String(120), default="")
    job_code = db.Column(db.String(80), default="")
    jd_text = db.Column(db.Text, nullable=False)
    jd_structured = db.Column(db.JSON)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    status = db.Column(db.String(20), default="active")
    created_at = db.Column(db.DateTime, default=utc_now)


class RecruitmentDemand(db.Model):
    __table_args__ = (
        db.Index("ix_recruitment_demands_org_job", "org_id", "job_id"),
        db.Index("ix_recruitment_demands_org_owner_status", "org_id", "owner_hr_id", "status"),
        db.Index("ix_recruitment_demands_org_status_created", "org_id", "status", "created_at"),
        db.Index(
            "ix_recruitment_demands_org_default_interviewer",
            "org_id",
            "default_interviewer_id",
        ),
        db.Index(
            "uq_recruitment_demands_org_request_no",
            "org_id",
            "request_no",
            unique=True,
        ),
    )

    __tablename__ = "recruitment_demands"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    default_interviewer_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "users.id",
            name="fk_recruitment_demands_default_interviewer_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    city = db.Column(db.String(80), default="")
    department = db.Column(db.String(120), default="")
    job_title_snapshot = db.Column(db.String(200), default="")
    jd_text_snapshot = db.Column(db.Text)
    request_no = db.Column(
        db.String(80),
        default=_default_demand_request_no,
        nullable=False,
    )
    requester_name = db.Column(db.String(120), default="")
    requester_department = db.Column(db.String(120), default="")
    hiring_manager_name = db.Column(db.String(120), default="")
    requested_at = db.Column(db.Date)
    accepted_at = db.Column(db.Date)
    target_date = db.Column(db.Date)
    priority = db.Column(db.String(1), default="B", nullable=False)
    headcount = db.Column(db.Integer, default=1, nullable=False)
    status = db.Column(db.String(20), default="active", nullable=False)
    approval_status = db.Column(db.String(20), default="approved", nullable=False)
    submitted_at = db.Column(db.DateTime)
    reviewed_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
    )
    reviewed_at = db.Column(db.DateTime)
    review_reason = db.Column(db.Text)
    close_reason = db.Column(db.Text)
    closed_at = db.Column(db.DateTime)
    closed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    downgrade_reason = db.Column(db.Text)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    job = db.relationship("Job", backref="demands")
    candidate_flows = db.relationship(
        "CandidateDemandFlow",
        back_populates="demand",
        foreign_keys="CandidateDemandFlow.demand_id",
    )


class BusinessReviewTask(db.Model):
    __tablename__ = "business_review_tasks"
    __table_args__ = (
        db.Index(
            "ix_business_reviews_org_reviewer_status",
            "org_id",
            "reviewer_id",
            "status",
        ),
        db.Index(
            "ix_business_reviews_org_demand_candidate",
            "org_id",
            "demand_id",
            "candidate_id",
        ),
        db.Index(
            "uq_business_reviews_pending_slot",
            "org_id",
            "demand_id",
            "candidate_id",
            "pending_slot",
            unique=True,
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    demand_id = db.Column(
        db.Integer,
        db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"),
        nullable=False,
    )
    candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    reviewer_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status = db.Column(db.String(20), default="pending", nullable=False)
    pending_slot = db.Column(db.Integer, default=1)
    hr_note = db.Column(db.Text)
    business_note = db.Column(db.Text)
    due_at = db.Column(db.DateTime)
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    decided_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
    )
    decided_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class CandidateDemandFlow(db.Model):
    __tablename__ = "candidate_demand_flows"
    __table_args__ = (
        db.UniqueConstraint(
            "org_id",
            "candidate_id",
            "demand_id",
            name="uq_candidate_demand_flows_org_candidate_demand",
        ),
        db.Index("ix_candidate_demand_flows_org_demand_status", "org_id", "demand_id", "status"),
        db.Index("ix_candidate_demand_flows_org_owner_status", "org_id", "owner_hr_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    demand_id = db.Column(
        db.Integer,
        db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"),
        nullable=False,
    )
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"))
    status = db.Column(db.String(20), default="active", nullable=False)
    started_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    ended_at = db.Column(db.DateTime)
    transfer_from_demand_id = db.Column(
        db.Integer,
        db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"),
    )
    transfer_reason = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    candidate = db.relationship("Candidate", back_populates="demand_flows")
    demand = db.relationship(
        "RecruitmentDemand",
        back_populates="candidate_flows",
        foreign_keys=[demand_id],
    )


class TalentMap(db.Model):
    __tablename__ = "talent_maps"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    name = db.Column(db.String(200), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    department = db.Column(db.String(120), default="")
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    board_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    job = db.relationship("Job", backref="talent_maps")
    companies = db.relationship(
        "TalentMapCompany",
        backref="talent_map",
        cascade="all,delete-orphan",
        order_by="TalentMapCompany.id",
    )
    people = db.relationship(
        "TalentMapPerson",
        backref="talent_map",
        cascade="all,delete-orphan",
        order_by="TalentMapPerson.id",
    )


class TalentMapCompany(db.Model):
    __tablename__ = "talent_map_companies"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    map_id = db.Column(db.Integer, db.ForeignKey("talent_maps.id", ondelete="CASCADE"), nullable=False)
    company_name = db.Column(db.String(200), nullable=False)
    city = db.Column(db.String(80), default="")
    region = db.Column(db.String(80), default="")
    industry = db.Column(db.String(120), default="")
    priority = db.Column(db.String(40), default="medium")
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    people = db.relationship(
        "TalentMapPerson",
        backref="company",
        cascade="all",
        order_by="TalentMapPerson.id",
    )


class TalentMapPerson(db.Model):
    __tablename__ = "talent_map_people"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    map_id = db.Column(db.Integer, db.ForeignKey("talent_maps.id", ondelete="CASCADE"), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey("talent_map_companies.id"))
    name = db.Column(db.String(120), nullable=False)
    title = db.Column(db.String(160), default="")
    city = db.Column(db.String(80), default="")
    tags = db.Column(db.JSON)
    salary_range = db.Column(db.String(120), default="")
    contact_status = db.Column(db.String(80), default="未接触")
    evaluation = db.Column(db.String(120), default="")
    source = db.Column(db.String(160), default="")
    next_follow_at = db.Column(db.Date)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)


class Match(db.Model):
    __tablename__ = "matches"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    score = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)


class Interview(db.Model):
    __table_args__ = (
        db.Index("ix_interviews_org_demand_candidate", "org_id", "demand_id", "candidate_id"),
    )

    __tablename__ = "interviews"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    qa_json = db.Column(db.JSON)
    ai_report = db.Column(db.JSON)
    score = db.Column(db.Float)
    pass_recommended = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime, default=utc_now)


VALID_STAGES = {
    "pending", "ai_screen", "business_review",
    "interview",
    "interview_first", "interview_second", "interview_final",
    "offer", "onboarded", "rejected",
    "transferred",
}


class PipelineStage(db.Model):
    __table_args__ = (
        db.Index(
            "ix_pipeline_stages_org_demand_candidate_ts",
            "org_id",
            "demand_id",
            "candidate_id",
            "ts",
        ),
    )

    __tablename__ = "pipeline_stages"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    stage = db.Column(db.String(50), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    note = db.Column(db.Text)  # 本次阶段变更原因/备注，可空
    ts = db.Column(db.DateTime, default=utc_now)


class CandidateDisposition(db.Model):
    __table_args__ = (
        db.Index(
            "ix_candidate_dispositions_org_demand_candidate",
            "org_id",
            "demand_id",
            "candidate_id",
        ),
    )

    __tablename__ = "candidate_dispositions"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    reason = db.Column(db.String(240), default="")
    enter_talent_pool = db.Column(db.Boolean, default=True, nullable=False)
    next_contact_at = db.Column(db.Date)
    tags = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)


class OfferRecord(db.Model):
    __table_args__ = (
        db.Index("ix_offer_records_org_demand_candidate", "org_id", "demand_id", "candidate_id"),
        db.UniqueConstraint(
            "org_id",
            "demand_id",
            "candidate_id",
            name="uq_offer_records_org_demand_candidate",
        ),
    )

    __tablename__ = "offer_records"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    salary_range = db.Column(db.String(120), default="")
    onboard_date = db.Column(db.Date)
    approval_status = db.Column(db.String(40), default="draft")
    note = db.Column(db.Text)
    approver_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    submitted_at = db.Column(db.DateTime)
    approved_at = db.Column(db.DateTime)
    sent_at = db.Column(db.DateTime)
    responded_at = db.Column(db.DateTime)
    withdrawn_at = db.Column(db.DateTime)
    expires_at = db.Column(db.DateTime)
    onboarded_at = db.Column(db.DateTime)
    rejection_reason = db.Column(db.Text)
    candidate_reply = db.Column(db.JSON)
    salary_breakdown = db.Column(db.JSON)
    oa_instance_no = db.Column(db.String(120))
    oa_status = db.Column(
        db.String(30),
        default="not_started",
        server_default="not_started",
        nullable=False,
    )
    oa_note = db.Column(db.Text)
    oa_updated_at = db.Column(db.DateTime)
    version = db.Column(db.Integer, default=1, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    history = db.relationship(
        "OfferEvent",
        backref="offer",
        cascade="all,delete-orphan",
        order_by="OfferEvent.id",
    )


class OfferEvent(db.Model):
    __table_args__ = (
        db.Index("ix_offer_events_org_offer_created", "org_id", "offer_id", "created_at"),
    )

    __tablename__ = "offer_events"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    offer_id = db.Column(
        db.Integer,
        db.ForeignKey("offer_records.id", ondelete="CASCADE"),
        nullable=False,
    )
    action = db.Column(db.String(40), nullable=False)
    from_status = db.Column(db.String(40))
    to_status = db.Column(db.String(40), nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    comment = db.Column(db.Text)
    detail = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class KpiStandard(db.Model):
    __tablename__ = "kpi_standards"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False, unique=True, index=True)
    config_json = db.Column(db.JSON, nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class OrganizationSetting(db.Model):
    __table_args__ = (
        db.UniqueConstraint("org_id", name="uq_organization_settings_org"),
        db.Index("ix_organization_settings_org_id", "org_id"),
    )
    __tablename__ = "organization_settings"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False)
    config_json = db.Column(db.JSON, nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class InterviewAssignment(db.Model):
    __table_args__ = (
        db.Index(
            "ix_interview_assignments_org_demand_candidate_round",
            "org_id",
            "demand_id",
            "candidate_id",
            "round_sequence",
        ),
        db.Index(
            "uq_interview_assignment_primary_slot",
            "org_id",
            "demand_id",
            "candidate_id",
            "primary_slot",
            unique=True,
        ),
    )

    __tablename__ = "interview_assignments"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    round = db.Column(db.String(30), nullable=False)
    round_sequence = db.Column(db.Integer, default=1, nullable=False)
    is_primary = db.Column(db.Boolean, default=False, nullable=False)
    primary_slot = db.Column(db.Integer)
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    scheduled_at = db.Column(db.DateTime)
    location = db.Column(db.String(240), default="")
    note = db.Column(db.Text)
    status = db.Column(db.String(40), default="scheduled")
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)


class InterviewRescheduleRequest(db.Model):
    __table_args__ = (
        db.Index(
            "ix_interview_reschedule_org_assignment_status",
            "org_id",
            "assignment_id",
            "status",
        ),
        db.Index(
            "ix_interview_reschedule_org_candidate_demand_round",
            "org_id",
            "candidate_id",
            "demand_id",
            "round_sequence",
        ),
    )

    __tablename__ = "interview_reschedule_requests"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("interview_assignments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    replacement_assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("interview_assignments.id", ondelete="RESTRICT"),
    )
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    demand_id = db.Column(
        db.Integer,
        db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"),
        nullable=False,
    )
    round = db.Column(db.String(30), nullable=False)
    round_sequence = db.Column(db.Integer, default=1, nullable=False)
    source = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(30), nullable=False)
    requested_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    requested_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    proposed_times = db.Column(db.JSON, nullable=False, default=list)
    original_interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    original_scheduled_at = db.Column(db.DateTime)
    original_location = db.Column(db.String(240), default="", nullable=False)
    final_interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    final_scheduled_at = db.Column(db.DateTime)
    final_location = db.Column(db.String(240), default="", nullable=False)
    processed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    processed_at = db.Column(db.DateTime)
    processor_note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class Event(db.Model):
    __table_args__ = (
        db.Index("ix_events_org_demand_ts", "org_id", "demand_id", "ts"),
    )

    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    actor_role = db.Column(db.String(20))
    action = db.Column(db.String(100), nullable=False)
    entity_id = db.Column(db.Integer)
    entity_type = db.Column(db.String(50))
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    payload = db.Column(db.JSON)
    request_id = db.Column(db.String(80))
    ip = db.Column(db.String(80))
    user_agent = db.Column(db.Text)
    result = db.Column(db.String(20), default="success", nullable=False)
    failure_reason = db.Column(db.String(240))
    source = db.Column(db.String(20), default="ui", nullable=False)
    severity = db.Column(db.String(20), default="info", nullable=False)
    ts = db.Column(db.DateTime, default=utc_now)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    target_table = db.Column(db.String(50))
    target_id = db.Column(db.Integer)
    action = db.Column(db.String(50))
    ts = db.Column(db.DateTime, default=utc_now)


class Notification(db.Model):
    __table_args__ = (
        db.Index("ix_notifications_org_demand_user", "org_id", "demand_id", "user_id"),
    )

    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text)
    link = db.Column(db.String(500))
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class IdempotencyRecord(db.Model):
    __tablename__ = "idempotency_records"
    id = db.Column(db.Integer, primary_key=True)
    scope_key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    idempotency_key = db.Column(db.String(160), nullable=False)
    actor_scope = db.Column(db.String(120), nullable=False)
    method = db.Column(db.String(12), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    body_hash = db.Column(db.String(64), nullable=False)
    status_code = db.Column(db.Integer, nullable=False)
    response_json = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class Conversation(db.Model):
    __table_args__ = (
        db.Index(
            "ix_conversations_org_user_archived_updated",
            "org_id",
            "user_id",
            "archived",
            "updated_at",
        ),
    )

    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), default="新对话")
    title_source = db.Column(db.String(20), default="auto", nullable=False)
    archived = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    messages = db.relationship(
        "ConversationMessage",
        backref="conversation",
        cascade="all,delete-orphan",
        order_by="ConversationMessage.id",
    )


class ConversationMessage(db.Model):
    __table_args__ = (
        db.Index(
            "ix_conversation_messages_org_conversation",
            "org_id",
            "conversation_id",
        ),
    )

    __tablename__ = "conversation_messages"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    tool_calls = db.Column(db.JSON)
    thoughts = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now)


class AgentCallLog(db.Model):
    __table_args__ = (
        db.Index(
            "ix_agent_call_logs_org_created",
            "org_id",
            "created_at",
        ),
        db.Index(
            "ix_agent_call_logs_org_conversation_created",
            "org_id",
            "conversation_id",
            "created_at",
        ),
        db.Index(
            "ix_agent_call_logs_org_user_created",
            "org_id",
            "user_id",
            "created_at",
        ),
    )

    __tablename__ = "agent_call_logs"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("conversations.id", ondelete="SET NULL"),
    )
    message_id = db.Column(
        db.Integer,
        db.ForeignKey("conversation_messages.id", ondelete="SET NULL"),
    )
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    kind = db.Column(db.String(30), nullable=False)
    model = db.Column(db.String(120))
    prompt_tokens = db.Column(db.Integer)
    completion_tokens = db.Column(db.Integer)
    duration_ms = db.Column(db.Integer)
    status = db.Column(db.String(20), nullable=False)
    error_msg = db.Column(db.Text)
    tool_calls = db.Column(db.JSON)
    thoughts = db.Column(db.JSON)
    input_text = db.Column(db.Text)
    output_text = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class InterviewFeedback(db.Model):
    __table_args__ = (
        db.Index(
            "ix_interview_feedback_org_demand_candidate_round",
            "org_id",
            "demand_id",
            "candidate_id",
            "round",
        ),
        db.Index(
            "uq_interview_feedback_assignment_id",
            "assignment_id",
            unique=True,
        ),
    )

    __tablename__ = "interview_feedback"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"))
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("interview_assignments.id", ondelete="RESTRICT"),
    )
    round = db.Column(db.String(30), nullable=False)  # interview_first/second/final
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Integer)        # 1-5
    passed = db.Column(db.Boolean)
    strengths = db.Column(db.Text)
    concerns = db.Column(db.Text)
    reason_tags = db.Column(db.JSON)
    evaluation_json = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
    )
    updated_at = db.Column(
        db.DateTime,
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


@event.listens_for(db.metadata, "before_create")
def _ensure_local_pilot_columns(_metadata, connection, **_kwargs):
    """Keep explicit local SQLite create_all compatibility additive."""
    if connection.dialect.name != "sqlite":
        return

    inspector = inspect(connection)
    if inspector.has_table("recruitment_demands"):
        demand_columns = {
            column["name"]
            for column in inspector.get_columns("recruitment_demands")
        }
        demand_definitions = {
            "approval_status": "VARCHAR(20) NOT NULL DEFAULT 'approved'",
            "submitted_at": "DATETIME",
            "reviewed_by": "INTEGER",
            "reviewed_at": "DATETIME",
            "review_reason": "TEXT",
        }
        for column_name, definition in demand_definitions.items():
            if column_name not in demand_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE recruitment_demands "
                    f"ADD COLUMN {column_name} {definition}"
                )

    if inspector.has_table("interview_feedback"):
        feedback_columns = {
            column["name"]
            for column in inspector.get_columns("interview_feedback")
        }
        if "updated_by" not in feedback_columns:
            connection.exec_driver_sql(
                "ALTER TABLE interview_feedback ADD COLUMN updated_by INTEGER"
            )
        if "updated_at" not in feedback_columns:
            connection.exec_driver_sql(
                "ALTER TABLE interview_feedback ADD COLUMN updated_at DATETIME"
            )
            connection.exec_driver_sql(
                "UPDATE interview_feedback SET updated_at = CURRENT_TIMESTAMP "
                "WHERE updated_at IS NULL"
            )


class BossAccount(db.Model):
    """绑定的 BOSS 直聘账号（多账号，按智聘用户隔离）。"""
    __tablename__ = "boss_accounts"
    id = db.Column(db.Integer, primary_key=True)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    label = db.Column(db.String(100))
    cookies_encrypted = db.Column(db.Text, nullable=False)
    cookie_count = db.Column(db.Integer, default=0)
    has_stoken = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=False)
    last_verified_at = db.Column(db.DateTime)
    last_verified_ok = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
