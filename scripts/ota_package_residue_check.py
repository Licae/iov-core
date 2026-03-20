#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


RESIDUE_DIRS = ["/data/ota_package", "/cache/recovery", "/data/update_package", "/metadata/ota"]


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行升级包非法获取检查。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始升级残留包检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备残留升级包检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    joined_dirs = " ".join(RESIDUE_DIRS)
    shell_cmd = (
        "for d in "
        + joined_dirs
        + "; do "
        + "if [ -d \"$d\" ]; then "
        + "echo EXISTS:$d; "
        + "find \"$d\" -maxdepth 3 -type f \\( -name \"*.zip\" -o -name \"*.bin\" -o -name \"*.img\" -o -name \"*payload*\" -o -name \"*update*\" \\) 2>/dev/null | sed 's/^/RESIDUE:/'; "
        + "fi; "
        + "done"
    )
    check_command = f'adb -s {target} shell "{shell_cmd}"'
    check_ok, check_output = run_command(["adb", "-s", target, "shell", "sh", "-c", shell_cmd])
    lines = [line.strip() for line in (check_output or "").splitlines() if line.strip()]
    existing_dirs = [line.replace("EXISTS:", "", 1) for line in lines if line.startswith("EXISTS:")]
    residue_files = [line.replace("RESIDUE:", "", 1) for line in lines if line.startswith("RESIDUE:")]

    if not check_ok and not lines:
        verdict = "BLOCKED"
        logs = "升级残留包检查命令执行失败。"
        assessment = "运行环境异常，暂无法判定升级包是否可非法获取。"
        command_result = "FAILED"
    elif not existing_dirs:
        verdict = "BLOCKED"
        logs = "未发现 OTA 缓存目录，缺少可检测目标。"
        assessment = "系统未暴露标准 OTA 缓存目录，建议结合设备版本人工复核。"
        command_result = "PASSED" if check_ok else "FAILED"
    elif residue_files:
        preview = ", ".join(residue_files[:8])
        verdict = "FAILED"
        logs = f"升级后发现可直接获取的残留包文件: {preview}"
        assessment = "升级包残留未清理，存在非法获取风险。"
        command_result = "PASSED"
    else:
        verdict = "PASSED"
        logs = f"已检查目录 {', '.join(existing_dirs)}，未发现可直接获取的残留包。"
        assessment = "升级后残留包已清理或未暴露，符合预期。"
        command_result = "PASSED"

    steps.append(
        step(
            "升级包残留文件检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=check_command,
            command_result=command_result,
            output=check_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])
    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 存在 OTA 升级包非法获取风险。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的升级包非法获取检查未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的升级包非法获取检查通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
