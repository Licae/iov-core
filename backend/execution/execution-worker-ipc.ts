export type WorkerStatePayload = {
  runningTaskId: number | null;
  queuedTaskIds: number[];
};

export type WorkerEventPayload = unknown;
export type WorkerResponseData = unknown;

export type WorkerRequest =
  | { type: "enqueue"; requestId: string; taskId: number }
  | { type: "cancel"; requestId: string; taskId: number }
  | { type: "requeue"; requestId: string }
  | { type: "state"; requestId: string };

export type WorkerResponse =
  | { type: "response"; requestId: string; success: true; data?: WorkerResponseData }
  | { type: "response"; requestId: string; success: false; error: string }
  | { type: "event"; data: WorkerEventPayload }
  | { type: "ready" };
