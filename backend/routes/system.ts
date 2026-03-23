import type { Express } from "express";

type DefectRecord = {
  id: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  created_at?: string;
};

type SystemRouteDeps = {
  db: any;
  generateDefectAnalysis: (defect: DefectRecord) => Promise<{ summary: string; recommendations: string[] }>;
  buildReportHtml: () => string;
};

export const registerSystemRoutes = (app: Express, deps: SystemRouteDeps) => {
  const { db, generateDefectAnalysis, buildReportHtml } = deps;

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
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

