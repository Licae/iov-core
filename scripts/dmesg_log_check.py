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
        return finish("BLOCKED", "资产未配置连接地址，无法执行 dmesg 日志测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 dmesg 访问检查。" if connect_ok else "ADB 会话建立失败，无法继续 dmesg 访问检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行 dmesg 安全检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定 dmesg 访问控制策略。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，dmesg 日志测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    dmesg_started = time.time()
    dmesg_command = f'adb -s {target} shell sh -c "dmesg | tail -n 120"'
    dmesg_ok, dmesg_output = run_command(["adb", "-s", target, "shell", "sh", "-c", "dmesg | tail -n 120"])
    normalized_output = (dmesg_output or "").lower()

    if "permission denied" in normalized_output or "operation not permitted" in normalized_output:
        verdict = "PASSED"
        logs = "dmesg 读取被系统权限策略阻止。"
        assessment = "内核日志读取已受限，符合安全预期。"
    elif dmesg_ok:
        verdict = "FAILED"
        logs = "dmesg 可被直接读取。"
        assessment = "内核日志暴露给当前执行上下文，存在信息泄露风险。"
    else:
        verdict = "BLOCKED"
        logs = "dmesg 命令执行失败，无法完成日志访问判定。"
        assessment = "执行环境异常，暂无法验证 dmesg 访问控制。"

    steps.append(
        step(
            "dmesg 访问控制检查",
            verdict,
            logs,
            max(1, int(time.time() - dmesg_started)),
            command=dmesg_command,
            command_result="PASSED" if dmesg_ok else "FAILED",
            output=dmesg_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 可读取 dmesg 内核日志，访问控制不符合预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 dmesg 日志测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 已限制 dmesg 内核日志访问。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
