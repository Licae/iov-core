#!/usr/bin/env python3
import socket
import ssl
import time

from security_case_lib import finish, load_payload, resolve_target, step


WEAK_CIPHER_KEYWORDS = ("RC4", "3DES", "DES", "NULL", "MD5", "EXPORT", "ADH", "ANON")


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("tls_port") or "443"))
    server_name = str(runtime_inputs.get("tls_server_name") or host).strip()
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 TLS 弱加密套件检查。", steps, 0)

    check_started = time.time()
    command = f"tls_cipher_probe {host}:{port} server_name={server_name}"
    try:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, port), timeout=6) as sock:
            with context.wrap_socket(sock, server_hostname=server_name) as tls_sock:
                cipher = tls_sock.cipher() or ("", "", 0)
        cipher_name = str(cipher[0] or "")
        cipher_bits = int(cipher[2] or 0)
        normalized = cipher_name.upper()
        is_weak = any(keyword in normalized for keyword in WEAK_CIPHER_KEYWORDS) or cipher_bits < 128
        if is_weak:
            verdict = "FAILED"
            logs = f"检测到弱加密套件: {cipher_name} ({cipher_bits} bits)。"
            assessment = "TLS 协商结果存在弱加密风险。"
        else:
            verdict = "PASSED"
            logs = f"当前协商套件: {cipher_name} ({cipher_bits} bits)。"
            assessment = "未发现弱加密套件，符合安全基线。"
        command_result = "PASSED"
        output = f"cipher={cipher_name}; bits={cipher_bits}"
    except (ssl.SSLError, OSError, TimeoutError) as exc:
        verdict = "BLOCKED"
        logs = "TLS 弱加密套件检查未完成。"
        assessment = "网络路径或服务状态异常，暂无法判定加密套件策略。"
        command_result = "BLOCKED"
        output = str(exc)

    steps.append(
        step(
            "TLS 协商套件检查",
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
        return finish("FAILED", f"目标 {host}:{port} 的 TLS 套件策略不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的 TLS 套件检查未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 的 TLS 套件检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
