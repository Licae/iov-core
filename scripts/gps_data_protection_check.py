#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


LOCATION_KEYWORDS = ("gps", "location", "latitude", "longitude", "lat=", "lon=")
COORDINATE_REGEX = re.compile(
    r"\b-?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*,\s*-?(?:1[0-7]\d(?:\.\d+)?|180(?:\.0+)?|[0-9]?\d(?:\.\d+)?)\b"
)


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 GPS 信息保护测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 GPS 信息检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备 GPS 信息检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    log_started = time.time()
    log_command = f"adb -s {target} shell logcat -d -t 1000"
    log_ok, log_output = run_command(["adb", "-s", target, "shell", "logcat", "-d", "-t", "1000"])
    lines = [line.strip() for line in (log_output or "").splitlines() if line.strip()]
    candidate_lines = [line for line in lines if any(keyword in line.lower() for keyword in LOCATION_KEYWORDS)]
    coordinate_hits = [line for line in candidate_lines if COORDINATE_REGEX.search(line)]

    if not log_ok:
        verdict = "BLOCKED"
        logs = "logcat 命令执行失败。"
        assessment = "运行环境异常，无法完成 GPS 信息保护检查。"
        command_result = "FAILED"
    elif not candidate_lines:
        verdict = "BLOCKED"
        logs = "未采集到定位相关日志样本。"
        assessment = "样本不足，无法判定定位信息是否泄露。"
        command_result = "PASSED"
    elif coordinate_hits:
        preview = " | ".join(coordinate_hits[:3])
        verdict = "FAILED"
        logs = f"定位日志中出现经纬度信息: {preview}"
        assessment = "GPS 信息直接出现在日志中，存在数据泄露风险。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = f"已检查 {len(candidate_lines)} 条定位相关日志，未发现经纬度明文泄露。"
        assessment = "GPS 信息日志暴露风险可控。"
        command_result = "PASSED"

    steps.append(
        step(
            "定位日志敏感信息检查",
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
        return finish("FAILED", f"目标 {target} 的 GPS 信息保护测试不通过。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 GPS 信息保护测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 GPS 信息保护测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
