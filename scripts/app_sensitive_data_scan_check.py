#!/usr/bin/env python3
import re
import time
import zipfile
from pathlib import Path

from security_case_lib import finish, load_payload, step

TEXT_EXTENSIONS = (".json", ".xml", ".txt", ".plist", ".properties", ".conf", ".cfg", ".ini", ".yml", ".yaml")
SENSITIVE_PATTERNS = [
    re.compile(pattern, flags=re.IGNORECASE)
    for pattern in [
        r"api[_-]?key",
        r"client[_-]?secret",
        r"access[_-]?token",
        r"refresh[_-]?token",
        r"private[_-]?key",
        r"password",
        r"bearer\s+[a-z0-9._-]+",
        r"aws[_-]?secret",
    ]
]
SENSITIVE_FILE_HINTS = (".pem", ".p12", ".jks", ".keystore", ".key")


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("app_package_path") or "").strip())
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少应用包路径，无法执行敏感信息扫描。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"应用包不存在: {package_path}", steps, 0)

    check_started = time.time()
    findings: list[str] = []
    try:
        with zipfile.ZipFile(package_path, "r") as archive:
            for member in archive.infolist()[:400]:
                member_name = member.filename
                lowered_name = member_name.lower()
                if lowered_name.endswith(SENSITIVE_FILE_HINTS):
                    findings.append(f"sensitive-file:{member_name}")
                    continue
                if member.file_size > 1024 * 1024 or not lowered_name.endswith(TEXT_EXTENSIONS):
                    continue
                with archive.open(member, "r") as handle:
                    try:
                        content = handle.read().decode("utf-8", errors="ignore")
                    except Exception:
                        content = ""
                for pattern in SENSITIVE_PATTERNS:
                    if pattern.search(content):
                        findings.append(f"{member_name}:{pattern.pattern}")
                        break

        if findings:
            verdict = "FAILED"
            logs = f"检测到 {len(findings)} 个疑似敏感信息暴露点。"
            assessment = "应用包内存在疑似明文敏感信息或敏感证书产物。"
        else:
            verdict = "PASSED"
            logs = "未在应用包内检测到明显的明文敏感信息。"
            assessment = "静态扫描未发现明显的敏感信息暴露迹象。"
        output = "\n".join(findings[:20]) or "no obvious sensitive findings"
        command_result = "PASSED"
    except zipfile.BadZipFile as exc:
        verdict = "FAILED"
        logs = "应用包不是有效的压缩格式。"
        assessment = "输入文件损坏或格式不正确。"
        output = str(exc)
        command_result = "FAILED"

    steps.append(
        step(
            "应用包敏感信息静态扫描",
            verdict,
            logs,
            max(1, int(time.time() - check_started)),
            command=f"scan package content {package_path}",
            command_result=command_result,
            output=output,
            security_assessment=assessment,
        )
    )

    if verdict == "PASSED":
        return finish("PASSED", f"{item.get('title') or '敏感信息扫描'}通过。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '敏感信息扫描'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
