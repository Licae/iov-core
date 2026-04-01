#!/usr/bin/env python3
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from security_case_lib import finish, load_payload, run_command, step


def parse_expiry(raw: str) -> datetime | None:
    match = re.search(r"until:\s*([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\d{4})", raw)
    if not match:
        return None
    tokens = match.group(1).split()
    if len(tokens) != 6:
        return None
    normalized = " ".join(tokens[:4] + [tokens[5]])
    try:
        return datetime.strptime(normalized, "%a %b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def main() -> int:
    _, item, runtime_inputs = load_payload()
    package_path = Path(str(runtime_inputs.get("app_package_path") or "").strip())
    started_at = time.time()
    steps: list[dict] = []

    if not package_path:
        return finish("BLOCKED", "缺少应用包路径，无法执行证书有效期检查。", steps, 0)
    if not package_path.exists():
        return finish("BLOCKED", f"应用包不存在: {package_path}", steps, 0)
    if shutil.which("keytool") is None:
        return finish("BLOCKED", "当前环境缺少 keytool，无法读取签名证书信息。", steps, 0)

    check_started = time.time()
    command = f"keytool -printcert -jarfile {package_path}"
    ok, output = run_command(["keytool", "-printcert", "-jarfile", str(package_path)])
    if not ok:
        verdict = "BLOCKED"
        logs = "keytool 未能读取应用包证书。"
        assessment = "当前环境缺少签名证书解析能力或应用包未签名。"
        command_result = "FAILED"
    else:
        expiry = parse_expiry(output or "")
        if expiry is None:
            verdict = "BLOCKED"
            logs = "未能解析证书有效期。"
            assessment = "证书输出格式异常，建议人工复核。"
            command_result = "PASSED"
        else:
            days_left = int((expiry - datetime.now(timezone.utc)).total_seconds() // 86400)
            if days_left < 0:
                verdict = "FAILED"
                logs = f"签名证书已过期（{days_left} 天）。"
                assessment = "签名证书过期会导致安装与信任链风险。"
            elif days_left <= 30:
                verdict = "FAILED"
                logs = f"签名证书将在 {days_left} 天内过期。"
                assessment = "签名证书即将过期，存在交付风险。"
            else:
                verdict = "PASSED"
                logs = f"签名证书有效期剩余 {days_left} 天。"
                assessment = "签名证书处于有效期内。"
            command_result = "PASSED"

    steps.append(
        step(
            "应用签名证书有效期检查",
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
        return finish("PASSED", f"{item.get('title') or '证书有效性检查'}通过。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"{item.get('title') or '证书有效性检查'}暂无法完成。", steps, max(1, int(time.time() - started_at)))
    return finish("FAILED", f"{item.get('title') or '证书有效性检查'}未通过。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
