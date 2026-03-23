import type { ExecutorAdapterPlugin } from "./types";

const isCanoeCase = (item: { executor_type?: string | null; test_tool?: string | null; title?: string | null; description?: string | null; script_path?: string | null }) => {
  const executor = String(item.executor_type || "").trim().toLowerCase();
  if (executor === "canoe") return true;
  const haystack = [item.test_tool, item.title, item.description, item.script_path]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("canoe") || haystack.includes(".cfg");
};

export const canoeAdapterPlugin: ExecutorAdapterPlugin = {
  name: "canoe",
  order: 30,
  create: (runtime) => ({
    name: "canoe",
    matches: (_task, item) => isCanoeCase(item),
    run: runtime.canoeExecutor,
  }),
};
