#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""幂等写入一组「地图视图」验收 Mock 数据。

只新增、不删除、可重复执行：
- 已存在同名验收公司时直接跳过，不会重复建。
- 归属到 hr01（找不到时回退到任意招聘专员）。

用法：
  cd backend
  DATABASE_URL=sqlite:////absolute/path/runtime/zhipin-demo.db \
    LOCAL_SCHEMA_COMPAT=true \
    python scripts/seed_talent_map_mock.py
"""

import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app, db  # noqa: E402
from app.models import TalentMap, TalentMapCompany, TalentMapPerson, User  # noqa: E402


COMPANY_NAME = "示例智造（Mock 验收）"
MAP_NAME = "Mock 验收公司地图"
DEPARTMENTS = [
    {"name": "技术中心", "roles": ["后端工程师", "前端工程师", "算法工程师"]},
    {"name": "产品部", "roles": ["产品经理", "产品运营"]},
    {"name": "销售中心", "roles": ["大客户销售"]},
]
PEOPLE = [
    {"name": "王建国", "department": "技术中心", "title": "后端工程师", "level": "高级", "module": "平台架构组", "phone": "13800000001", "contact_status": "已确认", "note": "架构组核心，负责微服务改造"},
    {"name": "李思远", "department": "技术中心", "title": "后端工程师", "level": "中级", "module": "订单中心", "phone": "13800000002", "contact_status": "沟通中", "note": "谈过两轮，意向较高"},
    {"name": "张小雨", "department": "技术中心", "title": "前端工程师", "level": "高级", "module": "招聘门户", "phone": "13800000003", "contact_status": "待联系", "note": "简历优秀，等待首次沟通"},
    {"name": "陈默", "department": "产品部", "title": "产品经理", "level": "专家级", "module": "招聘中台", "phone": "13800000004", "contact_status": "已确认", "note": "匹配度最高的候选人"},
    {"name": "林悦", "department": "产品部", "title": "产品经理", "level": "高级", "module": "移动端", "phone": "13800000005", "contact_status": "沟通中", "note": "正在谈薪资"},
    {"name": "赵子豪", "department": "销售中心", "title": "大客户销售", "level": "总监级", "module": "华东大区", "phone": "13800000006", "contact_status": "待联系", "note": "大客户资源丰富"},
    {"name": "刘芳", "department": "未分部门", "title": "待补充岗位", "level": "", "module": "", "phone": "13800000007", "contact_status": "已确认", "note": "职级待补充"},
    {"name": "孙磊", "department": "未分部门", "title": "顾问", "level": "高级", "module": "行业顾问", "phone": "13800000008", "contact_status": "不合适", "note": "价格谈不拢"},
    {"name": "周琪", "department": "产品部", "title": "产品运营", "level": "中级", "module": "用户增长", "phone": "13800000009", "contact_status": "未接触", "note": "刚入库，未联系"},
]


def main() -> int:
    app = create_app()
    with app.app_context():
        existing = TalentMapCompany.query.filter_by(company_name=COMPANY_NAME).first()
        if existing is not None:
            print(f"验收公司已存在 id={existing.id}，跳过（幂等）。")
            return 0

        owner = User.query.filter_by(email="hr01@mvp.local").first()
        if owner is None:
            owner = User.query.filter_by(role="recruiter").order_by(User.id).first()
        if owner is None:
            print("找不到可归属的招聘专员账号，请先运行 seed_dev.py。")
            return 1

        talent_map = TalentMap(
            org_id=owner.org_id,
            name=MAP_NAME,
            owner_hr_id=owner.id,
            board_json={},
        )
        db.session.add(talent_map)
        db.session.flush()

        company = TalentMapCompany(
            org_id=talent_map.org_id,
            map_id=talent_map.id,
            company_name=COMPANY_NAME,
            industry="智能制造",
            city="上海",
            note="用于验收地图视图的演示数据",
        )
        db.session.add(company)
        db.session.flush()

        board_json = dict(talent_map.board_json or {})
        board_json["organization"] = {
            str(company.id): {"departments": DEPARTMENTS}
        }
        talent_map.board_json = board_json

        for item in PEOPLE:
            db.session.add(TalentMapPerson(
                org_id=talent_map.org_id,
                map_id=talent_map.id,
                company_id=company.id,
                owner_hr_id=owner.id,
                name=item["name"],
                department=item["department"],
                title=item["title"],
                level=item["level"],
                module=item["module"],
                phone=item["phone"],
                contact_status=item["contact_status"],
                note=item["note"],
                source="Mock验收",
                tags=[],
            ))

        db.session.commit()
        print(f"验收公司已创建：map={talent_map.id} company={company.id} people={len(PEOPLE)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
