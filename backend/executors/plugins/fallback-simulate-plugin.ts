import type { ExecutorAdapterPlugin } from "./types";

export const fallbackSimulateAdapterPlugin: ExecutorAdapterPlugin = {
  name: "fallback-simulate",
  order: 1000,
  create: (runtime) => ({
    name: "simulate",
    matches: () => true,
    run: runtime.simulateExecutor,
  }),
};
