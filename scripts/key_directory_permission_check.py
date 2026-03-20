#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def parse_permission_line(line: str) -> tuple[str, str]:
    parts = line.strip().split()
    if len(parts) < 2:
        return "", ""
    return parts[0], parts[-1]


def is_group_write(perms: str) -> bool:
    return len(perms) >= 6 and perms[5] == "w"


def is_other_write(perms: str) -> bool:
    return len(perms) >= 9 and perms[8] == "w"


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行关键目录权限检查。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始目录权限检查。" if connect_ok else "ADB 会话建立失败，无法继续目录权限检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行目录权限检查的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定目录权限。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，关键目录权限检查被阻塞。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    check_command = f'adb -s {target} shell ls -ld /system /vendor /data 2>/dev/null'
    check_ok, check_output = run_command(["adb", "-s", target, "shell", "ls", "-ld", "/system", "/vendor", "/data"])
    lines = [line for line in (check_output or "").splitlines() if line.strip()]
    parsed = [parse_permission_line(line) for line in lines]
    parsed = [(perms, path) for perms, path in parsed if perms and path]

    missing_paths = [p for p in ["/system", "/vendor", "/data"] if not any(path == p for _, path in parsed)]
    offending: list[str] = []
    for perms, path in parsed:
        if path in {"/system", "/vendor"} and (is_group_write(perms) or is_other_write(perms)):
            offending.append(f"{path}:{perms}")
        if path == "/data" and is_other_write(perms):
            offending.append(f"{path}:{perms}")

    if not check_ok and not parsed:
        verdict = "BLOCKED"
        logs = "目录权限命令执行失败。"
        assessment = "执行环境异常，无法读取关键目录权限。"
        command_result = "FAILED"
    elif missing_paths:
        verdict = "BLOCKED"
        logs = f"未获取到目录权限信息: {', '.join(missing_paths)}。"
        assessment = "目录信息不完整，暂无法判定。"
        command_result = "PASSED" if check_ok else "FAILED"
    elif offending:
        verdict = "FAILED"
        logs = f"发现权限过宽目录: {', '.join(offending)}。"
        assessment = "关键目录存在可写风险，不符合安全基线。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = "关键目录权限未发现越权写入风险。"
        assessment = "目录权限符合安全基线。"
        command_result = "PASSED"

    steps.append(
        step(
            "关键目录权限检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=check_command,
            command_result=command_result,
            output=check_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的关键目录权限不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的关键目录权限检查未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的关键目录权限检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
