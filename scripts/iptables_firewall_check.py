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
        return finish("BLOCKED", "资产未配置连接地址，无法执行 iptables 防火墙检测。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始防火墙规则检查。" if connect_ok else "ADB 会话建立失败，无法继续防火墙规则检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行防火墙策略检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定防火墙策略状态。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，iptables 防火墙检测被阻塞。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    check_command = f'adb -s {target} shell sh -c "iptables -S 2>/dev/null || iptables -L 2>/dev/null"'
    check_ok, check_output = run_command(
        ["adb", "-s", target, "shell", "sh", "-c", "iptables -S 2>/dev/null || iptables -L 2>/dev/null"]
    )
    normalized_output = (check_output or "").upper()

    if not check_ok and ("NOT FOUND" in normalized_output or "INACCESSIBLE" in normalized_output):
        verdict = "BLOCKED"
        logs = "系统未提供可访问的 iptables 命令，无法完成防火墙规则判定。"
        assessment = "执行环境不支持 iptables 检测。"
    elif not check_ok:
        verdict = "BLOCKED"
        logs = "iptables 命令执行失败，未获得有效规则输出。"
        assessment = "防火墙规则状态暂不可判定。"
    else:
        has_default_drop = ("-P INPUT DROP" in normalized_output) or ("-P INPUT REJECT" in normalized_output)
        has_reject_rule = ("DROP" in normalized_output) or ("REJECT" in normalized_output)
        has_all_accept = ("-P INPUT ACCEPT" in normalized_output) and ("DROP" not in normalized_output and "REJECT" not in normalized_output)
        if has_default_drop or has_reject_rule:
            verdict = "PASSED"
            logs = "检测到防火墙存在 DROP/REJECT 策略。"
            assessment = "防火墙默认策略或规则具备阻断能力，符合预期。"
        elif has_all_accept:
            verdict = "FAILED"
            logs = "检测到 INPUT 策略为 ACCEPT 且未发现阻断规则。"
            assessment = "防火墙策略过宽，存在暴露风险。"
        else:
            verdict = "BLOCKED"
            logs = "iptables 输出无法明确判定阻断策略。"
            assessment = "建议人工复核防火墙规则完整性。"

    steps.append(
        step(
            "iptables 规则检查",
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
        return finish("FAILED", f"目标 {target} 的 iptables 防火墙策略不符合安全预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 iptables 防火墙检测未完成，请检查环境与规则输出。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 iptables 防火墙检测通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
