#!/usr/bin/env python3
import json
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

TEST_RESULTS = {"PASSED", "FAILED", "BLOCKED", "ERROR"}
COMMAND_RESULTS = {"PASSED", "FAILED", "BLOCKED", "ERROR"}


def normalize_result(value: str, default: str = "ERROR") -> str:
    normalized = str(value or "").strip().upper()
    return normalized if normalized in TEST_RESULTS else default


def normalize_command_result(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"SUCCEEDED", "SUCCESS", "OK"}:
        return "PASSED"
    if normalized in COMMAND_RESULTS:
        return normalized
    return ""


def step(
    name: str,
    result: str,
    logs: str,
    duration: int,
    command: str = "",
    command_result: str = "",
    output: str = "",
    security_assessment: str = "",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "result": normalize_result(result),
        "logs": logs,
        "duration": duration,
    }
    if command:
        payload["command"] = command
    if command_result:
        normalized_command_result = normalize_command_result(command_result)
        if normalized_command_result:
            payload["command_result"] = normalized_command_result
    if output:
        payload["output"] = output
    if security_assessment:
        payload["security_assessment"] = security_assessment
    return payload


def finish(result: str, summary: str, steps: list[dict[str, Any]], duration: int) -> int:
    normalized_result = normalize_result(result)
    print(
        json.dumps(
            {
                "result": normalized_result,
                "duration": duration,
                "summary": summary,
                "logs": summary,
                "steps": steps,
            }
        ),
        flush=True,
    )
    return 0 if normalized_result == "PASSED" else 1


def decode_output(data: bytes | None) -> str:
    if not data:
        return ""
    return data.decode("utf-8", errors="replace").strip()


def run_command(command: list[str], env: dict[str, str] | None = None) -> tuple[bool, str]:
    completed = subprocess.run(command, capture_output=True, env=env)
    output = decode_output(completed.stdout) or decode_output(completed.stderr)
    return completed.returncode == 0, output or f"{' '.join(command)} exited with code {completed.returncode}"


def load_payload() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if len(sys.argv) != 2:
        print(json.dumps({"result": "BLOCKED", "duration": 0, "logs": "Missing payload file"}))
        raise SystemExit(1)

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text("utf-8"))
    item = payload.get("item", {}) or {}
    runtime_inputs = payload.get("runtimeInputs", {}) or {}
    return payload, item, runtime_inputs


def resolve_target(runtime_inputs: dict[str, Any], item: dict[str, Any]) -> str:
    return str(runtime_inputs.get("connection_address") or item.get("connection_address") or "").strip()


def resolve_artifact_dir(payload: dict[str, Any], key: str, fallback_subdir: str) -> Path:
    artifact_dirs = payload.get("artifact_dirs") or {}
    configured = artifact_dirs.get(key)
    if configured:
        target = Path(str(configured))
    else:
        project_root = Path(__file__).resolve().parent.parent
        target = project_root / "runtime-artifacts" / fallback_subdir
    target.mkdir(parents=True, exist_ok=True)
    return target


def probe_tcp_port(host: str, port: int, timeout: float = 3.0) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"Connected to {host}:{port}"
    except OSError as exc:
        return False, str(exc)
