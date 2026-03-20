#!/usr/bin/env python3
import time
from pathlib import Path

from security_case_lib import finish, load_payload, resolve_artifact_dir, run_command, resolve_target, step


def main() -> int:
    payload, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    source_path = str(runtime_inputs.get("adb_pull_source_path") or "/system/build.prop").strip()
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 ADB Pull 测试。", steps, 0)

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
        return finish("PASSED", f"目标 {target} 无法建立 ADB 会话，ADB Pull 被前置访问控制拦截。", steps, max(1, int(time.time() - started_at)))

    pull_artifact_dir = resolve_artifact_dir(payload, "adb_pull_dir", "adb-pull")
    local_path = Path(pull_artifact_dir) / "pull_result.bin"
    pull_started = time.time()
    pull_command = f"adb -s {target} pull {source_path} {local_path}"
    pull_ok, pull_logs = run_command(["adb", "-s", target, "pull", source_path, str(local_path)])
    steps.append(
        step(
            "ADB Pull 文件下载验证",
            "FAILED" if pull_ok else "PASSED",
            "ADB pull 成功拉取目标文件。" if pull_ok else "ADB pull 未能拉取目标文件。",
            max(1, int(time.time() - pull_started)),
            command=pull_command,
            command_result="PASSED" if pull_ok else "FAILED",
            output=pull_logs,
            security_assessment="设备允许通过 ADB pull 拉取文件，访问控制失败。" if pull_ok else "设备阻止了 ADB pull 拉取，访问控制符合预期。",
        )
    )

    run_command(["adb", "disconnect", target])

    if pull_ok:
        return finish("FAILED", f"目标 {target} 允许通过 ADB pull 拉取 {source_path}，访问控制失败。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 已阻止通过 ADB pull 拉取 {source_path}，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
