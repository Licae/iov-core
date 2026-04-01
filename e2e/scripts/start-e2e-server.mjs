import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const runtimeDbPath = path.resolve(rootDir, "runtime-data", "v2x_testing.db");
const emptyDbPath = path.resolve(rootDir, "v2x_testing.db.empty.bak");
const e2eDir = path.resolve(rootDir, "tmp", "playwright");
const e2eDbPath = path.resolve(e2eDir, "v2x_testing.e2e.db");
const sourceDbPath = existsSync(runtimeDbPath) ? runtimeDbPath : emptyDbPath;

mkdirSync(e2eDir, { recursive: true });
rmSync(e2eDbPath, { force: true });
cpSync(sourceDbPath, e2eDbPath);

const child = spawn(process.execPath, ["--import", "tsx", "backend/server.ts"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT || "3100",
    DB_PATH: path.relative(rootDir, e2eDbPath),
    EXECUTION_MODE: "simulate",
    ENABLE_DEMO_SEED: "false",
    ARTIFACT_CLEAN_ON_START: "true",
    RUNTIME_ARTIFACTS_DIR: path.relative(rootDir, path.resolve(e2eDir, "artifacts")),
  },
});

const stopChild = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
