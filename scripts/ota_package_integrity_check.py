#!/usr/bin/env python3
import hashlib
import time
import zipfile
from pathlib import Path

from security_case_lib import finish, load_payload, step


def sha256sum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("ota_package_path") or "").strip())
    expected_sha256 = str(runtime_inputs.get("ota_expected_sha256") or "").strip().lower()
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少 OTA 升级包路径，无法执行完整性校验。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"OTA 升级包不存在: {package_path}", steps, 0)
    if not expected_sha256:
        return finish("BLOCKED", "缺少期望 SHA256，无法执行完整性比对。", steps, 0)

    check_started = time.time()
    try:
        actual_sha256 = sha256sum(package_path)
        with zipfile.ZipFile(package_path, "r") as archive:
            corrupted_entry = archive.testzip()
        if corrupted_entry:
            verdict = "FAILED"
            logs = f"升级包完整性检查失败，损坏文件: {corrupted_entry}"
            assessment = "压缩包内容已损坏，不符合交付要求。"
        elif actual_sha256 != expected_sha256:
            verdict = "FAILED"
            logs = "升级包 SHA256 与期望值不一致。"
            assessment = "升级包可能被篡改或版本不匹配。"
        else:
            verdict = "PASSED"
            logs = "升级包完整性检查通过。"
            assessment = "升级包内容完整，哈希与基线一致。"
        output = f"actual_sha256={actual_sha256}\nexpected_sha256={expected_sha256}"
        command_result = "PASSED"
    except zipfile.BadZipFile as exc:
        verdict = "FAILED"
        logs = "OTA 升级包不是有效的 ZIP 格式。"
        assessment = "升级包格式异常，无法作为合法升级包使用。"
        output = str(exc)
        command_result = "FAILED"

    steps.append(
        step(
            "OTA 升级包完整性校验",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f"sha256 + zip integrity check {package_path}",
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or 'OTA 完整性校验'}通过。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or 'OTA 完整性校验'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
