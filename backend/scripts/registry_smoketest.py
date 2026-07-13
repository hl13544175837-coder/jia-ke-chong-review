#!/usr/bin/env python3
"""服务注册中心连通性烟测：注册 → 发现 → 注销，逐步打印结果。

用途：在把 Consul/Eureka 配置接入 SIT/生产前，先用真实注册中心地址验证“能否跑通”，
而不必启动整个 Flask 应用。

用法（读取环境变量 / .env，与应用同一套配置）：
    # 直接用 .env / 环境变量里的配置
    python backend/scripts/registry_smoketest.py

    # 或临时覆盖，指向某个 Consul
    CONSUL_ENABLED=true CONSUL_HOST=consul.tomcat.tomcat.01.sit CONSUL_PORT=8500 \
        SERVICE_NAME=zhipin-server SERVICE_PORT=5000 \
        python backend/scripts/registry_smoketest.py

    # 注册后保持在线（持续心跳），用于在注册中心 UI 里肉眼确认，Ctrl-C 退出并注销
    python backend/scripts/registry_smoketest.py --hold 60
"""
import argparse
import logging
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / ".env")

from app.registry import build_instance, build_registry, load_config  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Consul/Eureka 注册连通性烟测")
    parser.add_argument(
        "--hold", type=int, default=0,
        help="注册后保持在线的秒数（持续心跳），便于在注册中心 UI 里确认；默认 0（立即注销）",
    )
    parser.add_argument("--no-deregister", action="store_true", help="结束时不注销（调试用）")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    config = load_config()
    print("=" * 64)
    print(f"registry_type   : {config.registry_type}")
    print(f"service_name    : {config.service_name}")
    if config.registry_type == "consul":
        print(f"consul          : {config.consul_scheme}://{config.consul_host}:{config.consul_port}")
        print(f"check_mode      : {config.consul_check_mode}")
    elif config.registry_type == "eureka":
        print(f"eureka zones    : {config.eureka_server_urls}")
    print("=" * 64)

    if not config.enabled:
        print("✗ 未启用任何注册中心（CONSUL_ENABLED / EUREKA_ENABLED 都为 false）。")
        print("  设 CONSUL_ENABLED=true 或 EUREKA_ENABLED=true 后重试。")
        return 2

    registry = build_registry(config)
    instance = build_instance(config)
    print(f"本机实例         : id={instance.instance_id} ip={instance.ip} port={instance.port}")
    print(f"health_check_url : {instance.health_check_url}")
    print("-" * 64)

    # 1) 注册
    print("① 注册 ...")
    if not registry.start(instance):
        print("✗ 注册失败，见上方日志（多为网络不通 / 主机不可达 / ACL 拒绝）。")
        return 1
    print("✓ 注册成功")

    # 2) 发现（回读，确认注册中心里确实有这条记录）
    time.sleep(1)
    print("② 发现回读 ...")
    found = registry.discover(config.service_name)
    if found:
        print(f"✓ 在注册中心查到 {len(found)} 个实例：")
        for f in found:
            print(f"    - {f}")
    else:
        print("⚠ 未查到实例。HTTP 健康检查模式下，可能是 Consul 还未完成首次回拉（健康态未就绪）。")
        print("  若本服务未真正在监听端口，Consul 会判 critical 而不返回 passing 实例。")

    # 3) 可选保持在线
    if args.hold > 0:
        print(f"③ 保持在线 {args.hold}s（持续心跳），可在注册中心 UI 确认。Ctrl-C 提前退出 ...")
        try:
            time.sleep(args.hold)
        except KeyboardInterrupt:
            print("\n收到中断，准备注销 ...")

    # 4) 注销
    if args.no_deregister:
        print("④ 按 --no-deregister 跳过注销（记得手动清理）。")
        return 0
    print("④ 注销 ...")
    registry.stop(instance)
    print("✓ 注销完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
