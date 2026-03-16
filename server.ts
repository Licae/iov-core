import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const db = new Database("v2x_testing.db");

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
    status TEXT DEFAULT 'Draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_case_id INTEGER,
    result TEXT,            -- Pass, Fail, Blocked
    logs TEXT,
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
const columns = ['test_input', 'test_tool', 'expected_result', 'automation_level'];
columns.forEach(col => {
  try {
    db.exec(`ALTER TABLE test_cases ADD COLUMN ${col} TEXT;`);
  } catch (e) {}
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;
  const activeSuiteRuns = new Map<number, NodeJS.Timeout[]>();

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

  const listSuiteRuns = () => db.prepare(`
    SELECT
      sr.*,
      ts.name as suite_name,
      tc.title as current_case_title
    FROM suite_runs sr
    LEFT JOIN test_suites ts ON ts.id = sr.suite_id
    LEFT JOIN test_cases tc ON tc.id = sr.current_case_id
    ORDER BY
      CASE WHEN sr.status = 'Running' THEN 0 ELSE 1 END,
      sr.started_at DESC
    LIMIT 20
  `).all();

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

  app.post("/api/test-runs", (req, res) => {
    const { test_case_id, asset_id } = req.body;
    // 模拟发起测试任务：更新用例状态为 Running
    db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(test_case_id);
    // 记录一条初始运行记录
    const info = db.prepare(
      "INSERT INTO test_runs (test_case_id, result, logs, executed_by) VALUES (?, ?, ?, ?)"
    ).run(test_case_id, 'Running', `Task initiated for asset ID: ${asset_id}`, 'User');
    
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/test-cases", (req, res) => {
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level } = req.body;
    const info = db.prepare(
      "INSERT INTO test_cases (title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(title, category, type, protocol, description, JSON.stringify(steps), test_input, test_tool, expected_result, automation_level);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/test-cases/import", (req, res) => {
    const { cases } = req.body;
    const insert = db.prepare(`
      INSERT INTO test_cases (category, title, test_input, test_tool, steps, expected_result, automation_level, type, protocol)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        // 自动识别协议和类型
        const protocol = item.category === 'CAN总线' ? 'CAN' : 
                         item.category.includes('蓝牙') ? 'BLE' : 
                         item.category === '车云通信' ? 'Ethernet' : 
                         item.category.includes('无线电') ? 'WiFi' : 'Other';
        const type = item.automation_level === 'A' ? 'Automated' : 'Manual';
        
        insert.run(
          item.category,
          item.title,
          item.test_input,
          item.test_tool,
          JSON.stringify(item.steps.split('\n')),
          item.expected_result,
          item.automation_level,
          type,
          protocol
        );
      }
    });

    transaction(cases);
    res.json({ success: true, count: cases.length });
  });

  app.patch("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    const { title, category, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level } = req.body;
    db.prepare(
      `UPDATE test_cases
       SET title = ?, category = ?, type = ?, protocol = ?, description = ?, steps = ?, test_input = ?, test_tool = ?, expected_result = ?, automation_level = ?
       WHERE id = ?`
    ).run(title, category, type, protocol, description, JSON.stringify(steps), test_input, test_tool, expected_result, automation_level, id);
    res.json({ success: true });
  });

  app.delete("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
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
    const { id } = req.params;
    
    // 1. 更新状态为 Running
    db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(id);
    
    // 2. 模拟延迟后决定结果 (这里我们直接同步返回，前端处理动画)
    // 实际生产中这通常是异步的，但为了演示，我们随机生成一个结果
    const results = ['Passed', 'Failed', 'Blocked'];
    const finalResult = results[Math.floor(Math.random() * results.length)];
    
    // 模拟实时报文发送
    const protocols = ['CAN', 'DoIP', 'V2X', 'Ethernet'];
    const protocol = protocols[Math.floor(Math.random() * protocols.length)];
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const hex = Array.from({length: 8}, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(' ');
      broadcast({
        type: 'SIMULATION_LOG',
        testCaseId: parseInt(id),
        message: `[${protocol}] Frame ${step}: ID=0x${Math.floor(Math.random() * 2048).toString(16)} DATA=[${hex}]`,
        timestamp: new Date().toISOString()
      });
      
      if (step >= 10) {
        clearInterval(interval);
        broadcast({
          type: 'SIMULATION_COMPLETE',
          testCaseId: parseInt(id),
          result: finalResult
        });
      }
    }, 500);

    const logs = `Simulation run at ${new Date().toISOString()}: Initializing... Protocol check... Execution complete. Result: ${finalResult}`;
    
    // 3. 记录运行结果
    const duration = Math.floor(Math.random() * 600) + 60; // 1-11 minutes
    db.prepare("INSERT INTO test_runs (test_case_id, result, logs, duration, executed_by) VALUES (?, ?, ?, ?, ?)")
      .run(id, finalResult, logs, duration, 'Auto-Runner');
      
    // 4. 更新最终状态
    db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(finalResult, id);
    
    res.json({ success: true, result: finalResult, logs });
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
    db.prepare("DELETE FROM suite_runs WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM test_suite_cases WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM test_suites WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/suite-runs", (req, res) => {
    res.json(listSuiteRuns());
  });

  app.post("/api/test-suites/:id/run", (req, res) => {
    const { id } = req.params;
    const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(id);
    if (!suite) {
      return res.status(404).json({ error: "Suite not found" });
    }

    const suiteCases = db.prepare("SELECT test_case_id FROM test_suite_cases WHERE suite_id = ? ORDER BY sort_order ASC, id ASC").all(id) as Array<{ test_case_id: number }>;
    if (suiteCases.length === 0) {
      return res.status(400).json({ error: "Suite has no test cases" });
    }

    const existingRun = db.prepare("SELECT id FROM suite_runs WHERE suite_id = ? AND status = 'Running' ORDER BY started_at DESC LIMIT 1").get(id);
    if (existingRun) {
      return res.status(409).json({ error: "Suite is already running" });
    }

    const info = db.prepare(`
      INSERT INTO suite_runs (suite_id, status, total_cases, current_case_id)
      VALUES (?, 'Queued', ?, ?)
    `).run(id, suiteCases.length, suiteCases[0].test_case_id);
    const suiteRunId = Number(info.lastInsertRowid);

    broadcast({
      type: "SUITE_RUN_STARTED",
      suiteRunId,
      suiteId: Number(id),
      totalCases: suiteCases.length,
    });

    scheduleSuiteRun(suiteRunId, Number(id));
    res.json({ id: suiteRunId, success: true });
  });

  app.get("/api/assets", (req, res) => {
    const assets = db.prepare("SELECT * FROM assets ORDER BY created_at DESC").all();
    res.json(assets);
  });

  app.post("/api/assets", (req, res) => {
    const { name, status, version, type } = req.body;
    if (!name || !status || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const result = db.prepare("INSERT INTO assets (name, status, version, type) VALUES (?, ?, ?, ?)").run(name, status, version || 'v1.0.0', type);
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/assets/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM assets WHERE id = ?").run(id);
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

  // Seed data if empty
  const count = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
  if (count === 0) {
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
    const insertAsset = db.prepare("INSERT INTO assets (name, status, version, type) VALUES (?, ?, ?, ?)");
    insertAsset.run('GW-01 (Gateway)', 'Online', 'v2.4.1', 'Hardware');
    insertAsset.run('TBOX-PRO-X', 'Online', 'v4.0.2', 'Hardware');
    insertAsset.run('ADAS-SIM-NODE', 'Offline', 'v1.1.0', 'Simulation');
    insertAsset.run('BMS-UNIT-04', 'Online', 'v3.2.2', 'Hardware');

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
