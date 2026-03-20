#!/usr/bin/env python3
import time

from security_case_lib import finish, load_payload, probe_tcp_port, resolve_target, step


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("telnet_port") or "23"))
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 Telnet 服务禁用检查。", steps, 0)

    probe_started = time.time()
    probe_ok, probe_output = probe_tcp_port(host, port)
    steps.append(
        step(
            "Telnet 服务探测",
            "FAILED" if probe_ok else "PASSED",
            "Telnet 服务对外可达。" if probe_ok else "Telnet 服务未对外开放或不可达。",
            max(1, int(time.time() - probe_started)),
            command=f"tcp_connect {host}:{port}",
            command_result="PASSED" if probe_ok else "FAILED",
            output=probe_output,
            security_assessment="Telnet 服务已暴露，不符合禁用基线。" if probe_ok else "Telnet 服务未暴露，符合禁用基线。",
        )
    )

    if probe_ok:
        return finish("FAILED", f"目标 {host}:{port} 暴露了 Telnet 服务。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 未暴露 Telnet 服务。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
