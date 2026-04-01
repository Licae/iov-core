export const SECURITY_BASELINE_SUITE_NAME = '系统安全基线套件';

export const CASE_CATEGORY_OPTIONS = ['IVI', 'T-Box', 'Gateway', 'ADAS', 'BMS', 'OTA', '整车', '云控平台', '移动端', 'CAN总线'];

export const SECURITY_DOMAIN_OPTIONS = ['访问控制', '身份认证', '口令策略', '日志安全', '配置加固', '数据保护', '网络暴露', 'OTA安全', '供应链安全', '未分类'];

export const REQUIRED_INPUT_OPTIONS = [
  { value: 'connection_address', label: '连接地址', description: '从测试资产自动带入 IP/主机名。' },
  { value: 'probe_command', label: '探测命令', description: '任务发起时填写实际执行的探测命令，命令返回 0 视为通过。' },
  { value: 'ota_package_path', label: 'OTA 包路径', description: '任务发起时填写待验证的 OTA 升级包路径。' },
  { value: 'ota_expected_sha256', label: 'OTA 包 SHA256', description: '任务发起时填写 OTA 升级包的期望 SHA256。' },
  { value: 'app_package_path', label: '应用包路径', description: '任务发起时填写待检测的 APK/IPA 包路径。' },
  { value: 'ssh_probe_username', label: 'SSH 测试账号', description: '任务发起时填写用于尝试登录的测试用户名。' },
  { value: 'ssh_probe_password', label: 'SSH 测试密码', description: '任务发起时填写用于尝试登录的测试密码。' },
  { value: 'ssh_port', label: 'SSH 端口', description: '任务发起时填写 SSH 端口，默认 22。' },
  { value: 'adb_port', label: 'ADB 端口', description: '任务发起时填写 ADB 监听端口，默认 5555。' },
  { value: 'adb_push_target_path', label: 'ADB Push 目标路径', description: '任务发起时填写待写入的设备路径，默认 /data/local/tmp/iov_probe.txt。' },
  { value: 'adb_pull_source_path', label: 'ADB Pull 源路径', description: '任务发起时填写待拉取的设备路径，默认 /system/build.prop。' },
  { value: 'telnet_port', label: 'Telnet 端口', description: '任务发起时填写 Telnet 监听端口，默认 23。' },
  { value: 'ftp_port', label: 'FTP 端口', description: '任务发起时填写 FTP 监听端口，默认 21。' },
  { value: 'ftp_probe_username', label: 'FTP 测试账号', description: '任务发起时填写用于尝试登录的 FTP 用户名。' },
  { value: 'ftp_probe_password', label: 'FTP 测试密码', description: '任务发起时填写用于尝试登录的 FTP 密码。' },
  { value: 'tls_port', label: 'TLS 端口', description: '任务发起时填写 TLS 服务端口，默认 443。' },
  { value: 'tls_server_name', label: 'TLS 主机名(SNI)', description: '任务发起时填写 TLS 证书校验主机名，不填则默认连接地址。' },
] as const;

export const DEFAULT_RUNTIME_INPUT_SUGGESTIONS: Record<string, string> = {
  ssh_port: '22',
  adb_port: '5555',
  telnet_port: '23',
  ftp_port: '21',
  tls_port: '443',
};
