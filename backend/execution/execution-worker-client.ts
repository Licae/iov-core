import { spawn, type ChildProcess } from "child_process";
import type { WorkerRequest, WorkerResponse, WorkerStatePayload } from "./execution-worker-ipc";

type ExecutionWorkerClientOptions = {
  cwd: string;
  onEvent?: (event: any) => void;
  onReady?: () => void | Promise<void>;
  autoRestart?: boolean;
  restartDelayMs?: number;
  maxRestartDelayMs?: number;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type WorkerRequestPayload =
  | { type: "enqueue"; taskId: number }
  | { type: "cancel"; taskId: number }
  | { type: "requeue" }
  | { type: "state" };

export class ExecutionWorkerClient {
  private readonly cwd: string;
  private readonly onEvent?: (event: any) => void;
  private readonly onReady?: () => void | Promise<void>;
  private readonly autoRestart: boolean;
  private readonly restartDelayMs: number;
  private readonly maxRestartDelayMs: number;
  private child: ChildProcess | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private requestSeq = 0;
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartAttempts = 0;

  constructor(options: ExecutionWorkerClientOptions) {
    this.cwd = options.cwd;
    this.onEvent = options.onEvent;
    this.onReady = options.onReady;
    this.autoRestart = options.autoRestart !== false;
    this.restartDelayMs = Math.max(500, Number(options.restartDelayMs ?? 1_000));
    this.maxRestartDelayMs = Math.max(this.restartDelayMs, Number(options.maxRestartDelayMs ?? 15_000));
  }

  async start() {
    this.stopping = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child && this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    const child = spawn(process.execPath, ["--import", "tsx", "backend/execution/execution-worker-process.ts"], {
      cwd: this.cwd,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: process.env,
    });

    this.child = child;

    child.on("message", (message: WorkerResponse) => this.handleMessage(message));
    child.on("exit", (code, signal) => {
      const reason = new Error(`Worker process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      this.readyReject?.(reason);
      this.pending.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(reason);
      });
      this.pending.clear();
      this.child = null;
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
      if (!this.stopping && this.autoRestart) {
        this.scheduleRestart();
      }
    });

    child.on("error", (error) => {
      this.pending.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(error);
      });
      this.pending.clear();
    });

    await this.readyPromise;
  }

  stop() {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.child) return;
    this.child.kill("SIGTERM");
    this.child = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
  }

  async enqueue(taskId: number) {
    await this.request({ type: "enqueue", taskId });
  }

  async cancel(taskId: number) {
    return Boolean(await this.request({ type: "cancel", taskId }));
  }

  async requeuePendingTasks() {
    return Number(await this.request({ type: "requeue" })) || 0;
  }

  async getWorkerState(): Promise<WorkerStatePayload> {
    return (await this.request({ type: "state" })) as WorkerStatePayload;
  }

  private async request(payload: WorkerRequestPayload) {
    if (!this.child || !this.readyPromise) {
      await this.start();
    }
    const child = this.child;
    if (!child) {
      throw new Error("Worker process is not available");
    }

    const requestId = `${Date.now()}-${++this.requestSeq}`;
    const message: WorkerRequest = { ...payload, requestId } as WorkerRequest;

    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Worker request timeout: ${payload.type}`));
      }, 30000);

      this.pending.set(requestId, { resolve, reject, timer });
      child.send(message, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private handleMessage(message: WorkerResponse) {
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") {
      this.restartAttempts = 0;
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      Promise.resolve(this.onReady?.()).catch((error) => {
        console.error("[worker] onReady callback failed", error);
      });
      return;
    }
    if (message.type === "event") {
      this.onEvent?.(message.data);
      return;
    }
    if (message.type !== "response") return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.success) {
      pending.resolve(message.data);
      return;
    }
    const errorMessage = message.success === false ? message.error : "Worker request failed";
    pending.reject(new Error(errorMessage || "Worker request failed"));
  }

  private scheduleRestart() {
    if (this.restartTimer) return;
    const delay = Math.min(this.maxRestartDelayMs, this.restartDelayMs * Math.max(1, 2 ** this.restartAttempts));
    this.restartAttempts += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start().catch((error) => {
        console.error("[worker] auto restart failed", error);
        this.scheduleRestart();
      });
    }, delay);
    this.restartTimer.unref();
  }
}
