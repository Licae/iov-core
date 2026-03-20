#!/usr/bin/env python3
import socket
import time

from security_case_lib import finish, load_payload, resolve_target, step

HIGH_RISK_PORTS = [21, 23, 2323, 5555]


def probe_port(host: str, port: int, timeout: float = 1.5) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"{host}:{port} open"
    except OSError as exc:
        return False, str(exc)


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行开放端口扫描。", steps, 0)

    open_ports: list[int] = []
    blocked_count = 0
    step_started = time.time()
    details: list[str] = []

    for port in HIGH_RISK_PORTS:
        check_started = time.time()
        command = f"tcp_connect {host}:{port}"
        is_open, output = probe_port(host, port)
        if is_open:
            open_ports.append(port)
            step_result = "FAILED"
            security_assessment = f"检测到 {port} 端口开放，存在未授权访问风险。"
        else:
            lower_output = (output or "").lower()
            if "timed out" in lower_output or "no route to host" in lower_output or "name or service not known" in lower_output:
                blocked_count += 1
                step_result = "BLOCKED"
                security_assessment = f"端口 {port} 检测受网络条件影响，结果不可判定。"
            else:
                step_result = "PASSED"
                security_assessment = f"端口 {port} 未开放，符合访问控制预期。"
        details.append(f"{port}: {'open' if is_open else output}")
        steps.append(
            step(
                f"端口 {port} 探测",
                step_result,
                f"对 {host}:{port} 进行连接探测。",
                max(1, int(time.time() - check_started)),
                command=command,
                command_result="BLOCKED" if step_result == "BLOCKED" else "PASSED",
                output=output,
                security_assessment=security_assessment,
            )
        )

    if open_ports:
        verdict = "FAILED"
        summary = f"目标 {host} 检测到高风险开放端口: {', '.join(str(port) for port in open_ports)}。"
    elif blocked_count == len(HIGH_RISK_PORTS):
        verdict = "BLOCKED"
        summary = f"目标 {host} 的开放端口扫描未完成，网络路径不可达或超时。"
    else:
        verdict = "PASSED"
        summary = f"目标 {host} 未发现高风险开放端口。"

    steps.append(
        step(
            "扫描结果汇总",
            verdict,
            summary,
            max(1, int(time.time() - step_started)),
            output="\n".join(details),
            security_assessment="建议将开放端口结果与设备实际安全策略白名单进行比对。",
        )
    )

    return finish(verdict, summary, steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
