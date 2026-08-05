"""Job-description profile extraction shared by job and demand workflows."""

import json
import re


JD_EXTRACT_SYS = (
    "你是一位资深招聘专家。请从岗位描述(JD)中提取结构化招聘画像，严格返回 JSON：\n"
    "{\n"
    '  "title_normalized": "规范化岗位名称",\n'
    '  "seniority": "职级，如 初级/中级/高级/专家/管理",\n'
    '  "education": "最低学历要求，如 本科/硕士/不限",\n'
    '  "major": "专业要求，无则填 不限",\n'
    '  "years_experience": "经验年限要求，如 3-5年/不限",\n'
    '  "must_have_skills": ["硬性技能1", "硬性技能2"],\n'
    '  "nice_to_have_skills": ["加分技能1"],\n'
    '  "responsibilities": ["职责1", "职责2"],\n'
    '  "skill_tags_raw": "技能1 , 4 , AI|技能2 , 3 , BE"\n'
    "}\n"
    "规则：只依据 JD 原文提取，不要臆造；JD 未提及的字段填 \"不限\" 或空数组；"
    "skill_tags_raw 中分数为该技能重要度(1-5)。只返回 JSON，不含任何其他文字。"
)


def extract_jd_structured(llm, jd_text):
    """Extract a structured JD profile; return an empty dict on model failure."""

    try:
        if llm is None:
            from llm_client import LLMClient

            llm = LLMClient()
        raw = llm.chat(JD_EXTRACT_SYS, jd_text[:4000])
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(match.group()) if match else {}
    except Exception:  # noqa: BLE001 - AI extraction must not block saving a JD
        return {}
