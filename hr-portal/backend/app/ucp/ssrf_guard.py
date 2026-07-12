"""Phase 5-E: SSRF 防护。

禁止 API 模板/资源配置访问内网敏感地址、metadata 地址和未授权域名。
"""
from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

# 禁止的 IPv4 目标范围
BLOCKED_IPV4_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("224.0.0.0/4"),  # multicast
    ipaddress.ip_network("240.0.0.0/4"),  # reserved
]

# 禁止的 IPv6 目标范围
BLOCKED_IPV6_NETWORKS = [
    ipaddress.ip_network("::1/128"),           # loopback
    ipaddress.ip_network("fe80::/10"),          # link-local
    ipaddress.ip_network("fc00::/7"),           # unique local (ULA)
    ipaddress.ip_network("fd00::/8"),           # ULA
    ipaddress.ip_network("ff00::/8"),           # multicast
]

# 禁止的 hostname 模式
BLOCKED_HOST_PATTERNS = [
    re.compile(r"^localhost$", re.IGNORECASE),
    re.compile(r"\.local$", re.IGNORECASE),
    re.compile(r"\.internal$", re.IGNORECASE),
    re.compile(r"^metadata\.google\.internal$", re.IGNORECASE),
    re.compile(r"^169\.254\.169\.254$"),
]

# 检测非标准 IP 编码: 十六进制 (0x7f000001)、八进制 (0177...)、纯整数 (2130706433)
_HEX_IP = re.compile(r"^0x[0-9a-fA-F]+$")
_OCT_IP = re.compile(r"^0[0-7]+$")
_DEC_IP = re.compile(r"^\d{8,10}$")


class SSRFError(RuntimeError):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"SSRF blocked: {reason}")


def check_url(url: str, allowed_domains: list[str] | None = None) -> str:
    """校验 URL 是否安全可访问。

    返回规范化的 URL（去除 fragment）。
    Raises SSRFError 若 URL 不安全。

    注意：allowed_domains 为 None 时使用严格模式 —— 仅允许公网 IP 且 hostname
    不匹配任何内网模式。生产环境应始终传入 allowed_domains 白名单。
    """
    if not url:
        raise SSRFError("URL 为空")
    if not url.startswith(("http://", "https://")):
        raise SSRFError(f"仅允许 http/https 协议: {url}")

    try:
        parsed = urlparse(url)
    except Exception:
        raise SSRFError(f"URL 解析失败: {url}")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError(f"无法提取主机名: {url}")

    # 检查 hostname 黑名单
    for pattern in BLOCKED_HOST_PATTERNS:
        if pattern.match(hostname):
            raise SSRFError(f"禁止访问主机: {hostname}")

    # 检测非标准 IP 编码 (hex/octal/decimal)
    if _HEX_IP.match(hostname) or _OCT_IP.match(hostname) or _DEC_IP.match(hostname):
        raise SSRFError(f"禁止非标准 IP 编码: {hostname}")

    # 解析 IP
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        # 主机名 —— 必须通过白名单检查
        if not allowed_domains:
            raise SSRFError(f"未配置域名白名单，拒绝访问: {hostname}")
        if not any(_domain_match(hostname, d) for d in allowed_domains):
            raise SSRFError(f"域名不在白名单中: {hostname}")
        return _normalize_url(parsed)

    # IP 地址 —— 检查内网范围
    if ip.version == 4:
        for net in BLOCKED_IPV4_NETWORKS:
            if ip in net:
                raise SSRFError(f"禁止访问内网 IP: {hostname}")
    elif ip.version == 6:
        for net in BLOCKED_IPV6_NETWORKS:
            if ip in net:
                raise SSRFError(f"禁止访问内网 IPv6: {hostname}")

    return _normalize_url(parsed)


def _domain_match(hostname: str, allowed: str) -> bool:
    """检查 hostname 是否匹配允许的域名（支持通配符 *）。"""
    if allowed == "*":
        return True
    if allowed.startswith("*."):
        return hostname == allowed[2:] or hostname.endswith("." + allowed[2:])
    return hostname == allowed


def _normalize_url(parsed) -> str:
    scheme = parsed.scheme
    host = parsed.hostname
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{scheme}://{host}{port}{path}{query}"
