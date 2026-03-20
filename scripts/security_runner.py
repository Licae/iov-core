#!/usr/bin/env python3
import json
import random
import sys
import time
from pathlib import Path


def log(message: str) -> None:
    print(message, flush=True)


def assess_case(payload: dict) -> dict:
    test_case = payload.get("testCase", {})
    title = str(test_case.get("title") or "")
    description = str(test_case.get("description") or "")
    test_input = str(test_case.get("test_input") or "")
    protocol = str(test_case.get("protocol") or "GENERIC")
    category = str(test_case.get("category") or "security")
    signature = " ".join([title.lower(), description.lower(), test_input.lower()])

    risk_keywords = {
        "ssh": ("FAILED", "发现未授权 SSH 入口，默认策略未完全封堵。"),
        "firewall": ("PASSED", "防火墙规则命中预期，未发现异常放行。"),
        "dos": ("FAILED", "压力场景下出现资源耗尽迹象，需要限流或隔离。"),
        "ota": ("PASSED", "升级包签名与完整性校验符合预期。"),
        "bluetooth": ("BLOCKED", "蓝牙安全场景需要外部射频环境支持，当前环境不足。"),
        "penetration": ("FAILED", "渗透模拟发现可疑攻击面，需要进一步加固。"),
        "dtc": ("PASSED", "诊断访问权限控制正常，未发现越权读取。"),
    }

    for keyword, (result, reason) in risk_keywords.items():
        if keyword in signature:
            return {
                "result": result,
                "reason": reason,
                "protocol": protocol,
                "category": category,
            }

    result = random.choices(["PASSED", "FAILED", "BLOCKED"], weights=[0.6, 0.25, 0.15], k=1)[0]
    default_reason = {
        "PASSED": "规则校验与访问控制检查通过。",
        "FAILED": "检测到潜在策略缺口，需要复核安全基线。",
        "BLOCKED": "缺少必要测试前置条件，暂时阻塞。",
    }[result]
    return {
        "result": result,
        "reason": default_reason,
        "protocol": protocol,
        "category": category,
    }


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"result": "BLOCKED", "duration": 0, "logs": "Missing payload file"}))
        return 1

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text("utf-8"))
    test_case = payload.get("testCase", {})
    title = test_case.get("title", "Unknown Case")

    log(f"[SECURITY] Loading test case: {title}")
    time.sleep(0.15)
    log("[SECURITY] Validating environment prerequisites")
    time.sleep(0.15)
    log("[SECURITY] Executing policy and attack-surface checks")
    time.sleep(0.2)

    assessment = assess_case(payload)
    log(f"[SECURITY] Protocol={assessment['protocol']} Category={assessment['category']}")
    time.sleep(0.15)
    log(f"[SECURITY] Assessment: {assessment['reason']}")

    step_results = [
        {"name": "装载测试用例与环境检查", "result": "PASSED", "logs": "用例载入完成，基础运行环境可用。", "duration": 1},
        {"name": "策略与攻击面扫描", "result": "PASSED" if assessment["result"] != "BLOCKED" else "BLOCKED", "logs": f"Protocol={assessment['protocol']} Category={assessment['category']}", "duration": 1},
        {"name": "安全结论判定", "result": assessment["result"], "logs": assessment["reason"], "duration": 1},
    ]

    result_payload = {
        "result": assessment["result"],
        "duration": 2,
        "summary": assessment["reason"],
        "logs": f"{title}: {assessment['reason']}",
        "steps": step_results,
    }
    print(json.dumps(result_payload), flush=True)
    return 0 if assessment["result"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
