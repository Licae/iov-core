#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, probe_tcp_port, resolve_target, run_command, step


def parse_auth_methods(output: str) -> list[str]:
    match = re.search(r"authentications that can continue:\s*([^\r\n]+)", output, flags=re.IGNORECASE)
    if not match:
        return []
    return [part.strip().lower() for part in match.group(1).split(",") if part.strip()]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("ssh_port") or "22"))
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 SSH 空口令/弱口令策略检查。", steps, 0)

    probe_started = time.time()
    probe_ok, probe_output = probe_tcp_port(host, port)
    steps.append(
        step(
            "SSH 端口探测",
            "FAILED" if probe_ok else "PASSED",
            "SSH 端口对外可达。" if probe_ok else "SSH 端口未开放或不可达。",
            max(1, int(time.time() - probe_started)),
            command=f"tcp_connect {host}:{port}",
            command_result="PASSED" if probe_ok else "FAILED",
            output=probe_output,
            security_assessment="SSH 暴露，可继续检查认证方式。" if probe_ok else "SSH 未暴露，不存在口令爆破入口。",
        )
    )

    if not probe_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 SSH 服务，弱口令攻击入口不存在。", steps, max(1, int(time.time() - started_at)))

    auth_started = time.time()
    auth_command = (
        f"ssh -vv -p {port} -o BatchMode=yes -o PreferredAuthentications=none "
        "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "
        f"-o ConnectTimeout=6 iov_probe_user@{host} exit"
    )
    auth_ok, auth_output = run_command(
        [
            "ssh",
            "-vv",
            "-p",
            str(port),
            "-o",
            "BatchMode=yes",
            "-o",
            "PreferredAuthentications=none",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "ConnectTimeout=6",
            f"iov_probe_user@{host}",
            "exit",
        ]
    )

    methods = parse_auth_methods(auth_output or "")
    weak_surface = any(method in {"password", "keyboard-interactive"} for method in methods)
    normalized_output = (auth_output or "").lower()

    if auth_ok:
        verdict = "FAILED"
        logs = "探测账号在无凭据前提下登录成功。"
        assessment = "认证策略异常，存在高风险。"
        command_result = "PASSED"
    elif weak_surface:
        verdict = "FAILED"
        logs = f"服务仍暴露口令认证方式：{', '.join(methods)}。"
        assessment = "存在弱口令/口令爆破攻击面。"
        command_result = "FAILED"
    elif methods:
        verdict = "PASSED"
        logs = f"未发现口令认证暴露，当前认证方式：{', '.join(methods)}。"
        assessment = "口令类认证面已受限，符合预期。"
        command_result = "FAILED"
    elif re.search(r"timed out|connection refused|no route to host|name or service not known", normalized_output):
        verdict = "BLOCKED"
        logs = "认证方式探测未完成，网络路径不可达。"
        assessment = "环境连通性不足，暂无法判定口令策略。"
        command_result = "BLOCKED"
    else:
        verdict = "BLOCKED"
        logs = "未能解析 SSH 认证方式。"
        assessment = "输出信息不足，建议人工复核认证策略。"
        command_result = "BLOCKED"

    steps.append(
        step(
            "SSH 认证方式探测",
            verdict,
            logs,
            max(1, int(time.time() - auth_started)),
            command=auth_command,
            command_result=command_result,
            output=auth_output,
            security_assessment=assessment,
        )
    )

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {host}:{port} 仍暴露弱口令攻击面。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的口令策略暂不可判定。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 的口令认证面符合安全预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
