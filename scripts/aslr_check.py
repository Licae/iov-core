#!/usr/bin/env python3
import re
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
        return finish("BLOCKED", "资产未配置连接地址，无法执行 ASLR 测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 ASLR 配置检查。" if connect_ok else "ADB 会话建立失败，无法继续 ASLR 配置检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行 ASLR 配置检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定 ASLR 配置状态。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，ASLR 测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    aslr_started = time.time()
    aslr_command = f"adb -s {target} shell cat /proc/sys/kernel/randomize_va_space"
    aslr_ok, aslr_output = run_command(["adb", "-s", target, "shell", "cat", "/proc/sys/kernel/randomize_va_space"])
    value_match = re.search(r"\b([0-2])\b", aslr_output or "")
    aslr_value = int(value_match.group(1)) if value_match else None

    if not aslr_ok:
        verdict = "BLOCKED"
        logs = "无法读取 /proc/sys/kernel/randomize_va_space。"
        assessment = "执行环境异常或权限不足，暂无法判定 ASLR 配置。"
    elif aslr_value == 2:
        verdict = "PASSED"
        logs = "ASLR 配置值为 2（完全随机化）。"
        assessment = "ASLR 完全开启，符合安全基线。"
    elif aslr_value == 1:
        verdict = "FAILED"
        logs = "ASLR 配置值为 1（部分随机化）。"
        assessment = "ASLR 仅部分开启，防护强度不足。"
    elif aslr_value == 0:
        verdict = "FAILED"
        logs = "ASLR 配置值为 0（关闭）。"
        assessment = "ASLR 已关闭，存在明显内存利用风险。"
    else:
        verdict = "BLOCKED"
        logs = f"ASLR 配置返回异常值: {aslr_output or '(empty)'}。"
        assessment = "未获得可判定的 ASLR 配置值。"

    steps.append(
        step(
            "ASLR 配置检查",
            verdict,
            logs,
            max(1, int(time.time() - aslr_started)),
            command=aslr_command,
            command_result="PASSED" if aslr_ok else "FAILED",
            output=aslr_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 ASLR 配置不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 ASLR 测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 ASLR 配置检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
