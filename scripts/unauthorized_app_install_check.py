#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def normalize_setting(value: str) -> str:
    return value.strip().lower()


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行未授权应用安装测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始安装策略检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备应用安装策略检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    unknown_source_started = time.time()
    unknown_source_command = f"adb -s {target} shell settings get secure install_non_market_apps"
    unknown_source_ok, unknown_source_output = run_command(
        ["adb", "-s", target, "shell", "settings", "get", "secure", "install_non_market_apps"]
    )
    unknown_source_value = normalize_setting(unknown_source_output or "")
    if not unknown_source_ok:
        source_verdict = "BLOCKED"
        source_logs = "无法读取 install_non_market_apps 配置。"
        source_assessment = "缺少未知来源安装配置，无法确认安装管控策略。"
    elif unknown_source_value in {"1", "true"}:
        source_verdict = "FAILED"
        source_logs = "install_non_market_apps=1，允许未知来源安装。"
        source_assessment = "未授权应用安装策略存在风险。"
    elif unknown_source_value in {"0", "false"}:
        source_verdict = "PASSED"
        source_logs = "install_non_market_apps=0，未知来源安装被禁止。"
        source_assessment = "未知来源安装策略符合预期。"
    else:
        source_verdict = "BLOCKED"
        source_logs = f"install_non_market_apps 返回异常值: {unknown_source_output or '(empty)'}"
        source_assessment = "配置值不可判定，建议人工复核。"

    steps.append(
        step(
            "未知来源安装策略检查",
            source_verdict,
            source_logs,
            max(1, int(time.time() - unknown_source_started)),
            command=unknown_source_command,
            command_result="PASSED" if unknown_source_ok else "FAILED",
            output=unknown_source_output,
            security_assessment=source_assessment,
        )
    )

    verifier_started = time.time()
    verifier_command = f"adb -s {target} shell settings get global package_verifier_enable"
    verifier_ok, verifier_output = run_command(["adb", "-s", target, "shell", "settings", "get", "global", "package_verifier_enable"])
    verifier_value = normalize_setting(verifier_output or "")
    if not verifier_ok:
        verifier_verdict = "BLOCKED"
        verifier_logs = "无法读取 package_verifier_enable 配置。"
        verifier_assessment = "缺少安装包校验配置，无法确认安装前校验策略。"
    elif verifier_value in {"0", "false"}:
        verifier_verdict = "FAILED"
        verifier_logs = "package_verifier_enable=0，安装包校验被禁用。"
        verifier_assessment = "应用安装前校验关闭，存在未授权安装风险。"
    elif verifier_value in {"1", "true"}:
        verifier_verdict = "PASSED"
        verifier_logs = "package_verifier_enable=1，安装包校验已启用。"
        verifier_assessment = "应用安装前校验策略符合预期。"
    else:
        verifier_verdict = "BLOCKED"
        verifier_logs = f"package_verifier_enable 返回异常值: {verifier_output or '(empty)'}"
        verifier_assessment = "配置值不可判定，建议人工复核。"

    steps.append(
        step(
            "安装包校验策略检查",
            verifier_verdict,
            verifier_logs,
            max(1, int(time.time() - verifier_started)),
            command=verifier_command,
            command_result="PASSED" if verifier_ok else "FAILED",
            output=verifier_output,
            security_assessment=verifier_assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if "FAILED" in {source_verdict, verifier_verdict}:
        return finish("FAILED", f"目标 {target} 的未授权应用安装策略不符合预期。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {source_verdict, verifier_verdict} and "PASSED" not in {source_verdict, verifier_verdict}:
        return finish("BLOCKED", f"目标 {target} 的未授权应用安装测试未完成。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {source_verdict, verifier_verdict}:
        return finish("BLOCKED", f"目标 {target} 的未授权应用安装测试结果不完整。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的未授权应用安装测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
