import path from "path";
import { existsSync, mkdirSync } from "fs";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import { initializeDatabase } from "../db";
import { createArtifactManager } from "../services";
import { createExecutionRuntime } from "./execution-runtime";
import { parseExecutorPluginNames } from "../executors";
import type { WorkerRequest, WorkerResponse } from "./execution-worker-ipc";

dotenv.config();

const resolveDatabasePath = () => {
  const fromEnv = String(process.env.DB_PATH || "").trim();
  if (fromEnv) {
    return path.resolve(process.cwd(), fromEnv);
  }
  const legacyPath = path.resolve(process.cwd(), "v2x_testing.db");
  if (existsSync(legacyPath)) {
    return legacyPath;
  }
  return path.resolve(process.cwd(), "runtime-data", "v2x_testing.db");
};

const DATABASE_PATH = resolveDatabasePath();
mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
const db = new Database(DATABASE_PATH);
initializeDatabase(db);

const executionMode =
  process.env.EXECUTION_MODE === "script"
    ? "script"
    : process.env.EXECUTION_MODE === "shell"
      ? "script"
      : process.env.EXECUTION_MODE === "simulate"
        ? "simulate"
        : "python";

const artifactManager = createArtifactManager({
  rootDir: path.resolve(process.cwd(), process.env.RUNTIME_ARTIFACTS_DIR || "runtime-artifacts"),
  retentionHoursPass: Number(process.env.ARTIFACT_RETENTION_HOURS_PASS ?? "0"),
  retentionHoursFail: Number(process.env.ARTIFACT_RETENTION_HOURS_FAIL ?? "24"),
  retentionHoursCancel: Number(process.env.ARTIFACT_RETENTION_HOURS_CANCEL ?? "2"),
  maxSizeMb: Number(process.env.ARTIFACT_MAX_SIZE_MB ?? "2048"),
  maxDirs: Number(process.env.ARTIFACT_MAX_DIRS ?? "5000"),
  cleanOnStart: false,
});

const safeSend = (payload: WorkerResponse) => {
  if (typeof process.send === "function") {
    process.send(payload);
  }
};

const runtime = createExecutionRuntime({
  db,
  broadcast: (data: unknown) => safeSend({ type: "event", data }),
  executionMode,
  executionScript: process.env.EXECUTION_SCRIPT,
  pythonExecutable: process.env.PYTHON_EXECUTABLE || "python3",
  pythonSecurityRunner: process.env.PYTHON_SECURITY_RUNNER || path.join(process.cwd(), "scripts", "security_runner.py"),
  enabledExecutorPlugins: parseExecutorPluginNames(process.env.EXECUTOR_ADAPTERS),
  maxTaskRetries: Number(process.env.MAX_TASK_RETRIES ?? "3"),
  artifactRoot: artifactManager.artifactRoot,
  createTaskArtifactDir: artifactManager.createTaskArtifactDir,
  scheduleTaskArtifactCleanup: artifactManager.scheduleTaskCleanup,
});

process.on("message", async (raw: WorkerRequest) => {
  if (!raw || typeof raw !== "object" || !("type" in raw)) return;
  const requestId = raw.requestId;
  try {
    if (raw.type === "enqueue") {
      runtime.enqueueExecutionTask(raw.taskId);
      safeSend({ type: "response", requestId, success: true });
      return;
    }
    if (raw.type === "cancel") {
      const result = runtime.cancelExecutionTask(raw.taskId);
      safeSend({ type: "response", requestId, success: true, data: result });
      return;
    }
    if (raw.type === "requeue") {
      const result = runtime.requeuePendingExecutionTasks();
      safeSend({ type: "response", requestId, success: true, data: result });
      return;
    }
    if (raw.type === "state") {
      safeSend({ type: "response", requestId, success: true, data: runtime.getWorkerState() });
      return;
    }
    safeSend({ type: "response", requestId, success: false, error: "Unsupported worker request" });
  } catch (error) {
    safeSend({
      type: "response",
      requestId,
      success: false,
      error: error instanceof Error ? error.message : "Worker request failed",
    });
  }
});

safeSend({ type: "ready" });
