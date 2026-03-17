#!/usr/bin/env python3
import json
import os
import shlex
import socket
import subprocess
import sys
import time
from pathlib import Path


def step(name: str, result: str, logs: str, duration: int) -> dict:
    return {
        "name": name,
        "result": result,
        "logs": logs,
        "duration": duration,
    }


def finish(result: str, summary: str, steps: list[dict], duration: int) -> int:
    print(
        json.dumps(
            {
                "result": result,
                "duration": duration,
                "summary": summary,
                "logs": summary,
                "steps": steps,
            }
        ),
        flush=True,
    )
    return 0 if result == "Passed" else 1


def run_ping(host: str) -> tuple[bool, str]:
    command = ["ping", "-c", "1", "-W", "1000", host]
    completed = subprocess.run(command, capture_output=True, text=True)
    output = (completed.stdout or completed.stderr or "").strip()
    return completed.returncode == 0, output or "ping completed"


def check_port(host: str, port: int, timeout: float = 3.0) -> tuple[bool, str]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    started = time.time()
    try:
        sock.connect((host, port))
        elapsed = max(1, int((time.time() - started) * 1000))
        return True, f"TCP {port} reachable in {elapsed} ms"
    except OSError as exc:
        return False, str(exc)
    finally:
        sock.close()


def run_ssh_command(host: str, username: str, password: str, port: int) -> tuple[bool, str]:
    env = os.environ.copy()
    env["SSHPASS"] = password
    command = [
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
        f"{username}@{host}",
        "true",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, env=env)
    output = (completed.stdout or completed.stderr or "").strip()
    return completed.returncode == 0, output or f"ssh exited with code {completed.returncode}"


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"result": "Blocked", "duration": 0, "logs": "Missing payload file"}))
        return 1

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text("utf-8"))
    item = payload.get("item", {})
    test_case = payload.get("testCase", {})

    host = str(item.get("connection_address") or "").strip()
    port = int(os.environ.get("SSH_TEST_PORT", "22"))
    allowed_user = os.environ.get("SSH_TEST_ALLOWED_USER", "").strip()
    allowed_password = os.environ.get("SSH_TEST_ALLOWED_PASSWORD", "").strip()
    denied_user = os.environ.get("SSH_TEST_DENIED_USER", "").strip()
    denied_password = os.environ.get("SSH_TEST_DENIED_PASSWORD", "").strip()

    started_at = time.time()
    steps: list[dict] = []

    if not host:
      return finish("Blocked", "资产未配置连接地址，无法执行 SSH 访问控制验证。", steps, 0)

    ping_started = time.time()
    ping_ok, ping_logs = run_ping(host)
    steps.append(step("目标主机存活检查", "Passed" if ping_ok else "Failed", ping_logs, max(1, int(time.time() - ping_started))))
    if not ping_ok:
        return finish("Failed", f"目标 {host} 不可达，SSH 测试无法继续。", steps, max(1, int(time.time() - started_at)))

    port_started = time.time()
    port_ok, port_logs = check_port(host, port)
    steps.append(step("22 端口连通性检查", "Passed" if port_ok else "Failed", port_logs, max(1, int(time.time() - port_started))))
    if not port_ok:
        return finish("Failed", f"目标 {host}:{port} 不可连接，SSH 服务未就绪或未开放。", steps, max(1, int(time.time() - started_at)))

    if not allowed_user or not allowed_password or not denied_user or not denied_password:
        steps.append(
            step(
                "访问控制凭据检查",
                "Blocked",
                "缺少 SSH_TEST_ALLOWED_* 或 SSH_TEST_DENIED_* 环境变量，无法进行真实授权/未授权登录验证。",
                1,
            )
        )
        return finish("Blocked", "SSH 目标可达，但未配置授权/未授权测试凭据。", steps, max(1, int(time.time() - started_at)))

    allowed_started = time.time()
    allowed_ok, allowed_logs = run_ssh_command(host, allowed_user, allowed_password, port)
    steps.append(
        step(
            "授权账号登录验证",
            "Passed" if allowed_ok else "Failed",
            f"用户 {allowed_user}: {allowed_logs}",
            max(1, int(time.time() - allowed_started)),
        )
    )
    if not allowed_ok:
        return finish("Failed", f"授权账号 {allowed_user} 无法登录目标 {host}。", steps, max(1, int(time.time() - started_at)))

    denied_started = time.time()
    denied_ok, denied_logs = run_ssh_command(host, denied_user, denied_password, port)
    steps.append(
        step(
            "未授权账号拒绝验证",
            "Passed" if not denied_ok else "Failed",
            f"用户 {denied_user}: {denied_logs}",
            max(1, int(time.time() - denied_started)),
        )
    )

    if denied_ok:
        return finish("Failed", f"未授权账号 {denied_user} 仍可登录目标 {host}，访问控制失败。", steps, max(1, int(time.time() - started_at)))

    summary = f"目标 {host} 的 SSH 访问控制验证通过：授权账号可登录，未授权账号被拒绝。"
    return finish("Passed", summary, steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
