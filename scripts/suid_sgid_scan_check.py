#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


KNOWN_ALLOWLIST = {
    "/system/bin/run-as",
    "/system/bin/su",
    "/system/xbin/su",
    "/system/bin/ping",
    "/system/bin/traceroute6",
}


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 SUID/SGID 扫描。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 SUID/SGID 扫描。" if connect_ok else "ADB 会话建立失败，无法继续 SUID/SGID 扫描。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行 SUID/SGID 检查的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定 SUID/SGID 风险。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，SUID/SGID 扫描被阻塞。", steps, max(1, int(time.time() - started_at)))

    scan_started = time.time()
    scan_shell = "find /system /vendor -xdev -type f \\( -perm -4000 -o -perm -2000 \\) 2>/dev/null | head -n 80"
    scan_command = f'adb -s {target} shell "{scan_shell}"'
    scan_ok, scan_output = run_command(["adb", "-s", target, "shell", "sh", "-c", scan_shell])
    entries = [line.strip() for line in (scan_output or "").splitlines() if line.strip()]
    unknown_entries = [entry for entry in entries if entry not in KNOWN_ALLOWLIST]

    if not scan_ok and not entries:
        verdict = "BLOCKED"
        logs = "SUID/SGID 扫描命令执行失败。"
        assessment = "执行环境异常，无法获取可判定结果。"
        command_result = "FAILED"
    elif unknown_entries:
        preview = ", ".join(unknown_entries[:8])
        verdict = "FAILED"
        logs = f"发现疑似高风险 SUID/SGID 文件: {preview}"
        assessment = "存在未纳入白名单的特权文件，建议人工复核与清理。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = "未发现白名单外的 SUID/SGID 文件。"
        assessment = "特权文件暴露面可控，符合当前基线预期。"
        command_result = "PASSED"

    steps.append(
        step(
            "SUID/SGID 文件扫描",
            verdict,
            logs,
            max(1, int(time.time() - scan_started)),
            command=scan_command,
            command_result=command_result,
            output=scan_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 SUID/SGID 检查发现可疑特权文件。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 SUID/SGID 检查未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 SUID/SGID 检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
