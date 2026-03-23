import { validateBaselineSuiteCases } from "./traceability-governance";

type SeedOptions = {
  enabled: boolean;
};

export const SECURITY_BASELINE_CASE_TITLES_DEFAULT = [
  "ADB访问控制验证",
  "SSH访问控制验证",
  "Telnet访问测试",
  "FTP访问测试",
  "ADB Push测试",
  "ADB pull测试",
  "系统日志测试",
  "Dmesg日志测试",
  "OTA升级日志",
  "SELinux策略测试",
  "ASLR测试",
  "iptables防火墙检测",
  "最小权限测试",
  "系统证书保护测试",
  "开放端口扫描",
  "SSH root 登录禁用检查",
  "SSH 空口令/弱口令策略检查",
  "Telnet 服务禁用检查",
  "FTP 匿名登录禁用检查",
  "关键目录权限检查",
  "可疑 SUID/SGID 文件扫描",
  "TLS 证书有效期与主机名校验",
  "TLS 弱加密套件检查",
  "升级包存储安全",
  "升级包非法获取",
  "OTA降级测试",
  "OTA日志安全",
  "APK logcat日志",
  "控车日志测试",
  "系统提权测试",
  "系统版本测试",
  "未授权应用安装测试",
  "强制访问控制测试",
  "GPS信息保护测试",
  "VIN信息保护测试",
  "OTA升级包保护测试",
  "代码保护测试",
  "账户锁定",
] as const;

export const seedDemoDataIfNeeded = (db: any, options: SeedOptions) => {
  const count = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
  if (!options.enabled || count !== 0) {
    return false;
  }

  const seedCases = [
    {
      title: "T-Box 车联网单元 CAN 总线压力测试",
      category: "T-Box",
      type: "Automated",
      protocol: "CAN",
      description: "监控自动化测试运行、ECU 仿真及整车诊断。",
      status: "RUNNING",
      steps: JSON.stringify([
        "初始化 CAN 总线连接",
        "加载压力测试脚本 v2.1",
        "开始发送高频负载数据 (1000 msg/s)",
        "监控 ECU 响应延迟",
        "记录总线错误帧"
      ])
    },
    {
      title: "原型车辆-X OTA 更新仿真",
      category: "整车",
      type: "Automated",
      protocol: "OTA",
      description: "整车 (VIN: WA1...) OTA 更新流程验证。",
      status: "PASSED",
      steps: JSON.stringify([
        "建立与 OTA 服务器的安全连接",
        "下载固件包 (v1.0.4)",
        "验证固件包签名",
        "分发固件至各 ECU",
        "执行更新并重启系统"
      ])
    },
    {
      title: "ADAS 控制单元 HIL 诊断测试",
      category: "ADAS",
      type: "Manual",
      protocol: "HIL",
      description: "组件 (ECU) 硬件在环诊断功能验证。",
      status: "PASSED",
      steps: JSON.stringify([
        "连接 HIL 仿真机柜",
        "启动诊断会话 (UDS)",
        "读取故障码 (DTC)",
        "清除故障码并验证",
        "执行 IO 环回测试"
      ])
    },
    {
      title: "电池管理系统 热失控仿真",
      category: "BMS",
      type: "Automated",
      protocol: "BMS",
      description: "组件 (BMS) 电池热管理与安全预警测试。",
      status: "FAILED",
      steps: JSON.stringify([
        "模拟电芯温度异常升高",
        "触发热失控预警信号",
        "验证冷却系统启动响应",
        "监控高压切断逻辑",
        "记录系统关断时间"
      ])
    },
    {
      title: "网关防火墙 渗透测试",
      category: "Gateway",
      type: "Manual",
      protocol: "Ethernet",
      description: "整车网关安全策略与防火墙规则验证。",
      status: "BLOCKED",
      steps: JSON.stringify([
        "扫描开放端口",
        "尝试未授权的 SSH 访问",
        "验证防火墙拦截规则",
        "执行拒绝服务 (DoS) 攻击模拟",
        "分析安全审计日志"
      ])
    }
  ];
  const insert = db.prepare("INSERT INTO test_cases (title, category, type, protocol, description, status, steps) VALUES (?, ?, ?, ?, ?, ?, ?)");
  seedCases.forEach((c) => insert.run(c.title, c.category, c.type, c.protocol, c.description, c.status, c.steps));

  const insertRun = db.prepare("INSERT INTO test_runs (test_case_id, result, logs, duration, executed_by) VALUES (?, ?, ?, ?, ?)");
  insertRun.run(1, "ERROR", "CAN traffic high load...", 765, "System");
  insertRun.run(2, "PASSED", "OTA update successful", 192, "Admin");
  insertRun.run(3, "PASSED", "Diagnostics clear", 485, "Tester");
  insertRun.run(4, "FAILED", "Thermal threshold exceeded", 320, "System");

  const insertDefect = db.prepare("INSERT INTO defects (id, description, module, severity, status) VALUES (?, ?, ?, ?, ?)");
  insertDefect.run("DTC-0821", "CAN 总线信号丢失 - 转向柱模块", "GW", "Critical", "Open");
  insertDefect.run("SEC-442", "未授权的 SSH 访问尝试", "T-Box", "Critical", "In Review");
  insertDefect.run("LOG-102", "电池包温度传感器读数异常", "BMS", "Major", "Fixed");
  insertDefect.run("UI-009", "中控屏启动动画掉帧", "IVI", "Minor", "Closed");

  const insertAsset = db.prepare(`
    INSERT INTO assets (name, status, version, hardware_version, software_version, description, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertAsset.run("GW-01 (Gateway)", "Online", "v2.4.1", "HW-GW-01", "v2.4.1", "主网关验证节点", "Hardware");
  insertAsset.run("TBOX-PRO-X", "Online", "v4.0.2", "HW-TBOX-X", "v4.0.2", "T-Box 样机", "Hardware");
  insertAsset.run("ADAS-SIM-NODE", "Offline", "v1.1.0", "SIM-ADAS-01", "v1.1.0", "ADAS 仿真节点", "Simulation");
  insertAsset.run("BMS-UNIT-04", "Online", "v3.2.2", "HW-BMS-04", "v3.2.2", "BMS 试验样件", "Hardware");

  const suiteInfo = db.prepare("INSERT INTO test_suites (name, description) VALUES (?, ?)").run(
    "核心 ECU 回归套件",
    "覆盖 Gateway、T-Box、ADAS 和 BMS 的基础回归验证。"
  );
  const suiteId = Number(suiteInfo.lastInsertRowid);
  const insertSuiteCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
  [1, 3, 4, 5].forEach((testCaseId, index) => insertSuiteCase.run(suiteId, testCaseId, index + 1));

  return true;
};

export const ensureSecurityBaselineSuite = (
  db: any,
  suiteName: string,
  caseTitles: string[],
) => {
  const placeholders = caseTitles.map(() => "?").join(",");
  const cases = db.prepare(`
    SELECT id, title
    FROM test_cases
    WHERE title IN (${placeholders})
  `).all(...caseTitles) as Array<{ id: number; title: string }>;
  if (cases.length === 0) return null;

  const byTitle = new Map(cases.map((item) => [item.title, item.id]));
  const orderedCaseIds = caseTitles
    .map((title) => byTitle.get(title))
    .filter((id): id is number => Number.isFinite(id));

  if (orderedCaseIds.length === 0) return null;
  const validatedCases = validateBaselineSuiteCases(db, orderedCaseIds);
  const eligibleCaseIds = validatedCases
    .filter((item) => item.valid)
    .map((item) => item.testCaseId);
  if (eligibleCaseIds.length === 0) return null;
  const skippedCount = validatedCases.length - eligibleCaseIds.length;

  const existingSuite = db.prepare("SELECT id FROM test_suites WHERE name = ?").get(suiteName) as { id: number } | undefined;
  const description = `系统安全基线（自动维护）：覆盖 SSH/ADB/Telnet/FTP 访问控制、日志与配置加固、OTA 升级安全、数据保护及账户策略检查（当前 ${eligibleCaseIds.length} 条${skippedCount > 0 ? `，跳过 ${skippedCount} 条无效输入定义用例` : ""}）。`;
  return db.transaction(() => {
    const resolvedSuiteId = existingSuite
      ? existingSuite.id
      : Number(db.prepare("INSERT INTO test_suites (name, description, is_baseline) VALUES (?, ?, 1)").run(suiteName, description).lastInsertRowid);
    db.prepare("UPDATE test_suites SET description = ?, is_baseline = 1 WHERE id = ?").run(description, resolvedSuiteId);
    db.prepare("UPDATE test_suites SET is_baseline = 0 WHERE is_baseline = 1 AND id <> ?").run(resolvedSuiteId);
    db.prepare("DELETE FROM test_suite_cases WHERE suite_id = ?").run(resolvedSuiteId);
    const insertCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
    eligibleCaseIds.forEach((testCaseId, index) => insertCase.run(resolvedSuiteId, testCaseId, index + 1));
    return resolvedSuiteId;
  })();
};
