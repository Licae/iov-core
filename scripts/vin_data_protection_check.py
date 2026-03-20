#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


VIN_REGEX = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b")
VIN_PATHS = ["/persist/vin", "/mnt/vendor/persist/vin", "/data/vendor/vehicle/vin", "/data/system/vin"]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 VIN 信息保护测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 VIN 信息检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备 VIN 信息检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    prop_started = time.time()
    prop_shell = "getprop | grep -Ei 'vin|vehicle_identification' || true"
    prop_command = f'adb -s {target} shell "{prop_shell}"'
    prop_ok, prop_output = run_command(["adb", "-s", target, "shell", "sh", "-c", prop_shell])
    vin_hits = VIN_REGEX.findall(prop_output or "")
    if not prop_ok:
        prop_verdict = "BLOCKED"
        prop_logs = "VIN 属性检查命令执行失败。"
        prop_assessment = "运行环境异常，无法判定 VIN 是否被属性暴露。"
        prop_command_result = "FAILED"
    elif vin_hits:
        prop_verdict = "FAILED"
        unique_hits = ", ".join(sorted(set(vin_hits))[:3])
        prop_logs = f"系统属性中检测到 VIN 明文: {unique_hits}"
        prop_assessment = "VIN 在系统属性可见，存在泄露风险。"
        prop_command_result = "PASSED"
    else:
        prop_verdict = "PASSED"
        prop_logs = "系统属性未检出 VIN 明文。"
        prop_assessment = "VIN 未通过系统属性直接暴露。"
        prop_command_result = "PASSED"

    steps.append(
        step(
            "VIN 属性暴露检查",
            prop_verdict,
            prop_logs,
            max(1, int(time.time() - prop_started)),
            command=prop_command,
            command_result=prop_command_result,
            output=prop_output,
            security_assessment=prop_assessment,
        )
    )

    path_started = time.time()
    joined_paths = " ".join(VIN_PATHS)
    path_shell = (
        "for p in "
        + joined_paths
        + "; do "
        + "if [ -e \"$p\" ]; then "
        + "if [ -w \"$p\" ]; then echo WRITABLE:$p; "
        + "elif [ -r \"$p\" ]; then echo READABLE:$p; "
        + "else echo PROTECTED:$p; fi; "
        + "else echo MISSING:$p; fi; "
        + "done"
    )
    path_command = f'adb -s {target} shell "{path_shell}"'
    path_ok, path_output = run_command(["adb", "-s", target, "shell", "sh", "-c", path_shell])
    path_lines = [line.strip() for line in (path_output or "").splitlines() if line.strip()]
    writable_paths = [line.replace("WRITABLE:", "", 1) for line in path_lines if line.startswith("WRITABLE:")]
    readable_paths = [line.replace("READABLE:", "", 1) for line in path_lines if line.startswith("READABLE:")]
    protected_paths = [line.replace("PROTECTED:", "", 1) for line in path_lines if line.startswith("PROTECTED:")]

    if not path_ok:
        path_verdict = "BLOCKED"
        path_logs = "VIN 文件权限检查命令执行失败。"
        path_assessment = "运行环境异常，无法判定 VIN 文件保护状态。"
        path_command_result = "FAILED"
    elif writable_paths:
        path_verdict = "FAILED"
        path_logs = f"VIN 文件可写: {', '.join(writable_paths)}"
        path_assessment = "VIN 可被当前上下文修改，不符合数据保护要求。"
        path_command_result = "PASSED"
    elif readable_paths:
        path_verdict = "FAILED"
        path_logs = f"VIN 文件可读: {', '.join(readable_paths)}"
        path_assessment = "VIN 文件可被直接读取，存在泄露风险。"
        path_command_result = "PASSED"
    elif protected_paths:
        path_verdict = "PASSED"
        path_logs = f"VIN 路径存在但已受限: {', '.join(protected_paths)}"
        path_assessment = "VIN 文件访问受控，符合预期。"
        path_command_result = "PASSED"
    else:
        path_verdict = "BLOCKED"
        path_logs = "未发现可检测的 VIN 路径。"
        path_assessment = "目标环境缺少 VIN 样本，暂无法判定。"
        path_command_result = "PASSED"

    steps.append(
        step(
            "VIN 文件权限检查",
            path_verdict,
            path_logs,
            max(1, int(time.time() - path_started)),
            command=path_command,
            command_result=path_command_result,
            output=path_output,
            security_assessment=path_assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if "FAILED" in {prop_verdict, path_verdict}:
        return finish("FAILED", f"目标 {target} 的 VIN 信息保护测试不通过。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {prop_verdict, path_verdict} and "PASSED" not in {prop_verdict, path_verdict}:
        return finish("BLOCKED", f"目标 {target} 的 VIN 信息保护测试未完成。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {prop_verdict, path_verdict}:
        return finish("BLOCKED", f"目标 {target} 的 VIN 信息保护测试结果不完整。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 VIN 信息保护测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
