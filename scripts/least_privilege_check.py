#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行最小权限测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始最小权限检查。" if connect_ok else "ADB 会话建立失败，无法继续最小权限检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行最小权限检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定最小权限策略。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，最小权限测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    check_command = f"adb -s {target} shell id"
    check_ok, check_output = run_command(["adb", "-s", target, "shell", "id"])
    normalized_output = (check_output or "").lower()

    if not check_ok:
        verdict = "BLOCKED"
        logs = "无法读取 shell 身份信息(id)。"
        assessment = "执行环境异常，暂无法判定最小权限策略。"
    elif "uid=0" in normalized_output or "gid=0" in normalized_output:
        verdict = "FAILED"
        logs = f"检测到高权限身份输出: {check_output}"
        assessment = "当前执行上下文具备 root 权限，不符合最小权限原则。"
    elif "uid=" in normalized_output:
        verdict = "PASSED"
        logs = f"检测到非 root 身份输出: {check_output}"
        assessment = "执行上下文未直接拥有 root 权限，符合最小权限预期。"
    else:
        verdict = "BLOCKED"
        logs = f"id 输出异常: {check_output or '(empty)'}"
        assessment = "未获得可判定的权限身份信息。"

    steps.append(
        step(
            "最小权限身份检查",
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
        return finish("FAILED", f"目标 {target} 的最小权限策略不符合预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的最小权限测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的最小权限测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
