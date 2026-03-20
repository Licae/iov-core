#!/usr/bin/env python3
import os
import re
import time

from security_case_lib import finish, load_payload, probe_tcp_port, resolve_target, run_command, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("ssh_port") or "22"))
    probe_user = str(runtime_inputs.get("ssh_probe_username") or "root").strip()
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行账户锁定测试。", steps, 0)

    probe_started = time.time()
    probe_ok, probe_output = probe_tcp_port(host, port)
    steps.append(
        step(
            "SSH 服务探测",
            "FAILED" if probe_ok else "PASSED",
            "SSH 服务对外可达。" if probe_ok else "SSH 服务未对外开放或不可达。",
            max(1, int(time.time() - probe_started)),
            command=f"nc -zvw3 {host} {port}",
            command_result="PASSED" if probe_ok else "FAILED",
            output=probe_output,
            security_assessment="SSH 暴露，可继续检查账户锁定行为。" if probe_ok else "SSH 未暴露，账户锁定场景不适用。",
        )
    )
    if not probe_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 SSH 服务，账户锁定风险面关闭。", steps, max(1, int(time.time() - started_at)))

    attempt_count = int(str(runtime_inputs.get("ssh_lockout_attempts") or "5"))
    attempt_count = max(3, min(attempt_count, 10))
    bad_password = str(runtime_inputs.get("ssh_lockout_bad_password") or "WrongPass!123")
    env = os.environ.copy()
    env["SSHPASS"] = bad_password

    lockout_started = time.time()
    command_template = (
        f"sshpass -e ssh -p {port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "
        "-o ConnectTimeout=5 -o PreferredAuthentications=password -o PubkeyAuthentication=no "
        f"{probe_user}@{host} true"
    )
    outputs: list[str] = []
    lockout_detected = False
    executed_attempts = 0
    for index in range(attempt_count):
        ok, output = run_command(
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
                "ConnectTimeout=5",
                "-o",
                "PreferredAuthentications=password",
                "-o",
                "PubkeyAuthentication=no",
                f"{probe_user}@{host}",
                "true",
            ],
            env=env,
        )
        executed_attempts += 1
        normalized = (output or "").lower()
        outputs.append(f"attempt#{index + 1} => {'OK' if ok else 'FAIL'} | {output}")
        if ok:
            break
        if re.search(r"account.*locked|too many authentication failures|maximum authentication attempts", normalized):
            lockout_detected = True
            break

    combined_output = "\n".join(outputs)
    if executed_attempts == 0:
        verdict = "BLOCKED"
        logs = "未执行任何登录尝试。"
        assessment = "运行异常，无法验证账户锁定策略。"
        command_result = "BLOCKED"
    elif lockout_detected:
        verdict = "PASSED"
        logs = f"在连续失败登录后检测到账户锁定信号（用户 {probe_user}）。"
        assessment = "账户锁定机制生效，符合预期。"
        command_result = "FAILED"
    elif "ok |" in combined_output.lower():
        verdict = "FAILED"
        logs = f"弱凭据尝试中出现登录成功（用户 {probe_user}）。"
        assessment = "认证策略异常，存在高风险。"
        command_result = "PASSED"
    else:
        verdict = "FAILED"
        logs = f"连续 {executed_attempts} 次失败登录后未检测到账户锁定信号。"
        assessment = "未观察到账户锁定机制，存在暴力尝试风险。"
        command_result = "FAILED"

    steps.append(
        step(
            "连续失败登录锁定检查",
            verdict,
            logs,
            max(1, int(time.time() - lockout_started)),
            command=command_template,
            command_result=command_result,
            output=combined_output,
            security_assessment=assessment,
        )
    )

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {host}:{port} 的账户锁定策略不符合预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的账户锁定测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 的账户锁定策略检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
