import type { ExecutorAdapterPlugin } from "./types";

export const simulateAdapterPlugin: ExecutorAdapterPlugin = {
  name: "simulate",
  order: 999,
  create: (runtime) => ({
    name: "simulate",
    matches: () => runtime.executionMode === "simulate",
    run: runtime.simulateExecutor,
  }),
};
