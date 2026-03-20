#!/usr/bin/env python3
import re
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def _is_writeable_for_group_or_other(permission_bits: str) -> bool:
    if len(permission_bits) < 10:
        return False
    group_write = permission_bits[5] == "w"
    other_write = permission_bits[8] == "w"
    return group_write or other_write


def _extract_permission_bits(ls_output_line: str) -> str:
    match = re.search(r"([\-dlcbps][rwx\-stST]{9})", ls_output_line.strip())
    return match.group(1) if match else ""


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行系统证书保护测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_logs = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始系统证书目录权限检查。" if connect_ok else "ADB 会话建立失败，无法继续系统证书目录权限检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_logs,
            security_assessment="已具备执行证书目录权限检测的前置条件。" if connect_ok else "前置连接失败，当前任务无法判定证书目录保护状态。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话，系统证书保护测试被阻塞。", steps, max(1, int(time.time() - started_at)))

    check_started = time.time()
    check_command = (
        f'adb -s {target} shell sh -c "ls -ld /system/etc/security/cacerts 2>/dev/null; '
        "ls -ld /data/misc/user/0/cacerts-added 2>/dev/null\""
    )
    check_ok, check_output = run_command(
        [
            "adb",
            "-s",
            target,
            "shell",
            "sh",
            "-c",
            "ls -ld /system/etc/security/cacerts 2>/dev/null; ls -ld /data/misc/user/0/cacerts-added 2>/dev/null",
        ]
    )

    lines = [line.strip() for line in (check_output or "").splitlines() if line.strip()]
    permission_bits = [_extract_permission_bits(line) for line in lines]
    writable_paths = [bits for bits in permission_bits if bits and _is_writeable_for_group_or_other(bits)]

    if not check_ok and not lines:
        verdict = "BLOCKED"
        logs = "无法读取系统证书目录权限信息。"
        assessment = "执行环境异常或证书目录不可访问，暂无法判定证书保护状态。"
    elif not lines:
        verdict = "BLOCKED"
        logs = "证书目录检查未返回有效输出。"
        assessment = "未获取到可判定的证书目录权限信息。"
    elif writable_paths:
        verdict = "FAILED"
        logs = "检测到证书目录存在组或其他用户可写权限。"
        assessment = "证书目录权限过宽，可能导致证书被篡改。"
    else:
        verdict = "PASSED"
        logs = "证书目录权限未发现组/其他用户可写配置。"
        assessment = "系统证书目录访问权限符合最小写权限要求。"

    steps.append(
        step(
            "系统证书目录权限检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=check_command,
            command_result="PASSED" if check_ok else "FAILED",
            output=check_output,
            security_assessment=assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {target} 的系统证书目录权限不符合安全基线。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {target} 的系统证书保护测试未完成，请检查运行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的系统证书保护测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
