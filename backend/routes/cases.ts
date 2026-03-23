import type { Express } from "express";
import {
  markTestCaseChangeImpact,
  removeEntityReverificationTodos,
} from "../services/traceability-governance";

type CaseRouteDeps = {
  db: any;
};

const parseIdArray = (value: unknown) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );

const normalizeTestResult = (value?: string | null): "PASSED" | "FAILED" | "BLOCKED" | "ERROR" => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED") return "PASSED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "BLOCKED") return "BLOCKED";
  return "ERROR";
};

export const registerCaseRoutes = (app: Express, deps: CaseRouteDeps) => {
  const { db } = deps;

  app.get("/api/test-cases", (req, res) => {
    const cases = db.prepare(`
      SELECT
        tc.*,
        (
          SELECT COUNT(*)
          FROM test_case_requirements tcr
          WHERE tcr.test_case_id = tc.id
        ) AS requirement_count,
        (
          SELECT COUNT(*)
          FROM test_case_tara_links tctl
          WHERE tctl.test_case_id = tc.id
        ) AS tara_count
      FROM test_cases tc
      ORDER BY tc.created_at DESC
    `).all();
    res.json(cases);
  });

  app.get("/api/test-cases/:id/links", (req, res) => {
    const testCaseId = Number(req.params.id);
    if (!Number.isInteger(testCaseId) || testCaseId <= 0) {
      return res.status(400).json({ error: "Invalid test case id" });
    }

    const test_case_ids = db
      .prepare("SELECT requirement_id FROM test_case_requirements WHERE test_case_id = ? ORDER BY requirement_id ASC")
      .all(testCaseId)
      .map((row: { requirement_id: number }) => row.requirement_id);

    const tara_ids = db
      .prepare("SELECT tara_id FROM test_case_tara_links WHERE test_case_id = ? ORDER BY tara_id ASC")
      .all(testCaseId)
      .map((row: { tara_id: number }) => row.tara_id);

    return res.json({
      test_case_id: testCaseId,
      requirement_ids: test_case_ids,
      tara_ids,
    });
  });

  app.put("/api/test-cases/:id/links", (req, res) => {
    const testCaseId = Number(req.params.id);
    if (!Number.isInteger(testCaseId) || testCaseId <= 0) {
      return res.status(400).json({ error: "Invalid test case id" });
    }

    const requirementIds = parseIdArray(req.body?.requirement_ids);
    const taraIds = parseIdArray(req.body?.tara_ids);

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM test_case_requirements WHERE test_case_id = ?").run(testCaseId);
      requirementIds.forEach((requirementId) => {
        db.prepare("INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id) VALUES (?, ?)").run(testCaseId, requirementId);
      });

      db.prepare("DELETE FROM test_case_tara_links WHERE test_case_id = ?").run(testCaseId);
      taraIds.forEach((taraId) => {
        db.prepare("INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id) VALUES (?, ?)").run(testCaseId, taraId);
      });
    });

    transaction();
    markTestCaseChangeImpact(db, testCaseId, "测试用例关联关系变更后待复验");
    return res.json({
      success: true,
      test_case_id: testCaseId,
      requirement_ids: requirementIds,
      tara_ids: taraIds,
    });
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

  app.post("/api/test-cases", (req, res) => {
    const { title, category, security_domain, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs } = req.body;
    const info = db.prepare(
      `INSERT INTO test_cases (
        title, category, security_domain, type, protocol, description, steps, test_input, test_tool,
        expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      category,
      security_domain || "未分类",
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
    const testCaseId = Number(info.lastInsertRowid);
    markTestCaseChangeImpact(db, testCaseId, "测试用例新建后待复验");
    res.json({ id: testCaseId });
  });

  app.post("/api/test-cases/import", (req, res) => {
    const { cases } = req.body;
    const insert = db.prepare(`
      INSERT INTO test_cases (category, security_domain, title, test_input, test_tool, steps, expected_result, automation_level, type, protocol, description, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds: number[] = [];
    const transaction = db.transaction((items: any[]) => {
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

        const info = insert.run(
          category,
          item.security_domain || "未分类",
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
        insertedIds.push(Number(info.lastInsertRowid));
      }
    });

    transaction(cases);
    insertedIds.forEach((testCaseId) => {
      markTestCaseChangeImpact(db, testCaseId, "测试用例批量导入后待复验");
    });
    res.json({ success: true, count: cases.length });
  });

  app.patch("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    const { title, category, security_domain, type, protocol, description, steps, test_input, test_tool, expected_result, automation_level, executor_type, script_path, command_template, args_template, timeout_sec, required_inputs, default_runtime_inputs } = req.body;
    db.prepare(
      `UPDATE test_cases
       SET title = ?, category = ?, security_domain = ?, type = ?, protocol = ?, description = ?, steps = ?, test_input = ?, test_tool = ?, expected_result = ?, automation_level = ?,
           executor_type = ?, script_path = ?, command_template = ?, args_template = ?, timeout_sec = ?, required_inputs = ?, default_runtime_inputs = ?
       WHERE id = ?`
    ).run(
      title,
      category,
      security_domain || "未分类",
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
    markTestCaseChangeImpact(db, Number(id), "测试用例内容变更后待复验");
    res.json({ success: true });
  });

  app.delete("/api/test-cases/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM test_suite_cases WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM execution_task_items WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM execution_tasks WHERE test_case_id = ? OR current_test_case_id = ?").run(id, id);
    db.prepare("DELETE FROM test_case_requirements WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM test_case_tara_links WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM test_runs WHERE test_case_id = ?").run(id);
    db.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
    removeEntityReverificationTodos(db, "TEST_CASE", Number(id));
    res.json({ success: true });
  });

  app.patch("/api/test-cases/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(status, id);

    const normalizedResult = normalizeTestResult(status);
    if (["PASSED", "FAILED", "BLOCKED", "ERROR"].includes(normalizedResult)) {
      db.prepare("INSERT INTO test_runs (test_case_id, result, executed_by) VALUES (?, ?, ?)")
        .run(id, normalizedResult, "System");
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

    const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const formatted = trend.map((t: any) => ({
      date: days[new Date(t.date).getDay()],
      passRate: t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0,
      runs: t.total
    }));

    res.json(formatted);
  });

  app.get("/api/stats/coverage", (req, res) => {
    const coverage = db.prepare(`
      SELECT
        category as name,
        COUNT(*) as total,
        SUM(CASE WHEN UPPER(status) = 'PASSED' THEN 1 ELSE 0 END) as passed
      FROM test_cases
      GROUP BY category
    `).all();

    const formatted = coverage.map((c: any) => ({
      name: c.name,
      coverage: c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0,
      status: (c.passed / c.total) > 0.8 ? "Passed" : (c.passed / c.total) > 0.5 ? "Warning" : "Critical"
    }));

    res.json(formatted);
  });

  app.get("/api/test-cases/:id/history", (req, res) => {
    const { id } = req.params;
    const runs = db.prepare(`
      SELECT * FROM test_runs
      WHERE test_case_id = ?
      ORDER BY executed_at DESC
    `).all(id);
    res.json(runs);
  });
};
