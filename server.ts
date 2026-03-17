import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";

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

type ExecutionTaskRecord = {
  id: number;
  type: "single" | "suite";
  status: "Queued" | "Running" | "Completed" | "Failed" | "Cancelled";
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
  asset_name?: string | null;
  connection_address?: string | null;
};

type StepExecutionResult = {
  name: string;
  result: "Passed" | "Failed" | "Blocked" | "Running" | "Skipped";
  logs?: string;
  duration?: number;
};

type ExecutorResult = {
  result: "Passed" | "Failed" | "Blocked";
  duration: number;
  logs: string;
  summary?: string;
  stepResults?: StepExecutionResult[];
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
      SUM(CASE WHEN status = 'Passed' THEN 1 ELSE 0 END) as passedCases,
      SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) as failedCases,
      SUM(CASE WHEN status = 'Running' THEN 1 ELSE 0 END) as runningCases
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
      SUM(CASE WHEN status = 'Passed' THEN 1 ELSE 0 END) as passed
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
    if (result === "Passed") acc.passedCases += 1;
    if (result === "Failed") acc.failedCases += 1;
    if (result === "Blocked") acc.blockedCases += 1;
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
    status TEXT DEFAULT 'Draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_case_id INTEGER,
    result TEXT,            -- Pass, Fail, Blocked
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
    status TEXT DEFAULT 'Queued',
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
    status TEXT NOT NULL DEFAULT 'Queued',
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
    source_task_id INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
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
    status TEXT NOT NULL DEFAULT 'Queued',
    result TEXT,
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
const columns = ['test_input', 'test_tool', 'expected_result', 'automation_level', 'executor_type', 'script_path', 'command_template', 'args_template', 'timeout_sec'];
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

["executor TEXT DEFAULT 'python'", "source_task_id INTEGER", "retry_count INTEGER NOT NULL DEFAULT 0"].forEach(definition => {
  const columnName = definition.split(" ")[0];
  try {
    db.exec(`ALTER TABLE execution_tasks ADD COLUMN ${definition};`);
  } catch (e) {
    // Ignore error if column already exists
  }
});

async function startServer() {
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
      CASE WHEN et.status IN ('Running', 'Queued') THEN 0 ELSE 1 END,
      et.started_at DESC
    LIMIT 50
  `).all();

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

    return { task, items };
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
      CASE WHEN et.status IN ('Running', 'Queued') THEN 0 ELSE 1 END,
      et.started_at DESC
    LIMIT 20
  `).all();

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
  }) => {
    const transaction = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO execution_tasks (type, status, asset_id, suite_id, test_case_id, total_items, current_test_case_id, initiated_by, stop_on_failure, executor, source_task_id, retry_count)
        VALUES (?, 'Queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    if (["Queued", "Running"].includes(task.status)) return { error: "Task is still active" } as const;

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
      sourceTaskId: task.id,
      retryCount: Number(task.retry_count || 0) + 1,
    });
    return { taskId: newTaskId } as const;
  };

  const simulateExecutor: TaskExecutor = async (task, item, broadcastEvent) => {
    const results: Array<"Passed" | "Failed" | "Blocked"> = ["Passed", "Failed", "Blocked"];
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
    try {
      const lines = result.logs.split("\n").filter(Boolean);
      const lastJsonLine = [...lines].reverse().find((line) => {
        const normalized = line.replace(/^\[(stdout|stderr)\]\s*/i, "").trim();
        return normalized.startsWith("{") && normalized.endsWith("}");
      });
      if (!lastJsonLine) {
        return result;
      }
      const parsed = JSON.parse(lastJsonLine.replace(/^\[(stdout|stderr)\]\s*/i, "").trim());
      return {
        result: parsed.result || result.result,
        duration: Number(parsed.duration || result.duration),
        logs: parsed.logs || result.logs,
        summary: parsed.summary || parsed.logs || result.summary,
        stepResults: Array.isArray(parsed.steps) ? parsed.steps : result.stepResults,
      } as ExecutorResult;
    } catch {
      return result;
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
          result: "Blocked",
          duration: 0,
          logs: "EXECUTION_SCRIPT is not configured",
        });
        return;
      }

      const startedAt = Date.now();
      const output: string[] = [];
      const child = spawn(command, { shell: true, cwd: process.cwd(), env: process.env });
      registerChild(child);

      const handleChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
        const text = chunk.toString().trim();
        if (!text) return;
        output.push(`[${stream}] ${text}`);
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
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        if (signal === "SIGTERM") {
          resolve({
            result: "Blocked",
            duration,
            logs: output.join("\n") || "Execution cancelled",
          });
          return;
        }
        resolve(parseExecutorOutput({
          result: code === 0 ? "Passed" : "Failed",
          duration,
          logs: output.join("\n") || `Script exited with code ${code ?? -1}`,
        }));
      });
    });

  const shellExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const inlineShellCommand = item.test_tool?.startsWith("shell:") ? item.test_tool.slice("shell:".length).trim() : null;
    const command = inlineShellCommand || buildScriptCommand(task, item);
    return spawnCommandExecutor(command || "", task, item, broadcastEvent, registerChild);
  };

  const pythonExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iov-core-task-"));
    const payloadPath = path.join(tempDir, "payload.json");
    const payload = {
      task,
      item,
      testCase: {
        id: item.test_case_id,
        title: item.title,
        category: item.category,
        protocol: item.protocol,
        description: item.description,
        test_input: item.test_input,
        test_tool: item.test_tool,
        expected_result: item.expected_result,
      },
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
    return spawnCommandExecutor(command, task, item, broadcastEvent, registerChild).finally(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });
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
    registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
  ) => {
    const adapter = resolveExecutorAdapter(task, item);
    db.prepare("UPDATE execution_tasks SET executor = ? WHERE id = ?").run(adapter.name, task.id);
    return adapter.run(task, item, broadcast, registerChild);
  };

  const updateTaskCounters = (taskId: number) => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN result = 'Passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN result = 'Failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN result = 'Blocked' THEN 1 ELSE 0 END) as blocked
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
      db.prepare("UPDATE execution_tasks SET status = 'Completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
      return;
    }

    const completeTask = (status: "Completed" | "Failed" | "Cancelled" = "Completed", errorMessage?: string | null) => {
      updateTaskCounters(taskId);
      db.prepare(`
        UPDATE execution_tasks
        SET status = ?,
            current_test_case_id = NULL,
            current_item_label = NULL,
            finished_at = CURRENT_TIMESTAMP,
            error_message = ?
        WHERE id = ?
      `).run(status, errorMessage || null, taskId);

      const completedTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId);
      broadcast({ type: "EXECUTION_TASK_COMPLETED", task: completedTask });
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
        if (!latestTask || ["Cancelled", "Failed"].includes(latestTask.status)) {
          break;
        }

        db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(item.test_case_id);
        db.prepare(`
          UPDATE execution_task_items
          SET status = 'Running',
              started_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.id);
        db.prepare(`
          UPDATE execution_tasks
          SET status = 'Running',
              current_test_case_id = ?,
              current_item_label = ?
          WHERE id = ?
        `).run(item.test_case_id, item.title, taskId);

        broadcast({
          type: "EXECUTION_TASK_UPDATED",
          task: db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId),
        });
        const refreshedTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord;
        const { result, duration, logs, summary, stepResults } = await runTaskItem(refreshedTask, item, (child) => {
          if (child) {
            activeTaskChildren.set(taskId, child);
          } else {
            activeTaskChildren.delete(taskId);
          }
        });

        const currentTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (!currentTask || currentTask.status === "Cancelled") {
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
          SET status = 'Completed',
              result = ?,
              run_id = ?,
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(result, Number(runInfo.lastInsertRowid), item.id);

        updateTaskCounters(taskId);

        const isLast = index === items.length - 1;
        const stopOnFailureTriggered = Boolean(currentTask.stop_on_failure) && result === "Failed";
        if (stopOnFailureTriggered) {
          db.prepare(`
            UPDATE execution_task_items
            SET status = 'Cancelled',
                finished_at = CURRENT_TIMESTAMP
            WHERE task_id = ? AND sort_order > ?
          `).run(taskId, item.sort_order);
          completeTask("Failed", `Task stopped after failure on ${item.title}`);
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
            task: db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId),
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
      completeTask("Failed", error instanceof Error ? error.message : "Task failed");
    });
  };

  const cancelExecutionTask = (taskId: number) => {
    const task = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task || !["Queued", "Running"].includes(task.status)) {
      return false;
    }

    const timers = activeTaskRuns.get(taskId) || [];
    timers.forEach(timer => clearTimeout(timer));
    activeTaskRuns.delete(taskId);

    db.prepare(`
      UPDATE execution_task_items
      SET status = CASE WHEN status = 'Completed' THEN status ELSE 'Cancelled' END,
          finished_at = CASE WHEN status = 'Completed' THEN finished_at ELSE CURRENT_TIMESTAMP END
      WHERE task_id = ?
    `).run(taskId);

    db.prepare(`
      UPDATE execution_tasks
      SET status = 'Cancelled',
          current_test_case_id = NULL,
          current_item_label = NULL,
          finished_at = CURRENT_TIMESTAMP,
          error_message = 'Cancelled by user'
      WHERE id = ?
    `).run(taskId);

    const runningItems = db.prepare(`
      SELECT test_case_id
      FROM execution_task_items
      WHERE task_id = ? AND status = 'Running'
    `).all(taskId) as Array<{ test_case_id: number }>;
    runningItems.forEach(item => {
      db.prepare("UPDATE test_cases SET status = 'Draft' WHERE id = ?").run(item.test_case_id);
    });

    broadcast({
      type: "EXECUTION_TASK_COMPLETED",
      task: db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId),
    });

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
      db.prepare("UPDATE suite_runs SET status = 'Completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(suiteRunId);
      return;
    }

    const collectedResults: string[] = [];
    const timers: NodeJS.Timeout[] = [];

    suiteCases.forEach((testCase, index) => {
      const startDelay = index * 1800;
      const startTimer = setTimeout(() => {
        db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(testCase.id);
        db.prepare("UPDATE suite_runs SET status = 'Running', current_case_id = ? WHERE id = ?").run(testCase.id, suiteRunId);
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
        const results = ["Passed", "Failed", "Blocked"];
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
          isLast ? "Completed" : "Running",
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
            status: "Completed",
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
        WHERE suite_id = ? AND status IN ('Queued', 'Running')
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
    const { test_case_id, asset_id, stop_on_failure } = req.body;
    const testCaseId = Number(test_case_id);
    const testCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(testCaseId);
    if (!testCase) {
      return res.status(404).json({ error: "Test case not found" });
    }

    const taskId = createExecutionTask({
      type: "single",
      assetId: asset_id ? Number(asset_id) : null,
      testCaseId,
      testCaseIds: [testCaseId],
      initiatedBy: "User",
      stopOnFailure: Boolean(stop_on_failure),
    });
    scheduleExecutionTask(taskId);
    res.json({ id: taskId, success: true });
  });

  app.post("/api/test-cases", (req, res) => {
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec } = req.body;
    const info = db.prepare(
      `INSERT INTO test_cases (
        title, category, type, protocol, description, steps, test_input, test_tool,
        expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      Number(timeout_sec || 300)
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/test-cases/import", (req, res) => {
    const { cases } = req.body;
    const insert = db.prepare(`
      INSERT INTO test_cases (category, title, test_input, test_tool, steps, expected_result, automation_level, type, protocol, description, executor_type, script_path, command_template, args_template, timeout_sec)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          Number(item.timeout_sec || 300)
        );
      }
    });

    transaction(cases);
    res.json({ success: true, count: cases.length });
  });

  app.patch("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec } = req.body;
    db.prepare(
      `UPDATE test_cases
       SET title = ?, category = ?, type = ?, protocol = ?, description = ?, steps = ?, test_input = ?, test_tool = ?, expected_result = ?, automation_level = ?,
           executor_type = ?, script_path = ?, command_template = ?, args_template = ?, timeout_sec = ?
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
      id
    );
    res.json({ success: true });
  });

  app.delete("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
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
    if (['Passed', 'Failed', 'Blocked'].includes(status)) {
      db.prepare("INSERT INTO test_runs (test_case_id, result, executed_by) VALUES (?, ?, ?)")
        .run(id, status, 'System');
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
        SUM(CASE WHEN result = 'Passed' THEN 1 ELSE 0 END) as passed
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
        SUM(CASE WHEN status = 'Passed' THEN 1 ELSE 0 END) as passed
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
    const { stop_on_failure } = req.body || {};
    const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(suiteId);
    if (!suite) {
      return res.status(404).json({ error: "Suite not found" });
    }

    const suiteCases = db.prepare("SELECT test_case_id FROM test_suite_cases WHERE suite_id = ? ORDER BY sort_order ASC, id ASC").all(suiteId) as Array<{ test_case_id: number }>;
    if (suiteCases.length === 0) {
      return res.status(400).json({ error: "Suite has no test cases" });
    }

    const existingRun = db.prepare(`
      SELECT id
      FROM execution_tasks
      WHERE suite_id = ? AND status IN ('Queued', 'Running')
      ORDER BY started_at DESC
      LIMIT 1
    `).get(suiteId);
    if (existingRun) {
      return res.status(409).json({ error: "Suite is already running" });
    }

    const taskId = createExecutionTask({
      type: "suite",
      suiteId,
      testCaseIds: suiteCases.map(item => item.test_case_id),
      initiatedBy: "User",
      stopOnFailure: Boolean(stop_on_failure),
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
      WHERE asset_id = ? AND status IN ('Queued', 'Running')
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
        status: "Running",
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
        status: "Passed",
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
        status: "Passed",
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
        status: "Failed",
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
        status: "Blocked",
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
    insertRun.run(1, 'Running', 'CAN traffic high load...', 765, 'System');
    insertRun.run(2, 'Passed', 'OTA update successful', 192, 'Admin');
    insertRun.run(3, 'Passed', 'Diagnostics clear', 485, 'Tester');
    insertRun.run(4, 'Failed', 'Thermal threshold exceeded', 320, 'System');

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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
