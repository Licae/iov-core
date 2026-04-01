#!/usr/bin/env python3
import re
import shutil
import time
from pathlib import Path

from security_case_lib import finish, load_payload, run_command, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("app_package_path") or "").strip())
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少应用包路径，无法执行备份策略检查。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"应用包不存在: {package_path}", steps, 0)
    if package_path.suffix.lower() != ".apk":
        return finish("BLOCKED", "任意备份风险检查当前仅支持 APK。", steps, 0)

    check_started = time.time()
    command = ""
    output = ""
    ok = False
    if shutil.which("apkanalyzer"):
        command = f"apkanalyzer manifest print {package_path}"
        ok, output = run_command(["apkanalyzer", "manifest", "print", str(package_path)])
    elif shutil.which("aapt"):
        command = f"aapt dump xmltree {package_path} AndroidManifest.xml"
        ok, output = run_command(["aapt", "dump", "xmltree", str(package_path), "AndroidManifest.xml"])
    else:
        return finish("BLOCKED", "当前环境缺少 apkanalyzer/aapt，无法读取 AndroidManifest。", steps, 0)

    if not ok:
        verdict = "BLOCKED"
        logs = "未能读取应用 Manifest。"
        assessment = "环境工具可用但解析失败，建议人工复核。"
        command_result = "FAILED"
    else:
        normalized = output.lower()
        if re.search(r"allowbackup(?:=|\\s*=\\s*|\")true", normalized):
            verdict = "FAILED"
            logs = "Manifest 显示 allowBackup=true。"
            assessment = "应用允许备份，存在数据被非授权导出的风险。"
        elif re.search(r"allowbackup(?:=|\\s*=\\s*|\")false", normalized):
            verdict = "PASSED"
            logs = "Manifest 显示 allowBackup=false。"
            assessment = "应用已禁用备份，符合安全预期。"
        else:
            verdict = "BLOCKED"
            logs = "未能明确解析 allowBackup 配置。"
            assessment = "Manifest 输出格式差异较大，建议人工复核。"
        command_result = "PASSED"

    steps.append(
        step(
            "应用备份策略检查",
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
        return finish("PASSED", f"{item.get('title') or '备份策略检查'}通过。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"{item.get('title') or '备份策略检查'}暂无法完成。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '备份策略检查'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
