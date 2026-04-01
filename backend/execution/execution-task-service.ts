import {
  EXECUTION_STATUS,
  FAILURE_CATEGORY,
  TEST_RESULT,
  normalizeExecutionStatus,
  normalizeFailureCategory,
  normalizeTestResult,
  type ExecutionStatus,
  type FailureCategory,
  type TestResult,
} from "./execution-types";
import {
  ExecutionTaskRepository,
  type ExecutionTaskRecord,
  type ExecutionTaskDetailItemRecord,
  type SuiteRunRecord,
  type TestSuiteRecord,
} from "../repositories";
import type { SqliteDb } from "../types";

export type CreateExecutionTaskPayload = {
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
};

export type RetryDecision = {
  canRetry: boolean;
  reason: string | null;
};

type ExecutionTaskServiceOptions = {
  db: SqliteDb;
  executionMode: string;
  maxTaskRetries: number;
};

export type ExecutionTaskDetailRecord = {
  task: ExecutionTaskRecord;
  items: ExecutionTaskDetailItemRecord[];
};

export class ExecutionTaskService {
  private readonly db: SqliteDb;
  private readonly executionMode: string;
  private readonly maxTaskRetries: number;
  private readonly repository: ExecutionTaskRepository;

  constructor(options: ExecutionTaskServiceOptions) {
    this.db = options.db;
    this.executionMode = options.executionMode;
    this.maxTaskRetries = options.maxTaskRetries;
    this.repository = new ExecutionTaskRepository(this.db);
  }

  listTestSuites(): TestSuiteRecord[] {
    return this.repository.listTestSuites();
  }

  listExecutionTasks(): ExecutionTaskRecord[] {
    return this.repository.listExecutionTasks().map((task) => this.decorateTaskRetryMeta(task));
  }

  getExecutionTaskDetail(taskId: number): ExecutionTaskDetailRecord | null {
    const task = this.repository.getExecutionTaskDetailMeta(taskId);

    if (!task) {
      return null;
    }

    const items = this.repository.getExecutionTaskDetailItems(taskId);

    return { task: this.decorateTaskRetryMeta(task), items };
  }

  listSuiteRuns(): SuiteRunRecord[] {
    return this.repository.listSuiteRuns();
  }

  createExecutionTask(payload: CreateExecutionTaskPayload) {
    const {
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
    } = payload;

    const transaction = this.db.transaction(() => {
      const taskId = this.repository.createExecutionTask({
        type,
        assetId: assetId || null,
        suiteId: suiteId || null,
        testCaseId: testCaseId || null,
        totalItems: testCaseIds.length,
        currentTestCaseId: testCaseIds[0] || null,
        initiatedBy: initiatedBy || "System",
        stopOnFailure: Boolean(stopOnFailure),
        executor: this.executionMode,
        runtimeInputs: JSON.stringify(runtimeInputs || {}),
        sourceTaskId: sourceTaskId || null,
        retryCount: retryCount || 0,
      });
      this.repository.insertExecutionTaskItems(taskId, testCaseIds);
      return taskId;
    });

    return transaction();
  }

  cloneExecutionTask(taskId: number) {
    const task = this.repository.getExecutionTaskById(taskId);
    if (!task) return null;
    if ([EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(task.status)) return { error: "Task is still active" } as const;

    const items = this.repository.listExecutionTaskCaseIds(taskId);
    if (!items.length) return { error: "Task has no items" } as const;

    const newTaskId = this.createExecutionTask({
      type: task.type,
      assetId: task.asset_id || null,
      suiteId: task.suite_id || null,
      testCaseId: task.test_case_id || null,
      testCaseIds: items.map((item) => item.test_case_id),
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
  }

  getRetryDecision(task: ExecutionTaskRecord): RetryDecision {
    if ([EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING].includes(normalizeExecutionStatus(task.status))) {
      return { canRetry: false, reason: "任务仍在执行中，暂不可重试。" };
    }
    if (Number(task.retry_count || 0) >= this.maxTaskRetries) {
      return { canRetry: false, reason: `重试次数已达到上限（${this.maxTaskRetries}）。` };
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
    return { canRetry: true, reason: null };
  }

  decorateTaskRetryMeta<T extends ExecutionTaskRecord>(task: T): T {
    const decision = this.getRetryDecision(task);
    return {
      ...task,
      failure_category: normalizeFailureCategory(task.failure_category),
      can_retry: decision.canRetry,
      retry_block_reason: decision.reason,
    };
  }

  normalizeFailureCategory(value?: string | null): FailureCategory {
    return normalizeFailureCategory(value);
  }

  normalizeTestResult(value?: string | null, fallback: TestResult = TEST_RESULT.ERROR): TestResult {
    return normalizeTestResult(value, fallback);
  }
}
