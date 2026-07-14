#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
智聘 · 招聘管理系统 后端启动入口
开发模式：python run.py
生产模式：gunicorn -w 4 -b 0.0.0.0:5000 "run:app"
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Windows 控制台默认 GBK 编码，无法输出 ✓ 和中文，强制 stdout/stderr 用 UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# 加载 .env（如果存在）
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

# 在读取 Config / 创建应用之前，先从 Apollo 拉配置注入 os.environ（若启用）。
# 生产多 worker 下 master 已在 gunicorn.conf.py 的 on_starting 拉过并经 fork 继承，
# 这里幂等不会重复拉；开发单进程由这里负责。
try:
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO)  # 让 apollo 日志在终端可见
    from apollo_config import load_apollo_into_environ
    _apollo_result = load_apollo_into_environ()
    print(f"  [apollo] {_apollo_result}")
except Exception as exc:  # noqa: BLE001 - Apollo 异常不应阻断启动（除非显式 FAIL_FAST）
    print(f"  [apollo] 配置加载异常：{exc}")

from app import create_app
from app.config_validation import safe_database_label

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"\n✓ 智聘 · 招聘管理系统 后端已启动 http://localhost:{port}")
    print(f"  LLM provider : {os.environ.get('LLM_PROVIDER', 'openai')}")
    print(f"  Model        : {os.environ.get('LLM_MODEL', 'gpt-4o-mini')}")
    print(f"  Database     : {safe_database_label(app.config.get('SQLALCHEMY_DATABASE_URI', ''))}")
    print(f"  Debug        : {debug}\n")

    # 开发单进程注册（生产多 worker 走 gunicorn.conf.py 的 master 钩子，勿在此重复）。
    # debug 重载器会 fork 子进程，只在真正跑服务的子进程（WERKZEUG_RUN_MAIN=true）
    # 或非重载模式下注册，避免父进程也注册一次。
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        try:
            import logging
            logging.basicConfig(level=logging.INFO)  # 让注册日志在开发终端可见
            from app.registry import start_registration
            result = start_registration()
            print(f"  [registry] {result.summary()}")
        except Exception as exc:  # noqa: BLE001 - 注册异常不阻断本地启动
            print(f"  [registry] 服务注册启动失败：{exc}")

    app.run(host="0.0.0.0", port=port, debug=debug)
