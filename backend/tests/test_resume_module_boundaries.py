from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _line_count(relative_path):
    return len((ROOT / relative_path).read_text(encoding="utf-8").splitlines())


def test_resume_api_only_registers_routes_and_services_are_split_by_responsibility():
    service_files = [
        "app/services/resumes/file_service.py",
        "app/services/resumes/version_service.py",
        "app/services/resumes/parse_service.py",
        "app/services/resumes/upload_service.py",
    ]
    for service_file in service_files:
        assert (ROOT / service_file).is_file(), f"缺少简历服务模块: {service_file}"
        assert _line_count(service_file) < 500, f"{service_file} 超过 500 行，需继续拆分"

    assert _line_count("app/api/resume.py") < 350, "resume.py 只应保留路由接线"
