export type CreateExecutionTaskRecord = {
  type: "single" | "suite";
  assetId?: number | null;
  suiteId?: number | null;
  testCaseId?: number | null;
  totalItems: number;
  currentTestCaseId?: number | null;
  initiatedBy?: string | null;
  stopOnFailure?: boolean;
  executor?: string | null;
  runtimeInputs?: string | null;
  sourceTaskId?: number | null;
  retryCount?: number;
};

export class ExecutionTaskRepository {
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
  }

  listTestSuites() {
    return this.db.prepare(`
      SELECT
        ts.id,
        ts.name,
        ts.description,
        ts.is_baseline,
        ts.created_at,
        COUNT(tsc.id) as case_count
      FROM test_suites ts
      LEFT JOIN test_suite_cases tsc ON tsc.suite_id = ts.id
      GROUP BY ts.id
      ORDER BY ts.created_at DESC
    `).all();
  }

  listExecutionTasks() {
    return this.db.prepare(`
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
        CASE WHEN et.status IN ('RUNNING', 'PENDING') THEN 0 ELSE 1 END,
        et.started_at DESC
      LIMIT 50
    `).all();
  }

  getExecutionTaskById(taskId: number) {
    return this.db.prepare("SELECT * FROM execution_tasks WHERE id = ?").get(taskId);
  }

  getExecutionTaskDetailMeta(taskId: number) {
    return this.db.prepare(`
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
  }

  getExecutionTaskDetailItems(taskId: number) {
    return this.db.prepare(`
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
  }

  listSuiteRuns() {
    return this.db.prepare(`
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
        CASE WHEN et.status IN ('RUNNING', 'PENDING') THEN 0 ELSE 1 END,
        et.started_at DESC
      LIMIT 20
    `).all();
  }

  createExecutionTask(payload: CreateExecutionTaskRecord) {
    const info = this.db.prepare(`
      INSERT INTO execution_tasks (type, status, asset_id, suite_id, test_case_id, total_items, current_test_case_id, initiated_by, stop_on_failure, executor, runtime_inputs, source_task_id, retry_count)
      VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.type,
      payload.assetId || null,
      payload.suiteId || null,
      payload.testCaseId || null,
      payload.totalItems,
      payload.currentTestCaseId || null,
      payload.initiatedBy || "System",
      payload.stopOnFailure ? 1 : 0,
      payload.executor || "python",
      payload.runtimeInputs || "{}",
      payload.sourceTaskId || null,
      payload.retryCount || 0
    );
    return Number(info.lastInsertRowid);
  }

  insertExecutionTaskItems(taskId: number, testCaseIds: number[]) {
    const insertItem = this.db.prepare(`
      INSERT INTO execution_task_items (task_id, test_case_id, sort_order)
      VALUES (?, ?, ?)
    `);
    testCaseIds.forEach((id, index) => insertItem.run(taskId, id, index + 1));
  }

  listExecutionTaskCaseIds(taskId: number) {
    return this.db.prepare(`
      SELECT test_case_id
      FROM execution_task_items
      WHERE task_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(taskId) as Array<{ test_case_id: number }>;
  }
}
