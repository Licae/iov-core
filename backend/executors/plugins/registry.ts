import { canoeAdapterPlugin } from "./canoe-plugin";
import { fallbackSimulateAdapterPlugin } from "./fallback-simulate-plugin";
import { pythonAdapterPlugin } from "./python-plugin";
import { scapyAdapterPlugin } from "./scapy-plugin";
import { shellAdapterPlugin } from "./shell-plugin";
import { simulateAdapterPlugin } from "./simulate-plugin";
import type { ExecutorAdapter, ExecutorAdapterPlugin, ExecutorAdapterPluginRuntime } from "./types";

const pluginCatalog: Record<string, ExecutorAdapterPlugin> = {
  shell: shellAdapterPlugin,
  scapy: scapyAdapterPlugin,
  canoe: canoeAdapterPlugin,
  python: pythonAdapterPlugin,
  simulate: simulateAdapterPlugin,
  "fallback-simulate": fallbackSimulateAdapterPlugin,
};

const defaultPluginNames = [
  "shell",
  "scapy",
  "canoe",
  "python",
  "simulate",
  "fallback-simulate",
];

const resolvePluginsByNames = (names: string[]) => {
  const selected = names
    .map((name) => pluginCatalog[name])
    .filter(Boolean);
  if (!selected.length) {
    return defaultPluginNames.map((name) => pluginCatalog[name]).filter(Boolean);
  }
  if (!names.includes("fallback-simulate")) {
    selected.push(pluginCatalog["fallback-simulate"]);
  }
  return selected;
};

export const parseExecutorPluginNames = (raw?: string) => {
  const normalized = String(raw || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!normalized.length) return defaultPluginNames;
  const unique = Array.from(new Set(normalized));
  const known = unique.filter((name) => name in pluginCatalog);
  return known.length ? known : defaultPluginNames;
};

const defaultPlugins: ExecutorAdapterPlugin[] = [
  shellAdapterPlugin,
  scapyAdapterPlugin,
  canoeAdapterPlugin,
  pythonAdapterPlugin,
  simulateAdapterPlugin,
  fallbackSimulateAdapterPlugin,
];

export const createExecutorAdapterRegistry = (
  runtime: ExecutorAdapterPluginRuntime,
  options?: { enabledPluginNames?: string[] },
  extraPlugins: ExecutorAdapterPlugin[] = [],
): ExecutorAdapter[] => {
  const configuredNames = options?.enabledPluginNames || defaultPluginNames;
  const configuredPlugins = resolvePluginsByNames(configuredNames);
  const sourcePlugins = configuredPlugins.length ? configuredPlugins : defaultPlugins;
  return [...sourcePlugins, ...extraPlugins]
    .sort((a, b) => a.order - b.order)
    .map((plugin) => plugin.create(runtime));
};
