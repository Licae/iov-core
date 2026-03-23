import type { Express } from "express";
import { validateBaselineSuiteCases } from "../services/traceability-governance";

type TaskRouteDeps = {
  db: any;
  listExecutionTasks: () => any[];
  getExecutionTaskDetail: (taskId: number) => any;
  submitExecutionTask: (payload: any) => number | Promise<number>;
  listTestSuites: () => any[];
  listSuiteRuns: () => any[];
  cancelExecutionTask: (taskId: number) => boolean | Promise<boolean>;
  getRetryDecision: (task: any) => { canRetry: boolean; reason: string | null };
  cloneExecutionTask: (taskId: number) => { taskId: number } | { error: string } | null;
  enqueueExecutionTask: (taskId: number) => void | Promise<void>;
  getWorkerState: () => { runningTaskId: number | null; queuedTaskIds: number[] } | Promise<{ runningTaskId: number | null; queuedTaskIds: number[] }>;
};

export const registerTaskRoutes = (app: Express, deps: TaskRouteDeps) => {
  const {
    db,
    listExecutionTasks,
    getExecutionTaskDetail,
    submitExecutionTask,
    listTestSuites,
    listSuiteRuns,
    cancelExecutionTask,
    getRetryDecision,
    cloneExecutionTask,
    enqueueExecutionTask,
    getWorkerState,
  } = deps;

  app.get("/api/tasks", (req, res) => {
    res.json(listExecutionTasks());
  });

  app.get("/api/tasks/worker", async (req, res) => {
    try {
      res.json(await Promise.resolve(getWorkerState()));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load worker state" });
    }
  });

  app.get("/api/tasks/:id", (req, res) => {
    const taskId = Number(req.params.id);
    const detail = getExecutionTaskDetail(taskId);
    if (!detail) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(detail);
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const { type, test_case_id, suite_id, asset_id, stop_on_failure } = req.body || {};

      if (type === "single") {
        if (!test_case_id) {
          return res.status(400).json({ error: "test_case_id is required" });
        }
        const testCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(test_case_id);
        if (!testCase) {
          return res.status(404).json({ error: "Test case not found" });
        }

        const taskId = await Promise.resolve(submitExecutionTask({
          type: "single",
          assetId: asset_id || null,
          testCaseId: test_case_id,
          testCaseIds: [test_case_id],
          initiatedBy: "User",
          stopOnFailure: Boolean(stop_on_failure),
        }));
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

        const taskId = await Promise.resolve(submitExecutionTask({
          type: "suite",
          assetId: asset_id || null,
          suiteId: suite_id,
          testCaseIds: suiteCases.map((item) => item.test_case_id),
          initiatedBy: "User",
          stopOnFailure: Boolean(stop_on_failure),
        }));
        return res.json({ id: taskId, success: true });
      }

      return res.status(400).json({ error: "Unsupported task type" });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create task" });
    }
  });

  app.post("/api/test-runs", async (req, res) => {
    try {
      const { test_case_id, test_case_ids, asset_id, stop_on_failure, runtime_inputs } = req.body || {};
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

      const taskId = await Promise.resolve(submitExecutionTask({
        type: testCaseIds.length > 1 ? "suite" : "single",
        assetId: asset_id ? Number(asset_id) : null,
        testCaseId: primaryTestCaseId,
        testCaseIds,
        initiatedBy: "User",
        stopOnFailure: Boolean(stop_on_failure),
        runtimeInputs: runtime_inputs && typeof runtime_inputs === "object" ? runtime_inputs : {},
      }));
      res.json({ id: taskId, success: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to submit task" });
    }
  });

  app.post("/api/test-cases/:id/run", async (req, res) => {
    try {
      const testCaseId = Number(req.params.id);
      const { stop_on_failure } = req.body || {};
      const testCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(testCaseId);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }

      const taskId = await Promise.resolve(submitExecutionTask({
        type: "single",
        testCaseId,
        testCaseIds: [testCaseId],
        initiatedBy: "User",
        stopOnFailure: Boolean(stop_on_failure),
      }));

      res.json({ success: true, taskId });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run test case" });
    }
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
    const { name, description, test_case_ids, is_baseline } = req.body as { name?: string; description?: string; test_case_ids?: number[]; is_baseline?: boolean };
    if (!name?.trim()) {
      return res.status(400).json({ error: "Suite name is required" });
    }
    if (!Array.isArray(test_case_ids) || test_case_ids.length === 0) {
      return res.status(400).json({ error: "At least one test case is required" });
    }
    const normalizedCaseIds = Array.from(
      new Set(
        test_case_ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
    if (normalizedCaseIds.length === 0) {
      return res.status(400).json({ error: "At least one valid test case id is required" });
    }
    const existingCases = db
      .prepare(`SELECT id FROM test_cases WHERE id IN (${normalizedCaseIds.map(() => "?").join(",")})`)
      .all(...normalizedCaseIds) as Array<{ id: number }>;
    if (existingCases.length !== normalizedCaseIds.length) {
      return res.status(404).json({ error: "One or more test cases were not found" });
    }
    const baselineRequested = Boolean(is_baseline) || /基线|baseline/i.test(name.trim());
    if (baselineRequested) {
      const validation = validateBaselineSuiteCases(db, normalizedCaseIds).filter((item) => !item.valid);
      if (validation.length > 0) {
        return res.status(400).json({
          error: "基线套件仅允许包含具备有效输入定义的测试用例。",
          invalid_cases: validation,
        });
      }
    }

    const transaction = db.transaction(() => {
      const suiteInfo = db.prepare("INSERT INTO test_suites (name, description, is_baseline) VALUES (?, ?, ?)").run(
        name.trim(),
        description?.trim() || null,
        baselineRequested ? 1 : 0,
      );
      const suiteId = Number(suiteInfo.lastInsertRowid);
      const insertCase = db.prepare("INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)");
      normalizedCaseIds.forEach((testCaseId, index) => {
        insertCase.run(suiteId, testCaseId, index + 1);
      });
      if (baselineRequested) {
        db.prepare("UPDATE test_suites SET is_baseline = 0 WHERE id <> ? AND is_baseline = 1").run(suiteId);
      }
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

  app.patch("/api/tasks/:id/cancel", async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const success = await Promise.resolve(cancelExecutionTask(taskId));
      if (!success) {
        return res.status(409).json({ error: "Task cannot be cancelled" });
      }
      res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to cancel task" });
    }
  });

  app.post("/api/tasks/:id/retry", async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const originalTask = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId);
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

      await Promise.resolve(enqueueExecutionTask(cloned.taskId));
      res.json({ success: true, id: cloned.taskId });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to retry task" });
    }
  });

  app.post("/api/test-suites/:id/run", async (req, res) => {
    try {
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

      const taskId = await Promise.resolve(submitExecutionTask({
        type: "suite",
        assetId,
        suiteId,
        testCaseIds: suiteCases.map((item) => item.test_case_id),
        initiatedBy: "User",
        stopOnFailure: Boolean(stop_on_failure),
        runtimeInputs: runtime_inputs && typeof runtime_inputs === "object" ? runtime_inputs : {},
      }));

      res.json({ id: taskId, success: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run suite" });
    }
  });
};
