import { GoogleGenAI } from "@google/genai";
import type { SqliteDb } from "../types";

export type DefectRecord = {
  id: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  created_at?: string;
};

export type DefectAnalysisResult = {
  analysis: string;
  source: "fallback" | "gemini";
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

export const createDefectAnalysisGenerator = (apiKey?: string) =>
  async (defect: DefectRecord): Promise<DefectAnalysisResult> => {
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

export const createReportHtmlBuilder = (db: SqliteDb) => () => {
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
