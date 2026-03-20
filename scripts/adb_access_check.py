#!/usr/bin/env python3
import json
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


def run_command(command: list[str]) -> tuple[bool, str]:
    completed = subprocess.run(command, capture_output=True)
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
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 ADB 访问控制验证。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB Connect 连接验证",
            "FAILED" if connect_ok else "PASSED",
            "ADB connect 已成功建立，未被访问控制阻止。" if connect_ok else "ADB connect 被阻止，符合访问控制预期。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="设备允许建立 ADB 连接，存在暴露风险。" if connect_ok else "设备未允许建立 ADB 连接，访问控制符合预期。",
        )
    )
    if not connect_ok:
        return finish("PASSED", f"目标 {target} 无法建立 adb connect，会话被阻止，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))

    shell_started = time.time()
    shell_command = f"adb -s {target} shell getprop ro.build.type"
    shell_ok, shell_logs = run_command(["adb", "-s", target, "shell", "getprop", "ro.build.type"])
    steps.append(
        step(
            "ADB Shell 进入系统验证",
            "FAILED" if shell_ok else "PASSED",
            "ADB shell 已进入系统，访问控制失败。" if shell_ok else "ADB shell 未能进入系统，访问控制符合预期。",
            max(1, int(time.time() - shell_started)),
            command=shell_command,
            command_result="PASSED" if shell_ok else "FAILED",
            output=shell_logs,
            security_assessment="设备允许执行 shell 命令，未授权访问已进入系统。" if shell_ok else "设备阻止了 shell 进入系统。",
        )
    )

    run_command(["adb", "disconnect", target])

    if shell_ok:
        return finish("FAILED", f"目标 {target} 已可通过 adb shell 进入系统，访问控制失败。", steps, max(1, int(time.time() - started_at)))

    return finish("PASSED", f"目标 {target} 虽可见 ADB 服务，但 adb shell 未能进入系统，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
