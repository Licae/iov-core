#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


INSTALL_KEYWORDS = ("packageinstaller", "pm install", "adb install", "apk", "install_failed")
SENSITIVE_PATTERNS = [
    re.compile(r"password", flags=re.IGNORECASE),
    re.compile(r"token", flags=re.IGNORECASE),
    re.compile(r"secret", flags=re.IGNORECASE),
    re.compile(r"private[_ -]?key", flags=re.IGNORECASE),
    re.compile(r"authorization", flags=re.IGNORECASE),
]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 APK logcat 日志测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 APK 日志检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备 APK 日志检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    log_started = time.time()
    log_command = f"adb -s {target} shell logcat -d -t 800"
    log_ok, log_output = run_command(["adb", "-s", target, "shell", "logcat", "-d", "-t", "800"])
    lines = [line.strip() for line in (log_output or "").splitlines() if line.strip()]
    install_lines = [line for line in lines if any(keyword in line.lower() for keyword in INSTALL_KEYWORDS)]
    sensitive_hits: list[str] = []
    for line in install_lines:
        if any(pattern.search(line) for pattern in SENSITIVE_PATTERNS):
            sensitive_hits.append(line)

    if not log_ok:
        verdict = "BLOCKED"
        logs = "logcat 命令执行失败。"
        assessment = "运行环境异常，无法完成 APK 日志检查。"
        command_result = "FAILED"
    elif not install_lines:
        verdict = "BLOCKED"
        logs = "未采集到 APK 安装相关日志样本。"
        assessment = "当前日志样本不足，暂无法判定是否存在敏感信息泄露。"
        command_result = "PASSED"
    elif sensitive_hits:
        verdict = "FAILED"
        preview = " | ".join(sensitive_hits[:3])
        logs = f"APK 安装日志中出现疑似敏感字段: {preview}"
        assessment = "日志存在敏感信息暴露风险。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = f"已检查 {len(install_lines)} 条 APK 安装相关日志，未检出敏感字段。"
        assessment = "APK 安装日志未发现明显敏感信息泄露。"
        command_result = "PASSED"

    steps.append(
        step(
            "APK 日志敏感信息检查",
            verdict,
            logs,
            max(1, int(time.time() - log_started)),
            command=log_command,
            command_result=command_result,
            output=log_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])
    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 APK logcat 日志存在敏感信息风险。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 APK logcat 日志测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 APK logcat 日志测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
