#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def parse_kv_output(output: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in output.splitlines():
        normalized = line.strip()
        if "=" not in normalized:
            continue
        key, raw_value = normalized.split("=", 1)
        values[key.strip()] = raw_value.strip()
    return values


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 OTA 降级测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始降级防护检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备降级防护检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    version_started = time.time()
    version_command = f"adb -s {target} shell getprop ro.build.version.incremental"
    version_ok, version_output = run_command(["adb", "-s", target, "shell", "getprop", "ro.build.version.incremental"])
    current_version = (version_output or "").strip()
    steps.append(
        step(
            "当前版本读取",
            "PASSED" if version_ok and current_version else "BLOCKED",
            f"当前系统版本: {current_version}" if version_ok and current_version else "无法读取当前系统版本。",
            max(1, int(time.time() - version_started)),
            command=version_command,
            command_result="PASSED" if version_ok else "FAILED",
            output=version_output,
            security_assessment="已获得版本信息，可继续评估降级防护。" if version_ok and current_version else "缺少版本信息，影响降级判断准确性。",
        )
    )
    if not version_ok:
        run_command(["adb", "disconnect", target])
        return finish("BLOCKED", f"目标 {target} 的 OTA 降级测试未完成，无法读取版本信息。", steps, max(1, int(time.time() - started_at)))

    rollback_started = time.time()
    rollback_shell = (
        "echo rollback_index=$(getprop ro.boot.rollback_index); "
        "echo avb_version=$(getprop ro.boot.avb_version); "
        "echo vbmeta_digest=$(getprop ro.boot.vbmeta.digest); "
        "echo verified_state=$(getprop ro.boot.verifiedbootstate)"
    )
    rollback_command = f'adb -s {target} shell "{rollback_shell}"'
    rollback_ok, rollback_output = run_command(["adb", "-s", target, "shell", "sh", "-c", rollback_shell])
    values = parse_kv_output(rollback_output or "")
    rollback_index = values.get("rollback_index", "")
    avb_version = values.get("avb_version", "")
    vbmeta_digest = values.get("vbmeta_digest", "")
    verified_state = values.get("verified_state", "").lower()

    has_rollback_anchor = bool(rollback_index and rollback_index != "0") or bool(avb_version) or bool(vbmeta_digest)
    secure_verified_boot = verified_state in {"green", "yellow"}

    if not rollback_ok:
        verdict = "BLOCKED"
        logs = "未能读取降级防护属性。"
        assessment = "运行环境异常，无法判定是否具备反降级能力。"
        command_result = "FAILED"
    elif not has_rollback_anchor:
        verdict = "FAILED"
        logs = "未检测到 rollback_index/AVB/vbmeta 等降级防护标识。"
        assessment = "系统缺少明确的防降级锚点，存在回滚风险。"
        command_result = "PASSED"
    elif verified_state == "orange":
        verdict = "FAILED"
        logs = "Verified Boot 状态为 orange。"
        assessment = "启动链完整性未严格校验，降级防护不可靠。"
        command_result = "PASSED"
    elif not secure_verified_boot and verified_state:
        verdict = "BLOCKED"
        logs = f"Verified Boot 状态为 {verified_state}，无法直接判定降级策略。"
        assessment = "状态值非常规，建议结合设备文档复核。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = f"检测到防降级标识，当前版本 {current_version} 具备降级拦截基础。"
        assessment = "系统具备反降级基础能力，符合用例预期。"
        command_result = "PASSED"

    steps.append(
        step(
            "降级防护属性检查",
            verdict,
            logs,
            max(1, int(time.time() - rollback_started)),
            command=rollback_command,
            command_result=command_result,
            output=rollback_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])
    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 OTA 降级防护不符合预期。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 OTA 降级测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 OTA 降级防护检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
