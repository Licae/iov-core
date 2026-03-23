export type ExecutionWorkerState = {
  runningTaskId: number | null;
  queuedTaskIds: number[];
};

type ExecutionWorkerOptions = {
  runTask: (taskId: number) => Promise<void>;
  onError?: (taskId: number, error: unknown) => void;
  onStateChange?: (state: ExecutionWorkerState) => void;
};

export class ExecutionWorker {
  private readonly queue: number[] = [];
  private readonly queuedSet = new Set<number>();
  private runningTaskId: number | null = null;
  private readonly runTask: (taskId: number) => Promise<void>;
  private readonly onError?: (taskId: number, error: unknown) => void;
  private readonly onStateChange?: (state: ExecutionWorkerState) => void;

  constructor(options: ExecutionWorkerOptions) {
    this.runTask = options.runTask;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;
  }

  enqueue(taskId: number) {
    if (!Number.isFinite(taskId) || taskId <= 0) return false;
    if (this.runningTaskId === taskId || this.queuedSet.has(taskId)) return false;

    this.queue.push(taskId);
    this.queuedSet.add(taskId);
    this.emitState();
    this.pump();
    return true;
  }

  remove(taskId: number) {
    if (!this.queuedSet.has(taskId)) return false;
    const index = this.queue.indexOf(taskId);
    if (index >= 0) this.queue.splice(index, 1);
    this.queuedSet.delete(taskId);
    this.emitState();
    return true;
  }

  getState(): ExecutionWorkerState {
    return {
      runningTaskId: this.runningTaskId,
      queuedTaskIds: [...this.queue],
    };
  }

  private emitState() {
    this.onStateChange?.(this.getState());
  }

  private async pump() {
    if (this.runningTaskId !== null) return;
    const nextTaskId = this.queue.shift();
    if (!nextTaskId) {
      this.emitState();
      return;
    }

    this.queuedSet.delete(nextTaskId);
    this.runningTaskId = nextTaskId;
    this.emitState();

    try {
      await this.runTask(nextTaskId);
    } catch (error) {
      this.onError?.(nextTaskId, error);
    } finally {
      this.runningTaskId = null;
      this.emitState();
      queueMicrotask(() => this.pump());
    }
  }
}

