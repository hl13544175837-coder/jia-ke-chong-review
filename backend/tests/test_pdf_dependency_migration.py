import importlib.util
from importlib.metadata import version
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIN_SAFE_PYMUPDF = (1, 28, 0)


def _version_tuple(version: str):
    return tuple(int(part) for part in version.split(".")[:3])


def test_pdf_parser_uses_document_to_image_vision_pipeline():
    parser_source = (ROOT / "base_agent" / "resume_parser.py").read_text(encoding="utf-8")
    assert "import PyPDF2" not in parser_source
    assert "PyPDF2.PdfReader" not in parser_source
    assert "from pypdf import PdfReader" not in parser_source
    assert "from document_to_image import document_to_image_data_uris" in parser_source
    assert "vision.parse_document(data_uris)" in parser_source


def test_requirements_depend_on_visual_document_conversion_stack():
    requirement_text = "\n".join(
        [
            (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8"),
            (ROOT / "base_agent" / "requirements.txt").read_text(encoding="utf-8"),
        ]
    )
    assert "PyPDF2" not in requirement_text
    assert "pypdf" not in requirement_text
    for dependency in ("PyMuPDF", "python-docx", "Pillow"):
        assert dependency in requirement_text


def test_runtime_can_import_visual_document_conversion_stack():
    for module in ("fitz", "docx", "PIL"):
        assert importlib.util.find_spec(module) is not None


def test_runtime_pymupdf_version_matches_secured_baseline():
    assert _version_tuple(version("PyMuPDF")) >= MIN_SAFE_PYMUPDF
