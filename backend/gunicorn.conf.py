"""Gunicorn 配置：多 worker 下只在 master 进程注册一次服务。

为什么放在这里而不是 create_app()：
    gunicorn -w 4 会 fork 出 4 个 worker，每个 worker 都会 import 应用。
    若在 create_app() 里注册，同一个 ip:port 会被注册 4 次（正是本项目
    docs/superpowers 里点名的“应用内注册中心在多 worker 下重复注册”问题）。
    when_ready 只在 master 启动完成时触发一次，on_exit 只在 master 退出时触发一次，
    因此注册与心跳都收敛到唯一的 master 进程；worker 只负责响应 /actuator/health。

运行：gunicorn -c gunicorn.conf.py run:app
"""
import os

# ── 基本运行参数（保持与原 CMD 一致，可用环境变量覆盖）──────────────
bind = os.environ.get("GUNICORN_BIND", f"0.0.0.0:{os.environ.get('PORT', '5000')}")
workers = int(os.environ.get("GUNICORN_WORKERS", "4"))
# AI 助手 SSE 流式响应需要较大超时（见 DEPLOYMENT.md）
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))


# ── 服务注册生命周期钩子（master 单点）─────────────────────────────
def when_ready(server):
    """master 就绪后注册一次。注册失败不阻断服务对外可用。"""
    try:
        from app.registry import start_registration
        start_registration()
    except Exception as exc:  # noqa: BLE001 - 注册异常不应拖垮启动
        server.log.error("服务注册启动失败：%s", exc)


def on_exit(server):
    """master 退出时注销一次。"""
    try:
        from app.registry import stop_registration
        stop_registration()
    except Exception as exc:  # noqa: BLE001
        server.log.error("服务注销失败：%s", exc)
