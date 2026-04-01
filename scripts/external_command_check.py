#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, run_command, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    command = str(runtime_inputs.get("probe_command") or "").strip()
    started_at = time.time()
    steps: list[dict] = []

    if not command:
      return finish("BLOCKED", f"{item.get('title') or '自动化检查'}缺少探测命令。", steps, 0)

    check_started = time.time()
    ok, output = run_command(["sh", "-lc", command])
    output_lower = (output or "").lower()
    if "not found" in output_lower or "command not found" in output_lower:
        verdict = "BLOCKED"
        logs = "探测命令引用的工具不存在。"
        assessment = "执行环境缺少所需命令，暂无法自动判定。"
        command_result = "BLOCKED"
    elif ok:
        verdict = "PASSED"
        logs = "探测命令执行成功，结果符合预期。"
        assessment = "自动化探测命令返回成功状态。"
        command_result = "PASSED"
    else:
        verdict = "FAILED"
        logs = "探测命令返回非零退出码。"
        assessment = "探测命令已发现异常或校验未通过。"
        command_result = "FAILED"

    steps.append(
        step(
            "外部探测命令执行",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=command,
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or '自动化检查'}执行通过。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"{item.get('title') or '自动化检查'}缺少可执行环境。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '自动化检查'}执行失败。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
