#!/usr/bin/env python3
import time
import zipfile
from pathlib import Path

from security_case_lib import finish, load_payload, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("app_package_path") or "").strip())
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少应用包路径，无法执行完整性检查。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"应用包不存在: {package_path}", steps, 0)

    check_started = time.time()
    try:
        with zipfile.ZipFile(package_path, "r") as archive:
            members = archive.namelist()
            corrupted = archive.testzip()
        is_apk = any(name.upper() == "ANDROIDMANIFEST.XML" for name in members)
        is_ipa = any(name.endswith(".app/Info.plist") for name in members)
        if corrupted:
            verdict = "FAILED"
            logs = f"应用包存在损坏条目: {corrupted}"
            assessment = "压缩内容已损坏，完整性不通过。"
        elif is_apk or is_ipa:
            verdict = "PASSED"
            logs = "应用包结构完整且未检测到损坏条目。"
            assessment = "应用包格式与结构满足完整性检查要求。"
        else:
            verdict = "FAILED"
            logs = "未检测到 APK/IPA 关键结构。"
            assessment = "输入文件不是有效的移动应用安装包。"
        output = f"entries={len(members)}"
        command_result = "PASSED"
    except zipfile.BadZipFile as exc:
        verdict = "FAILED"
        logs = "应用包不是有效的压缩格式。"
        assessment = "输入文件损坏或格式不正确。"
        output = str(exc)
        command_result = "FAILED"

    steps.append(
        step(
            "应用包完整性检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f"inspect app package integrity {package_path}",
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or '应用完整性校验'}通过。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '应用完整性校验'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
