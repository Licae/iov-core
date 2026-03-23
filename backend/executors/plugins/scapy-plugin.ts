import type { ExecutorAdapterPlugin } from "./types";

const isScapyCase = (item: { executor_type?: string | null; test_tool?: string | null; title?: string | null; description?: string | null }) => {
  const executor = String(item.executor_type || "").trim().toLowerCase();
  if (executor === "scapy") return true;
  const haystack = [item.test_tool, item.title, item.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("scapy") || haystack.includes("pcap");
};

export const scapyAdapterPlugin: ExecutorAdapterPlugin = {
  name: "scapy",
  order: 20,
  create: (runtime) => ({
    name: "scapy",
    matches: (_task, item) => isScapyCase(item),
    run: runtime.scapyExecutor,
  }),
};
