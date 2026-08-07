import json

from flask import request


def _structured_metadata_for_files(files, svc, source_platform="BOSS直聘"):
    raw_metadata = request.form.get("metadata_json")
    try:
        payload = json.loads(raw_metadata) if raw_metadata else None
    except (TypeError, ValueError):
        raise ValueError("请提供正确的简历结构化信息") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise ValueError("请提供正确的简历结构化信息")

    boss_account = str(request.form.get("boss_account") or "").strip()
    source_link = str(request.form.get("source_link") or "").strip()
    if not boss_account or len(boss_account) > 160:
        raise ValueError("请提供正确的BOSS账号")
    if len(source_link) > 2000:
        raise ValueError("来源链接过长")

    metadata_by_filename = {}
    for raw_item in payload["items"]:
        if not isinstance(raw_item, dict):
            raise ValueError("简历结构化信息格式不正确")
        filename = str(raw_item.get("filename") or "").strip()
        external_import_id = str(raw_item.get("external_import_id") or "").strip()
        if not filename or len(filename) > 255:
            raise ValueError("简历文件名不正确")
        if filename in metadata_by_filename:
            raise ValueError(f"简历 {filename} 的结构化信息重复")
        if not external_import_id or len(external_import_id) > 200:
            raise ValueError(f"简历 {filename} 缺少正确的外部导入编号")
        if not isinstance(raw_item.get("resume_json"), dict):
            raise ValueError(f"简历 {filename} 缺少结构化信息")
        normalized_resume = svc.normalize_structured_resume(raw_item["resume_json"])
        metadata_by_filename[filename] = {
            "external_import_id": external_import_id,
            "resume_json": normalized_resume,
            "agent_source": {
                "external_import_id": external_import_id,
                "source_platform": source_platform,
                "boss_account": boss_account,
                "source_link": source_link,
            },
        }

    uploaded_names = [file.filename for file in files if file.filename]
    for filename in uploaded_names:
        if filename not in metadata_by_filename:
            raise ValueError(f"简历 {filename} 缺少结构化信息")
    if set(metadata_by_filename) != set(uploaded_names):
        raise ValueError("结构化信息与上传的简历文件不一致")
    return metadata_by_filename
