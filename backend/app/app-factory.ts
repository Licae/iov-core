import express, { type Express } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import {
  registerTaskRoutes,
  registerCaseRoutes,
  registerAssetRoutes,
  registerSystemRoutes,
  registerRequirementRoutes,
  registerTaraRoutes,
} from "../routes";

type BroadcastFn = (data: any) => void;
type PingAddressFn = (address: string) => Promise<{ success: boolean; latency_ms?: number; output: string }>;

type ApiRouteDeps = {
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
  generateDefectAnalysis: (defect: any) => Promise<any>;
  buildReportHtml: () => string;
  pingAddress: PingAddressFn;
};

export const createAppServerBase = () => {
  const app = express();
  const server = http.createServer(app);
  app.use(express.json());
  return { app, server };
};

export const attachRealtimeBroadcast = (server: http.Server): BroadcastFn => {
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  return (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };
};

export const createPingAddress = (): PingAddressFn =>
  (address: string) =>
    new Promise<{ success: boolean; latency_ms?: number; output: string }>((resolve) => {
      const child = spawn("ping", ["-c", "1", address], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ success: false, output: stderr || stdout || "Ping timeout" });
      }, 5000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const output = `${stdout}${stderr}`.trim();
        const latencyMatch = output.match(/time[=<]([0-9.]+)\s*ms/i);
        resolve({
          success: code === 0,
          latency_ms: latencyMatch ? Number(latencyMatch[1]) : undefined,
          output,
        });
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve({ success: false, output: error.message });
      });
    });

export const registerApiRoutes = (app: Express, deps: ApiRouteDeps) => {
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
    generateDefectAnalysis,
    buildReportHtml,
    pingAddress,
  } = deps;

  registerCaseRoutes(app, { db });
  registerTaskRoutes(app, {
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
  });
  registerSystemRoutes(app, {
    db,
    generateDefectAnalysis,
    buildReportHtml,
  });
  registerRequirementRoutes(app, { db });
  registerTaraRoutes(app, { db });
  registerAssetRoutes(app, {
    db,
    pingAddress,
  });
};

export const setupFrontendMiddleware = async (app: Express) => {
  if (process.env.NODE_ENV !== "production") {
    const hmrPort = Number(process.env.VITE_HMR_PORT || "24679");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: hmrPort,
          clientPort: hmrPort,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
};
