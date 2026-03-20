#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, resolve_target, run_command, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("adb_port") or "5555"))
    target = f"{host}:{port}"
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行系统版本测试。", steps, 0)

    connect_started = time.time()
    connect_command = f"adb connect {target}"
    connect_ok, connect_output = run_command(["adb", "connect", target])
    steps.append(
        step(
            "ADB 会话建立",
            "PASSED" if connect_ok else "BLOCKED",
            "ADB 会话建立成功，开始系统版本检查。" if connect_ok else "ADB 会话建立失败，无法继续检查。",
            max(1, int(time.time() - connect_started)),
            command=connect_command,
            command_result="PASSED" if connect_ok else "FAILED",
            output=connect_output,
            security_assessment="具备系统版本检查前置条件。" if connect_ok else "前置连接失败。",
        )
    )
    if not connect_ok:
        return finish("BLOCKED", f"目标 {target} 无法建立 ADB 会话。", steps, max(1, int(time.time() - started_at)))

    build_type_started = time.time()
    build_type_command = f"adb -s {target} shell getprop ro.build.type"
    build_type_ok, build_type_output = run_command(["adb", "-s", target, "shell", "getprop", "ro.build.type"])
    build_type = (build_type_output or "").strip().lower()
    if not build_type_ok or not build_type:
        type_verdict = "BLOCKED"
        type_logs = "无法读取 ro.build.type。"
        type_assessment = "缺少构建类型信息，无法判定版本安全属性。"
    elif build_type == "user":
        type_verdict = "PASSED"
        type_logs = "构建类型为 user。"
        type_assessment = "量产构建类型符合预期。"
    else:
        type_verdict = "FAILED"
        type_logs = f"构建类型为 {build_type}。"
        type_assessment = "非 user 构建可能包含调试能力，不符合量产安全基线。"

    steps.append(
        step(
            "系统构建类型检查",
            type_verdict,
            type_logs,
            max(1, int(time.time() - build_type_started)),
            command=build_type_command,
            command_result="PASSED" if build_type_ok else "FAILED",
            output=build_type_output,
            security_assessment=type_assessment,
        )
    )

    build_tags_started = time.time()
    build_tags_command = f"adb -s {target} shell getprop ro.build.tags"
    build_tags_ok, build_tags_output = run_command(["adb", "-s", target, "shell", "getprop", "ro.build.tags"])
    build_tags = (build_tags_output or "").strip().lower()
    if not build_tags_ok or not build_tags:
        tags_verdict = "BLOCKED"
        tags_logs = "无法读取 ro.build.tags。"
        tags_assessment = "缺少签名标签信息，建议人工复核。"
    elif "test-keys" in build_tags:
        tags_verdict = "FAILED"
        tags_logs = f"构建标签包含 test-keys: {build_tags}"
        tags_assessment = "测试签名镜像不应出现在量产环境。"
    else:
        tags_verdict = "PASSED"
        tags_logs = f"构建标签: {build_tags}"
        tags_assessment = "构建签名标签符合量产预期。"

    steps.append(
        step(
            "系统签名标签检查",
            tags_verdict,
            tags_logs,
            max(1, int(time.time() - build_tags_started)),
            command=build_tags_command,
            command_result="PASSED" if build_tags_ok else "FAILED",
            output=build_tags_output,
            security_assessment=tags_assessment,
        )
    )

    run_command(["adb", "disconnect", target])

    if "FAILED" in {type_verdict, tags_verdict}:
        return finish("FAILED", f"目标 {target} 的系统版本安全属性不符合预期。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {type_verdict, tags_verdict} and "PASSED" not in {type_verdict, tags_verdict}:
        return finish("BLOCKED", f"目标 {target} 的系统版本测试未完成。", steps, max(1, int(time.time() - started_at)))
    if "BLOCKED" in {type_verdict, tags_verdict}:
        return finish("BLOCKED", f"目标 {target} 的系统版本测试部分结果缺失，请复核。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {target} 的系统版本测试通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
