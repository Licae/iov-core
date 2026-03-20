#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def step(
    name: str,
    result: str,
    logs: str,
    duration: int,
    command: str = "",
    command_result: str = "",
    output: str = "",
    security_assessment: str = "",
) -> dict:
    payload = {
        "name": name,
        "result": result,
        "logs": logs,
        "duration": duration,
    }
    if command:
        payload["command"] = command
    if command_result:
        payload["command_result"] = command_result
    if output:
        payload["output"] = output
    if security_assessment:
        payload["security_assessment"] = security_assessment
    return payload


def finish(result: str, summary: str, steps: list[dict], duration: int) -> int:
    normalized_result = str(result or "").strip().upper()
    print(
        json.dumps(
            {
                "result": normalized_result,
                "duration": duration,
                "summary": summary,
                "logs": summary,
                "steps": steps,
            }
        ),
        flush=True,
    )
    return 0 if normalized_result == "PASSED" else 1


def decode_output(data: bytes | None) -> str:
    if not data:
        return ""
    return data.decode("utf-8", errors="replace").strip()


def run_command(command: list[str], env: dict | None = None) -> tuple[bool, str]:
    completed = subprocess.run(command, capture_output=True, env=env)
    output = decode_output(completed.stdout) or decode_output(completed.stderr)
    return completed.returncode == 0, output or f"{' '.join(command)} exited with code {completed.returncode}"


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"result": "BLOCKED", "duration": 0, "logs": "Missing payload file"}))
        return 1

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text("utf-8"))
    item = payload.get("item", {})
    runtime_inputs = payload.get("runtimeInputs", {}) or {}

    host = str(runtime_inputs.get("connection_address") or item.get("connection_address") or "").strip()
    port = int(str(runtime_inputs.get("ssh_port") or "22"))
    probe_user = str(runtime_inputs.get("ssh_probe_username") or runtime_inputs.get("ssh_denied_username") or "").strip()
    probe_password = str(runtime_inputs.get("ssh_probe_password") or runtime_inputs.get("ssh_denied_password") or "").strip()

    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 SSH 访问控制验证。", steps, 0)

    port_command = ["nc", "-zvw3", host, str(port)]
    port_started = time.time()
    port_ok, port_logs = run_command(port_command)
    steps.append(
        step(
            "SSH 端口探测",
            "FAILED" if port_ok else "PASSED",
            "SSH 端口对外可达。" if port_ok else "SSH 端口未对外开放或不可达。",
            max(1, int(time.time() - port_started)),
            command=" ".join(port_command),
            command_result="PASSED" if port_ok else "FAILED",
            output=port_logs,
            security_assessment="SSH 服务已暴露，可继续尝试登录。" if port_ok else "SSH 服务未暴露，访问控制符合预期。",
        )
    )
    if not port_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 SSH 服务，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))

    if not probe_user or not probe_password:
        steps.append(
            step(
                "SSH 登录探测凭据检查",
                "BLOCKED",
                "任务未提供 SSH 测试账号或密码。",
                1,
                security_assessment="缺少运行时输入，无法继续判定 SSH 访问控制是否生效。",
            )
        )
        return finish("BLOCKED", "SSH 端口已暴露，但当前任务缺少 SSH 测试账号或密码。", steps, max(1, int(time.time() - started_at)))

    env = os.environ.copy()
    env["SSHPASS"] = probe_password
    ssh_command = [
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
    ]
    ssh_started = time.time()
    ssh_ok, ssh_logs = run_command(ssh_command, env=env)
    steps.append(
        step(
            "SSH 登录进入系统验证",
            "FAILED" if ssh_ok else "PASSED",
            "SSH 登录已成功进入系统。" if ssh_ok else "SSH 登录未能进入系统。",
            max(1, int(time.time() - ssh_started)),
            command=" ".join(ssh_command[:-1]) + " true",
            command_result="PASSED" if ssh_ok else "FAILED",
            output=ssh_logs,
            security_assessment="测试账号可进入系统，访问控制失败。" if ssh_ok else "测试账号未能进入系统，访问控制符合预期。",
        )
    )

    if ssh_ok:
        return finish("FAILED", f"目标 {host}:{port} 允许测试账号 {probe_user} 通过 SSH 进入系统，访问控制失败。", steps, max(1, int(time.time() - started_at)))

    return finish("PASSED", f"目标 {host}:{port} 阻止了测试账号 {probe_user} 的 SSH 登录，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
