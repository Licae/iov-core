import {
  ExecutionTaskService,
  type CreateExecutionTaskPayload,
} from "./execution-task-service";
import { ExecutionRunner } from "./execution-runner";
import { ExecutionOrchestrator } from "./execution-orchestrator";
import type { ExecutionTaskRecord } from "../repositories";
import type { SqliteDb } from "../types";

type CreateExecutionRuntimeOptions = {
  db: SqliteDb;
  broadcast: (data: unknown) => void;
  executionMode: string;
  executionScript?: string;
  pythonExecutable: string;
  pythonSecurityRunner: string;
  enabledExecutorPlugins?: string[];
  maxTaskRetries: number;
  artifactRoot: string;
  createTaskArtifactDir: (taskId: number, itemId: number, artifactType: "payloads" | "adb-push" | "adb-pull" | "logs") => string;
  scheduleTaskArtifactCleanup: (task: ExecutionTaskRecord) => void;
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
  const decorateTaskRetryMeta = (task: ExecutionTaskRecord) => executionTaskService.decorateTaskRetryMeta(task);
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

  const submitExecutionTask = (payload: CreateExecutionTaskPayload) => {
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
