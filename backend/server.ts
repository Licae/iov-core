import path from "path";
import { existsSync, mkdirSync } from "fs";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { initializeDatabase, runDatabaseMaintenance } from "./db";
import {
  createArtifactManager,
  createDefectAnalysisGenerator,
  createReportHtmlBuilder,
  SECURITY_BASELINE_CASE_TITLES_DEFAULT,
  ensureSecurityBaselineSuite,
  seedDemoDataIfNeeded,
  syncAllTaraAffectedAssets,
} from "./services";
import { attachRealtimeBroadcast, createAppServerBase, createPingAddress, registerApiRoutes, setupFrontendMiddleware } from "./app";
import { ExecutionTaskService, ExecutionWorkerClient } from "./execution";

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
const ENABLE_DEMO_SEED = process.env.ENABLE_DEMO_SEED === "true";

const EXECUTION_MODE = process.env.EXECUTION_MODE === "script" ? "script" : process.env.EXECUTION_MODE === "shell" ? "script" : process.env.EXECUTION_MODE === "simulate" ? "simulate" : "python";
const MAX_TASK_RETRIES = Number(process.env.MAX_TASK_RETRIES ?? "3");
const artifactManager = createArtifactManager({
  rootDir: path.resolve(process.cwd(), process.env.RUNTIME_ARTIFACTS_DIR || "runtime-artifacts"),
  retentionHoursPass: Number(process.env.ARTIFACT_RETENTION_HOURS_PASS ?? "0"),
  retentionHoursFail: Number(process.env.ARTIFACT_RETENTION_HOURS_FAIL ?? "24"),
  retentionHoursCancel: Number(process.env.ARTIFACT_RETENTION_HOURS_CANCEL ?? "2"),
  maxSizeMb: Number(process.env.ARTIFACT_MAX_SIZE_MB ?? "2048"),
  maxDirs: Number(process.env.ARTIFACT_MAX_DIRS ?? "5000"),
  cleanOnStart: process.env.ARTIFACT_CLEAN_ON_START !== "false",
});
const SECURITY_BASELINE_SUITE_NAME = process.env.SECURITY_BASELINE_SUITE_NAME || "系统安全基线套件";
const SECURITY_BASELINE_CASE_TITLES = [...SECURITY_BASELINE_CASE_TITLES_DEFAULT];
const generateDefectAnalysis = createDefectAnalysisGenerator(process.env.GEMINI_API_KEY);
const buildReportHtml = createReportHtmlBuilder(db);
const DB_ARCHIVE_RETENTION_DAYS = Number(process.env.DB_ARCHIVE_RETENTION_DAYS ?? "30");
const DB_ARCHIVE_BATCH_SIZE = Number(process.env.DB_ARCHIVE_BATCH_SIZE ?? "500");
const DB_MAINTENANCE_INTERVAL_MS = Number(process.env.DB_MAINTENANCE_INTERVAL_MS ?? String(30 * 60 * 1000));

initializeDatabase(db);
const syncedTaraAffectedAssetsCount = syncAllTaraAffectedAssets(db);
if (syncedTaraAffectedAssetsCount > 0) {
  console.log(`[tara] Synced affected assets for ${syncedTaraAffectedAssetsCount} TARA item(s)`);
}

async function startServer() {
  artifactManager.prepareOnStart();
  const initialMaintenance = runDatabaseMaintenance(db, {
    retentionDays: DB_ARCHIVE_RETENTION_DAYS,
    batchSize: DB_ARCHIVE_BATCH_SIZE,
  });
  if (initialMaintenance.totalArchived > 0) {
    console.log(
      `[db] Archived test_runs=${initialMaintenance.testRunsArchived}, tasks=${initialMaintenance.executionTasksArchived}, items=${initialMaintenance.executionTaskItemsArchived}`,
    );
  }

  const { app, server } = createAppServerBase();
  const broadcast = attachRealtimeBroadcast(server);
  const pingAddress = createPingAddress();
  const PORT = Number(process.env.PORT || "3000");

  const executionTaskService = new ExecutionTaskService({
    db,
    executionMode: EXECUTION_MODE,
    maxTaskRetries: MAX_TASK_RETRIES,
  });
  let executionWorkerClient: ExecutionWorkerClient;
  executionWorkerClient = new ExecutionWorkerClient({
    cwd: process.cwd(),
    onEvent: (event) => broadcast(event),
    onReady: async () => {
      try {
        const recoveredTaskCount = await executionWorkerClient.requeuePendingTasks();
        if (recoveredTaskCount > 0) {
          console.log(`[worker] Requeued ${recoveredTaskCount} pending/running task(s)`);
        }
      } catch (error) {
        console.error("[worker] failed to recover pending tasks", error);
      }
    },
  });
  await executionWorkerClient.start();

  const submitExecutionTask = async (payload: Parameters<ExecutionTaskService["createExecutionTask"]>[0]) => {
    const taskId = executionTaskService.createExecutionTask(payload);
    await executionWorkerClient.enqueue(taskId);
    return taskId;
  };

  registerApiRoutes(app, {
    db,
    listExecutionTasks: () => executionTaskService.listExecutionTasks(),
    getExecutionTaskDetail: (taskId) => executionTaskService.getExecutionTaskDetail(taskId),
    submitExecutionTask,
    listTestSuites: () => executionTaskService.listTestSuites(),
    listSuiteRuns: () => executionTaskService.listSuiteRuns(),
    cancelExecutionTask: (taskId) => executionWorkerClient.cancel(taskId),
    getRetryDecision: (task) => executionTaskService.getRetryDecision(task),
    cloneExecutionTask: (taskId) => executionTaskService.cloneExecutionTask(taskId),
    enqueueExecutionTask: (taskId) => executionWorkerClient.enqueue(taskId),
    getWorkerState: () => executionWorkerClient.getWorkerState(),
    generateDefectAnalysis,
    buildReportHtml,
    pingAddress,
  });

  await setupFrontendMiddleware(app);

  seedDemoDataIfNeeded(db, { enabled: ENABLE_DEMO_SEED });

  const baselineSuiteId = ensureSecurityBaselineSuite(db, SECURITY_BASELINE_SUITE_NAME, SECURITY_BASELINE_CASE_TITLES);
  if (baselineSuiteId) {
    console.log(`[suite] Security baseline suite ready (id=${baselineSuiteId})`);
  }

  process.on("exit", () => executionWorkerClient.stop());
  process.on("SIGINT", () => executionWorkerClient.stop());
  process.on("SIGTERM", () => executionWorkerClient.stop());

  const maintenanceTimer = setInterval(() => {
    try {
      const maintenance = runDatabaseMaintenance(db, {
        retentionDays: DB_ARCHIVE_RETENTION_DAYS,
        batchSize: DB_ARCHIVE_BATCH_SIZE,
      });
      if (maintenance.totalArchived > 0) {
        console.log(
          `[db] Archived test_runs=${maintenance.testRunsArchived}, tasks=${maintenance.executionTasksArchived}, items=${maintenance.executionTaskItemsArchived}`,
        );
      }
    } catch (error) {
      console.error("[db] maintenance failed", error);
    }
  }, DB_MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
