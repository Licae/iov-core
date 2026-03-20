#!/usr/bin/env python3
import socket
import ssl
import time
from datetime import datetime, timezone

from security_case_lib import finish, load_payload, resolve_target, step


def parse_not_after(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("tls_port") or "443"))
    server_name = str(runtime_inputs.get("tls_server_name") or host).strip()
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 TLS 证书校验。", steps, 0)

    check_started = time.time()
    command = f"tls_handshake {host}:{port} server_name={server_name}"
    try:
        context = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=6) as sock:
            with context.wrap_socket(sock, server_hostname=server_name) as tls_sock:
                cert = tls_sock.getpeercert()
        not_after_raw = str(cert.get("notAfter") or "")
        not_after = parse_not_after(not_after_raw)
        now = datetime.now(timezone.utc)
        if not_after is None:
            verdict = "FAILED"
            logs = "证书有效期字段解析失败。"
            assessment = "证书格式异常，存在配置风险。"
            command_result = "PASSED"
        else:
            days_left = int((not_after - now).total_seconds() // 86400)
            if days_left < 0:
                verdict = "FAILED"
                logs = f"证书已过期（{days_left} 天）。"
                assessment = "证书过期会导致 TLS 安全失效。"
            elif days_left <= 30:
                verdict = "FAILED"
                logs = f"证书将在 {days_left} 天内过期。"
                assessment = "证书即将过期，存在服务中断与安全风险。"
            else:
                verdict = "PASSED"
                logs = f"证书校验通过，剩余有效期 {days_left} 天。"
                assessment = "证书链与主机名校验通过，符合基线预期。"
            command_result = "PASSED"
        output = f"notAfter={not_after_raw}"
    except ssl.SSLCertVerificationError as exc:
        verdict = "FAILED"
        logs = "证书链或主机名校验失败。"
        assessment = "TLS 证书不可信或主机名不匹配。"
        command_result = "FAILED"
        output = str(exc)
    except (ssl.SSLError, OSError, TimeoutError) as exc:
        verdict = "BLOCKED"
        logs = "TLS 握手未完成。"
        assessment = "网络路径或服务状态异常，暂无法判定证书策略。"
        command_result = "BLOCKED"
        output = str(exc)

    steps.append(
        step(
            "TLS 证书有效性与主机名校验",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=command,
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {host}:{port} 的 TLS 证书策略不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的 TLS 证书校验未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 的 TLS 证书校验通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
