import type {
  Asset,
  Defect,
  ExecutionTask,
  ExecutionTaskDetail,
  RecentRun,
  ReverificationTodo,
  Requirement,
  RequirementCoverageSnapshot,
  SettingsMap,
  Stats,
  SuiteRun,
  TaraItem,
  TestCase,
  TestRun,
  TestSuite,
} from "./types";

type RequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
  signal?: AbortSignal;
};

const toErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const candidate = (payload as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
};

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Request failed: ${response.status}`));
  }
  return payload as T;
}

export const apiClient = {
  getTestCases: (signal?: AbortSignal) => request<TestCase[]>("/api/test-cases", { signal }),
  getStats: (signal?: AbortSignal) => request<Stats>("/api/stats", { signal }),
  getTrend: (signal?: AbortSignal) => request<Array<{ date: string; passRate: number; runs: number }>>("/api/stats/trend", { signal }),
  getCoverage: (signal?: AbortSignal) => request<Array<{ name: string; coverage: number; status: string }>>("/api/stats/coverage", { signal }),
  getDefects: (signal?: AbortSignal) => request<Defect[]>("/api/defects", { signal }),
  getAssets: (signal?: AbortSignal) => request<Asset[]>("/api/assets", { signal }),
  getSettings: (signal?: AbortSignal) => request<SettingsMap>("/api/settings", { signal }),
  getRequirements: (signal?: AbortSignal) => request<Requirement[]>("/api/requirements", { signal }),
  getRequirementCoverage: (signal?: AbortSignal) =>
    request<RequirementCoverageSnapshot>("/api/requirements/coverage-matrix", { signal }),
  getReverificationTodos: (signal?: AbortSignal) =>
    request<{ todos: ReverificationTodo[] }>("/api/reverification-todos", { signal }),
  getTaraItems: (signal?: AbortSignal) => request<TaraItem[]>("/api/tara-items", { signal }),
  getSuites: (signal?: AbortSignal) => request<TestSuite[]>("/api/test-suites", { signal }),
  getSuiteRuns: (signal?: AbortSignal) => request<SuiteRun[]>("/api/suite-runs", { signal }),
  getTasks: (signal?: AbortSignal) => request<ExecutionTask[]>("/api/tasks", { signal }),
  getRecentRuns: (signal?: AbortSignal) => request<RecentRun[]>("/api/dashboard/recent-runs", { signal }),
  getTaskDetail: (taskId: number, signal?: AbortSignal) => request<ExecutionTaskDetail>(`/api/tasks/${taskId}`, { signal }),
  getHistory: (testCaseId: number, signal?: AbortSignal) => request<TestRun[]>(`/api/test-cases/${testCaseId}/history`, { signal }),

  runTestCase: (testCaseId: number, body?: Record<string, unknown>) =>
    request<{ success: boolean; taskId?: number }>(`/api/test-cases/${testCaseId}/run`, { method: "POST", body: body || {} }),
  runSuite: (suiteId: number | string, body: Record<string, unknown>) =>
    request<{ id: number; success: boolean }>(`/api/test-suites/${suiteId}/run`, { method: "POST", body }),
  runCases: (body: Record<string, unknown>) =>
    request<{ id: number; success: boolean }>("/api/test-runs", { method: "POST", body }),
  cancelTask: (taskId: number) => request<{ success: boolean }>(`/api/tasks/${taskId}/cancel`, { method: "PATCH" }),
  retryTask: (taskId: number) => request<{ success: boolean; id: number }>(`/api/tasks/${taskId}/retry`, { method: "POST" }),

  createCase: (body: Record<string, unknown>) => request<{ id: number }>("/api/test-cases", { method: "POST", body }),
  updateCase: (testCaseId: number, body: Record<string, unknown>) => request<{ success: boolean }>(`/api/test-cases/${testCaseId}`, { method: "PATCH", body }),
  deleteCase: (testCaseId: number) => request<{ success: boolean }>(`/api/test-cases/${testCaseId}`, { method: "DELETE" }),
  importCases: (cases: unknown[]) => request<{ success: boolean; count: number }>("/api/test-cases/import", { method: "POST", body: { cases } }),
  updateCaseStatus: (testCaseId: number, status: string) =>
    request<{ success: boolean }>(`/api/test-cases/${testCaseId}/status`, { method: "PATCH", body: { status } }),
  updateCaseLinks: (testCaseId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/test-cases/${testCaseId}/links`, { method: "PUT", body }),

  createRequirement: (body: Record<string, unknown>) => request<{ id: number }>("/api/requirements", { method: "POST", body }),
  updateRequirement: (requirementId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/requirements/${requirementId}`, { method: "PATCH", body }),
  deleteRequirement: (requirementId: number) =>
    request<{ success: boolean }>(`/api/requirements/${requirementId}`, { method: "DELETE" }),
  updateRequirementLinks: (requirementId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/requirements/${requirementId}/links`, { method: "PUT", body }),
  updateRequirementAssets: (requirementId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/requirements/${requirementId}/assets`, { method: "PUT", body }),

  createTaraItem: (body: Record<string, unknown>) => request<{ id: number }>("/api/tara-items", { method: "POST", body }),
  updateTaraItem: (taraId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/tara-items/${taraId}`, { method: "PATCH", body }),
  deleteTaraItem: (taraId: number) =>
    request<{ success: boolean }>(`/api/tara-items/${taraId}`, { method: "DELETE" }),
  updateTaraLinks: (taraId: number, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/tara-items/${taraId}/links`, { method: "PUT", body }),

  createSuite: (body: Record<string, unknown>) => request<{ id: number }>("/api/test-suites", { method: "POST", body }),
  deleteSuite: (suiteId: number) => request<{ success: boolean }>(`/api/test-suites/${suiteId}`, { method: "DELETE" }),

  createAsset: (body: Record<string, unknown>) => request<{ id: number }>("/api/assets", { method: "POST", body }),
  updateAsset: (assetId: number, body: Record<string, unknown>) => request<{ success: boolean }>(`/api/assets/${assetId}`, { method: "PATCH", body }),
  deleteAsset: (assetId: number) => request<{ success: boolean }>(`/api/assets/${assetId}`, { method: "DELETE" }),
  pingAsset: (assetId: number) =>
    request<{ success: boolean; asset_id: number; name: string; address: string; latency_ms?: number; output?: string }>(`/api/assets/${assetId}/ping`, { method: "POST" }),

  analyzeDefect: (defectId: string) => request<{ analysis?: string }>(`/api/defects/${defectId}/analyze`, { method: "POST" }),
  updateSetting: (key: string, value: boolean) =>
    request<{ success: boolean }>(`/api/settings/${key}`, { method: "PATCH", body: { value } }),
};
