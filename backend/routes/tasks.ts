import type { Express } from "express";
import type { WorkerStatePayload } from "../execution/execution-worker-ipc";
import type { ExecutionTaskService, CreateExecutionTaskPayload, RetryDecision, ExecutionTaskDetailRecord } from "../execution/execution-task-service";
import { validateBaselineSuiteCases, writebackRequirementSatisfactionFromRun } from "../services/traceability-governance";
import type { SqliteDb } from "../types";

type TaskRouteDeps = {
  db: SqliteDb;
  listExecutionTasks: () => ReturnType<ExecutionTaskService["listExecutionTasks"]>;
  getExecutionTaskDetail: (taskId: number) => ExecutionTaskDetailRecord | null;
  submitExecutionTask: (payload: CreateExecutionTaskPayload) => number | Promise<number>;
  listTestSuites: () => ReturnType<ExecutionTaskService["listTestSuites"]>;
  listSuiteRuns: () => ReturnType<ExecutionTaskService["listSuiteRuns"]>;
  cancelExecutionTask: (taskId: number) => boolean | Promise<boolean>;
  getRetryDecision: (task: Parameters<ExecutionTaskService["getRetryDecision"]>[0]) => RetryDecision;
  cloneExecutionTask: (taskId: number) => { taskId: number } | { error: string } | null;
  enqueueExecutionTask: (taskId: number) => void | Promise<void>;
  getWorkerState: () => WorkerStatePayload | Promise<WorkerStatePayload>;
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
  const normalizeManualResult = (value: unknown) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "PASSED" || normalized === "FAILED" || normalized === "BLOCKED" || normalized === "ERROR") {
      return normalized as "PASSED" | "FAILED" | "BLOCKED" | "ERROR";
    }
    return null;
  };

  const normalizeFailureCategory = (
    value: unknown,
    result: "PASSED" | "FAILED" | "BLOCKED" | "ERROR",
  ) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "ENVIRONMENT" || normalized === "PERMISSION" || normalized === "SCRIPT" || normalized === "NONE") {
      return normalized as "ENVIRONMENT" | "PERMISSION" | "SCRIPT" | "NONE";
    }
    if (result === "PASSED") return "NONE" as const;
    if (result === "BLOCKED") return "ENVIRONMENT" as const;
    return "SCRIPT" as const;
  };

  const normalizeStepResult = (value: unknown) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "PASSED" || normalized === "FAILED" || normalized === "BLOCKED" || normalized === "ERROR" || normalized === "RUNNING" || normalized === "SKIPPED") {
      return normalized as "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "RUNNING" | "SKIPPED";
    }
    return "ERROR" as const;
  };

  const buildManualStepResults = (
    rawSteps: unknown,
    fallbackResult: "PASSED" | "FAILED" | "BLOCKED" | "ERROR",
    fallbackSummary: string,
  ) => {
    const now = new Date().toISOString();
    if (Array.isArray(rawSteps) && rawSteps.length > 0) {
      return rawSteps
        .map((raw, index) => {
          if (!raw || typeof raw !== "object") return null;
          const step = raw as Record<string, unknown>;
          const stepResult = normalizeStepResult(step.result ?? fallbackResult);
          return {
            name: String(step.name || `人工步骤 ${index + 1}`).trim() || `人工步骤 ${index + 1}`,
            result: stepResult,
            logs: String(step.logs || "").trim(),
            command: String(step.command || "manual://operator-review").trim(),
            command_result: normalizeStepResult(step.command_result ?? stepResult),
            output: String(step.output || "").trim(),
            security_assessment: String(step.security_assessment || "").trim(),
            exit_code: typeof step.exit_code === "number" ? step.exit_code : null,
            stdout: String(step.stdout || "").trim(),
            stderr: String(step.stderr || "").trim(),
            timestamp: String(step.timestamp || now),
            conclusion: String(step.conclusion || step.security_assessment || step.logs || "").trim(),
          };
        })
        .filter(Boolean);
    }
    return [
      {
        name: "人工执行结论",
        result: fallbackResult,
        logs: fallbackSummary,
        command: "manual://operator-review",
        command_result: fallbackResult,
        output: fallbackSummary,
        security_assessment: fallbackSummary,
        exit_code: fallbackResult === "PASSED" ? 0 : 1,
        stdout: fallbackResult === "PASSED" ? fallbackSummary : "",
        stderr: fallbackResult === "PASSED" ? "" : fallbackSummary,
        timestamp: now,
        conclusion: fallbackSummary,
      },
    ];
  };

  const refreshTaskCountersAndFailure = (taskId: number) => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN result = 'PASSED' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN result IN ('FAILED', 'ERROR') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
      FROM execution_task_items
      WHERE task_id = ?
    `).get(taskId) as { total?: number; completed?: number; passed?: number; failed?: number; blocked?: number };

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
      taskId,
    );

    const items = db.prepare(`
      SELECT result, failure_category
      FROM execution_task_items
      WHERE task_id = ?
      ORDER BY sort_order DESC, id DESC
    `).all(taskId) as Array<{ result?: string | null; failure_category?: string | null }>;

    const activeFailure = items.find((item) => String(item.result || "").trim().toUpperCase() !== "PASSED");
    const fallbackCategory = activeFailure ? normalizeFailureCategory(activeFailure.failure_category, normalizeManualResult(activeFailure.result) || "ERROR") : "NONE";
    db.prepare("UPDATE execution_tasks SET failure_category = ? WHERE id = ?").run(fallbackCategory, taskId);
    return fallbackCategory;
  };

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

  app.post("/api/tasks/:id/items/:itemId/manual-result", async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "Invalid task/item id" });
      }

      const task = db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as { id: number; status: string; stop_on_failure?: number } | undefined;
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      if (String(task.status || "").trim().toUpperCase() === "CANCELLED") {
        return res.status(409).json({ error: "Task is cancelled" });
      }

      const item = db.prepare(`
        SELECT
          eti.*,
          tc.title,
          tc.type as case_type,
          tc.executor_type
        FROM execution_task_items eti
        JOIN test_cases tc ON tc.id = eti.test_case_id
        WHERE eti.id = ? AND eti.task_id = ?
      `).get(itemId, taskId) as {
        id: number;
        task_id: number;
        test_case_id: number;
        sort_order: number;
        status: string;
        run_id?: number | null;
        started_at?: string | null;
        title: string;
        case_type?: string | null;
        executor_type?: string | null;
      } | undefined;
      if (!item) {
        return res.status(404).json({ error: "Task item not found" });
      }

      const isManualCase = String(item.case_type || "").trim().toLowerCase() === "manual" ||
        String(item.executor_type || "").trim().toLowerCase() === "manual";
      if (!isManualCase) {
        return res.status(400).json({ error: "Only manual test cases support manual result submission" });
      }
      if (String(item.status || "").trim().toUpperCase() === "COMPLETED" && Number(item.run_id || 0) > 0) {
        return res.status(409).json({ error: "Manual result has already been submitted" });
      }
      if (!["RUNNING", "PENDING"].includes(String(item.status || "").trim().toUpperCase())) {
        return res.status(409).json({ error: "Current task item is not waiting for manual result" });
      }

      const result = normalizeManualResult(req.body?.result);
      if (!result) {
        return res.status(400).json({ error: "result must be one of PASSED/FAILED/BLOCKED/ERROR" });
      }
      const summary = String(req.body?.summary || "").trim() || "人工执行已提交结论。";
      const logs = String(req.body?.logs || "").trim() || summary;
      const operator = String(req.body?.operator || "").trim() || "Manual-Reviewer";
      const failureCategory = normalizeFailureCategory(req.body?.failure_category, result);
      const stepResults = buildManualStepResults(req.body?.step_results, result, summary);

      const duration = Number(
        (
          db.prepare(`
            SELECT
              CASE
                WHEN ? IS NULL OR TRIM(?) = '' THEN 1
                ELSE MAX(1, CAST((julianday(CURRENT_TIMESTAMP) - julianday(?)) * 86400 AS INTEGER))
              END AS duration
          `).get(item.started_at || null, item.started_at || null, item.started_at || null) as { duration?: number } | undefined
        )?.duration || 1
      );
      let shouldResumeTask = false;

      const transaction = db.transaction(() => {
        const runInfo = db.prepare(`
          INSERT INTO test_runs (test_case_id, result, logs, summary, step_results, duration, executed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.test_case_id,
          result,
          logs,
          summary,
          JSON.stringify(stepResults),
          duration,
          operator,
        );
        const runId = Number(runInfo.lastInsertRowid);

        writebackRequirementSatisfactionFromRun(db, {
          runId,
          testCaseId: item.test_case_id,
          result,
        });

        db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(result, item.test_case_id);
        db.prepare(`
          UPDATE execution_task_items
          SET status = 'COMPLETED',
              result = ?,
              failure_category = ?,
              run_id = ?,
              started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(result, failureCategory, runId, item.id);

        if (Boolean(task.stop_on_failure) && (result === "FAILED" || result === "ERROR")) {
          db.prepare(`
            UPDATE execution_task_items
            SET status = 'CANCELLED',
                finished_at = CURRENT_TIMESTAMP
            WHERE task_id = ? AND status = 'PENDING' AND sort_order > ?
          `).run(taskId, item.sort_order);
          const taskFailureCategory = refreshTaskCountersAndFailure(taskId);
          db.prepare(`
            UPDATE execution_tasks
            SET status = 'COMPLETED',
                current_test_case_id = NULL,
                current_item_label = NULL,
                finished_at = CURRENT_TIMESTAMP,
                error_message = ?,
                failure_category = ?
            WHERE id = ?
          `).run(`Task stopped after failure on ${item.title}`, taskFailureCategory, taskId);
          return;
        }

        const nextPending = db.prepare(`
          SELECT eti.test_case_id, tc.title
          FROM execution_task_items eti
          JOIN test_cases tc ON tc.id = eti.test_case_id
          WHERE eti.task_id = ? AND eti.status = 'PENDING'
          ORDER BY eti.sort_order ASC, eti.id ASC
          LIMIT 1
        `).get(taskId) as { test_case_id: number; title: string } | undefined;

        const taskFailureCategory = refreshTaskCountersAndFailure(taskId);
        if (nextPending) {
          db.prepare(`
            UPDATE execution_tasks
            SET status = 'PENDING',
                current_test_case_id = ?,
                current_item_label = ?,
                finished_at = NULL,
                error_message = NULL,
                failure_category = ?
            WHERE id = ?
          `).run(nextPending.test_case_id, nextPending.title, taskFailureCategory, taskId);
          shouldResumeTask = true;
          return;
        }

        db.prepare(`
          UPDATE execution_tasks
          SET status = 'COMPLETED',
              current_test_case_id = NULL,
              current_item_label = NULL,
              finished_at = CURRENT_TIMESTAMP,
              error_message = NULL,
              failure_category = ?
          WHERE id = ?
        `).run(taskFailureCategory, taskId);
      });

      transaction();

      if (shouldResumeTask) {
        await Promise.resolve(enqueueExecutionTask(taskId));
      }

      const detail = getExecutionTaskDetail(taskId);
      return res.json({
        success: true,
        taskId,
        itemId,
        resumed: shouldResumeTask,
        detail,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to submit manual result" });
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
