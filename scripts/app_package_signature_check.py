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
        return finish("BLOCKED", "缺少应用包路径，无法执行签名检查。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"应用包不存在: {package_path}", steps, 0)

    check_started = time.time()
    try:
        with zipfile.ZipFile(package_path, "r") as archive:
            members = archive.namelist()
        members_upper = [name.upper() for name in members]
        android_signature = [
            name for name in members
            if name.upper().startswith("META-INF/") and name.upper().endswith((".RSA", ".DSA", ".EC", ".SF"))
        ]
        ios_signature = [name for name in members if name.startswith("_CodeSignature/") or name.endswith("embedded.mobileprovision")]
        if android_signature or ios_signature:
            verdict = "PASSED"
            logs = "应用包包含签名相关文件。"
            assessment = "签名元数据存在，可继续做更深入的签名链校验。"
        elif "ANDROIDMANIFEST.XML" in members_upper or any(name.endswith(".app/Info.plist") for name in members):
            verdict = "FAILED"
            logs = "应用包结构存在，但未发现签名相关文件。"
            assessment = "应用可能未签名或签名产物被移除。"
        else:
            verdict = "FAILED"
            logs = "未识别到有效的 APK/IPA 包结构。"
            assessment = "输入文件不是有效的移动应用安装包。"
        output = "\n".join((android_signature or ios_signature)[:20]) or "missing signature artifacts"
        command_result = "PASSED"
    except zipfile.BadZipFile as exc:
        verdict = "FAILED"
        logs = "应用包不是有效的压缩格式。"
        assessment = "输入文件损坏或格式不正确。"
        output = str(exc)
        command_result = "FAILED"

    steps.append(
        step(
            "应用包签名元数据检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f"inspect app package signature {package_path}",
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or '应用包签名检查'}通过。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '应用包签名检查'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
