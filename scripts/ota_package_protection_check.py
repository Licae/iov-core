#!/usr/bin/env python3
import time
from pathlib import Path

from security_case_lib import finish, load_payload, resolve_artifact_dir, resolve_target, run_command, step


OTA_PACKAGE_PATHS = [
    "/data/ota_package/update.zip",
    "/data/ota_package/payload.bin",
    "/cache/recovery/block.map",
    "/cache/recovery/last_install",
]


def main() -> int:
    payload, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 OTA 升级包保护测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始 OTA 升级包保护检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备 OTA 升级包保护检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    discover_started = time.time()
    joined_paths = " ".join(OTA_PACKAGE_PATHS)
    discover_shell = "for p in " + joined_paths + "; do if [ -f \"$p\" ]; then echo EXISTS:$p; fi; done"
    discover_command = f'adb -s {target} shell "{discover_shell}"'
    discover_ok, discover_output = run_command(["adb", "-s", target, "shell", "sh", "-c", discover_shell])
    existing_paths = [
        line.replace("EXISTS:", "", 1).strip()
        for line in (discover_output or "").splitlines()
        if line.strip().startswith("EXISTS:")
    ]

    if not discover_ok:
        discover_verdict = "BLOCKED"
        discover_logs = "OTA 升级包路径发现命令执行失败。"
        discover_assessment = "运行环境异常，无法定位升级包路径。"
        discover_command_result = "FAILED"
    elif not existing_paths:
        discover_verdict = "BLOCKED"
        discover_logs = "未发现可检测的 OTA 升级包文件。"
        discover_assessment = "样本不足，无法完成升级包保护判定。"
        discover_command_result = "PASSED"
    else:
        discover_verdict = "PASSED"
        discover_logs = f"发现可检测升级包路径: {', '.join(existing_paths)}"
        discover_assessment = "已定位升级包路径，可继续验证是否可直接获取。"
        discover_command_result = "PASSED"

    steps.append(
        step(
            "OTA 升级包路径发现",
            discover_verdict,
            discover_logs,
            max(1, int(time.time() - discover_started)),
            command=discover_command,
            command_result=discover_command_result,
            output=discover_output,
            security_assessment=discover_assessment,
        )
    )

    pull_verdict = "BLOCKED"
    pull_logs = "未执行 OTA 升级包拉取验证。"
    pull_assessment = "缺少可检测路径。"
    pull_output = ""
    pull_command = ""
    pull_command_result = "BLOCKED"

    if discover_verdict == "PASSED":
        pull_started = time.time()
        pull_dir = resolve_artifact_dir(payload, "adb_pull_dir", "adb-pull")
        pull_results: list[str] = []
        pulled_paths: list[str] = []
        for index, remote_path in enumerate(existing_paths, start=1):
            local_path = Path(pull_dir) / f"ota_package_{index}.bin"
            current_command = f"adb -s {target} pull {remote_path} {local_path}"
            current_ok, current_output = run_command(["adb", "-s", target, "pull", remote_path, str(local_path)])
            pull_results.append(f"{remote_path} => {'OK' if current_ok else 'DENIED'} | {current_output}")
            if current_ok:
                pulled_paths.append(remote_path)
            if current_ok:
                pull_command = current_command
            elif not pull_command:
                pull_command = current_command
        pull_output = "\n".join(pull_results)
        if pulled_paths:
            pull_verdict = "FAILED"
            pull_logs = f"升级包可被直接拉取: {', '.join(pulled_paths)}"
            pull_assessment = "升级包保护不足，存在直接获取风险。"
            pull_command_result = "PASSED"
        else:
            pull_verdict = "PASSED"
            pull_logs = "检测到升级包路径，但 adb pull 均被阻止。"
            pull_assessment = "升级包直接拉取受限，保护策略符合预期。"
            pull_command_result = "FAILED"

        steps.append(
            step(
                "OTA 升级包拉取验证",
                pull_verdict,
                pull_logs,
                max(1, int(time.time() - pull_started)),
                command=pull_command,
                command_result=pull_command_result,
                output=pull_output,
                security_assessment=pull_assessment,
            )
        )

    run_command(["adb", "disconnect", target])

    if discover_verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 OTA 升级包保护测试未完成。", steps, max(1, int(time.time() - started_at)))
    if pull_verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的 OTA 升级包保护测试不通过。", steps, max(1, int(time.time() - started_at)))
    if pull_verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的 OTA 升级包保护测试未完成。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的 OTA 升级包保护测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
