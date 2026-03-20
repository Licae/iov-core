#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


CONTROL_KEYWORDS = ("door", "lock", "unlock", "engine", "brake", "vehicle", "control", "can")
SENSITIVE_PATTERNS = [
    re.compile(r"\b(?:VIN|vin)\b"),
    re.compile(r"\b(?:imei|imsi)\b", flags=re.IGNORECASE),
    re.compile(r"\b(?:token|password|secret|private[_ -]?key)\b", flags=re.IGNORECASE),
    re.compile(r"\b-?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*,\s*-?(?:1[0-7]\d(?:\.\d+)?|180(?:\.0+)?|[0-9]?\d(?:\.\d+)?)\b"),
]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行控车日志测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始控车日志检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备控车日志检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    log_started = time.time()
    log_command = f"adb -s {target} shell logcat -d -t 800"
    log_ok, log_output = run_command(["adb", "-s", target, "shell", "logcat", "-d", "-t", "800"])
    lines = [line.strip() for line in (log_output or "").splitlines() if line.strip()]
    control_lines = [line for line in lines if any(keyword in line.lower() for keyword in CONTROL_KEYWORDS)]

    sensitive_hits: list[str] = []
    for line in control_lines:
        if any(pattern.search(line) for pattern in SENSITIVE_PATTERNS):
            sensitive_hits.append(line)

    if not log_ok:
        verdict = "BLOCKED"
        logs = "logcat 命令执行失败。"
        assessment = "运行环境异常，无法完成控车日志检查。"
        command_result = "FAILED"
    elif not control_lines:
        verdict = "BLOCKED"
        logs = "未采集到控车相关日志样本。"
        assessment = "日志样本不足，暂无法判定控车日志是否安全。"
        command_result = "PASSED"
    elif sensitive_hits:
        verdict = "FAILED"
        preview = " | ".join(sensitive_hits[:3])
        logs = f"控车日志出现敏感信息: {preview}"
        assessment = "控车日志存在敏感信息泄露风险。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = f"已检查 {len(control_lines)} 条控车相关日志，未发现敏感信息。"
        assessment = "控车日志未发现明显敏感信息暴露。"
        command_result = "PASSED"

    steps.append(
        step(
            "控车日志敏感信息检查",
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
        return finish("FAILED", f"目标 {target} 的控车日志存在敏感信息风险。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的控车日志测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的控车日志测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
