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
        return finish("BLOCKED", "资产未配置连接地址，无法执行代码保护测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始代码保护检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备代码保护检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    debug_started = time.time()
    debug_command = f"adb -s {target} shell getprop ro.debuggable"
    debug_ok, debug_output = run_command(["adb", "-s", target, "shell", "getprop", "ro.debuggable"])
    debug_value = (debug_output or "").strip()
    if not debug_ok:
        debug_verdict = "BLOCKED"
        debug_logs = "无法读取 ro.debuggable。"
        debug_assessment = "缺少调试状态信息，无法判定代码保护风险。"
        debug_command_result = "FAILED"
    elif debug_value == "1":
        debug_verdict = "FAILED"
        debug_logs = "ro.debuggable=1，系统开启调试能力。"
        debug_assessment = "量产环境不应开放调试能力。"
        debug_command_result = "PASSED"
    elif debug_value == "0":
        debug_verdict = "PASSED"
        debug_logs = "ro.debuggable=0，系统未开启调试能力。"
        debug_assessment = "调试能力受控，符合预期。"
        debug_command_result = "PASSED"
    else:
        debug_verdict = "BLOCKED"
        debug_logs = f"ro.debuggable 返回异常值: {debug_output or '(empty)'}"
        debug_assessment = "状态值不可判定，建议人工复核。"
        debug_command_result = "PASSED"

    steps.append(
        step(
            "系统调试开关检查",
            debug_verdict,
            debug_logs,
            max(1, int(time.time() - debug_started)),
            command=debug_command,
            command_result=debug_command_result,
            output=debug_output,
            security_assessment=debug_assessment,
        )
    )

    residue_started = time.time()
    residue_shell = (
        "find /data/local/tmp -maxdepth 3 -type f "
        "\\( -iname '*test*' -o -iname '*debug*' -o -name '*.sh' -o -name '*probe*' \\) "
        "2>/dev/null | head -n 30"
    )
    residue_command = f'adb -s {target} shell "{residue_shell}"'
    residue_ok, residue_output = run_command(["adb", "-s", target, "shell", "sh", "-c", residue_shell])
    residues = [line.strip() for line in (residue_output or "").splitlines() if line.strip()]
    if not residue_ok:
        residue_verdict = "BLOCKED"
        residue_logs = "调试残留文件扫描命令执行失败。"
        residue_assessment = "运行环境异常，无法完成残留文件判定。"
        residue_command_result = "FAILED"
    elif residues:
        residue_verdict = "FAILED"
        residue_logs = f"检测到疑似调试/测试残留文件: {', '.join(residues[:8])}"
        residue_assessment = "量产环境存在可疑测试残留，代码保护不足。"
        residue_command_result = "PASSED"
    else:
        residue_verdict = "PASSED"
        residue_logs = "未发现明显调试或测试残留文件。"
        residue_assessment = "文件层面未检出明显代码保护风险。"
        residue_command_result = "PASSED"

    steps.append(
        step(
            "调试残留文件检查",
            residue_verdict,
            residue_logs,
            max(1, int(time.time() - residue_started)),
            command=residue_command,
            command_result=residue_command_result,
            output=residue_output,
            security_assessment=residue_assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if "FAILED" in {debug_verdict, residue_verdict}:
        return finish("FAILED", f"目标 {target} 的代码保护测试不通过。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {debug_verdict, residue_verdict} and "PASSED" not in {debug_verdict, residue_verdict}:
        return finish("BLOCKED", f"目标 {target} 的代码保护测试未完成。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {debug_verdict, residue_verdict}:
        return finish("BLOCKED", f"目标 {target} 的代码保护测试结果不完整。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的代码保护测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
