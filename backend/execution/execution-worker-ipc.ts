export type WorkerStatePayload = {
  runningTaskId: number | null;
  queuedTaskIds: number[];
};

export type WorkerRequest =
  | { type: "enqueue"; requestId: string; taskId: number }
  | { type: "cancel"; requestId: string; taskId: number }
  | { type: "requeue"; requestId: string }
  | { type: "state"; requestId: string };

export type WorkerResponse =
  | { type: "response"; requestId: string; success: true; data?: any }
  | { type: "response"; requestId: string; success: false; error: string }
  | { type: "event"; data: any }
  | { type: "ready" };

