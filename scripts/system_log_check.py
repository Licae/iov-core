#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


SENSITIVE_PATTERNS = [
    r"password",
    r"passwd",
    r"token",
    r"secret",
    r"private[_ -]?key",
    r"authorization",
]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行系统日志测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始系统日志检查。" if connect_ok else "ADB 会话建立失败，无法继续系统日志检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行日志安全检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定日志安全策略。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，系统日志测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    logcat_started = time.time()
    logcat_command = f"adb -s {target} shell logcat -d -t 400"
    logcat_ok, logcat_output = run_command(["adb", "-s", target, "shell", "logcat", "-d", "-t", "400"])
    normalized_output = (logcat_output or "").lower()
    matched = sorted({pattern for pattern in SENSITIVE_PATTERNS if re.search(pattern, normalized_output)})
    has_permission_denied = "permission denied" in normalized_output

    if has_permission_denied:
        verdict = "PASSED"
        logs = "logcat 访问被权限策略限制。"
        assessment = "系统日志访问已受限，符合最小暴露原则。"
    elif not logcat_ok:
        verdict = "BLOCKED"
        logs = "logcat 命令执行失败，无法完成系统日志检查。"
        assessment = "执行环境异常，未能得到有效日志样本。"
    elif matched:
        verdict = "FAILED"
        logs = f"logcat 输出疑似包含敏感字段：{', '.join(matched)}。"
        assessment = "系统日志存在敏感信息暴露风险。"
    else:
        verdict = "PASSED"
        logs = "logcat 输出未检出预定义敏感字段。"
        assessment = "系统日志内容未发现明显敏感信息暴露。"

    steps.append(
        step(
            "系统日志敏感信息检查",
            verdict,
            logs,
            max(1, int(time.time() - logcat_started)),
            command=logcat_command,
            command_result="PASSED" if logcat_ok else "FAILED",
            output=logcat_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的系统日志存在敏感信息暴露风险。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的系统日志测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的系统日志检查通过，未发现明显敏感信息暴露。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
