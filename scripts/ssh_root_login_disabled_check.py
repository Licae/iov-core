#!/usr/bin/env python3
import re
import time
import os

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
    root_probe_password = str(runtime_inputs.get("ssh_probe_password") or "").strip()
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 SSH root 登录禁用检查。", steps, 0)

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
            security_assessment="SSH 暴露，可继续检查 root 登录策略。" if probe_ok else "SSH 未暴露，不存在 root 远程登录风险。",
        )
    )

    if not probe_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 SSH 服务，root 登录风险可控。", steps, max(1, int(time.time() - started_at)))

    auth_started = time.time()
    auth_command = (
        f"ssh -vv -p {port} -o BatchMode=yes -o PreferredAuthentications=none "
        "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "
        f"-o ConnectTimeout=6 root@{host} exit"
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
            f"root@{host}",
            "exit",
        ]
    )
    normalized_auth_output = (auth_output or "").lower()
    methods = parse_auth_methods(auth_output or "")
    password_surface_exposed = any(method in {"password", "keyboard-interactive"} for method in methods)

    if not auth_ok and re.search(r"timed out|connection refused|no route to host|name or service not known", normalized_auth_output):
        auth_verdict = "BLOCKED"
        auth_logs = "SSH root 认证方式检查未完成，网络路径不可达。"
        auth_assessment = "环境连通性不足，暂无法判定 root 登录策略。"
        auth_command_result = "BLOCKED"
    elif methods and password_surface_exposed:
        auth_verdict = "FAILED"
        auth_logs = f"root 账号仍暴露口令认证方式：{', '.join(methods)}。"
        auth_assessment = "root 登录禁用策略未生效，存在口令登录风险。"
        auth_command_result = "FAILED"
    elif methods:
        auth_verdict = "PASSED"
        auth_logs = f"root 账号未暴露口令认证方式：{', '.join(methods)}。"
        auth_assessment = "root 口令登录入口已受限，符合预期。"
        auth_command_result = "FAILED"
    else:
        auth_verdict = "BLOCKED"
        auth_logs = "SSH root 认证方式检查返回未知响应。"
        auth_assessment = "返回信息不足，建议人工复核。"
        auth_command_result = "BLOCKED"

    steps.append(
        step(
            "SSH root 认证方式检查",
            auth_verdict,
            auth_logs,
            max(1, int(time.time() - auth_started)),
            command=auth_command,
            command_result=auth_command_result,
            output=auth_output,
            security_assessment=auth_assessment,
        )
    )

    password_verdict = "BLOCKED"
    if root_probe_password:
        env = os.environ.copy()
        env["SSHPASS"] = root_probe_password
        password_started = time.time()
        password_command = (
            f"sshpass -e ssh -p {port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "
            "-o ConnectTimeout=6 -o PreferredAuthentications=password -o PubkeyAuthentication=no "
            f"root@{host} true"
        )
        password_ok, password_output = run_command(
            [
                "sshpass",
                "-e",
                "ssh",
                "-p",
                str(port),
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "ConnectTimeout=6",
                "-o",
                "PreferredAuthentications=password",
                "-o",
                "PubkeyAuthentication=no",
                f"root@{host}",
                "true",
            ],
            env=env,
        )
        normalized_password_output = (password_output or "").lower()
        if password_ok:
            password_verdict = "FAILED"
            password_logs = "root 账号可通过口令直接登录。"
            password_assessment = "root 远程口令登录未禁用，存在高风险。"
            password_command_result = "PASSED"
        elif re.search(r"permission denied|authentication failed|auth fail", normalized_password_output):
            password_verdict = "PASSED"
            password_logs = "提供口令后 root 登录仍被拒绝。"
            password_assessment = "root 口令登录被阻断。"
            password_command_result = "FAILED"
        elif re.search(r"timed out|connection refused|no route to host|name or service not known", normalized_password_output):
            password_verdict = "BLOCKED"
            password_logs = "root 口令登录验证未完成，网络路径不可达。"
            password_assessment = "环境连通性不足，无法完成口令登录验证。"
            password_command_result = "BLOCKED"
        else:
            password_verdict = "BLOCKED"
            password_logs = "root 口令登录验证返回未知响应。"
            password_assessment = "返回信息不足，建议人工复核。"
            password_command_result = "BLOCKED"

        steps.append(
            step(
                "SSH root 口令登录验证",
                password_verdict,
                password_logs,
                max(1, int(time.time() - password_started)),
                command=password_command,
                command_result=password_command_result,
                output=password_output,
                security_assessment=password_assessment,
            )
        )
    else:
        steps.append(
            step(
                "SSH root 口令登录验证",
                "BLOCKED",
                "未提供 ssh_probe_password，跳过口令登录验证。",
                1,
                command=f"sshpass -e ssh -p {port} root@{host} true",
                command_result="BLOCKED",
                security_assessment="若需强确认 root 是否可口令登录，请在任务中提供 ssh_probe_password。",
            )
        )

    final_result = "PASSED"
    if auth_verdict == "FAILED" or password_verdict == "FAILED":
        final_result = "FAILED"
    elif auth_verdict == "BLOCKED" and password_verdict != "FAILED":
        final_result = "BLOCKED"
    elif password_verdict == "BLOCKED" and auth_verdict == "PASSED":
        final_result = "BLOCKED"

    if final_result == "FAILED":
        return finish("FAILED", f"目标 {host}:{port} 允许 root 远程登录，不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if final_result == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的 root 登录策略暂不可判定。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 已限制 root 远程登录。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
