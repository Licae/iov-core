import { ExecutionTaskService } from "./execution-task-service";
import { ExecutionRunner } from "./execution-runner";
import { ExecutionOrchestrator } from "./execution-orchestrator";

type ExecutionTaskRecord = {
  id: number;
  type: "single" | "suite";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";
  asset_id?: number | null;
  suite_id?: number | null;
  test_case_id?: number | null;
  total_items: number;
  completed_items: number;
  passed_items: number;
  failed_items: number;
  blocked_items: number;
  current_test_case_id?: number | null;
  current_item_label?: string | null;
  started_at: string;
  finished_at?: string | null;
  initiated_by?: string | null;
  error_message?: string | null;
  stop_on_failure?: number;
  executor?: string | null;
  source_task_id?: number | null;
  retry_count?: number;
  runtime_inputs?: string | null;
  failure_category?: string | null;
  can_retry?: boolean;
  retry_block_reason?: string | null;
};

type CreateExecutionRuntimeOptions = {
  db: any;
  broadcast: (data: any) => void;
  executionMode: string;
  executionScript?: string;
  pythonExecutable: string;
  pythonSecurityRunner: string;
  enabledExecutorPlugins?: string[];
  maxTaskRetries: number;
  artifactRoot: string;
  createTaskArtifactDir: (taskId: number, itemId: number, artifactType: "payloads" | "adb-push" | "adb-pull" | "logs") => string;
  scheduleTaskArtifactCleanup: (task: any) => void;
};

export const createExecutionRuntime = (options: CreateExecutionRuntimeOptions) => {
  const {
    db,
    broadcast,
    executionMode,
    executionScript,
    pythonExecutable,
    pythonSecurityRunner,
    enabledExecutorPlugins,
    maxTaskRetries,
    artifactRoot,
    createTaskArtifactDir,
    scheduleTaskArtifactCleanup,
  } = options;

  const executionTaskService = new ExecutionTaskService({
    db,
    executionMode,
    maxTaskRetries,
  });

  const getRetryDecision = (task: ExecutionTaskRecord) => executionTaskService.getRetryDecision(task);
  const decorateTaskRetryMeta = <T>(task: T): T => executionTaskService.decorateTaskRetryMeta(task as any) as T;
  const listTestSuites = () => executionTaskService.listTestSuites();
  const listExecutionTasks = () => executionTaskService.listExecutionTasks();
  const getExecutionTaskDetail = (taskId: number) => executionTaskService.getExecutionTaskDetail(taskId);
  const listSuiteRuns = () => executionTaskService.listSuiteRuns();
  const executionRunner = new ExecutionRunner({
    executionMode,
    executionScript,
    pythonExecutable,
    pythonSecurityRunner,
    enabledExecutorPlugins,
    artifactRoot,
    createTaskArtifactDir,
    broadcast,
  });

  const createExecutionTask = (payload: Parameters<ExecutionTaskService["createExecutionTask"]>[0]) =>
    executionTaskService.createExecutionTask(payload);
  const cloneExecutionTask = (taskId: number) => executionTaskService.cloneExecutionTask(taskId);
  const executionOrchestrator = new ExecutionOrchestrator({
    db,
    executionRunner,
    broadcast,
    decorateTaskRetryMeta,
    scheduleTaskArtifactCleanup,
  });

  const enqueueExecutionTask = (taskId: number) => {
    executionOrchestrator.enqueue(taskId);
  };

  type ExecutionTaskSubmitPayload = Parameters<typeof createExecutionTask>[0];
  const submitExecutionTask = (payload: ExecutionTaskSubmitPayload) => {
    const taskId = createExecutionTask(payload);
    enqueueExecutionTask(taskId);
    return taskId;
  };

  const requeuePendingExecutionTasks = () => executionOrchestrator.requeuePendingTasks();
  const cancelExecutionTask = (taskId: number) => executionOrchestrator.cancelTask(taskId);

  return {
    listExecutionTasks,
    getExecutionTaskDetail,
    submitExecutionTask,
    listTestSuites,
    listSuiteRuns,
    cancelExecutionTask,
    getRetryDecision,
    cloneExecutionTask,
    enqueueExecutionTask,
    getWorkerState: () => executionOrchestrator.getWorkerState(),
    requeuePendingExecutionTasks,
  };
};
