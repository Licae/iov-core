import type { Express } from "express";
import type { ExecutionTaskService } from "../execution/execution-task-service";
import { buildDashboardBootstrap } from "../services";
import type { DefectAnalysisResult } from "../services/report-service";
import type { SqliteDb } from "../types";

type DefectRecord = {
  id: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  created_at?: string;
};

type SystemRouteDeps = {
  db: SqliteDb;
  listExecutionTasks: () => ReturnType<ExecutionTaskService["listExecutionTasks"]>;
  listTestSuites: () => ReturnType<ExecutionTaskService["listTestSuites"]>;
  listSuiteRuns: () => ReturnType<ExecutionTaskService["listSuiteRuns"]>;
  generateDefectAnalysis: (defect: DefectRecord) => Promise<DefectAnalysisResult>;
  buildReportHtml: () => string;
};

type SettingRow = {
  key: string;
  value: string;
};

type CountRow = {
  count: number;
};

type DefectSeverityRow = {
  severity: string;
  count: number;
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const registerSystemRoutes = (app: Express, deps: SystemRouteDeps) => {
  const { db, listExecutionTasks, listTestSuites, listSuiteRuns, generateDefectAnalysis, buildReportHtml } = deps;

  app.get("/api/bootstrap", (_req, res) => {
    res.json(buildDashboardBootstrap({
      db,
      listExecutionTasks,
      listTestSuites,
      listSuiteRuns,
    }));
  });

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all() as SettingRow[];
    const settingsMap = settings.reduce<Record<string, boolean>>((acc, curr) => {
      acc[curr.key] = curr.value === "true";
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

  app.get("/api/defects/page", (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 10), 100);
    const total = Number((db.prepare("SELECT COUNT(*) AS count FROM defects").get() as CountRow | undefined)?.count || 0);
    const offset = (page - 1) * pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const defects = db
      .prepare("SELECT * FROM defects ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(pageSize, offset) as DefectRecord[];
    const summaryRows = db
      .prepare("SELECT severity, COUNT(*) AS count FROM defects GROUP BY severity")
      .all() as DefectSeverityRow[];
    const summary = summaryRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.severity] = Number(row.count || 0);
      return acc;
    }, {});

    res.json({
      items: defects,
      summary,
      page,
      pageSize,
      total,
      totalPages,
    });
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
};
