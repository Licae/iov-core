#!/usr/bin/env python3
import ftplib
import time

from security_case_lib import finish, load_payload, probe_tcp_port, resolve_target, step


def try_anonymous_login(host: str, port: int) -> tuple[bool, str]:
    ftp = ftplib.FTP()
    try:
        ftp.connect(host, port, timeout=6)
        ftp.login("anonymous", "anonymous@iov.local")
        try:
            listing = ftp.nlst()
            preview = ", ".join(listing[:3]) if listing else "(empty)"
        except ftplib.all_errors:
            preview = "anonymous login succeeded"
        ftp.quit()
        return True, preview
    except ftplib.all_errors as exc:
        return False, str(exc)
    finally:
        try:
            ftp.close()
        except OSError:
            pass


def main() -> int:
    _, item, runtime_inputs = load_payload()
    host = resolve_target(runtime_inputs, item)
    port = int(str(runtime_inputs.get("ftp_port") or "21"))
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 FTP 匿名登录禁用检查。", steps, 0)

    probe_started = time.time()
    probe_ok, probe_output = probe_tcp_port(host, port)
    steps.append(
        step(
            "FTP 服务探测",
            "FAILED" if probe_ok else "PASSED",
            "FTP 服务对外可达。" if probe_ok else "FTP 服务未对外开放或不可达。",
            max(1, int(time.time() - probe_started)),
            command=f"tcp_connect {host}:{port}",
            command_result="PASSED" if probe_ok else "FAILED",
            output=probe_output,
            security_assessment="FTP 暴露，可继续验证匿名登录策略。" if probe_ok else "FTP 未暴露，不存在匿名登录风险。",
        )
    )

    if not probe_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 FTP 服务，匿名登录风险可控。", steps, max(1, int(time.time() - started_at)))

    login_started = time.time()
    login_ok, login_output = try_anonymous_login(host, port)
    normalized_output = (login_output or "").lower()
    if login_ok:
        verdict = "FAILED"
        logs = "FTP 匿名登录成功。"
        assessment = "设备允许匿名访问，存在高风险。"
        command_result = "PASSED"
    elif any(token in normalized_output for token in ["530", "login incorrect", "not logged in", "authentication failed"]):
        verdict = "PASSED"
        logs = "FTP 匿名登录被拒绝。"
        assessment = "匿名访问策略生效，符合预期。"
        command_result = "FAILED"
    elif any(token in normalized_output for token in ["timed out", "refused", "no route to host"]):
        verdict = "BLOCKED"
        logs = "FTP 匿名登录检查未完成，网络路径异常。"
        assessment = "环境连通性不足，暂无法判定匿名访问策略。"
        command_result = "BLOCKED"
    else:
        verdict = "BLOCKED"
        logs = "FTP 匿名登录检查返回未知响应。"
        assessment = "返回信息不足，建议人工复核。"
        command_result = "BLOCKED"

    steps.append(
        step(
            "FTP 匿名登录禁用检查",
            verdict,
            logs,
            max(1, int(time.time() - login_started)),
            command=f"ftp anonymous@{host}:{port}",
            command_result=command_result,
            output=login_output,
            security_assessment=assessment,
        )
    )

    if verdict == "FAILED":
        return finish("FAILED", f"目标 {host}:{port} 允许匿名 FTP 登录。", steps, max(1, int(time.time() - started_at)))
    if verdict == "BLOCKED":
        return finish("BLOCKED", f"目标 {host}:{port} 的匿名登录策略暂不可判定。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 已禁用匿名 FTP 登录。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
