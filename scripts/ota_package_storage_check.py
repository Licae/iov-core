#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


CHECK_PATHS = ["/data/ota_package", "/data/ota", "/cache/recovery", "/data/update_package"]


def is_over_permissive(permission: str) -> bool:
    if len(permission) < 9:
        return False
    group_writable = permission[5] == "w"
    other_writable = permission[8] == "w"
    return group_writable or other_writable


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行升级包存储安全检查。", steps, 0)

    connect_started = time.time()
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始升级包目录权限检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=f"adb connect {target}",
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备目录权限检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    shell_cmd = f"ls -ld {' '.join(CHECK_PATHS)} 2>/dev/null"
    check_ok, check_output = run_command(["adb", "-s", target, "shell", "sh", "-c", shell_cmd])
    lines = [line.strip() for line in (check_output or "").splitlines() if line.strip()]
    parsed = []
    for line in lines:
        parts = line.split()
        if len(parts) < 2:
            continue
        permission = parts[0]
        path = parts[-1]
        parsed.append((permission, path))
    exposed = [f"{path}:{permission}" for permission, path in parsed if is_over_permissive(permission)]

    if not check_ok and not parsed:
        verdict = "BLOCKED"
        logs = "未读取到升级包存储目录权限。"
        assessment = "环境异常，无法判定目录权限。"
        command_result = "FAILED"
    elif not parsed:
        verdict = "BLOCKED"
        logs = "升级包存储目录不存在或不可访问。"
        assessment = "目录信息缺失，建议人工复核。"
        command_result = "PASSED" if check_ok else "FAILED"
    elif exposed:
        verdict = "FAILED"
        logs = f"检测到权限过宽目录: {', '.join(exposed[:8])}"
        assessment = "升级包存储目录存在越权写入风险。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = "升级包存储目录权限符合预期。"
        assessment = "未发现目录权限过宽风险。"
        command_result = "PASSED"

    steps.append(
        step(
            "升级包存储目录权限检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f'adb -s {target} shell "{shell_cmd}"',
            command_result=command_result,
            output=check_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])
    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的升级包存储权限不安全。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的升级包存储权限检查未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的升级包存储权限检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
