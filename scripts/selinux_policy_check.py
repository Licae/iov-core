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
        return finish("BLOCKED", "资产未配置连接地址，无法执行 SELinux 策略测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 SELinux 状态检查。" if connect_ok else "ADB 会话建立失败，无法继续 SELinux 状态检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行 SELinux 策略检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定 SELinux 策略状态。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，SELinux 策略测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    selinux_started = time.time()
    selinux_command = f"adb -s {target} shell getenforce"
    selinux_ok, selinux_output = run_command(["adb", "-s", target, "shell", "getenforce"])
    normalized = (selinux_output or "").strip().upper()

    if not selinux_ok:
        verdict = "BLOCKED"
        logs = "getenforce 命令执行失败，无法读取 SELinux 状态。"
        assessment = "执行环境异常，暂无法判定 SELinux 策略是否生效。"
    elif normalized == "ENFORCING":
        verdict = "PASSED"
        logs = "SELinux 当前为 Enforcing。"
        assessment = "SELinux 处于强制模式，符合安全基线。"
    elif normalized in {"PERMISSIVE", "DISABLED"}:
        verdict = "FAILED"
        logs = f"SELinux 当前为 {normalized}。"
        assessment = "SELinux 非强制模式，存在安全防护降级风险。"
    else:
        verdict = "BLOCKED"
        logs = f"SELinux 状态返回异常值: {selinux_output or '(empty)'}。"
        assessment = "未获得可判定的 SELinux 状态值。"

    steps.append(
        step(
            "SELinux 状态检查",
            verdict,
            logs,
            max(1, int(time.time() - selinux_started)),
            command=selinux_command,
            command_result="PASSED" if selinux_ok else "FAILED",
            output=selinux_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 SELinux 策略不符合基线要求。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 SELinux 策略测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 SELinux 策略检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
