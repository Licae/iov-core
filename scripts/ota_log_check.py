#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


OTA_PATHS = [
    "/cache/recovery/last_log",
    "/data/misc/ota",
    "/data/ota_package",
    "/metadata/ota",
]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 OTA 升级日志测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 OTA 日志路径检查。" if connect_ok else "ADB 会话建立失败，无法继续 OTA 日志路径检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行 OTA 日志访问控制检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定 OTA 日志访问策略。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，OTA 升级日志测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    joined_paths = " ".join(OTA_PATHS)
    check_command = (
        f'adb -s {target} shell sh -c '
        f'"for p in {joined_paths}; do '
        f'if [ -e \\"$p\\" ]; then '
        f'if [ -r \\"$p\\" ]; then echo READABLE:$p; else echo DENIED:$p; fi; '
        f'else echo MISSING:$p; fi; done"'
    )
    check_started = time.time()
    check_ok, check_output = run_command(
        [
            "adb",
            "-s",
            target,
            "shell",
            "sh",
            "-c",
            (
                "for p in "
                + joined_paths
                + "; do if [ -e \"$p\" ]; then if [ -r \"$p\" ]; then echo READABLE:$p; "
                + "else echo DENIED:$p; fi; else echo MISSING:$p; fi; done"
            ),
        ]
    )

    lines = [line.strip() for line in (check_output or "").splitlines() if line.strip()]
    readable_paths = [line.replace("READABLE:", "", 1) for line in lines if line.startswith("READABLE:")]
    denied_paths = [line.replace("DENIED:", "", 1) for line in lines if line.startswith("DENIED:")]
    missing_paths = [line.replace("MISSING:", "", 1) for line in lines if line.startswith("MISSING:")]

    if not check_ok:
        verdict = "BLOCKED"
        logs = "OTA 日志路径检测命令执行失败。"
        assessment = "执行环境异常，暂无法验证 OTA 日志访问控制。"
    elif readable_paths:
        verdict = "FAILED"
        logs = f"检测到可读取的 OTA 日志路径: {', '.join(readable_paths)}。"
        assessment = "OTA 升级日志可被当前上下文读取，存在敏感信息泄露风险。"
    elif denied_paths:
        verdict = "PASSED"
        logs = f"OTA 日志路径存在但被拒绝读取: {', '.join(denied_paths)}。"
        assessment = "OTA 日志访问受限，符合安全预期。"
    else:
        verdict = "BLOCKED"
        logs = f"未发现可检测的 OTA 日志路径: {', '.join(missing_paths) if missing_paths else '未知'}。"
        assessment = "目标系统未提供预置 OTA 日志路径，当前用例无法完成有效判定。"

    steps.append(
        step(
            "OTA 日志路径访问控制检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=check_command,
            command_result="PASSED" if check_ok else "FAILED",
            output=check_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 OTA 升级日志访问控制不符合预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 OTA 升级日志测试未完成，请检查路径配置或运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 OTA 升级日志访问控制检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
