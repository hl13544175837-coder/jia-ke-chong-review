"""本机 IP 探测：对齐 Spring Cloud 的 prefer-ip-address 语义。

优先按“到注册中心的出口网卡”推断本机可路由 IP，避免在多网卡 / 容器
环境里注册成 127.0.0.1 或 docker 网桥地址。可用 SERVICE_IP 强制覆盖。
"""
import os
import socket


def detect_ip(prefer_toward_host: str = "", prefer_toward_port: int = 0) -> str:
    """返回本机对外可路由的 IPv4。

    - 若设置 SERVICE_IP 环境变量则直接返回（运维显式指定，最高优先级）。
    - 否则用 UDP 连一次目标地址（不产生真实流量），读取内核选定的源地址。
    - 全部失败时退回主机名解析。
    """
    override = os.environ.get("SERVICE_IP", "").strip()
    if override:
        return override

    target_host = prefer_toward_host or "8.8.8.8"
    target_port = prefer_toward_port or 80

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect((target_host, target_port))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()
