#!/usr/bin/env python3
import ftplib
import time

from security_case_lib import finish, load_payload, probe_tcp_port, resolve_target, step


def try_ftp_login(host: str, port: int, username: str, password: str) -> tuple[bool, str]:
    ftp = ftplib.FTP()
    try:
        ftp.connect(host, port, timeout=5)
        ftp.login(username, password)
        try:
            listing = ftp.nlst()
            preview = ", ".join(listing[:3]) if listing else "(empty)"
        except ftplib.all_errors:
            preview = "login succeeded"
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
    probe_user = str(runtime_inputs.get("ftp_probe_username") or "").strip()
    probe_password = str(runtime_inputs.get("ftp_probe_password") or "").strip()
    started_at = time.time()
    steps: list[dict] = []

    if not host:
        return finish("BLOCKED", "资产未配置连接地址，无法执行 FTP 访问测试。", steps, 0)

    probe_started = time.time()
    probe_ok, probe_output = probe_tcp_port(host, port)
    steps.append(
        step(
            "FTP 服务探测",
            "FAILED" if probe_ok else "PASSED",
            "FTP 服务对外可达。" if probe_ok else "FTP 服务未对外开放或不可达。",
            max(1, int(time.time() - probe_started)),
            command=f"nc -zvw3 {host} {port}",
            command_result="PASSED" if probe_ok else "FAILED",
            output=probe_output,
            security_assessment="FTP 服务已暴露，可继续尝试登录。" if probe_ok else "FTP 服务未暴露，访问控制符合预期。",
        )
    )
    if not probe_ok:
        return finish("PASSED", f"目标 {host}:{port} 未暴露 FTP 服务，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))

    anonymous_started = time.time()
    anonymous_ok, anonymous_output = try_ftp_login(host, port, "anonymous", "anonymous@iov.local")
    steps.append(
        step(
            "FTP 匿名登录验证",
            "FAILED" if anonymous_ok else "PASSED",
            "FTP 匿名登录成功。" if anonymous_ok else "FTP 匿名登录被拒绝。",
            max(1, int(time.time() - anonymous_started)),
            command=f"ftp anonymous@{host}:{port}",
            command_result="PASSED" if anonymous_ok else "FAILED",
            output=anonymous_output,
            security_assessment="设备允许匿名 FTP 访问，访问控制失败。" if anonymous_ok else "设备拒绝匿名 FTP 访问。",
        )
    )
    if anonymous_ok:
        return finish("FAILED", f"目标 {host}:{port} 允许匿名 FTP 登录，访问控制失败。", steps, max(1, int(time.time() - started_at)))

    if not probe_user or not probe_password:
        steps.append(
            step(
                "FTP 探测凭据检查",
                "BLOCKED",
                "任务未提供 FTP 测试账号或密码。",
                1,
                security_assessment="匿名登录已被拒绝，但未进一步验证弱口令/探测账号路径。",
            )
        )
        return finish("BLOCKED", f"目标 {host}:{port} 已拒绝匿名 FTP 登录，但当前任务缺少 FTP 测试账号或密码。", steps, max(1, int(time.time() - started_at)))

    probe_login_started = time.time()
    probe_login_ok, probe_login_output = try_ftp_login(host, port, probe_user, probe_password)
    steps.append(
        step(
            "FTP 测试账号登录验证",
            "FAILED" if probe_login_ok else "PASSED",
            "FTP 测试账号登录成功。" if probe_login_ok else "FTP 测试账号登录被拒绝。",
            max(1, int(time.time() - probe_login_started)),
            command=f"ftp {probe_user}@{host}:{port}",
            command_result="PASSED" if probe_login_ok else "FAILED",
            output=probe_login_output,
            security_assessment="测试账号可登录 FTP，访问控制失败。" if probe_login_ok else "测试账号未能登录 FTP，访问控制符合预期。",
        )
    )

    if probe_login_ok:
        return finish("FAILED", f"目标 {host}:{port} 允许测试账号 {probe_user} 登录 FTP，访问控制失败。", steps, max(1, int(time.time() - started_at)))
    return finish("PASSED", f"目标 {host}:{port} 已拒绝匿名与测试账号 FTP 登录，访问控制符合预期。", steps, max(1, int(time.time() - started_at)))


if __name__ == "__main__":
    raise SystemExit(main())
