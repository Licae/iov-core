import type { ExecutorAdapterPlugin } from "./types";

const isPythonLikeCase = (executionMode: string, item: {
  executor_type?: string | null;
  test_tool?: string | null;
  title?: string | null;
  category?: string | null;
  description?: string | null;
  test_input?: string | null;
}) => {
  if (String(item.executor_type || "").trim().toLowerCase() === "python") return true;
  const tool = String(item.test_tool || "").toLowerCase();
  const signature = [item.title, item.category, item.description, item.test_input, item.test_tool]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tool.startsWith("python:") ||
    tool.includes("security") ||
    signature.includes("安全") ||
    signature.includes("渗透") ||
    signature.includes("ssh") ||
    signature.includes("firewall") ||
    executionMode === "python";
};

export const pythonAdapterPlugin: ExecutorAdapterPlugin = {
  name: "python",
  order: 40,
  create: (runtime) => ({
    name: "python",
    matches: (_task, item) => isPythonLikeCase(runtime.executionMode, item),
    run: runtime.pythonExecutor,
  }),
};
