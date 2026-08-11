#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIT/演示用种子数据脚本：为目标人才地图填充真实感演示数据。

用途：让 SIT 验收/领导演示有质感 —— 真实目标公司、人才、联系记录、
简历库候选人（最近任职公司均可被 AI 导入自动匹配）。

用法：
    python scripts/seed_demo_data.py [--db runtime/zhipin-demo.db] [--map-id 9] [--clean-e2e]

说明：
- 只写入指定 map（默认 9 = hr01 的"云计算"地图），不破坏其他数据。
- --clean-e2e 会清理 E2E 测试残留（E2E公司*/E2E人选*/E2E地图*）。
- 数据均为虚构演示数据（假姓名/假电话），无真实个人信息。
- 运行前请先备份数据库。
"""

import argparse
import json
import sqlite3
from datetime import datetime

NOW = datetime.now().isoformat()

COMPANIES = [
    ('美团', '北京', '本地生活', 'medium', '到店/到家核心产品线'),
    ('拼多多', '上海', '电商', 'medium', '主站推荐与供应链'),
    ('华为', '深圳', '通信/ICT', 'high', 'ICT 产品线，含终端与云'),
    ('比亚迪', '深圳', '新能源汽车', 'high', '智能驾驶部门扩招中'),
    ('宁德时代', '宁德', '新能源', 'medium', '研发中心动力电池'),
    ('招商银行', '深圳', '金融', 'high', '金融科技部持续扩编'),
    ('平安科技', '深圳', '金融科技', 'medium', 'AI 平台与大数据'),
    ('科大讯飞', '合肥', '人工智能', 'medium', 'AI 研究院语音方向'),
    ('商汤科技', '上海', '人工智能', 'medium', '研究院 CV 方向'),
]

PEOPLE = [
    ('张伟', '字节跳动', '技术中心 · 后端部', '资深后端工程师', '专家级', '平台架构组', '13810020001', '北京', '待联系', None, '高并发后端方向，字节三年经验'),
    ('刘洋', '字节跳动', '产品部', '高级产品经理', '高级', '短视频方向', '13810020002', '北京', '沟通中', None, 'TOB 产品经历，面试已一轮'),
    ('孙悦', '腾讯', 'AI 实验室', '算法工程师', '专家级', '大模型方向', '13810020003', '深圳', '已确认', '2026-08-25', '大模型推理优化，薪资 55K 达成一致'),
    ('赵磊', '阿里巴巴', '云智能', '云架构师', '高级', '弹性计算', '13810020004', '杭州', '待联系', None, '云原生专家，猎头推荐'),
    ('周芳', '美团', '到家事业群', '后端工程师', '高级', '配送系统', '13810020005', '北京', '沟通中', '2026-08-19', '稳定性建设经验，二面通过'),
    ('吴刚', '华为', 'ICT 产品线', '解决方案架构师', '总监级', '政企大客户', '13810020006', '深圳', '未接触', None, '政企解决方案经验丰富'),
    ('郑洁', '招商银行', '金融科技部', '风控算法工程师', '高级', '反欺诈', '13810020007', '深圳', '待联系', None, '金融风控模型背景'),
    ('冯鑫', '科大讯飞', 'AI 研究院', '语音算法工程师', '专家级', '语音识别', '13810020008', '合肥', '沟通中', '2026-08-20', '语音算法八年，认可度高'),
    ('许晴', '商汤科技', '研究院', '计算机视觉算法', '高级', '感知方向', '13810020009', '上海', '未接触', None, 'CV 顶会论文多篇'),
    ('何磊', '比亚迪', '智能驾驶部', '感知算法工程师', '高级', '多传感器融合', '13810020010', '深圳', '待联系', None, '自动驾驶感知方向'),
    ('高翔', '宁德时代', '研发中心', '电池算法工程师', '高级', 'BMS 算法', '13810020011', '宁德', '未接触', None, 'BMS 建模背景'),
    ('林晓', '平安科技', '金融科技部', '数据分析师', '中级', '经营分析', '13810020012', '深圳', '已确认', '2026-08-15', '数据分析五年，已发 Offer'),
]

CONTACT_LOGS = [
    ('孙悦', '电话沟通，对岗位意向高，期望薪资 55K，已约二面'),
    ('孙悦', '二面通过，进入谈薪阶段，等待 HR 发 Offer'),
    ('周芳', '一面通过，面试官评价稳定性和系统设计能力突出'),
    ('冯鑫', '猎头推荐，认可团队方向，约本周五电话深聊'),
    ('林晓', '已发 Offer，候选人确认 8 月底入职'),
]

RESUMES = [
    ('陈**', '陈雨桐', '资深后端工程师', '上海交通大学 · 本科 · 计算机科学', '高并发后端架构，字节三年，主导过亿级流量系统重构', '字节跳动', '后端工程师', 3, 'Go、Kafka、Redis、分布式系统设计', ['Go', 'Kafka', 'Redis', 'Docker']),
    ('王**', '王子睿', 'AI 算法工程师', '浙江大学 · 硕士 · 人工智能', '大模型推理优化，腾讯五年，负责推荐模型线上化', '腾讯', '算法工程师', 5, 'PyTorch、TensorRT、推理优化、模型压缩', ['PyTorch', 'TensorRT', 'CUDA', '模型压缩']),
    ('李**', '李思颖', '云架构师', '南京大学 · 本科 · 软件工程', '云原生架构专家，阿里六年，主导弹性计算平台建设', '阿里巴巴', '云架构师', 6, 'Kubernetes、容器、云原生、微服务', ['Kubernetes', '容器编排', '微服务', '云原生']),
    ('赵**', '赵一帆', '后端工程师', '华中科技大学 · 本科 · 计算机科学', '美团四年，负责配送调度系统，稳定性 99.99%', '美团', '后端工程师', 4, 'Java、Spring、高并发、稳定性建设', ['Java', 'Spring', '高并发', '稳定性']),
    ('吴**', '吴雨欣', '解决方案架构师', '电子科技大学 · 硕士 · 通信工程', '华为七年，政企 ICT 解决方案，主导多个千万级项目落地', '华为', '解决方案架构师', 7, 'ICT、云、政企方案、架构设计', ['ICT', '云计算', '方案设计', '项目管理']),
    ('郑**', '郑浩宇', '风控算法工程师', '上海财经大学 · 硕士 · 金融工程', '招商银行三年，反欺诈模型上线，坏账率下降 18%', '招商银行', '风控算法工程师', 3, '风控模型、特征工程、反欺诈', ['风控', '特征工程', 'XGBoost', '反欺诈']),
    ('冯**', '冯晓琳', '语音算法工程师', '中国科学技术大学 · 硕士 · 信号处理', '科大讯飞四年，语音识别准确率行业领先，落地多个智能硬件', '科大讯飞', '语音算法工程师', 4, '语音识别、声学模型、Kaldi', ['语音识别', '声学模型', 'Kaldi', 'Python']),
    ('何**', '何俊杰', '感知算法工程师', '华南理工大学 · 硕士 · 自动化', '比亚迪三年，多传感器融合方案，支撑智能驾驶量产', '比亚迪', '感知算法工程师', 3, '传感器融合、目标检测、自动驾驶', ['传感器融合', '目标检测', '深度学习', 'C++']),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='runtime/zhipin-demo.db')
    parser.add_argument('--map-id', type=int, default=9)
    parser.add_argument('--clean-e2e', action='store_true', help='清理 E2E 测试残留数据')
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    cur = conn.cursor()
    map_id = args.map_id

    if args.clean_e2e:
        cur.execute("DELETE FROM talent_map_contact_logs WHERE person_id IN (SELECT id FROM talent_map_people WHERE name LIKE 'E2E%')")
        cur.execute("DELETE FROM talent_map_people WHERE name LIKE 'E2E%'")
        cur.execute("DELETE FROM talent_map_companies WHERE company_name LIKE 'E2E%'")
        print('已清理 E2E 残留')

    for name, city, industry, priority, note in COMPANIES:
        exists = cur.execute("SELECT 1 FROM talent_map_companies WHERE map_id=? AND company_name=?", (map_id, name)).fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO talent_map_companies (org_id, map_id, company_name, city, industry, priority, note, created_at, updated_at) VALUES (1,?,?,?,?,?,?,?,?)",
                (map_id, name, city, industry, priority, note, NOW, NOW),
            )
    print(f'公司: {len(COMPANIES)} 家(去重)')

    cid = {r[0]: r[1] for r in cur.execute("SELECT company_name, id FROM talent_map_companies WHERE map_id=?", (map_id,)).fetchall()}
    for name, company, dept, title, level, module, phone, city, status, follow, note in PEOPLE:
        exists = cur.execute("SELECT 1 FROM talent_map_people WHERE map_id=? AND name=? AND company_id=?", (map_id, name, cid.get(company))).fetchone()
        if not exists:
            cur.execute(
                """INSERT INTO talent_map_people (org_id, map_id, company_id, owner_hr_id, name, department, title, level, module, phone, city, tags, contact_status, source, next_follow_at, note, created_at, updated_at)
                   VALUES (1,?,?,2,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (map_id, cid[company], name, dept, title, level, module, phone, city, '[]', status, 'AI导入', follow, note, NOW, NOW),
            )
    print(f'人才: {len(PEOPLE)} 人(去重)')

    pid = {r[0]: r[1] for r in cur.execute("SELECT name, id FROM talent_map_people WHERE map_id=?", (map_id,)).fetchall()}
    for name, content in CONTACT_LOGS:
        cur.execute(
            "INSERT INTO talent_map_contact_logs (org_id, person_id, content, contact_at, created_by, created_at) VALUES (1,?,?,?,2,?)",
            (pid.get(name), content, NOW, NOW),
        )
    print(f'联系记录: {len(CONTACT_LOGS)} 条')

    for name_masked, name, target, edu, summary, company, title, years, desc, skills in RESUMES:
        resume = {
            'extracted_info': {
                'name': name,
                'target_position': target,
                'summary': summary,
                'education': {'school': edu.split(' · ')[0], 'degree': edu.split(' · ')[1], 'major': edu.split(' · ')[2]},
                'experience': [{'company': company, 'title': title, 'years': years, 'desc': desc}],
            },
            'skills': skills,
        }
        cur.execute(
            """INSERT INTO candidates (org_id, owner_hr_id, current_demand_id, upload_batch_id, name_masked, email_masked, phone_masked,
               raw_file_path, created_at, deleted_at, deleted_by, anonymized_at, parse_status, parse_error, resume_sha256, raw_file_name, raw_file_data, resume_json)
               VALUES (1, 2, 0, 0, ?, ?, ?, '', ?, NULL, NULL, NULL, 'ok', '', '', '', NULL, ?)""",
            (name_masked, '***@qq.com', '138****0000', NOW, json.dumps(resume, ensure_ascii=False)),
        )
    print(f'简历库候选人: {len(RESUMES)} 份')

    conn.commit()
    conn.close()
    print('✅ 演示数据完成')


if __name__ == '__main__':
    main()
