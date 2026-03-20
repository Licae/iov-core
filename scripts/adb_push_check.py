#!/usr/bin/env python3
import time
from pathlib import Path

from security_case_lib import finish, load_payload, resolve_artifact_dir, run_command, resolve_target, step


def main() -> int:
    payload, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target_path = str(runtime_inputs.get("adb_push_target_path") or "/data/local/tmp/iov_probe.txt").strip()
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 ADB Push 测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB Connect 连接验证",
            "FAILED" if connect_ok else "PASSED",
            "ADB connect 已成功建立。" if connect_ok else "ADB connect 被阻止。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="设备允许建立 ADB 会话。" if connect_ok else "设备未允许建立 ADB 会话，访问控制符合预期。",
        )
    )
    if not connect_ok:
        return finish("PASSED", f"目标 {target} 无法建立 ADB 会话，ADB Push 被前置访问控制拦截。", steps, max(1, int(time.time() - started_at)))

    push_artifact_dir = resolve_artifact_dir(payload, "adb_push_dir", "adb-push")
    local_path = Path(push_artifact_dir) / "push_probe.txt"
    local_path.write_text("iov probe", encoding="utf-8")

    push_started = time.time()
    push_command = f"adb -s {target} push {local_path} {target_path}"
    push_ok, push_logs = run_command(["adb", "-s", target, "push", str(local_path), target_path])
    steps.append(
        step(
            "ADB Push 文件上传验证",
            "FAILED" if push_ok else "PASSED",
            "ADB push 成功写入目标路径。" if push_ok else "ADB push 未能写入目标路径。",
            max(1, int(time.time() - push_started)),
            command=push_command,
            command_result="PASSED" if push_ok else "FAILED",
            output=push_logs,
            security_assessment="设备允许通过 ADB push 上传文件，访问控制失败。" if push_ok else "设备阻止了 ADB push 上传，访问控制符合预期。",
        )
    )

    run_command(["adb", "-s", target, "shell", "rm", "-f", target_path])
    run_command(["adb", "disconnect", target])

    if push_ok:
        return finish("FAILED", f"目标 {target} 允许通过 ADB push 写入 {target_path}，访问控制失败。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 已阻止通过 ADB push 写入 {target_path}，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
