import type { ExecutorAdapterPlugin } from "./types";

export const shellAdapterPlugin: ExecutorAdapterPlugin = {
  name: "shell",
  order: 10,
  create: (runtime) => ({
    name: "shell",
    matches: (_task, item) =>
      item.executor_type === "shell" ||
      Boolean(item.test_tool?.startsWith("shell:")) ||
      runtime.executionMode === "script",
    run: runtime.shellExecutor,
  }),
};
