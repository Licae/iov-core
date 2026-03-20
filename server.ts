import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import net from "net";

dotenv.config();

const db = new Database("v2x_testing.db");
const ENABLE_DEMO_SEED = process.env.ENABLE_DEMO_SEED === "true";

type DefectRecord = {
  id: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  created_at?: string;
};

type SuiteRunProgress = {
  completedCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
};

type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";
type TestResult = "PASSED" | "FAILED" | "BLOCKED" | "ERROR";
type FailureCategory = "NONE" | "ENVIRONMENT" | "PERMISSION" | "SCRIPT";

type ExecutionTaskRecord = {
  id: number;
  type: "single" | "suite";
  status: ExecutionStatus;
  asset_id?: number | null;
  suite_id?: number | null;
  test_case_id?: number | null;
  total_items: number;
  completed_items: number;
  passed_items: number;
  failed_items: number;
  blocked_items: number;
  current_test_case_id?: number | null;
  current_item_label?: string | null;
  started_at: string;
  finished_at?: string | null;
  initiated_by?: string | null;
  error_message?: string | null;
  stop_on_failure?: number;
  executor?: string | null;
  source_task_id?: number | null;
  retry_count?: number;
  runtime_inputs?: string | null;
  failure_category?: FailureCategory | string | null;
  can_retry?: boolean;
  retry_block_reason?: string | null;
};

type ExecutionTaskItemRecord = {
  id: number;
  test_case_id: number;
  sort_order: number;
  title: string;
  protocol?: string | null;
  category?: string | null;
  description?: string | null;
  test_input?: string | null;
  test_tool?: string | null;
  expected_result?: string | null;
  steps?: string | null;
  executor_type?: string | null;
  script_path?: string | null;
  command_template?: string | null;
  args_template?: string | null;
  timeout_sec?: number | null;
  required_inputs?: string | null;
  default_runtime_inputs?: string | null;
  asset_name?: string | null;
  connection_address?: string | null;
};

type StepExecutionResult = {
  name: string;
  result: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "RUNNING" | "SKIPPED";
  logs?: string;
  duration?: number;
  command?: string;
  command_result?: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "RUNNING" | "SKIPPED";
  output?: string;
  security_assessment?: string;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  timestamp?: string;
  conclusion?: string;
};

type CommandEvidence = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  signal?: NodeJS.Signals | null;
};

type ExecutorResult = {
  result: TestResult;
  duration: number;
  logs: string;
  summary?: string;
  stepResults?: StepExecutionResult[];
  failureCategory?: FailureCategory;
  evidence?: CommandEvidence;
};

const EXECUTION_STATUS = {
  PENDING: "PENDING" as ExecutionStatus,
  RUNNING: "RUNNING" as ExecutionStatus,
  COMPLETED: "COMPLETED" as ExecutionStatus,
  CANCELLED: "CANCELLED" as ExecutionStatus,
};

const TEST_RESULT = {
  PASSED: "PASSED" as TestResult,
  FAILED: "FAILED" as TestResult,
  BLOCKED: "BLOCKED" as TestResult,
  ERROR: "ERROR" as TestResult,
};

const FAILURE_CATEGORY = {
  NONE: "NONE" as FailureCategory,
  ENVIRONMENT: "ENVIRONMENT" as FailureCategory,
  PERMISSION: "PERMISSION" as FailureCategory,
  SCRIPT: "SCRIPT" as FailureCategory,
};

const normalizeExecutionStatus = (value?: string | null): ExecutionStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RUNNING") return EXECUTION_STATUS.RUNNING;
  if (normalized === "COMPLETED" || normalized === "FAILED") return EXECUTION_STATUS.COMPLETED;
  if (normalized === "CANCELLED") return EXECUTION_STATUS.CANCELLED;
  return EXECUTION_STATUS.PENDING;
};

const normalizeTestResult = (value?: string | null, fallback: TestResult = TEST_RESULT.ERROR): TestResult => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED") return TEST_RESULT.PASSED;
  if (normalized === "FAILED") return TEST_RESULT.FAILED;
  if (normalized === "BLOCKED") return TEST_RESULT.BLOCKED;
  if (normalized === "ERROR") return TEST_RESULT.ERROR;
  return fallback;
};

const normalizeStepResult = (value?: string | null): StepExecutionResult["result"] => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED") return "PASSED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "BLOCKED") return "BLOCKED";
  if (normalized === "ERROR") return "ERROR";
  if (normalized === "RUNNING") return "RUNNING";
  if (normalized === "SKIPPED") return "SKIPPED";
  return "ERROR";
};

const normalizeFailureCategory = (value?: string | null): FailureCategory => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ENVIRONMENT") return FAILURE_CATEGORY.ENVIRONMENT;
  if (normalized === "PERMISSION") return FAILURE_CATEGORY.PERMISSION;
  if (normalized === "SCRIPT") return FAILURE_CATEGORY.SCRIPT;
  return FAILURE_CATEGORY.NONE;
};

type TaskExecutor = (
  task: ExecutionTaskRecord,
  item: ExecutionTaskItemRecord,
  broadcast: (data: any) => void,
  registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
) => Promise<ExecutorResult>;

type ExecutorAdapter = {
  name: string;
  matches: (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) => boolean;
  run: TaskExecutor;
};

const EXECUTION_MODE = process.env.EXECUTION_MODE === "script" ? "script" : process.env.EXECUTION_MODE === "shell" ? "script" : process.env.EXECUTION_MODE === "simulate" ? "simulate" : "python";
const EXECUTION_SCRIPT = process.env.EXECUTION_SCRIPT;
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || "python3";
const PYTHON_SECURITY_RUNNER = process.env.PYTHON_SECURITY_RUNNER || path.join(process.cwd(), "scripts", "security_runner.py");
const MAX_TASK_RETRIES = Number(process.env.MAX_TASK_RETRIES ?? "3");
const ARTIFACT_ROOT = path.resolve(process.cwd(), process.env.RUNTIME_ARTIFACTS_DIR || "runtime-artifacts");
const ARTIFACT_SUBDIRS = ["payloads", "adb-push", "adb-pull", "logs"] as const;
const ARTIFACT_RETENTION_HOURS_PASS = Number(process.env.ARTIFACT_RETENTION_HOURS_PASS ?? "0");
const ARTIFACT_RETENTION_HOURS_FAIL = Number(process.env.ARTIFACT_RETENTION_HOURS_FAIL ?? "24");
const ARTIFACT_RETENTION_HOURS_CANCEL = Number(process.env.ARTIFACT_RETENTION_HOURS_CANCEL ?? "2");
const ARTIFACT_MAX_SIZE_MB = Number(process.env.ARTIFACT_MAX_SIZE_MB ?? "2048");
const ARTIFACT_MAX_DIRS = Number(process.env.ARTIFACT_MAX_DIRS ?? "5000");
const ARTIFACT_CLEAN_ON_START = process.env.ARTIFACT_CLEAN_ON_START !== "false";
const SECURITY_BASELINE_SUITE_NAME = process.env.SECURITY_BASELINE_SUITE_NAME || "系统安全基线套件";
const SECURITY_BASELINE_CASE_TITLES = [
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
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildFallbackDefectAnalysis = (defect: DefectRecord) => {
  const severityActions: Record<string, string> = {
    Critical: "立即隔离受影响链路，并优先验证是否存在横向扩散风险。",
    Major: "优先确认是否影响核心业务路径，并安排回归验证。",
    Minor: "记录影响范围，纳入常规修复窗口并跟踪复现条件。",
  };

  return [
    `### 根因分析`,
    `${defect.module} 模块出现 "${defect.description}"，结合当前严重级别 ${defect.severity}，更可能是通信链路异常、配置偏差或模块自身状态机处理不完整导致。`,
    ``,
    `### 排查建议`,
    `1. 核对 ${defect.module} 相关日志、最近一次固件变更和触发该缺陷前后的总线报文。`,
    `2. 在相同输入条件下复现问题，确认是否只在特定负载、时序或协议版本下出现。`,
    `3. ${severityActions[defect.severity] || "补充模块级日志后再次执行回归测试，确认问题边界。"}`
  ].join("\n");
};

const taskArtifactPaths = new Map<number, Set<string>>();
const taskArtifactCleanupTimers = new Map<number, NodeJS.Timeout>();

const safePositiveNumber = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

const ensureArtifactDirectories = () => {
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  ARTIFACT_SUBDIRS.forEach((dir) => mkdirSync(path.join(ARTIFACT_ROOT, dir), { recursive: true }));
};

const getPathSizeBytes = (targetPath: string): number => {
  try {
    const stats = statSync(targetPath);
    if (stats.isFile()) return stats.size;
    if (!stats.isDirectory()) return 0;
    return readdirSync(targetPath).reduce((acc, entry) => acc + getPathSizeBytes(path.join(targetPath, entry)), 0);
  } catch {
    return 0;
  }
};

const listManagedArtifactDirs = () => {
  const entries: Array<{ path: string; mtimeMs: number; sizeBytes: number }> = [];
  ARTIFACT_SUBDIRS.forEach((subdir) => {
    const base = path.join(ARTIFACT_ROOT, subdir);
    try {
      readdirSync(base, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory()) return;
        if (!entry.name.startsWith("task-")) return;
        const fullPath = path.join(base, entry.name);
        const stats = statSync(fullPath);
        entries.push({
          path: fullPath,
          mtimeMs: stats.mtimeMs,
          sizeBytes: getPathSizeBytes(fullPath),
        });
      });
    } catch {
      // ignore
    }
  });
  return entries;
};

const deleteArtifactDir = (artifactPath: string) => {
  try {
    rmSync(artifactPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const enforceArtifactQuota = () => {
  const maxSizeBytes = safePositiveNumber(ARTIFACT_MAX_SIZE_MB, 2048) * 1024 * 1024;
  const maxDirs = safePositiveNumber(ARTIFACT_MAX_DIRS, 5000);
  const dirs = listManagedArtifactDirs().sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalSize = dirs.reduce((acc, item) => acc + item.sizeBytes, 0);
  let totalDirs = dirs.length;

  for (const entry of dirs) {
    if (totalSize <= maxSizeBytes && totalDirs <= maxDirs) break;
    deleteArtifactDir(entry.path);
    totalSize -= entry.sizeBytes;
    totalDirs -= 1;
  }
};

const cleanupExpiredArtifactsOnStart = () => {
  if (!ARTIFACT_CLEAN_ON_START) return;
  const maxRetentionHours = Math.max(
    safePositiveNumber(ARTIFACT_RETENTION_HOURS_PASS, 0),
    safePositiveNumber(ARTIFACT_RETENTION_HOURS_FAIL, 24),
    safePositiveNumber(ARTIFACT_RETENTION_HOURS_CANCEL, 2)
  );
  const cutoff = Date.now() - maxRetentionHours * 60 * 60 * 1000;
  listManagedArtifactDirs().forEach((entry) => {
    if (entry.mtimeMs < cutoff) {
      deleteArtifactDir(entry.path);
    }
  });
  enforceArtifactQuota();
};

const registerTaskArtifactPath = (taskId: number, artifactPath: string) => {
  const bucket = taskArtifactPaths.get(taskId) || new Set<string>();
  bucket.add(artifactPath);
  taskArtifactPaths.set(taskId, bucket);
};

const createTaskArtifactDir = (taskId: number, itemId: number, subdir: (typeof ARTIFACT_SUBDIRS)[number]) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const dir = path.join(ARTIFACT_ROOT, subdir, `task-${taskId}-item-${itemId}-${unique}`);
  mkdirSync(dir, { recursive: true });
  registerTaskArtifactPath(taskId, dir);
  return dir;
};

const getTaskArtifactRetentionMs = (task: ExecutionTaskRecord) => {
  const passMs = safePositiveNumber(ARTIFACT_RETENTION_HOURS_PASS, 0) * 60 * 60 * 1000;
  const failMs = safePositiveNumber(ARTIFACT_RETENTION_HOURS_FAIL, 24) * 60 * 60 * 1000;
  const cancelMs = safePositiveNumber(ARTIFACT_RETENTION_HOURS_CANCEL, 2) * 60 * 60 * 1000;

  if (task.status === EXECUTION_STATUS.CANCELLED) return cancelMs;
  const hasFailure = Number(task.failed_items || 0) > 0 || Number(task.blocked_items || 0) > 0 || Boolean(task.error_message);
  if (hasFailure) return failMs;
  return passMs;
};

const scheduleTaskArtifactCleanup = (task: ExecutionTaskRecord) => {
  const taskId = task.id;
  const paths = Array.from(taskArtifactPaths.get(taskId) || []);
  if (paths.length === 0) return;

  const existingTimer = taskArtifactCleanupTimers.get(taskId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    taskArtifactCleanupTimers.delete(taskId);
  }

  const cleanupNow = () => {
    paths.forEach((artifactPath) => deleteArtifactDir(artifactPath));
    taskArtifactPaths.delete(taskId);
    taskArtifactCleanupTimers.delete(taskId);
    enforceArtifactQuota();
  };

  const retentionMs = getTaskArtifactRetentionMs(task);
  if (retentionMs <= 0) {
    cleanupNow();
    return;
  }

  const timer = setTimeout(cleanupNow, retentionMs);
  taskArtifactCleanupTimers.set(taskId, timer);
};

const generateDefectAnalysis = async (defect: DefectRecord) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      analysis: buildFallbackDefectAnalysis(defect),
      source: "fallback",
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `你是一名车联网与汽车网络安全测试专家。请基于以下缺陷信息，输出简洁的 Markdown 分析：

- 缺陷 ID: ${defect.id}
- 描述: ${defect.description}
- 模块: ${defect.module}
- 严重程度: ${defect.severity}
- 当前状态: ${defect.status}

请输出两个部分：
1. 根因分析（1 段）
2. 排查建议（3 条，必须具体且可执行）`,
  });

  return {
    analysis: response.text || buildFallbackDefectAnalysis(defect),
    source: "gemini",
  };
};

const buildReportHtml = () => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) as totalCases,
      SUM(CASE WHEN type = 'Automated' THEN 1 ELSE 0 END) as automatedCases,
      SUM(CASE WHEN type = 'Manual' THEN 1 ELSE 0 END) as manualCases,
      SUM(CASE WHEN UPPER(status) = 'PASSED' THEN 1 ELSE 0 END) as passedCases,
      SUM(CASE WHEN UPPER(status) = 'FAILED' THEN 1 ELSE 0 END) as failedCases,
      SUM(CASE WHEN UPPER(status) = 'RUNNING' THEN 1 ELSE 0 END) as runningCases
    FROM test_cases
  `).get() as Record<string, number>;

  const recentRuns = db.prepare(`
    SELECT tr.id, tc.title, tc.category, tr.result, tr.duration, tr.executed_by, tr.executed_at
    FROM test_runs tr
    LEFT JOIN test_cases tc ON tc.id = tr.test_case_id
    ORDER BY tr.executed_at DESC
    LIMIT 10
  `).all() as Array<Record<string, string | number>>;

  const coverage = db.prepare(`
    SELECT
      category,
      COUNT(*) as total,
      SUM(CASE WHEN UPPER(status) = 'PASSED' THEN 1 ELSE 0 END) as passed
    FROM test_cases
    GROUP BY category
    ORDER BY category ASC
  `).all() as Array<Record<string, number | string>>;

  const defects = db.prepare(`
    SELECT id, description, module, severity, status, created_at
    FROM defects
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as DefectRecord[];

  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const passRate = totals.totalCases ? Math.round(((totals.passedCases || 0) / totals.totalCases) * 100) : 0;

  const recentRunsRows = recentRuns.length
    ? recentRuns.map((run) => `
        <tr>
          <td>${escapeHtml(String(run.title || "-"))}</td>
          <td>${escapeHtml(String(run.category || "-"))}</td>
          <td>${escapeHtml(String(run.result || "-"))}</td>
          <td>${escapeHtml(String(run.duration || 0))}s</td>
          <td>${escapeHtml(String(run.executed_by || "-"))}</td>
          <td>${escapeHtml(String(run.executed_at || "-"))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">暂无执行记录</td></tr>`;

  const coverageRows = coverage.length
    ? coverage.map((item) => {
        const total = Number(item.total || 0);
        const passed = Number(item.passed || 0);
        const rate = total ? Math.round((passed / total) * 100) : 0;
        return `
          <tr>
            <td>${escapeHtml(String(item.category))}</td>
            <td>${total}</td>
            <td>${passed}</td>
            <td>${rate}%</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="4">暂无覆盖率数据</td></tr>`;

  const defectRows = defects.length
    ? defects.map((defect) => `
        <tr>
          <td>${escapeHtml(defect.id)}</td>
          <td>${escapeHtml(defect.description)}</td>
          <td>${escapeHtml(defect.module)}</td>
          <td>${escapeHtml(defect.severity)}</td>
          <td>${escapeHtml(defect.status)}</td>
          <td>${escapeHtml(defect.created_at || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">暂无缺陷记录</td></tr>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IOV-CORE 测试分析报告</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #141b2d;
      --panel-2: #1a2338;
      --line: #2b3654;
      --text: #ecf2ff;
      --muted: #95a1bf;
      --accent: #27c2ff;
      --good: #35d07f;
      --warn: #ffb648;
      --bad: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      background: linear-gradient(180deg, #08101d 0%, #121b31 100%);
      color: var(--text);
    }
    h1, h2 { margin: 0; }
    p { margin: 0; color: var(--muted); }
    .header { margin-bottom: 24px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin: 24px 0 32px;
    }
    .card {
      background: rgba(20, 27, 45, 0.92);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
    }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .value { font-size: 34px; font-weight: 700; margin-top: 10px; }
    .section {
      background: rgba(20, 27, 45, 0.92);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.08em;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: var(--muted);
    }
    @media print {
      body { background: #fff; color: #111; padding: 16px; }
      .card, .section { background: #fff; border-color: #ddd; }
      p, .label, th, .footer { color: #555; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>IOV-CORE 测试分析报告</h1>
    <p>生成时间：${escapeHtml(generatedAt)}</p>
  </div>

  <div class="cards">
    <div class="card"><div class="label">测试用例总数</div><div class="value">${totals.totalCases || 0}</div></div>
    <div class="card"><div class="label">自动化用例</div><div class="value">${totals.automatedCases || 0}</div></div>
    <div class="card"><div class="label">手动用例</div><div class="value">${totals.manualCases || 0}</div></div>
    <div class="card"><div class="label">当前通过率</div><div class="value">${passRate}%</div></div>
    <div class="card"><div class="label">失败用例</div><div class="value">${totals.failedCases || 0}</div></div>
    <div class="card"><div class="label">运行中任务</div><div class="value">${totals.runningCases || 0}</div></div>
  </div>

  <div class="section">
    <h2>最近执行记录</h2>
    <table>
      <thead>
        <tr><th>用例</th><th>分类</th><th>结果</th><th>耗时</th><th>执行人</th><th>执行时间</th></tr>
      </thead>
      <tbody>${recentRunsRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>模块覆盖率</h2>
    <table>
      <thead>
        <tr><th>分类</th><th>总用例</th><th>通过数</th><th>覆盖率</th></tr>
      </thead>
      <tbody>${coverageRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>缺陷概览</h2>
    <table>
      <thead>
        <tr><th>ID</th><th>描述</th><th>模块</th><th>严重程度</th><th>状态</th><th>记录时间</th></tr>
      </thead>
      <tbody>${defectRows}</tbody>
    </table>
  </div>

  <div class="footer">该报告由 IOV-CORE 自动生成，可直接另存为 PDF。</div>
</body>
</html>`;
};

const buildSuiteRunProgress = (results: string[]): SuiteRunProgress =>
  results.reduce<SuiteRunProgress>((acc, result) => {
    acc.completedCases += 1;
    if (result === TEST_RESULT.PASSED) acc.passedCases += 1;
    if (result === TEST_RESULT.FAILED || result === TEST_RESULT.ERROR) acc.failedCases += 1;
    if (result === TEST_RESULT.BLOCKED) acc.blockedCases += 1;
    return acc;
  }, { completedCases: 0, passedCases: 0, failedCases: 0, blockedCases: 0 });

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- ECU, T-Box, Gateway, IVI, Full Vehicle
    type TEXT NOT NULL,     -- Automated, Manual
    protocol TEXT,          -- CAN, DoIP, V2X, Bluetooth, etc.
    description TEXT,
    steps TEXT,             -- JSON string
    test_input TEXT,
    test_tool TEXT,
    expected_result TEXT,
    automation_level TEXT,
    executor_type TEXT DEFAULT 'python',
    script_path TEXT,
    command_template TEXT,
    args_template TEXT,
    timeout_sec INTEGER DEFAULT 300,
    default_runtime_inputs TEXT,
    status TEXT DEFAULT 'Draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_case_id INTEGER,
    result TEXT,            -- PASSED, FAILED, BLOCKED, ERROR
    logs TEXT,
    summary TEXT,
    step_results TEXT,
    duration INTEGER,       -- In seconds
    executed_by TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(test_case_id) REFERENCES test_cases(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS defects (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    module TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    version TEXT,
    hardware_version TEXT,
    software_version TEXT,
    connection_address TEXT,
    description TEXT,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_suite_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER NOT NULL,
    test_case_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(suite_id) REFERENCES test_suites(id),
    FOREIGN KEY(test_case_id) REFERENCES test_cases(id)
  );

  CREATE TABLE IF NOT EXISTS suite_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    total_cases INTEGER DEFAULT 0,
    completed_cases INTEGER DEFAULT 0,
    passed_cases INTEGER DEFAULT 0,
    failed_cases INTEGER DEFAULT 0,
    blocked_cases INTEGER DEFAULT 0,
    current_case_id INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    FOREIGN KEY(suite_id) REFERENCES test_suites(id),
    FOREIGN KEY(current_case_id) REFERENCES test_cases(id)
  );

  CREATE TABLE IF NOT EXISTS execution_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    asset_id INTEGER,
    suite_id INTEGER,
    test_case_id INTEGER,
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    passed_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    blocked_items INTEGER NOT NULL DEFAULT 0,
    current_test_case_id INTEGER,
    current_item_label TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    initiated_by TEXT,
    error_message TEXT,
    stop_on_failure INTEGER NOT NULL DEFAULT 0,
    executor TEXT DEFAULT 'python',
    runtime_inputs TEXT,
    source_task_id INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    failure_category TEXT NOT NULL DEFAULT 'NONE',
    FOREIGN KEY(asset_id) REFERENCES assets(id),
    FOREIGN KEY(suite_id) REFERENCES test_suites(id),
    FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
    FOREIGN KEY(current_test_case_id) REFERENCES test_cases(id),
    FOREIGN KEY(source_task_id) REFERENCES execution_tasks(id)
  );

  CREATE TABLE IF NOT EXISTS execution_task_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    test_case_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    result TEXT,
    failure_category TEXT,
    run_id INTEGER,
    started_at DATETIME,
    finished_at DATETIME,
    FOREIGN KEY(task_id) REFERENCES execution_tasks(id),
    FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
    FOREIGN KEY(run_id) REFERENCES test_runs(id)
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('abort_on_critical_dtc', 'true');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('pr_requires_sil', 'true');
`);

// Migration: Add duration column to test_runs if it doesn't exist
try {
  db.exec("ALTER TABLE test_runs ADD COLUMN duration INTEGER;");
} catch (e) {
  // Ignore error if column already exists
}

// Migration: Add steps column to test_cases if it doesn't exist
try {
  db.exec("ALTER TABLE test_cases ADD COLUMN steps TEXT;");
} catch (e) {
  // Ignore error if column already exists
}

// Migration: Add new columns if they don't exist
const columns = ['test_input', 'test_tool', 'expected_result', 'automation_level', 'executor_type', 'script_path', 'command_template', 'args_template', 'timeout_sec', 'required_inputs', 'default_runtime_inputs'];
columns.forEach(col => {
  try {
    db.exec(`ALTER TABLE test_cases ADD COLUMN ${col} TEXT;`);
  } catch (e) {}
});

['summary', 'step_results'].forEach(col => {
  try {
    db.exec(`ALTER TABLE test_runs ADD COLUMN ${col} TEXT;`);
  } catch (e) {}
});

['hardware_version', 'software_version', 'connection_address', 'description'].forEach(col => {
  try {
    db.exec(`ALTER TABLE assets ADD COLUMN ${col} TEXT;`);
  } catch (e) {}
});

// Normalize execution status and test result values into canonical uppercase enums.
db.exec(`
  UPDATE execution_tasks
  SET status = CASE UPPER(status)
    WHEN 'QUEUED' THEN 'PENDING'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'RUNNING' THEN 'RUNNING'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'FAILED' THEN 'COMPLETED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE 'PENDING'
  END;

  UPDATE execution_task_items
  SET status = CASE UPPER(status)
    WHEN 'QUEUED' THEN 'PENDING'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'RUNNING' THEN 'RUNNING'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE 'PENDING'
  END;

  UPDATE test_runs
  SET result = CASE UPPER(result)
    WHEN 'PASSED' THEN 'PASSED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'BLOCKED' THEN 'BLOCKED'
    WHEN 'RUNNING' THEN 'ERROR'
    WHEN 'SKIPPED' THEN 'ERROR'
    ELSE COALESCE(result, 'ERROR')
  END;

  UPDATE execution_task_items
  SET result = CASE UPPER(result)
    WHEN 'PASSED' THEN 'PASSED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'BLOCKED' THEN 'BLOCKED'
    WHEN 'ERROR' THEN 'ERROR'
    ELSE result
  END
  WHERE result IS NOT NULL;
`);

try {
  db.exec(`
    UPDATE assets
    SET software_version = COALESCE(NULLIF(software_version, ''), NULLIF(version, ''), 'v1.0.0')
    WHERE software_version IS NULL OR software_version = '';
  `);
} catch (e) {
  // Ignore error if assets table is not initialized yet
}

try {
  db.exec("ALTER TABLE execution_tasks ADD COLUMN stop_on_failure INTEGER NOT NULL DEFAULT 0;");
} catch (e) {
  // Ignore error if column already exists
}

["executor TEXT DEFAULT 'python'", "runtime_inputs TEXT", "source_task_id INTEGER", "retry_count INTEGER NOT NULL DEFAULT 0"].forEach(definition => {
  const columnName = definition.split(" ")[0];
  try {
    db.exec(`ALTER TABLE execution_tasks ADD COLUMN ${definition};`);
  } catch (e) {
    // Ignore error if column already exists
  }
});

["failure_category TEXT NOT NULL DEFAULT 'NONE'"].forEach(definition => {
  try {
    db.exec(`ALTER TABLE execution_tasks ADD COLUMN ${definition};`);
  } catch (e) {
    // Ignore error if column already exists
  }
});

["failure_category TEXT"].forEach(definition => {
  try {
    db.exec(`ALTER TABLE execution_task_items ADD COLUMN ${definition};`);
  } catch (e) {
    // Ignore error if column already exists
  }
});

db.exec(`
  UPDATE execution_tasks
  SET failure_category = CASE UPPER(COALESCE(failure_category, 'NONE'))
    WHEN 'ENVIRONMENT' THEN 'ENVIRONMENT'
    WHEN 'PERMISSION' THEN 'PERMISSION'
    WHEN 'SCRIPT' THEN 'SCRIPT'
    ELSE 'NONE'
  END;

  UPDATE execution_task_items
  SET failure_category = CASE UPPER(COALESCE(failure_category, ''))
    WHEN 'ENVIRONMENT' THEN 'ENVIRONMENT'
    WHEN 'PERMISSION' THEN 'PERMISSION'
    WHEN 'SCRIPT' THEN 'SCRIPT'
    ELSE NULL
  END;
`);

async function startServer() {
  ensureArtifactDirectories();
  cleanupExpiredArtifactsOnStart();

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;
  const activeSuiteRuns = new Map<number, NodeJS.Timeout[]>();
  const activeTaskRuns = new Map<number, NodeJS.Timeout[]>();
  const activeTaskChildren = new Map<number, ChildProcessWithoutNullStreams>();

  app.use(express.json());

  // WebSocket connection handling
  const clients = new Set<WebSocket>();
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  const pingAddress = (address: string) =>
    new Promise<{ success: boolean; latency_ms?: number; output: string }>((resolve) => {
      const child = spawn("ping", ["-c", "1", address], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ success: false, output: stderr || stdout || "Ping timeout" });
      }, 5000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const output = `${stdout}${stderr}`.trim();
        const latencyMatch = output.match(/time[=<]([0-9.]+)\s*ms/i);
        resolve({
          success: code === 0,
          latency_ms: latencyMatch ? Number(latencyMatch[1]) : undefined,
          output,
        });
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve({ success: false, output: error.message });
      });
    });

  const parseJsonArray = (value?: string | null): string[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const parseJsonObject = (value?: string | null): Record<string, string> => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .map(([key, raw]) => [key, String(raw ?? "").trim()] as const)
          .filter(([, normalized]) => normalized !== "")
      );
    } catch {
      return {};
    }
  };

  const resolveTaskRuntimeInputs = (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) => {
    const taskInputs = parseJsonObject(task.runtime_inputs);
    const defaultInputs = parseJsonObject(item.default_runtime_inputs);
    const merged = {
      ...defaultInputs,
      ...taskInputs,
    };
    if (!merged.connection_address && item.connection_address) {
      merged.connection_address = String(item.connection_address).trim();
    }
    return merged;
  };

  const toSafeCommand = (value: string) => (/^[A-Za-z0-9._-]+$/.test(value) ? value : "");
  const commandAvailabilityCache = new Map<string, { checkedAt: number; available: boolean; stdout: string; stderr: string }>();
  const checkCommandAvailability = (command: string) => {
    const normalized = toSafeCommand(command.trim());
    if (!normalized) {
      return { available: false, stdout: "", stderr: "invalid command name", exitCode: 1 };
    }
    const cached = commandAvailabilityCache.get(normalized);
    if (cached && Date.now() - cached.checkedAt < 15_000) {
      return { available: cached.available, stdout: cached.stdout, stderr: cached.stderr, exitCode: cached.available ? 0 : 1 };
    }
    const check = spawnSync("sh", ["-lc", `command -v ${normalized}`], { encoding: "utf8" });
    const stdout = String(check.stdout || "").trim();
    const stderr = String(check.stderr || "").trim();
    const available = check.status === 0;
    commandAvailabilityCache.set(normalized, { checkedAt: Date.now(), available, stdout, stderr });
    return { available, stdout, stderr, exitCode: available ? 0 : 1 };
  };

  const probeTcpPort = (host: string, port: number, timeoutMs = 1800) =>
    new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
      const socket = net.createConnection({ host, port });
      let resolved = false;
      const settle = (payload: { success: boolean; stdout: string; stderr: string }) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(payload);
      };
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => settle({ success: true, stdout: `connected to ${host}:${port}`, stderr: "" }));
      socket.once("timeout", () => settle({ success: false, stdout: "", stderr: `connect timeout (${timeoutMs}ms)` }));
      socket.once("error", (error) => settle({ success: false, stdout: "", stderr: error.message }));
    });

  const keywordMatches = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));
  const classifyFailureCategory = (
    result: TestResult,
    logs: string,
    summary: string,
    stepResults?: StepExecutionResult[],
  ): FailureCategory => {
    if (result === TEST_RESULT.PASSED) return FAILURE_CATEGORY.NONE;
    const haystack = [logs, summary, ...(stepResults || []).map((step) => `${step.logs || ""}\n${step.output || ""}\n${step.stderr || ""}\n${step.conclusion || ""}`)]
      .join("\n")
      .toLowerCase();
    const permissionKeywords = [
      "permission denied",
      "access denied",
      "unauthorized",
      "forbidden",
      "authentication failed",
      "auth failed",
      "login failed",
      "credential",
      "权限",
      "鉴权",
      "未授权",
      "拒绝访问",
    ];
    const environmentKeywords = [
      "no route",
      "host unreachable",
      "timeout",
      "timed out",
      "connection refused",
      "not found",
      "command not found",
      "dns",
      "network is unreachable",
      "address is empty",
      "missing payload",
      "invalid port",
      "environment",
      "连接失败",
      "不可达",
      "超时",
      "前置",
      "blocked",
    ];
    if (keywordMatches(haystack, permissionKeywords)) return FAILURE_CATEGORY.PERMISSION;
    if (result === TEST_RESULT.BLOCKED || keywordMatches(haystack, environmentKeywords)) return FAILURE_CATEGORY.ENVIRONMENT;
    return FAILURE_CATEGORY.SCRIPT;
  };

  const normalizeStepEvidence = (step: StepExecutionResult, evidence?: CommandEvidence): StepExecutionResult => {
    const fallbackTimestamp = evidence?.finishedAt || new Date().toISOString();
    const normalizedCommandResult = step.command_result ? normalizeStepResult(step.command_result) : undefined;
    let derivedExitCode: number | null | undefined;
    if (typeof step.exit_code === "number") {
      derivedExitCode = step.exit_code;
    } else if (normalizedCommandResult) {
      if (normalizedCommandResult === "PASSED") derivedExitCode = 0;
      else if (normalizedCommandResult === "FAILED" || normalizedCommandResult === "ERROR" || normalizedCommandResult === "BLOCKED") derivedExitCode = 1;
    } else if (typeof evidence?.exitCode === "number") {
      derivedExitCode = evidence.exitCode;
    }
    const stdout = step.stdout ?? step.output ?? evidence?.stdout ?? "";
    const stderr = step.stderr ?? evidence?.stderr ?? "";
    const conclusion = step.conclusion || step.security_assessment || step.logs || "";
    return {
      ...step,
      result: normalizeStepResult(step.result),
      command_result: normalizedCommandResult || step.command_result,
      command: step.command || evidence?.command || step.command || "",
      output: step.output || stdout || stderr ? step.output || stdout || stderr : "",
      exit_code: derivedExitCode ?? null,
      stdout,
      stderr,
      timestamp: step.timestamp || fallbackTimestamp,
      conclusion,
      security_assessment: step.security_assessment || conclusion,
    };
  };

  const buildFallbackStepResult = (result: TestResult, logs: string, evidence?: CommandEvidence): StepExecutionResult => {
    const commandResult = result === TEST_RESULT.PASSED
      ? "PASSED"
      : result === TEST_RESULT.BLOCKED
        ? "BLOCKED"
        : "FAILED";
    return normalizeStepEvidence({
      name: "执行结果",
      result,
      logs,
      duration: 0,
      command: evidence?.command || "",
      command_result: commandResult,
      output: [evidence?.stdout, evidence?.stderr].filter(Boolean).join("\n"),
      conclusion: result === TEST_RESULT.PASSED ? "执行命令完成，结果通过。" : "执行命令未通过，请查看命令输出。",
    }, evidence);
  };

  const enrichStepResultsWithEvidence = (
    stepResults: StepExecutionResult[] | undefined,
    result: TestResult,
    logs: string,
    evidence?: CommandEvidence,
  ) => {
    if (!stepResults || stepResults.length === 0) {
      return [buildFallbackStepResult(result, logs, evidence)];
    }
    return stepResults.map((step) => normalizeStepEvidence(step, evidence));
  };

  type PreflightResult = {
    ok: boolean;
    duration: number;
    logs: string;
    summary: string;
    stepResults: StepExecutionResult[];
    failureCategory?: FailureCategory;
  };

  const runPreflightChecks = async (
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    adapter: ExecutorAdapter,
  ): Promise<PreflightResult> => {
    const startedAt = Date.now();
    const steps: StepExecutionResult[] = [];
    const runtimeInputs = resolveTaskRuntimeInputs(task, item);
    const requiredInputs = parseJsonArray(item.required_inputs);
    const signature = [item.title, item.test_tool, item.script_path, item.description].filter(Boolean).join(" ").toLowerCase();
    const connectionAddress = String(runtimeInputs.connection_address || "").trim();
    const needsConnectionAddress = requiredInputs.includes("connection_address") ||
      requiredInputs.some((key) => key.endsWith("_port")) ||
      signature.includes("adb") ||
      signature.includes("ssh");
    const nowTimestamp = () => new Date().toISOString();

    const pushStep = (step: StepExecutionResult) => {
      steps.push(normalizeStepEvidence({
        ...step,
        timestamp: step.timestamp || nowTimestamp(),
      }));
    };

    if (needsConnectionAddress) {
      if (!connectionAddress) {
        pushStep({
          name: "前置检查：连接地址",
          result: "BLOCKED",
          logs: "未配置连接地址。",
          command: "validate connection_address",
          command_result: "BLOCKED",
          exit_code: 1,
          stderr: "connection_address is empty",
          conclusion: "任务缺少必要资产连接地址，无法执行。",
        });
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        return {
          ok: false,
          duration,
          logs: "前置检查失败：未配置连接地址。",
          summary: "前置检查失败：连接地址为空。",
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: "前置检查：连接地址",
        result: "PASSED",
        logs: `连接地址 ${connectionAddress} 已就绪。`,
        command: "validate connection_address",
        command_result: "PASSED",
        exit_code: 0,
        stdout: connectionAddress,
        conclusion: "已获取可用连接地址。",
      });
    }

    const requiredCommands = new Set<string>();
    if (adapter.name === "python") {
      requiredCommands.add(PYTHON_EXECUTABLE);
    }
    if (requiredInputs.includes("adb_port") || signature.includes("adb")) {
      requiredCommands.add("adb");
    }
    if (requiredInputs.includes("ssh_port") || signature.includes("ssh")) {
      requiredCommands.add("ssh");
    }

    for (const command of requiredCommands) {
      const started = Date.now();
      const checked = checkCommandAvailability(command);
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (!checked.available) {
        pushStep({
          name: `前置检查：命令 ${command}`,
          result: "BLOCKED",
          logs: `命令 ${command} 不可用。`,
          duration,
          command: `command -v ${command}`,
          command_result: "FAILED",
          exit_code: checked.exitCode,
          stdout: checked.stdout,
          stderr: checked.stderr || `${command} not found`,
          conclusion: `缺少 ${command}，任务无法启动。`,
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：命令 ${command} 不可用。`,
          summary: `前置检查失败：未安装或未配置 ${command}。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: `前置检查：命令 ${command}`,
        result: "PASSED",
        logs: `命令 ${command} 可用。`,
        duration,
        command: `command -v ${command}`,
        command_result: "PASSED",
        exit_code: 0,
        stdout: checked.stdout || command,
        stderr: checked.stderr,
        conclusion: `${command} 可执行。`,
      });
    }

    const portChecks: Array<{ key: string; label: string; fallback: number }> = [];
    if (requiredInputs.includes("adb_port") || signature.includes("adb")) {
      portChecks.push({ key: "adb_port", label: "ADB", fallback: 5555 });
    }
    if (requiredInputs.includes("ssh_port") || signature.includes("ssh")) {
      portChecks.push({ key: "ssh_port", label: "SSH", fallback: 22 });
    }

    for (const check of portChecks) {
      const portRaw = String(runtimeInputs[check.key] || check.fallback);
      const portValue = Number(portRaw);
      if (!Number.isInteger(portValue) || portValue <= 0 || portValue > 65535) {
        pushStep({
          name: `前置检查：${check.label} 端口`,
          result: "BLOCKED",
          logs: `${check.label} 端口配置无效: ${portRaw}`,
          command: `validate port ${check.key}`,
          command_result: "BLOCKED",
          exit_code: 1,
          stderr: `invalid port: ${portRaw}`,
          conclusion: "端口参数不合法，无法继续执行。",
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：${check.label} 端口配置无效。`,
          summary: `前置检查失败：${check.label} 端口配置无效。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      const started = Date.now();
      const tcp = await probeTcpPort(connectionAddress, portValue);
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (!tcp.success) {
        pushStep({
          name: `前置检查：${check.label} 端口连通性`,
          result: "BLOCKED",
          logs: `${check.label} 端口不可达：${tcp.stderr || "连接失败"}`,
          duration,
          command: `tcp_connect ${connectionAddress}:${portValue}`,
          command_result: "BLOCKED",
          exit_code: 1,
          stdout: tcp.stdout,
          stderr: tcp.stderr,
          conclusion: `${check.label} 端口不可达，任务在前置检查阶段阻塞。`,
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：${check.label} 端口不可达。`,
          summary: `前置检查失败：${connectionAddress}:${portValue} 不可达。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: `前置检查：${check.label} 端口连通性`,
        result: "PASSED",
        logs: `${check.label} 端口可达。`,
        duration,
        command: `tcp_connect ${connectionAddress}:${portValue}`,
        command_result: "PASSED",
        exit_code: 0,
        stdout: tcp.stdout,
        stderr: tcp.stderr,
        conclusion: `${check.label} 前置连通性通过。`,
      });
    }

    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    return {
      ok: true,
      duration,
      logs: "前置检查通过。",
      summary: "前置检查通过。",
      stepResults: steps,
    };
  };

  const refreshTaskFailureCategory = (taskId: number) => {
    const items = db.prepare(`
      SELECT
        failure_category,
        result
      FROM execution_task_items
      WHERE task_id = ?
      ORDER BY sort_order DESC, id DESC
    `).all(taskId) as Array<{ failure_category?: string | null; result?: string | null }>;
    const activeFailure = items.find((item) =>
      normalizeTestResult(item.result || "", TEST_RESULT.PASSED) !== TEST_RESULT.PASSED &&
      normalizeFailureCategory(item.failure_category) !== FAILURE_CATEGORY.NONE
    );
    const nextFailureCategory = activeFailure
      ? normalizeFailureCategory(activeFailure.failure_category)
      : FAILURE_CATEGORY.NONE;
    db.prepare("UPDATE execution_tasks SET failure_category = ? WHERE id = ?").run(nextFailureCategory, taskId);
    return nextFailureCategory;
  };

  const getRetryDecision = (task: ExecutionTaskRecord) => {
    if ([EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(normalizeExecutionStatus(task.status))) {
      return { canRetry: false, reason: "任务仍在执行中，暂不可重试。" };
    }
    if (Number(task.retry_count || 0) >= MAX_TASK_RETRIES) {
      return { canRetry: false, reason: `重试次数已达到上限（${MAX_TASK_RETRIES}）。` };
    }
    if (Number(task.failed_items || 0) === 0 && Number(task.blocked_items || 0) === 0 && Number(task.passed_items || 0) > 0) {
      return { canRetry: false, reason: "任务已通过，无需重试。" };
    }
    const category = normalizeFailureCategory(task.failure_category);
    if (category === FAILURE_CATEGORY.PERMISSION) {
      return { canRetry: false, reason: "权限类失败需先修复策略或凭据，不支持自动重试。" };
    }
    if (category === FAILURE_CATEGORY.NONE && Number(task.failed_items || 0) === 0 && Number(task.blocked_items || 0) === 0) {
      return { canRetry: false, reason: "任务没有可重试的失败项。" };
    }
    return { canRetry: true, reason: null as string | null };
  };

  const decorateTaskRetryMeta = <T extends ExecutionTaskRecord>(task: T): T => {
    const decision = getRetryDecision(task);
    return {
      ...task,
      failure_category: normalizeFailureCategory(task.failure_category),
      can_retry: decision.canRetry,
      retry_block_reason: decision.reason,
    };
  };

  const listTestSuites = () => db.prepare(`
    SELECT
      ts.id,
      ts.name,
      ts.description,
      ts.created_at,
      COUNT(tsc.id) as case_count
    FROM test_suites ts
    LEFT JOIN test_suite_cases tsc ON tsc.suite_id = ts.id
    GROUP BY ts.id
    ORDER BY ts.created_at DESC
  `).all();

  const listExecutionTasks = () => db.prepare(`
    SELECT
      et.*,
      ts.name as suite_name,
      tc.title as test_case_title,
      current_tc.title as current_case_title,
      a.name as asset_name
    FROM execution_tasks et
    LEFT JOIN test_suites ts ON ts.id = et.suite_id
    LEFT JOIN test_cases tc ON tc.id = et.test_case_id
    LEFT JOIN test_cases current_tc ON current_tc.id = et.current_test_case_id
    LEFT JOIN assets a ON a.id = et.asset_id
    ORDER BY
      CASE WHEN et.status IN ('RUNNING', 'PENDING') THEN 0 ELSE 1 END,
      et.started_at DESC
    LIMIT 50
  `).all().map((task: ExecutionTaskRecord) => decorateTaskRetryMeta(task));

  const getExecutionTaskDetail = (taskId: number) => {
    const task = db.prepare(`
      SELECT
        et.*,
        ts.name as suite_name,
        tc.title as test_case_title,
        current_tc.title as current_case_title,
        a.name as asset_name
      FROM execution_tasks et
      LEFT JOIN test_suites ts ON ts.id = et.suite_id
      LEFT JOIN test_cases tc ON tc.id = et.test_case_id
      LEFT JOIN test_cases current_tc ON current_tc.id = et.current_test_case_id
      LEFT JOIN assets a ON a.id = et.asset_id
      WHERE et.id = ?
    `).get(taskId);

    if (!task) {
      return null;
    }

    const items = db.prepare(`
      SELECT
        eti.*,
        tc.title,
        tc.category,
        tc.protocol,
        tc.test_tool,
        tc.test_input,
        tc.expected_result,
        tr.result as run_result,
        tr.logs,
        tr.summary,
        tr.step_results,
        tr.duration,
        tr.executed_at
      FROM execution_task_items eti
      JOIN test_cases tc ON tc.id = eti.test_case_id
      LEFT JOIN test_runs tr ON tr.id = eti.run_id
      WHERE eti.task_id = ?
      ORDER BY eti.sort_order ASC, eti.id ASC
    `).all(taskId);

    return { task: decorateTaskRetryMeta(task as ExecutionTaskRecord), items };
  };

  const listSuiteRuns = () => db.prepare(`
    SELECT
      et.id,
      et.suite_id,
      ts.name as suite_name,
      et.status,
      et.total_items as total_cases,
      et.completed_items as completed_cases,
      et.passed_items as passed_cases,
      et.failed_items as failed_cases,
      et.blocked_items as blocked_cases,
      et.current_test_case_id as current_case_id,
      current_tc.title as current_case_title,
      et.started_at,
      et.finished_at
    FROM execution_tasks et
    LEFT JOIN test_suites ts ON ts.id = et.suite_id
    LEFT JOIN test_cases current_tc ON current_tc.id = et.current_test_case_id
    WHERE et.type = 'suite'
    ORDER BY
      CASE WHEN et.status IN ('RUNNING', 'PENDING') THEN 0 ELSE 1 END,
      et.started_at DESC
    LIMIT 20
  `).all();

  const ensureSecurityBaselineSuite = () => {
    const placeholders = SECURITY_BASELINE_CASE_TITLES.map(() => "?").join(",");
    const cases = db.prepare(`
      SELECT id, title
      FROM test_cases
      WHERE title IN (${placeholders})
    `).all(...SECURITY_BASELINE_CASE_TITLES) as Array<{ id: number; title: string }>;
    if (cases.length === 0) return null;

    const byTitle = new Map(cases.map((item) => [item.title, item.id]));
    const orderedCaseIds = SECURITY_BASELINE_CASE_TITLES
      .map((title) => byTitle.get(title))
      .filter((id): id is number => Number.isFinite(id));

    if (orderedCaseIds.length === 0) return null;

    const existingSuite = db.prepare("SELECT id FROM test_suites WHERE name = ?").get(SECURITY_BASELINE_SUITE_NAME) as { id: number } | undefined;
    const description = `系统安全基线（自动维护）：覆盖 SSH/ADB/Telnet/FTP 访问控制、日志与配置加固、OTA 升级安全、数据保护及账户策略检查（当前 ${orderedCaseIds.length} 条）。`;
    const suiteId = db.transaction(() => {
      const resolvedSuiteId = existingSuite
        ? existingSuite.id
        : Number(db.prepare("INSERT INTO test_suites (name, description) VALUES (?, ?)").run(SECURITY_BASELINE_SUITE_NAME, description).lastInsertRowid);
      db.prepare("UPDATE test_suites SET description = ? WHERE id = ?").run(description, resolvedSuiteId);
      db.prepare("DELETE FROM test_suite_cases WHERE suite_id = ?").run(resolvedSuiteId);
      const insertCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
      orderedCaseIds.forEach((testCaseId, index) => insertCase.run(resolvedSuiteId, testCaseId, index + 1));
      return resolvedSuiteId;
    })();
    return suiteId;
  };

  const createExecutionTask = ({
    type,
    assetId,
    suiteId,
    testCaseId,
    initiatedBy,
    testCaseIds,
    stopOnFailure,
    sourceTaskId,
    retryCount,
    runtimeInputs,
  }: {
    type: "single" | "suite";
    assetId?: number | null;
    suiteId?: number | null;
    testCaseId?: number | null;
    initiatedBy?: string;
    testCaseIds: number[];
    stopOnFailure?: boolean;
    sourceTaskId?: number | null;
    retryCount?: number;
    runtimeInputs?: Record<string, string>;
  }) => {
    const transaction = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO execution_tasks (type, status, asset_id, suite_id, test_case_id, total_items, current_test_case_id, initiated_by, stop_on_failure, executor, runtime_inputs, source_task_id, retry_count)
        VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        type,
        assetId || null,
        suiteId || null,
        testCaseId || null,
        testCaseIds.length,
        testCaseIds[0] || null,
        initiatedBy || "System",
        stopOnFailure ? 1 : 0,
        EXECUTION_MODE,
        JSON.stringify(runtimeInputs || {}),
        sourceTaskId || null,
        retryCount || 0
      );

      const taskId = Number(info.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO execution_task_items (task_id, test_case_id, sort_order)
        VALUES (?, ?, ?)
      `);

      testCaseIds.forEach((id, index) => insertItem.run(taskId, id, index + 1));
      return taskId;
    });

    return transaction();
  };

  const cloneExecutionTask = (taskId: number) => {
    const task = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task) return null;
    if ([EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(task.status)) return { error: "Task is still active" } as const;

    const items = db.prepare(`
      SELECT test_case_id
      FROM execution_task_items
      WHERE task_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(taskId) as Array<{ test_case_id: number }>;
    if (!items.length) return { error: "Task has no items" } as const;

    const newTaskId = createExecutionTask({
      type: task.type,
      assetId: task.asset_id || null,
      suiteId: task.suite_id || null,
      testCaseId: task.test_case_id || null,
      testCaseIds: items.map(item => item.test_case_id),
      initiatedBy: "User",
      stopOnFailure: Boolean(task.stop_on_failure),
      runtimeInputs: (() => {
        try {
          return task.runtime_inputs ? JSON.parse(task.runtime_inputs) : {};
        } catch {
          return {};
        }
      })(),
      sourceTaskId: task.id,
      retryCount: Number(task.retry_count || 0) + 1,
    });
    return { taskId: newTaskId } as const;
  };

  const simulateExecutor: TaskExecutor = async (task, item, broadcastEvent) => {
    const results: TestResult[] = [TEST_RESULT.PASSED, TEST_RESULT.FAILED, TEST_RESULT.BLOCKED];
    const protocol = item.protocol || "CAN";
    const duration = Math.floor(Math.random() * 240) + 60;

    for (let logIndex = 1; logIndex <= 4; logIndex += 1) {
      await new Promise(resolve => setTimeout(resolve, 220));
      const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(" ");
      broadcastEvent({
        type: "SIMULATION_LOG",
        taskId: task.id,
        testCaseId: item.test_case_id,
        message: `[${protocol}] Step ${logIndex}: ID=0x${Math.floor(Math.random() * 2048).toString(16)} DATA=[${hex}]`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = results[Math.floor(Math.random() * results.length)];
    return {
      result,
      duration,
      logs: `Execution task ${task.id}: ${item.title} completed with ${result}`,
    };
  };

  const renderExecutorTemplate = (
    template: string,
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    extra: Record<string, string> = {},
  ) =>
    template
      .replace(/\{\{taskId\}\}/g, String(task.id))
      .replace(/\{\{testCaseId\}\}/g, String(item.test_case_id))
      .replace(/\{\{suiteId\}\}/g, String(task.suite_id || ""))
      .replace(/\{\{assetId\}\}/g, String(task.asset_id || ""))
      .replace(/\{\{title\}\}/g, item.title)
      .replace(/\{\{protocol\}\}/g, item.protocol || "")
      .replace(/\{\{target\}\}/g, item.connection_address || "")
      .replace(/\{\{assetName\}\}/g, item.asset_name || "")
      .replace(/\{\{pythonExecutable\}\}/g, PYTHON_EXECUTABLE)
      .replace(/\{\{payloadPath\}\}/g, extra.payloadPath || "");

  const buildScriptCommand = (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) => {
    const baseCommand = item.command_template || item.script_path || EXECUTION_SCRIPT;
    if (!baseCommand) return null;
    const rendered = renderExecutorTemplate(baseCommand, task, item);
    const renderedArgs = renderExecutorTemplate(item.args_template || "", task, item);
    return [rendered, renderedArgs].filter(Boolean).join(" ").trim();
  };

  const parseExecutorOutput = (result: ExecutorResult) => {
    const fallbackEvidence = result.evidence;
    const fallbackDuration = Number(result.duration || 0);
    try {
      const lines = result.logs.split("\n").filter(Boolean);
      const lastJsonLine = [...lines].reverse().find((line) => {
        const normalized = line.replace(/^\[(stdout|stderr)\]\s*/i, "").trim();
        return normalized.startsWith("{") && normalized.endsWith("}");
      });
      if (!lastJsonLine) {
        return {
          ...result,
          stepResults: enrichStepResultsWithEvidence(result.stepResults, result.result, result.logs, fallbackEvidence),
          failureCategory: result.failureCategory || classifyFailureCategory(result.result, result.logs, result.summary || "", result.stepResults),
        };
      }
      const parsed = JSON.parse(lastJsonLine.replace(/^\[(stdout|stderr)\]\s*/i, "").trim());
      const normalizedResult = normalizeTestResult(parsed.result, result.result);
      const normalizedLogs = parsed.logs || result.logs;
      const normalizedSummary = parsed.summary || parsed.logs || result.summary || "";
      const parsedSteps = Array.isArray(parsed.steps)
        ? parsed.steps.map((step: any) => ({
            ...step,
            result: normalizeStepResult(step?.result),
            command_result: step?.command_result ? normalizeStepResult(step.command_result) : undefined,
          } as StepExecutionResult))
        : result.stepResults;
      const normalizedStepResults = enrichStepResultsWithEvidence(parsedSteps, normalizedResult, normalizedLogs, fallbackEvidence);
      return {
        ...result,
        result: normalizedResult,
        duration: Number(parsed.duration || fallbackDuration),
        logs: normalizedLogs,
        summary: normalizedSummary,
        stepResults: normalizedStepResults,
        failureCategory: result.failureCategory || classifyFailureCategory(normalizedResult, normalizedLogs, normalizedSummary, normalizedStepResults),
      } as ExecutorResult;
    } catch {
      return {
        ...result,
        stepResults: enrichStepResultsWithEvidence(result.stepResults, result.result, result.logs, fallbackEvidence),
        failureCategory: result.failureCategory || classifyFailureCategory(result.result, result.logs, result.summary || "", result.stepResults),
      };
    }
  };

  const spawnCommandExecutor = (
    command: string,
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    broadcastEvent: (data: any) => void,
    registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
  ): Promise<ExecutorResult> =>
    new Promise<ExecutorResult>((resolve) => {
      if (!command) {
        resolve({
          result: TEST_RESULT.ERROR,
          duration: 0,
          logs: "EXECUTION_SCRIPT is not configured",
        });
        return;
      }

      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const output: string[] = [];
      const stdoutOutput: string[] = [];
      const stderrOutput: string[] = [];
      const child = spawn(command, { shell: true, cwd: process.cwd(), env: process.env });
      registerChild(child);

      const handleChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
        const text = chunk.toString().trim();
        if (!text) return;
        output.push(`[${stream}] ${text}`);
        if (stream === "stdout") stdoutOutput.push(text);
        if (stream === "stderr") stderrOutput.push(text);
        text.split("\n").forEach(line => {
          broadcastEvent({
            type: "SIMULATION_LOG",
            taskId: task.id,
            testCaseId: item.test_case_id,
            message: line,
            timestamp: new Date().toISOString(),
          });
        });
      };

      child.stdout.on("data", (chunk) => handleChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk) => handleChunk(chunk, "stderr"));
      child.on("close", (code, signal) => {
        registerChild(null);
        const finishedAt = Date.now();
        const duration = Math.max(1, Math.round((finishedAt - startedAt) / 1000));
        const evidence: CommandEvidence = {
          command,
          exitCode: typeof code === "number" ? code : null,
          stdout: stdoutOutput.join("\n"),
          stderr: stderrOutput.join("\n"),
          startedAt: startedAtIso,
          finishedAt: new Date(finishedAt).toISOString(),
          signal,
        };
        if (signal === "SIGTERM") {
          resolve({
            result: TEST_RESULT.BLOCKED,
            duration,
            logs: output.join("\n") || "Execution cancelled",
            summary: "执行被中断（SIGTERM）。",
            evidence,
            failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
            stepResults: enrichStepResultsWithEvidence(undefined, TEST_RESULT.BLOCKED, output.join("\n") || "Execution cancelled", evidence),
          });
          return;
        }
        resolve(parseExecutorOutput({
          result: code === 0 ? TEST_RESULT.PASSED : TEST_RESULT.FAILED,
          duration,
          logs: output.join("\n") || `Script exited with code ${code ?? -1}`,
          summary: code === 0 ? "命令执行完成。" : `命令退出码 ${code ?? -1}。`,
          evidence,
        }));
      });
    });

  const shellExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const inlineShellCommand = item.test_tool?.startsWith("shell:") ? item.test_tool.slice("shell:".length).trim() : null;
    const command = inlineShellCommand || buildScriptCommand(task, item);
    return spawnCommandExecutor(command || "", task, item, broadcastEvent, registerChild);
  };

  const pythonExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const payloadDir = createTaskArtifactDir(task.id, item.id, "payloads");
    const payloadPath = path.join(payloadDir, "payload.json");
    const artifactDirs = {
      root: ARTIFACT_ROOT,
      payload_dir: payloadDir,
      adb_push_dir: createTaskArtifactDir(task.id, item.id, "adb-push"),
      adb_pull_dir: createTaskArtifactDir(task.id, item.id, "adb-pull"),
      logs_dir: createTaskArtifactDir(task.id, item.id, "logs"),
    };
    const runtimeInputs = resolveTaskRuntimeInputs(task, item);
    const payload = {
      task,
      item,
      runtimeInputs,
      testCase: {
        id: item.test_case_id,
        title: item.title,
        category: item.category,
        protocol: item.protocol,
        description: item.description,
        test_input: item.test_input,
        test_tool: item.test_tool,
        expected_result: item.expected_result,
        required_inputs: item.required_inputs,
      },
      artifact_dirs: artifactDirs,
    };
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf8");

    const pythonScript = item.script_path || PYTHON_SECURITY_RUNNER;
    const command = item.command_template
      ? [
          renderExecutorTemplate(item.command_template, task, item, { payloadPath }),
          renderExecutorTemplate(item.args_template || "", task, item, { payloadPath }),
        ].filter(Boolean).join(" ").trim()
      : [
          PYTHON_EXECUTABLE,
          pythonScript,
          renderExecutorTemplate(item.args_template || "{{payloadPath}}", task, item, { payloadPath }),
        ].filter(Boolean).join(" ").trim();
    return spawnCommandExecutor(command, task, item, broadcastEvent, registerChild);
  };

  const adapterRegistry: ExecutorAdapter[] = [
    {
      name: "shell",
      matches: (_task, item) => item.executor_type === "shell" || Boolean(item.test_tool?.startsWith("shell:")) || EXECUTION_MODE === "script",
      run: shellExecutor,
    },
    {
      name: "python",
      matches: (_task, item) => {
        if (item.executor_type === "python") return true;
        const tool = (item.test_tool || "").toLowerCase();
        const signature = [item.title, item.category, item.description, item.test_input, item.test_tool]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return tool.startsWith("python:") ||
          tool.includes("security") ||
          tool.includes("scapy") ||
          signature.includes("安全") ||
          signature.includes("渗透") ||
          signature.includes("ssh") ||
          signature.includes("firewall") ||
          EXECUTION_MODE === "python";
      },
      run: pythonExecutor,
    },
    {
      name: "simulate",
      matches: () => true,
      run: simulateExecutor,
    },
  ];

  const resolveExecutorAdapter = (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) =>
    adapterRegistry.find(adapter => adapter.matches(task, item)) || adapterRegistry[adapterRegistry.length - 1];

  const runTaskItem = async (
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    adapter: ExecutorAdapter,
    registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
  ) => adapter.run(task, item, broadcast, registerChild);

  const updateTaskCounters = (taskId: number) => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN result = 'PASSED' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN result IN ('FAILED', 'ERROR') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
      FROM execution_task_items
      WHERE task_id = ?
    `).get(taskId) as Record<string, number>;

    db.prepare(`
      UPDATE execution_tasks
      SET total_items = ?,
          completed_items = ?,
          passed_items = ?,
          failed_items = ?,
          blocked_items = ?
      WHERE id = ?
    `).run(
      Number(stats.total || 0),
      Number(stats.completed || 0),
      Number(stats.passed || 0),
      Number(stats.failed || 0),
      Number(stats.blocked || 0),
      taskId
    );
  };

  const scheduleExecutionTask = (taskId: number) => {
    const task = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task) return;

    const items = db.prepare(`
      SELECT
        eti.id,
        eti.test_case_id,
        eti.sort_order,
        tc.title,
        tc.protocol,
        tc.category,
        tc.description,
        tc.test_input,
        tc.test_tool,
        tc.expected_result,
        tc.steps,
        tc.executor_type,
        tc.script_path,
        tc.command_template,
        tc.args_template,
        tc.timeout_sec,
        tc.required_inputs,
        tc.default_runtime_inputs,
        a.name as asset_name,
        a.connection_address
      FROM execution_task_items eti
      JOIN test_cases tc ON tc.id = eti.test_case_id
      LEFT JOIN execution_tasks et ON et.id = eti.task_id
      LEFT JOIN assets a ON a.id = et.asset_id
      WHERE eti.task_id = ?
      ORDER BY eti.sort_order ASC, eti.id ASC
    `).all(taskId) as ExecutionTaskItemRecord[];

    if (items.length === 0) {
      db.prepare("UPDATE execution_tasks SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP, failure_category = 'NONE' WHERE id = ?").run(taskId);
      return;
    }

    const completeTask = (status: ExecutionStatus = EXECUTION_STATUS.COMPLETED, errorMessage?: string | null) => {
      updateTaskCounters(taskId);
      const finalFailureCategory = refreshTaskFailureCategory(taskId);
      db.prepare(`
        UPDATE execution_tasks
        SET status = ?,
            current_test_case_id = NULL,
            current_item_label = NULL,
            finished_at = CURRENT_TIMESTAMP,
            error_message = ?,
            failure_category = ?
        WHERE id = ?
      `).run(status, errorMessage || null, finalFailureCategory, taskId);

      const completedTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord;
      broadcast({ type: "EXECUTION_TASK_COMPLETED", task: decorateTaskRetryMeta(completedTask) });
      scheduleTaskArtifactCleanup(completedTask);
      activeTaskRuns.delete(taskId);
      activeTaskChildren.delete(taskId);
    };

    const cancelPendingTimers = () => {
      const pendingTimers = activeTaskRuns.get(taskId) || [];
      pendingTimers.forEach(timer => clearTimeout(timer));
      activeTaskRuns.delete(taskId);
      const activeChild = activeTaskChildren.get(taskId);
      if (activeChild) {
        activeChild.kill("SIGTERM");
        activeTaskChildren.delete(taskId);
      }
    };

    const executeSequentially = async () => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const latestTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (!latestTask || latestTask.status === EXECUTION_STATUS.CANCELLED) {
          break;
        }

        db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(item.test_case_id);
        db.prepare(`
          UPDATE execution_task_items
          SET status = 'RUNNING',
              started_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.id);
        db.prepare(`
          UPDATE execution_tasks
          SET status = 'RUNNING',
              current_test_case_id = ?,
              current_item_label = ?
          WHERE id = ?
        `).run(item.test_case_id, item.title, taskId);

        broadcast({
          type: "EXECUTION_TASK_UPDATED",
          task: decorateTaskRetryMeta(db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord),
        });
        const refreshedTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord;
        const adapter = resolveExecutorAdapter(refreshedTask, item);
        db.prepare("UPDATE execution_tasks SET executor = ? WHERE id = ?").run(adapter.name, taskId);
        let result: TestResult = TEST_RESULT.ERROR;
        let duration = 0;
        let logs = "";
        let summary = "";
        let stepResults: StepExecutionResult[] | undefined;
        let failureCategory: FailureCategory = FAILURE_CATEGORY.NONE;
        try {
          const preflight = await runPreflightChecks(refreshedTask, item, adapter);
          if (!preflight.ok) {
            result = TEST_RESULT.BLOCKED;
            duration = preflight.duration;
            logs = preflight.logs;
            summary = preflight.summary;
            stepResults = preflight.stepResults;
            failureCategory = preflight.failureCategory || FAILURE_CATEGORY.ENVIRONMENT;
          } else {
            const execution = await runTaskItem(refreshedTask, item, adapter, (child) => {
              if (child) {
                activeTaskChildren.set(taskId, child);
              } else {
                activeTaskChildren.delete(taskId);
              }
            });
            result = normalizeTestResult(execution.result);
            duration = execution.duration;
            logs = execution.logs;
            summary = execution.summary || "";
            stepResults = execution.stepResults;
            failureCategory = execution.failureCategory || classifyFailureCategory(result, logs, summary, stepResults);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Execution error";
          result = TEST_RESULT.ERROR;
          duration = 0;
          logs = errorMessage;
          summary = `执行器异常: ${errorMessage}`;
          stepResults = enrichStepResultsWithEvidence(
            [{ name: "执行器异常", result: "ERROR", logs: errorMessage, duration: 0, conclusion: "执行器异常导致任务失败。" }],
            TEST_RESULT.ERROR,
            errorMessage
          );
          failureCategory = FAILURE_CATEGORY.SCRIPT;
        }

        stepResults = enrichStepResultsWithEvidence(stepResults, result, logs);
        if (result === TEST_RESULT.PASSED) {
          failureCategory = FAILURE_CATEGORY.NONE;
        }

        const currentTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (!currentTask || currentTask.status === EXECUTION_STATUS.CANCELLED) {
          break;
        }

        const runInfo = db.prepare(`
          INSERT INTO test_runs (test_case_id, result, logs, summary, step_results, duration, executed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.test_case_id,
          result,
          logs,
          summary || "",
          stepResults ? JSON.stringify(stepResults) : null,
          duration,
          refreshedTask.type === "suite" ? "Task-Orchestrator" : "Auto-Runner"
        );

        db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(result, item.test_case_id);
        db.prepare(`
          UPDATE execution_task_items
          SET status = 'COMPLETED',
              result = ?,
              failure_category = ?,
              run_id = ?,
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(result, failureCategory, Number(runInfo.lastInsertRowid), item.id);

        updateTaskCounters(taskId);
        refreshTaskFailureCategory(taskId);

        const isLast = index === items.length - 1;
        const stopOnFailureTriggered = Boolean(currentTask.stop_on_failure) && [TEST_RESULT.FAILED, TEST_RESULT.ERROR].includes(result);
        if (stopOnFailureTriggered) {
          db.prepare(`
            UPDATE execution_task_items
            SET status = 'CANCELLED',
                finished_at = CURRENT_TIMESTAMP
            WHERE task_id = ? AND sort_order > ?
          `).run(taskId, item.sort_order);
          completeTask(EXECUTION_STATUS.COMPLETED, `Task stopped after failure on ${item.title}`);
          cancelPendingTimers();
          break;
        } else if (isLast) {
          completeTask();
        } else {
          const nextItem = items[index + 1];
          db.prepare(`
            UPDATE execution_tasks
            SET current_test_case_id = ?,
                current_item_label = ?
            WHERE id = ?
          `).run(nextItem.test_case_id, nextItem.title, taskId);

          broadcast({
            type: "EXECUTION_TASK_UPDATED",
            task: decorateTaskRetryMeta(db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord),
          });
        }

        broadcast({
          type: "SIMULATION_COMPLETE",
          taskId,
          testCaseId: item.test_case_id,
          result,
        });
      }
    };

    const runner = executeSequentially();
    activeTaskRuns.set(taskId, []);
    runner.catch((error) => {
      console.error("Execution task failed:", error);
      completeTask(EXECUTION_STATUS.COMPLETED, error instanceof Error ? error.message : "Task failed");
    });
  };

  const cancelExecutionTask = (taskId: number) => {
    const task = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task || ![EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(task.status)) {
      return false;
    }

    const timers = activeTaskRuns.get(taskId) || [];
    timers.forEach(timer => clearTimeout(timer));
    activeTaskRuns.delete(taskId);
    const activeChild = activeTaskChildren.get(taskId);
    if (activeChild) {
      activeChild.kill("SIGTERM");
      activeTaskChildren.delete(taskId);
    }

    db.prepare(`
      UPDATE execution_task_items
      SET status = CASE WHEN status = 'COMPLETED' THEN status ELSE 'CANCELLED' END,
          failure_category = CASE WHEN status = 'COMPLETED' THEN failure_category ELSE 'ENVIRONMENT' END,
          finished_at = CASE WHEN status = 'COMPLETED' THEN finished_at ELSE CURRENT_TIMESTAMP END
      WHERE task_id = ?
    `).run(taskId);
    updateTaskCounters(taskId);

    db.prepare(`
      UPDATE execution_tasks
      SET status = 'CANCELLED',
          current_test_case_id = NULL,
          current_item_label = NULL,
          finished_at = CURRENT_TIMESTAMP,
          error_message = 'Cancelled by user',
          failure_category = 'ENVIRONMENT'
      WHERE id = ?
    `).run(taskId);

    const runningItems = db.prepare(`
      SELECT test_case_id
      FROM execution_task_items
      WHERE task_id = ? AND status = 'RUNNING'
    `).all(taskId) as Array<{ test_case_id: number }>;
    runningItems.forEach(item => {
      db.prepare("UPDATE test_cases SET status = 'Draft' WHERE id = ?").run(item.test_case_id);
    });

    const cancelledTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord;
    broadcast({
      type: "EXECUTION_TASK_COMPLETED",
      task: decorateTaskRetryMeta(cancelledTask),
    });
    scheduleTaskArtifactCleanup(cancelledTask);

    return true;
  };

  const scheduleSuiteRun = (suiteRunId: number, suiteId: number) => {
    const suiteCases = db.prepare(`
      SELECT tc.*
      FROM test_suite_cases tsc
      JOIN test_cases tc ON tc.id = tsc.test_case_id
      WHERE tsc.suite_id = ?
      ORDER BY tsc.sort_order ASC, tsc.id ASC
    `).all(suiteId) as Array<Record<string, any>>;

    if (suiteCases.length === 0) {
      db.prepare("UPDATE suite_runs SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(suiteRunId);
      return;
    }

    const collectedResults: string[] = [];
    const timers: NodeJS.Timeout[] = [];

    suiteCases.forEach((testCase, index) => {
      const startDelay = index * 1800;
      const startTimer = setTimeout(() => {
        db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(testCase.id);
        db.prepare("UPDATE suite_runs SET status = 'RUNNING', current_case_id = ? WHERE id = ?").run(testCase.id, suiteRunId);
        broadcast({
          type: "SUITE_CASE_STARTED",
          suiteRunId,
          suiteId,
          testCaseId: testCase.id,
          title: testCase.title,
        });
      }, startDelay);
      timers.push(startTimer);

      const finishTimer = setTimeout(() => {
        const results: TestResult[] = [TEST_RESULT.PASSED, TEST_RESULT.FAILED, TEST_RESULT.BLOCKED];
        const result = results[Math.floor(Math.random() * results.length)];
        const duration = Math.floor(Math.random() * 240) + 60;
        const logs = `Suite run ${suiteRunId}: ${testCase.title} finished with ${result}`;

        collectedResults.push(result);
        const progress = buildSuiteRunProgress(collectedResults);

        db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(result, testCase.id);
        db.prepare("INSERT INTO test_runs (test_case_id, result, logs, duration, executed_by) VALUES (?, ?, ?, ?, ?)")
          .run(testCase.id, result, logs, duration, "Suite-Orchestrator");

        const isLast = index === suiteCases.length - 1;
        const nextCaseId = isLast ? null : suiteCases[index + 1].id;
        db.prepare(`
          UPDATE suite_runs
          SET completed_cases = ?,
              passed_cases = ?,
              failed_cases = ?,
              blocked_cases = ?,
              current_case_id = ?,
              status = ?,
              finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
          WHERE id = ?
        `).run(
          progress.completedCases,
          progress.passedCases,
          progress.failedCases,
          progress.blockedCases,
          nextCaseId,
          isLast ? "COMPLETED" : "RUNNING",
          isLast ? 1 : 0,
          suiteRunId
        );

        broadcast({
          type: "SUITE_CASE_COMPLETED",
          suiteRunId,
          suiteId,
          testCaseId: testCase.id,
          title: testCase.title,
          result,
          progress: {
            ...progress,
            totalCases: suiteCases.length,
          },
        });

        if (isLast) {
          broadcast({
            type: "SUITE_RUN_COMPLETED",
            suiteRunId,
            suiteId,
            status: "COMPLETED",
            progress: {
              ...progress,
              totalCases: suiteCases.length,
            },
          });
          activeSuiteRuns.delete(suiteRunId);
        }
      }, startDelay + 1200);
      timers.push(finishTimer);
    });

    activeSuiteRuns.set(suiteRunId, timers);
  };

  // API Routes
  app.get("/api/test-cases", (req, res) => {
    const cases = db.prepare("SELECT * FROM test_cases ORDER BY created_at DESC").all();
    res.json(cases);
  });

  app.get("/api/tasks", (req, res) => {
    res.json(listExecutionTasks());
  });

  app.get("/api/dashboard/recent-runs", (req, res) => {
    const runs = db.prepare(`
      SELECT
        tr.id,
        tr.test_case_id,
        tr.result,
        tr.logs,
        tr.duration,
        tr.executed_by,
        tr.executed_at,
        tc.title as test_case_title,
        tc.category,
        tc.protocol,
        tc.status as test_case_status,
        et.id as task_id,
        et.type as task_type,
        et.status as task_status,
        a.name as asset_name
      FROM test_runs tr
      JOIN test_cases tc ON tc.id = tr.test_case_id
      LEFT JOIN execution_task_items eti ON eti.run_id = tr.id
      LEFT JOIN execution_tasks et ON et.id = eti.task_id
      LEFT JOIN assets a ON a.id = et.asset_id
      ORDER BY tr.executed_at DESC, tr.id DESC
      LIMIT 10
    `).all();
    res.json(runs);
  });

  app.get("/api/tasks/:id", (req, res) => {
    const taskId = Number(req.params.id);
    const detail = getExecutionTaskDetail(taskId);
    if (!detail) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(detail);
  });

  app.post("/api/tasks", (req, res) => {
    const { type, test_case_id, suite_id, asset_id, stop_on_failure } = req.body as {
      type?: "single" | "suite";
      test_case_id?: number;
      suite_id?: number;
      asset_id?: number;
      stop_on_failure?: boolean;
    };

    if (type === "single") {
      if (!test_case_id) {
        return res.status(400).json({ error: "test_case_id is required" });
      }
      const testCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(test_case_id);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }

      const taskId = createExecutionTask({
        type: "single",
        assetId: asset_id || null,
        testCaseId: test_case_id,
        testCaseIds: [test_case_id],
        initiatedBy: "User",
        stopOnFailure: Boolean(stop_on_failure),
      });
      scheduleExecutionTask(taskId);
      return res.json({ id: taskId, success: true });
    }

    if (type === "suite") {
      if (!suite_id) {
        return res.status(400).json({ error: "suite_id is required" });
      }
      const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(suite_id);
      if (!suite) {
        return res.status(404).json({ error: "Suite not found" });
      }

      const suiteCases = db.prepare(`
        SELECT test_case_id
        FROM test_suite_cases
        WHERE suite_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(suite_id) as Array<{ test_case_id: number }>;

      if (suiteCases.length === 0) {
        return res.status(400).json({ error: "Suite has no test cases" });
      }

      const existingRun = db.prepare(`
        SELECT id
        FROM execution_tasks
        WHERE suite_id = ? AND status IN ('PENDING', 'RUNNING')
        ORDER BY started_at DESC
        LIMIT 1
      `).get(suite_id);
      if (existingRun) {
        return res.status(409).json({ error: "Suite is already running" });
      }

      const taskId = createExecutionTask({
        type: "suite",
        assetId: asset_id || null,
        suiteId: suite_id,
        testCaseIds: suiteCases.map(item => item.test_case_id),
        initiatedBy: "User",
        stopOnFailure: Boolean(stop_on_failure),
      });
      scheduleExecutionTask(taskId);
      return res.json({ id: taskId, success: true });
    }

    return res.status(400).json({ error: "Unsupported task type" });
  });

  app.post("/api/test-runs", (req, res) => {
    const { test_case_id, test_case_ids, asset_id, stop_on_failure, runtime_inputs } = req.body;
    const testCaseIds = Array.isArray(test_case_ids)
      ? test_case_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
      : Number.isFinite(Number(test_case_id))
        ? [Number(test_case_id)]
        : [];
    if (testCaseIds.length === 0) {
      return res.status(400).json({ error: "At least one test case is required" });
    }
    const existingCases = db.prepare(`SELECT id FROM test_cases WHERE id IN (${testCaseIds.map(() => "?").join(",")})`).all(...testCaseIds) as Array<{ id: number }>;
    if (existingCases.length !== testCaseIds.length) {
      return res.status(404).json({ error: "One or more test cases were not found" });
    }
    const primaryTestCaseId = testCaseIds[0];

    const taskId = createExecutionTask({
      type: testCaseIds.length > 1 ? "suite" : "single",
      assetId: asset_id ? Number(asset_id) : null,
      testCaseId: primaryTestCaseId,
      testCaseIds,
      initiatedBy: "User",
      stopOnFailure: Boolean(stop_on_failure),
      runtimeInputs: runtime_inputs && typeof runtime_inputs === "object" ? runtime_inputs : {},
    });
    scheduleExecutionTask(taskId);
    res.json({ id: taskId, success: true });
  });

  app.post("/api/test-cases", (req, res) => {
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs } = req.body;
    const info = db.prepare(
      `INSERT INTO test_cases (
        title, category, type, protocol, description, steps, test_input, test_tool,
        expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      category,
      type,
      protocol,
      description,
      JSON.stringify(steps),
      test_input,
      test_tool,
      expected_result,
      automation_level,
      executor_type || "python",
      script_path || "",
      command_template || "",
      args_template || "",
      Number(timeout_sec || 300),
      JSON.stringify(Array.isArray(required_inputs) ? required_inputs : []),
      JSON.stringify(default_runtime_inputs && typeof default_runtime_inputs === "object" ? default_runtime_inputs : {})
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/test-cases/import", (req, res) => {
    const { cases } = req.body;
    const insert = db.prepare(`
      INSERT INTO test_cases (category, title, test_input, test_tool, steps, expected_result, automation_level, type, protocol, description, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        const category = String(item.category || item.module || "未分类").trim();
        const normalizedSteps = Array.isArray(item.steps)
          ? item.steps.map((step: string) => String(step).trim()).filter(Boolean)
          : String(item.steps || "")
              .split(/\r?\n/)
              .map((step: string) => step.trim())
              .filter(Boolean);
        const protocol = String(
          item.protocol ||
          (category === "CAN总线" ? "CAN" :
          category.includes("蓝牙") ? "BLE" :
          category === "车云通信" ? "Ethernet" :
          category.includes("无线电") ? "WiFi" : "Other")
        ).trim();
        const type = String(item.type || (item.automation_level === "A" ? "Automated" : "Manual")).trim();

        insert.run(
          category,
          item.title,
          item.test_input || "",
          item.test_tool || "",
          JSON.stringify(normalizedSteps),
          item.expected_result || "",
          item.automation_level || "B",
          type,
          protocol,
          item.description || "",
          item.executor_type || "python",
          item.script_path || "",
          item.command_template || "",
          item.args_template || "",
          Number(item.timeout_sec || 300),
          JSON.stringify(Array.isArray(item.required_inputs) ? item.required_inputs : []),
          JSON.stringify(item.default_runtime_inputs && typeof item.default_runtime_inputs === "object" ? item.default_runtime_inputs : {})
        );
      }
    });

    transaction(cases);
    res.json({ success: true, count: cases.length });
  });

  app.patch("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs } = req.body;
    db.prepare(
      `UPDATE test_cases
       SET title = ?, category = ?, type = ?, protocol = ?, description = ?, steps = ?, test_input = ?, test_tool = ?, expected_result = ?, automation_level = ?,
           executor_type = ?, script_path = ?, command_template = ?, args_template = ?, timeout_sec = ?, required_inputs = ?, default_runtime_inputs = ?
       WHERE id = ?`
    ).run(
      title,
      category,
      type,
      protocol,
      description,
      JSON.stringify(steps),
      test_input,
      test_tool,
      expected_result,
      automation_level,
      executor_type || "python",
      script_path || "",
      command_template || "",
      args_template || "",
      Number(timeout_sec || 300),
      JSON.stringify(Array.isArray(required_inputs) ? required_inputs : []),
      JSON.stringify(default_runtime_inputs && typeof default_runtime_inputs === "object" ? default_runtime_inputs : {}),
      id
    );
    res.json({ success: true });
  });

  app.delete("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM test_suite_cases WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM execution_task_items WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM execution_tasks WHERE test_case_id = ? OR current_test_case_id = ?").run(id, id);
    db.prepare("DELETE FROM test_runs WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.patch("/api/test-cases/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(status, id);
    
    // If it's a final state, record a test run to update stats
    const normalizedResult = normalizeTestResult(status, TEST_RESULT.ERROR);
    if ([TEST_RESULT.PASSED, TEST_RESULT.FAILED, TEST_RESULT.BLOCKED, TEST_RESULT.ERROR].includes(normalizedResult)) {
      db.prepare("INSERT INTO test_runs (test_case_id, result, executed_by) VALUES (?, ?, ?)")
        .run(id, normalizedResult, 'System');
    }
    
    res.json({ success: true });
  });

  app.get("/api/stats", (req, res) => {
    const stats = {
      total: db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count,
      automated: db.prepare("SELECT COUNT(*) as count FROM test_cases WHERE type = 'Automated'").get().count,
      manual: db.prepare("SELECT COUNT(*) as count FROM test_cases WHERE type = 'Manual'").get().count,
      results: db.prepare("SELECT result, COUNT(*) as count FROM test_runs GROUP BY result").all()
    };
    res.json(stats);
  });

  app.get("/api/stats/trend", (req, res) => {
    // Query real data from test_runs for the last 7 days
    const trend = db.prepare(`
      SELECT 
        date(executed_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN result = 'PASSED' THEN 1 ELSE 0 END) as passed
      FROM test_runs
      WHERE executed_at >= date('now', '-7 days')
      GROUP BY date(executed_at)
      ORDER BY date ASC
    `).all();

    // Map to the format frontend expects
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const formatted = trend.map(t => ({
      date: days[new Date(t.date).getDay()],
      passRate: t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0,
      runs: t.total
    }));

    res.json(formatted);
  });

  app.get("/api/stats/coverage", (req, res) => {
    // Calculate coverage based on test cases per category
    const coverage = db.prepare(`
      SELECT 
        category as name,
        COUNT(*) as total,
        SUM(CASE WHEN UPPER(status) = 'PASSED' THEN 1 ELSE 0 END) as passed
      FROM test_cases
      GROUP BY category
    `).all();

    const formatted = coverage.map(c => ({
      name: c.name,
      coverage: c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0,
      status: (c.passed / c.total) > 0.8 ? 'Passed' : (c.passed / c.total) > 0.5 ? 'Warning' : 'Critical'
    }));

    res.json(formatted);
  });

  // 获取特定测试用例的历史记录
  app.get("/api/test-cases/:id/history", (req, res) => {
    const { id } = req.params;
    const runs = db.prepare(`
      SELECT * FROM test_runs 
      WHERE test_case_id = ? 
      ORDER BY executed_at DESC
    `).all(id);
    res.json(runs);
  });

  // 模拟执行测试用例
  app.post("/api/test-cases/:id/run", (req, res) => {
    const testCaseId = Number(req.params.id);
    const { stop_on_failure } = req.body || {};
    const testCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(testCaseId);
    if (!testCase) {
      return res.status(404).json({ error: "Test case not found" });
    }

    const taskId = createExecutionTask({
      type: "single",
      testCaseId,
      testCaseIds: [testCaseId],
      initiatedBy: "User",
      stopOnFailure: Boolean(stop_on_failure),
    });
    scheduleExecutionTask(taskId);

    res.json({ success: true, taskId });
  });

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value === 'true';
      return acc;
    }, {});
    res.json(settingsMap);
  });

  app.patch("/api/settings/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
    res.json({ success: true });
  });

  app.get("/api/defects", (req, res) => {
    const defects = db.prepare("SELECT * FROM defects ORDER BY created_at DESC").all();
    res.json(defects);
  });

  app.post("/api/defects/:id/analyze", async (req, res) => {
    try {
      const { id } = req.params;
      const defect = db.prepare("SELECT * FROM defects WHERE id = ?").get(id) as DefectRecord | undefined;
      if (!defect) {
        return res.status(404).json({ error: "Defect not found" });
      }

      const result = await generateDefectAnalysis(defect);
      res.json(result);
    } catch (error) {
      console.error("Failed to analyze defect:", error);
      res.status(500).json({ error: "Failed to analyze defect" });
    }
  });

  app.get("/api/reports/export", (req, res) => {
    const html = buildReportHtml();
    const fileName = `iov-core-report-${new Date().toISOString().slice(0, 10)}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(html);
  });

  app.get("/api/test-suites", (req, res) => {
    res.json(listTestSuites());
  });

  app.get("/api/test-suites/:id", (req, res) => {
    const { id } = req.params;
    const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(id);
    if (!suite) {
      return res.status(404).json({ error: "Suite not found" });
    }

    const cases = db.prepare(`
      SELECT tc.*, tsc.sort_order
      FROM test_suite_cases tsc
      JOIN test_cases tc ON tc.id = tsc.test_case_id
      WHERE tsc.suite_id = ?
      ORDER BY tsc.sort_order ASC, tsc.id ASC
    `).all(id);

    res.json({ ...suite, cases });
  });

  app.post("/api/test-suites", (req, res) => {
    const { name, description, test_case_ids } = req.body as { name?: string; description?: string; test_case_ids?: number[] };
    if (!name?.trim()) {
      return res.status(400).json({ error: "Suite name is required" });
    }
    if (!Array.isArray(test_case_ids) || test_case_ids.length === 0) {
      return res.status(400).json({ error: "At least one test case is required" });
    }

    const transaction = db.transaction(() => {
      const suiteInfo = db.prepare("INSERT INTO test_suites (name, description) VALUES (?, ?)").run(name.trim(), description?.trim() || null);
      const suiteId = Number(suiteInfo.lastInsertRowid);
      const insertCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
      test_case_ids.forEach((testCaseId, index) => {
        insertCase.run(suiteId, testCaseId, index + 1);
      });
      return suiteId;
    });

    const suiteId = transaction();
    res.json({ id: suiteId });
  });

  app.delete("/api/test-suites/:id", (req, res) => {
    const { id } = req.params;
    const taskIds = db.prepare("SELECT id FROM execution_tasks WHERE suite_id = ?").all(id) as Array<{ id: number }>;
    taskIds.forEach(({ id: taskId }) => db.prepare("DELETE FROM execution_task_items WHERE task_id = ?").run(taskId));
    db.prepare("DELETE FROM execution_tasks WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM suite_runs WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM test_suite_cases WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM test_suites WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/suite-runs", (req, res) => {
    res.json(listSuiteRuns());
  });

  app.patch("/api/tasks/:id/cancel", (req, res) => {
    const taskId = Number(req.params.id);
    const success = cancelExecutionTask(taskId);
    if (!success) {
      return res.status(409).json({ error: "Task cannot be cancelled" });
    }
    res.json({ success: true });
  });

  app.post("/api/tasks/:id/retry", (req, res) => {
    const taskId = Number(req.params.id);
    const originalTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!originalTask) {
      return res.status(404).json({ error: "Task not found" });
    }
    const retryDecision = getRetryDecision(originalTask);
    if (!retryDecision.canRetry) {
      return res.status(409).json({ error: retryDecision.reason || "Task is not retryable" });
    }
    const cloned = cloneExecutionTask(taskId);
    if (!cloned) {
      return res.status(404).json({ error: "Task not found" });
    }
    if ("error" in cloned) {
      return res.status(409).json({ error: cloned.error });
    }

    scheduleExecutionTask(cloned.taskId);
    res.json({ success: true, id: cloned.taskId });
  });

  app.post("/api/test-suites/:id/run", (req, res) => {
    const suiteId = Number(req.params.id);
    const { stop_on_failure, asset_id, runtime_inputs } = req.body || {};
    const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(suiteId);
    if (!suite) {
      return res.status(404).json({ error: "Suite not found" });
    }
    const assetId = Number(asset_id);
    if (!assetId) {
      return res.status(400).json({ error: "asset_id is required for suite execution" });
    }
    const asset = db.prepare("SELECT id, status FROM assets WHERE id = ?").get(assetId) as { id: number; status: string } | undefined;
    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }
    if (asset.status !== "Online") {
      return res.status(409).json({ error: "Asset is not online" });
    }

    const suiteCases = db.prepare("SELECT test_case_id FROM test_suite_cases WHERE suite_id = ? ORDER BY sort_order ASC, id ASC").all(suiteId) as Array<{ test_case_id: number }>;
    if (suiteCases.length === 0) {
      return res.status(400).json({ error: "Suite has no test cases" });
    }

    const existingRun = db.prepare(`
      SELECT id
      FROM execution_tasks
      WHERE suite_id = ? AND status IN ('PENDING', 'RUNNING')
      ORDER BY started_at DESC
      LIMIT 1
    `).get(suiteId);
    if (existingRun) {
      return res.status(409).json({ error: "Suite is already running" });
    }

    const taskId = createExecutionTask({
      type: "suite",
      assetId,
      suiteId,
      testCaseIds: suiteCases.map(item => item.test_case_id),
      initiatedBy: "User",
      stopOnFailure: Boolean(stop_on_failure),
      runtimeInputs: runtime_inputs && typeof runtime_inputs === "object" ? runtime_inputs : {},
    });
    scheduleExecutionTask(taskId);

    res.json({ id: taskId, success: true });
  });

  app.get("/api/assets", (req, res) => {
    const assets = db.prepare(`
      SELECT
        id,
        name,
        status,
        type,
        COALESCE(NULLIF(hardware_version, ''), '-') as hardware_version,
        COALESCE(NULLIF(software_version, ''), NULLIF(version, ''), 'v1.0.0') as software_version,
        COALESCE(connection_address, '') as connection_address,
        COALESCE(description, '') as description,
        created_at
      FROM assets
      ORDER BY created_at DESC
    `).all();
    res.json(assets);
  });

  app.post("/api/assets", (req, res) => {
    const { name, status, type, hardware_version, software_version, connection_address, description } = req.body;
    if (!name || !status || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const normalizedSoftwareVersion = String(software_version || '').trim() || 'v1.0.0';
    const normalizedHardwareVersion = String(hardware_version || '').trim() || '-';
    const normalizedConnectionAddress = String(connection_address || '').trim();
    const normalizedDescription = String(description || '').trim();
    const result = db.prepare(`
      INSERT INTO assets (name, status, version, hardware_version, software_version, connection_address, description, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      status,
      normalizedSoftwareVersion,
      normalizedHardwareVersion,
      normalizedSoftwareVersion,
      normalizedConnectionAddress,
      normalizedDescription,
      type
    );
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/assets/:id", (req, res) => {
    const assetId = Number(req.params.id);
    const existingAsset = db.prepare("SELECT id FROM assets WHERE id = ?").get(assetId);
    if (!existingAsset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const { name, status, type, hardware_version, software_version, connection_address, description } = req.body;
    if (!name || !status || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedSoftwareVersion = String(software_version || '').trim() || 'v1.0.0';
    const normalizedHardwareVersion = String(hardware_version || '').trim() || '-';
    const normalizedConnectionAddress = String(connection_address || '').trim();
    const normalizedDescription = String(description || '').trim();

    db.prepare(`
      UPDATE assets
      SET name = ?,
          status = ?,
          type = ?,
          version = ?,
          hardware_version = ?,
          software_version = ?,
          connection_address = ?,
          description = ?
      WHERE id = ?
    `).run(
      name,
      status,
      type,
      normalizedSoftwareVersion,
      normalizedHardwareVersion,
      normalizedSoftwareVersion,
      normalizedConnectionAddress,
      normalizedDescription,
      assetId
    );

    res.json({ success: true });
  });

  app.post("/api/assets/:id/ping", async (req, res) => {
    const assetId = Number(req.params.id);
    const asset = db.prepare(`
      SELECT
        id,
        name,
        COALESCE(connection_address, '') as connection_address
      FROM assets
      WHERE id = ?
    `).get(assetId) as { id: number; name: string; connection_address: string } | undefined;

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    if (!asset.connection_address) {
      return res.status(400).json({ error: "Asset connection address is empty" });
    }

    const result = await pingAddress(asset.connection_address);
    if (!result.success) {
      return res.status(502).json({
        success: false,
        asset_id: asset.id,
        name: asset.name,
        address: asset.connection_address,
        output: result.output,
      });
    }

    res.json({
      success: true,
      asset_id: asset.id,
      name: asset.name,
      address: asset.connection_address,
      latency_ms: result.latency_ms,
      output: result.output,
    });
  });

  app.delete("/api/assets/:id", (req, res) => {
    const assetId = Number(req.params.id);
    const asset = db.prepare("SELECT id, name FROM assets WHERE id = ?").get(assetId);
    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const activeTask = db.prepare(`
      SELECT id
      FROM execution_tasks
      WHERE asset_id = ? AND status IN ('PENDING', 'RUNNING')
      LIMIT 1
    `).get(assetId);

    if (activeTask) {
      return res.status(409).json({ error: "Asset is currently bound to an active task" });
    }

    db.prepare("UPDATE execution_tasks SET asset_id = NULL WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Seed demo data only when explicitly enabled.
  const count = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
  if (ENABLE_DEMO_SEED && count === 0) {
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
    seedCases.forEach(c => insert.run(c.title, c.category, c.type, c.protocol, c.description, c.status, c.steps));

    // Seed some test runs
    const insertRun = db.prepare("INSERT INTO test_runs (test_case_id, result, logs, duration, executed_by) VALUES (?, ?, ?, ?, ?)");
    insertRun.run(1, 'ERROR', 'CAN traffic high load...', 765, 'System');
    insertRun.run(2, 'PASSED', 'OTA update successful', 192, 'Admin');
    insertRun.run(3, 'PASSED', 'Diagnostics clear', 485, 'Tester');
    insertRun.run(4, 'FAILED', 'Thermal threshold exceeded', 320, 'System');

    // Seed defects
    const insertDefect = db.prepare("INSERT INTO defects (id, description, module, severity, status) VALUES (?, ?, ?, ?, ?)");
    insertDefect.run('DTC-0821', 'CAN 总线信号丢失 - 转向柱模块', 'GW', 'Critical', 'Open');
    insertDefect.run('SEC-442', '未授权的 SSH 访问尝试', 'T-Box', 'Critical', 'In Review');
    insertDefect.run('LOG-102', '电池包温度传感器读数异常', 'BMS', 'Major', 'Fixed');
    insertDefect.run('UI-009', '中控屏启动动画掉帧', 'IVI', 'Minor', 'Closed');

    // Seed assets
    const insertAsset = db.prepare(`
      INSERT INTO assets (name, status, version, hardware_version, software_version, description, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertAsset.run('GW-01 (Gateway)', 'Online', 'v2.4.1', 'HW-GW-01', 'v2.4.1', '主网关验证节点', 'Hardware');
    insertAsset.run('TBOX-PRO-X', 'Online', 'v4.0.2', 'HW-TBOX-X', 'v4.0.2', 'T-Box 样机', 'Hardware');
    insertAsset.run('ADAS-SIM-NODE', 'Offline', 'v1.1.0', 'SIM-ADAS-01', 'v1.1.0', 'ADAS 仿真节点', 'Simulation');
    insertAsset.run('BMS-UNIT-04', 'Online', 'v3.2.2', 'HW-BMS-04', 'v3.2.2', 'BMS 试验样件', 'Hardware');

    const suiteInfo = db.prepare("INSERT INTO test_suites (name, description) VALUES (?, ?)").run(
      "核心 ECU 回归套件",
      "覆盖 Gateway、T-Box、ADAS 和 BMS 的基础回归验证。"
    );
    const suiteId = Number(suiteInfo.lastInsertRowid);
    const insertSuiteCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
    [1, 3, 4, 5].forEach((testCaseId, index) => insertSuiteCase.run(suiteId, testCaseId, index + 1));
  }

  const baselineSuiteId = ensureSecurityBaselineSuite();
  if (baselineSuiteId) {
    console.log(`[suite] Security baseline suite ready (id=${baselineSuiteId})`);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
