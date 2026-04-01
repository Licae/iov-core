import type { ChildProcessWithoutNullStreams } from "child_process";
import { ExecutionWorker } from "./execution-worker";
import { writebackRequirementSatisfactionFromRun } from "../services/traceability-governance";
import { ExecutionRunner } from "./execution-runner";
import {
  EXECUTION_STATUS,
  FAILURE_CATEGORY,
  TEST_RESULT,
  normalizeFailureCategory,
  normalizeTestResult,
  type ExecutionStatus,
} from "./execution-types";
import type { ExecutionTaskRecord } from "../repositories";
import type { SqliteDb } from "../types";

type ExecutionTaskRunItem = {
  id: number;
  test_case_id: number;
  sort_order: number;
  status: string;
  title: string;
  case_type?: string | null;
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

type ExecutionOrchestratorOptions = {
  db: SqliteDb;
  executionRunner: ExecutionRunner;
  broadcast: (data: unknown) => void;
  decorateTaskRetryMeta: (task: ExecutionTaskRecord) => ExecutionTaskRecord;
  scheduleTaskArtifactCleanup: (task: ExecutionTaskRecord) => void;
};

export class ExecutionOrchestrator {
  private readonly db: SqliteDb;
  private readonly executionRunner: ExecutionRunner;
  private readonly broadcast: (data: unknown) => void;
  private readonly decorateTaskRetryMeta: (task: ExecutionTaskRecord) => ExecutionTaskRecord;
  private readonly scheduleTaskArtifactCleanup: (task: ExecutionTaskRecord) => void;
  private readonly activeTaskRuns = new Map<number, NodeJS.Timeout[]>();
  private readonly activeTaskChildren = new Map<number, ChildProcessWithoutNullStreams>();
  private readonly worker: ExecutionWorker;

  constructor(options: ExecutionOrchestratorOptions) {
    this.db = options.db;
    this.executionRunner = options.executionRunner;
    this.broadcast = options.broadcast;
    this.decorateTaskRetryMeta = options.decorateTaskRetryMeta;
    this.scheduleTaskArtifactCleanup = options.scheduleTaskArtifactCleanup;

    this.worker = new ExecutionWorker({
      runTask: (taskId) => this.scheduleExecutionTask(taskId),
      onError: (taskId, error) => {
        console.error(`Execution worker failed on task ${taskId}:`, error);
        this.db.prepare(`
          UPDATE execution_tasks
          SET status = 'COMPLETED',
              error_message = ?,
              finished_at = CURRENT_TIMESTAMP,
              failure_category = 'SCRIPT'
          WHERE id = ? AND status IN ('PENDING', 'RUNNING')
        `).run(error instanceof Error ? error.message : "Worker execution failed", taskId);
        this.updateTaskCounters(taskId);
        const task = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (task) {
          this.broadcast({ type: "EXECUTION_TASK_COMPLETED", task: this.decorateTaskRetryMeta(task) });
        }
        this.activeTaskRuns.delete(taskId);
        this.activeTaskChildren.delete(taskId);
      },
      onStateChange: (state) => {
        this.broadcast({
          type: "EXECUTION_WORKER_UPDATED",
          worker: state,
        });
      },
    });
  }

  enqueue(taskId: number) {
    this.worker.enqueue(taskId);
  }

  getWorkerState() {
    return this.worker.getState();
  }

  requeuePendingTasks() {
    const pendingTasks = this.db.prepare(`
      SELECT id, status
      FROM execution_tasks
      WHERE status IN ('PENDING', 'RUNNING')
      ORDER BY started_at ASC, id ASC
    `).all() as Array<{ id: number; status: ExecutionStatus }>;

    pendingTasks.forEach((task) => {
      if (task.status === EXECUTION_STATUS.RUNNING) {
        this.db.prepare(`
          UPDATE execution_tasks
          SET status = 'PENDING',
              current_item_label = NULL,
              finished_at = NULL,
              error_message = NULL
          WHERE id = ?
        `).run(task.id);
        this.db.prepare(`
          UPDATE execution_task_items
          SET status = 'PENDING',
              started_at = NULL,
              finished_at = NULL
          WHERE task_id = ? AND status = 'RUNNING'
        `).run(task.id);
      }
      this.enqueue(task.id);
    });

    return pendingTasks.length;
  }

  cancelTask(taskId: number) {
    const task = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task || ![EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(task.status)) {
      return false;
    }

    this.worker.remove(taskId);

    const timers = this.activeTaskRuns.get(taskId) || [];
    timers.forEach((timer) => clearTimeout(timer));
    this.activeTaskRuns.delete(taskId);
    const activeChild = this.activeTaskChildren.get(taskId);
    if (activeChild) {
      activeChild.kill("SIGTERM");
      this.activeTaskChildren.delete(taskId);
    }

    this.db.prepare(`
      UPDATE execution_task_items
      SET status = CASE WHEN status = 'COMPLETED' THEN status ELSE 'CANCELLED' END,
          failure_category = CASE WHEN status = 'COMPLETED' THEN failure_category ELSE 'ENVIRONMENT' END,
          finished_at = CASE WHEN status = 'COMPLETED' THEN finished_at ELSE CURRENT_TIMESTAMP END
      WHERE task_id = ?
    `).run(taskId);
    this.updateTaskCounters(taskId);

    this.db.prepare(`
      UPDATE execution_tasks
      SET status = 'CANCELLED',
          current_test_case_id = NULL,
          current_item_label = NULL,
          finished_at = CURRENT_TIMESTAMP,
          error_message = 'Cancelled by user',
          failure_category = 'ENVIRONMENT'
      WHERE id = ?
    `).run(taskId);

    const runningItems = this.db.prepare(`
      SELECT test_case_id
      FROM execution_task_items
      WHERE task_id = ? AND status = 'RUNNING'
    `).all(taskId) as Array<{ test_case_id: number }>;
    runningItems.forEach((item) => {
      this.db.prepare("UPDATE test_cases SET status = 'Draft' WHERE id = ?").run(item.test_case_id);
    });

    const cancelledTask = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!cancelledTask) {
      return true;
    }
    this.broadcast({
      type: "EXECUTION_TASK_COMPLETED",
      task: this.decorateTaskRetryMeta(cancelledTask),
    });
    this.scheduleTaskArtifactCleanup(cancelledTask);

    return true;
  }

  private refreshTaskFailureCategory(taskId: number) {
    const items = this.db.prepare(`
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
    this.db.prepare("UPDATE execution_tasks SET failure_category = ? WHERE id = ?").run(nextFailureCategory, taskId);
    return nextFailureCategory;
  }

  private updateTaskCounters(taskId: number) {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN result = 'PASSED' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN result IN ('FAILED', 'ERROR') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
      FROM execution_task_items
      WHERE task_id = ?
    `).get(taskId) as Record<string, number>;

    this.db.prepare(`
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
  }

  private async scheduleExecutionTask(taskId: number) {
    const task = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
    if (!task) return;
    if (task.status === EXECUTION_STATUS.CANCELLED) return;

    const items = this.db.prepare(`
      SELECT
        eti.id,
        eti.test_case_id,
        eti.sort_order,
        eti.status,
        tc.title,
        tc.type as case_type,
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
      WHERE eti.task_id = ? AND UPPER(COALESCE(eti.status, 'PENDING')) IN ('PENDING', 'QUEUED')
      ORDER BY eti.sort_order ASC, eti.id ASC
    `).all(taskId) as ExecutionTaskRunItem[];

    if (items.length === 0) {
      this.db.prepare("UPDATE execution_tasks SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP, failure_category = 'NONE' WHERE id = ?").run(taskId);
      return;
    }

    const completeTask = (status: ExecutionStatus = EXECUTION_STATUS.COMPLETED, errorMessage?: string | null) => {
      this.updateTaskCounters(taskId);
      const finalFailureCategory = this.refreshTaskFailureCategory(taskId);
      this.db.prepare(`
        UPDATE execution_tasks
        SET status = ?,
            current_test_case_id = NULL,
            current_item_label = NULL,
            finished_at = CURRENT_TIMESTAMP,
            error_message = ?,
            failure_category = ?
        WHERE id = ?
      `).run(status, errorMessage || null, finalFailureCategory, taskId);

      const completedTask = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
      if (!completedTask) {
        this.activeTaskRuns.delete(taskId);
        this.activeTaskChildren.delete(taskId);
        return;
      }
      this.broadcast({ type: "EXECUTION_TASK_COMPLETED", task: this.decorateTaskRetryMeta(completedTask) });
      this.scheduleTaskArtifactCleanup(completedTask);
      this.activeTaskRuns.delete(taskId);
      this.activeTaskChildren.delete(taskId);
    };

    const cancelPendingTimers = () => {
      const pendingTimers = this.activeTaskRuns.get(taskId) || [];
      pendingTimers.forEach((timer) => clearTimeout(timer));
      this.activeTaskRuns.delete(taskId);
      const activeChild = this.activeTaskChildren.get(taskId);
      if (activeChild) {
        activeChild.kill("SIGTERM");
        this.activeTaskChildren.delete(taskId);
      }
    };

    const executeSequentially = async () => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const isManualCase = String(item.case_type || "").trim().toLowerCase() === "manual" ||
          String(item.executor_type || "").trim().toLowerCase() === "manual";
        const latestTask = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (!latestTask || latestTask.status === EXECUTION_STATUS.CANCELLED) {
          break;
        }

        this.db.prepare("UPDATE test_cases SET status = 'Running' WHERE id = ?").run(item.test_case_id);
        this.db.prepare(`
          UPDATE execution_task_items
          SET status = 'RUNNING',
              started_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.id);
        this.db.prepare(`
          UPDATE execution_tasks
          SET status = 'RUNNING',
              current_test_case_id = ?,
              current_item_label = ?
          WHERE id = ?
        `).run(item.test_case_id, item.title, taskId);

        this.broadcast({
          type: "EXECUTION_TASK_UPDATED",
          task: this.decorateTaskRetryMeta(this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord),
        });
        if (isManualCase) {
          this.db.prepare("UPDATE execution_tasks SET executor = ? WHERE id = ?").run("manual", taskId);
          this.broadcast({
            type: "EXECUTION_TASK_MANUAL_REQUIRED",
            taskId,
            testCaseId: item.test_case_id,
            itemId: item.id,
            title: item.title,
          });
          return;
        }

        const refreshedTask = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord;
        const outcome = await this.executionRunner.runWithPreflight(
          refreshedTask,
          item,
          (child: ChildProcessWithoutNullStreams | null) => {
            if (child) {
              this.activeTaskChildren.set(taskId, child);
            } else {
              this.activeTaskChildren.delete(taskId);
            }
          }
        );
        this.db.prepare("UPDATE execution_tasks SET executor = ? WHERE id = ?").run(outcome.adapterName, taskId);
        const result = outcome.result;
        const duration = outcome.duration;
        const logs = outcome.logs;
        const summary = outcome.summary;
        const stepResults = outcome.stepResults;
        const failureCategory = outcome.failureCategory;

        const currentTask = this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord | undefined;
        if (!currentTask || currentTask.status === EXECUTION_STATUS.CANCELLED) {
          break;
        }

        const runInfo = this.db.prepare(`
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
        const runId = Number(runInfo.lastInsertRowid);
        writebackRequirementSatisfactionFromRun(this.db, {
          runId,
          testCaseId: item.test_case_id,
          result,
        });

        this.db.prepare("UPDATE test_cases SET status = ? WHERE id = ?").run(result, item.test_case_id);
        this.db.prepare(`
          UPDATE execution_task_items
          SET status = 'COMPLETED',
              result = ?,
              failure_category = ?,
              run_id = ?,
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(result, failureCategory, runId, item.id);

        this.updateTaskCounters(taskId);
        this.refreshTaskFailureCategory(taskId);

        const isLast = index === items.length - 1;
        const stopOnFailureTriggered = Boolean(currentTask.stop_on_failure) && [TEST_RESULT.FAILED, TEST_RESULT.ERROR].includes(result);
        if (stopOnFailureTriggered) {
          this.db.prepare(`
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
          this.db.prepare(`
            UPDATE execution_tasks
            SET current_test_case_id = ?,
                current_item_label = ?
            WHERE id = ?
          `).run(nextItem.test_case_id, nextItem.title, taskId);

          this.broadcast({
            type: "EXECUTION_TASK_UPDATED",
            task: this.decorateTaskRetryMeta(this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId) as ExecutionTaskRecord),
          });
        }

        this.broadcast({
          type: "SIMULATION_COMPLETE",
          taskId,
          testCaseId: item.test_case_id,
          result,
        });
      }
    };

    this.activeTaskRuns.set(taskId, []);
    try {
      await executeSequentially();
    } catch (error) {
      console.error("Execution task failed:", error);
      completeTask(EXECUTION_STATUS.COMPLETED, error instanceof Error ? error.message : "Task failed");
    } finally {
      this.activeTaskRuns.delete(taskId);
      this.activeTaskChildren.delete(taskId);
    }
  }
}
