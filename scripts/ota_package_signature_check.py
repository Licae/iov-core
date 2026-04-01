#!/usr/bin/env python3
import time
import zipfile
from pathlib import Path

from security_case_lib import finish, load_payload, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("ota_package_path") or "").strip())
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少 OTA 升级包路径，无法执行签名校验。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"OTA 升级包不存在: {package_path}", steps, 0)

    check_started = time.time()
    try:
        with zipfile.ZipFile(package_path, "r") as archive:
            members = archive.namelist()
        members_upper = [name.upper() for name in members]
        has_manifest = "META-INF/MANIFEST.MF" in members_upper
        signature_members = [
            name for name in members
            if name.upper().startswith("META-INF/") and name.upper().endswith((".RSA", ".DSA", ".EC", ".SF"))
        ]
        if has_manifest and signature_members:
            verdict = "PASSED"
            logs = f"检测到 {len(signature_members)} 个签名相关条目。"
            assessment = "升级包包含签名元数据，可进入后续验签流程。"
        else:
            verdict = "FAILED"
            logs = "未检测到完整的 OTA 签名元数据。"
            assessment = "升级包缺少签名文件或清单文件，存在供应链风险。"
        output = "\n".join(signature_members[:20]) or "missing signature entries"
        command_result = "PASSED"
    except zipfile.BadZipFile as exc:
        verdict = "FAILED"
        logs = "OTA 升级包不是有效的 ZIP 格式。"
        assessment = "升级包已损坏或格式异常。"
        output = str(exc)
        command_result = "FAILED"

    steps.append(
        step(
            "OTA 升级包签名元数据检查",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f"inspect ota package {package_path}",
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or 'OTA 签名校验'}通过。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or 'OTA 签名校验'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
