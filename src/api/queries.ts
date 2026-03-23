import { useMemo } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type {
  Asset,
  Defect,
  ExecutionTask,
  RecentRun,
  Requirement,
  RequirementCoverageSnapshot,
  SettingsMap,
  Stats,
  SuiteRun,
  TaraItem,
  TestCase,
  TestSuite,
} from "./types";

export const queryKeys = {
  cases: ["cases"] as const,
  stats: ["stats"] as const,
  trend: ["trend"] as const,
  coverage: ["coverage"] as const,
  defects: ["defects"] as const,
  assets: ["assets"] as const,
  settings: ["settings"] as const,
  requirements: ["requirements"] as const,
  requirementCoverage: ["requirement-coverage"] as const,
  taraItems: ["tara-items"] as const,
  suites: ["suites"] as const,
  suiteRuns: ["suite-runs"] as const,
  tasks: ["tasks"] as const,
  recentRuns: ["recent-runs"] as const,
  history: (testCaseId: number) => ["history", testCaseId] as const,
  taskDetail: (taskId: number) => ["task-detail", taskId] as const,
};

type BootstrapData = {
  testCases: TestCase[];
  stats: Stats | null;
  trendData: Array<{ date: string; passRate: number; runs: number }>;
  coverageData: Array<{ name: string; coverage: number; status: string }>;
  defects: Defect[];
  assets: Asset[];
  settings: SettingsMap;
  requirements: Requirement[];
  requirementCoverage: RequirementCoverageSnapshot;
  taraItems: TaraItem[];
  testSuites: TestSuite[];
  suiteRuns: SuiteRun[];
  executionTasks: ExecutionTask[];
  recentRuns: RecentRun[];
  isLoading: boolean;
  isFetching: boolean;
};

const queryConfig = { staleTime: 10_000, gcTime: 5 * 60_000 };

export const useBootstrapData = (): BootstrapData => {
  const results = useQueries({
    queries: [
      { queryKey: queryKeys.cases, queryFn: ({ signal }) => apiClient.getTestCases(signal), ...queryConfig },
      { queryKey: queryKeys.stats, queryFn: ({ signal }) => apiClient.getStats(signal), ...queryConfig },
      { queryKey: queryKeys.trend, queryFn: ({ signal }) => apiClient.getTrend(signal), ...queryConfig },
      { queryKey: queryKeys.coverage, queryFn: ({ signal }) => apiClient.getCoverage(signal), ...queryConfig },
      { queryKey: queryKeys.defects, queryFn: ({ signal }) => apiClient.getDefects(signal), ...queryConfig },
      { queryKey: queryKeys.assets, queryFn: ({ signal }) => apiClient.getAssets(signal), ...queryConfig },
      { queryKey: queryKeys.settings, queryFn: ({ signal }) => apiClient.getSettings(signal), ...queryConfig },
      { queryKey: queryKeys.requirements, queryFn: ({ signal }) => apiClient.getRequirements(signal), ...queryConfig },
      { queryKey: queryKeys.taraItems, queryFn: ({ signal }) => apiClient.getTaraItems(signal), ...queryConfig },
      { queryKey: queryKeys.suites, queryFn: ({ signal }) => apiClient.getSuites(signal), ...queryConfig },
      { queryKey: queryKeys.suiteRuns, queryFn: ({ signal }) => apiClient.getSuiteRuns(signal), ...queryConfig },
      { queryKey: queryKeys.tasks, queryFn: ({ signal }) => apiClient.getTasks(signal), ...queryConfig },
      { queryKey: queryKeys.recentRuns, queryFn: ({ signal }) => apiClient.getRecentRuns(signal), ...queryConfig },
      { queryKey: queryKeys.requirementCoverage, queryFn: ({ signal }) => apiClient.getRequirementCoverage(signal), ...queryConfig },
    ],
  });

  return useMemo(
    () => ({
      testCases: (results[0].data as TestCase[]) || [],
      stats: (results[1].data as Stats) || null,
      trendData: (results[2].data as Array<{ date: string; passRate: number; runs: number }>) || [],
      coverageData: (results[3].data as Array<{ name: string; coverage: number; status: string }>) || [],
      defects: (results[4].data as Defect[]) || [],
      assets: (results[5].data as Asset[]) || [],
      settings: (results[6].data as SettingsMap) || { abort_on_critical_dtc: true, pr_requires_sil: true },
      requirements: (results[7].data as Requirement[]) || [],
      taraItems: (results[8].data as TaraItem[]) || [],
      testSuites: (results[9].data as TestSuite[]) || [],
      suiteRuns: (results[10].data as SuiteRun[]) || [],
      executionTasks: (results[11].data as ExecutionTask[]) || [],
      recentRuns: (results[12].data as RecentRun[]) || [],
      requirementCoverage: (results[13].data as RequirementCoverageSnapshot) || { summary: { total: 0, covered: 0, gap: 0, asset_count: 0 }, rows: [], uncovered: [] },
      isLoading: results.some((query) => query.isLoading),
      isFetching: results.some((query) => query.isFetching),
    }),
    [results],
  );
};

const allRefreshKeys = [
  queryKeys.cases,
  queryKeys.stats,
  queryKeys.trend,
  queryKeys.coverage,
  queryKeys.defects,
  queryKeys.assets,
  queryKeys.settings,
  queryKeys.requirements,
  queryKeys.requirementCoverage,
  queryKeys.taraItems,
  queryKeys.suites,
  queryKeys.suiteRuns,
  queryKeys.tasks,
  queryKeys.recentRuns,
] as const;

export const useRefreshAllData = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      allRefreshKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  };
};

const executionRefreshKeys = [
  queryKeys.tasks,
  queryKeys.recentRuns,
  queryKeys.suiteRuns,
  queryKeys.stats,
  queryKeys.trend,
  queryKeys.coverage,
  queryKeys.cases,
  queryKeys.requirements,
  queryKeys.requirementCoverage,
  queryKeys.taraItems,
] as const;

export const useRefreshExecutionData = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      executionRefreshKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  };
};

const invalidateKeys = async (queryClient: ReturnType<typeof useQueryClient>, keys: readonly (readonly unknown[])[]) => {
  await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
};

export const useAppMutations = () => {
  const queryClient = useQueryClient();

  const invalidateCases = async () => {
    await invalidateKeys(queryClient, [
      queryKeys.cases,
      queryKeys.stats,
      queryKeys.trend,
      queryKeys.coverage,
      queryKeys.recentRuns,
      queryKeys.tasks,
      queryKeys.requirements,
      queryKeys.requirementCoverage,
      queryKeys.taraItems,
    ]);
  };
  const invalidateExecution = async () => {
    await invalidateKeys(queryClient, executionRefreshKeys);
  };
  const invalidateSuites = async () => {
    await invalidateKeys(queryClient, [queryKeys.suites, queryKeys.suiteRuns, queryKeys.tasks]);
  };
  const invalidateAssets = async () => {
    await invalidateKeys(queryClient, [queryKeys.assets, queryKeys.tasks, queryKeys.recentRuns]);
  };
  const invalidateDefects = async () => {
    await invalidateKeys(queryClient, [queryKeys.defects]);
  };
  const invalidateSettings = async () => {
    await invalidateKeys(queryClient, [queryKeys.settings]);
  };
  const invalidateTraceability = async () => {
    await invalidateKeys(queryClient, [queryKeys.cases, queryKeys.requirements, queryKeys.requirementCoverage, queryKeys.taraItems]);
  };

  return {
    runTestCase: useMutation({
      mutationFn: ({ testCaseId, body }: { testCaseId: number; body?: Record<string, unknown> }) =>
        apiClient.runTestCase(testCaseId, body),
      onSuccess: invalidateExecution,
    }),
    runSuite: useMutation({
      mutationFn: ({ suiteId, body }: { suiteId: number | string; body: Record<string, unknown> }) =>
        apiClient.runSuite(suiteId, body),
      onSuccess: async () => {
        await invalidateExecution();
        await invalidateSuites();
      },
    }),
    runCases: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.runCases(body),
      onSuccess: invalidateExecution,
    }),
    cancelTask: useMutation({
      mutationFn: (taskId: number) => apiClient.cancelTask(taskId),
      onSuccess: invalidateExecution,
    }),
    retryTask: useMutation({
      mutationFn: (taskId: number) => apiClient.retryTask(taskId),
      onSuccess: invalidateExecution,
    }),
    createCase: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.createCase(body),
      onSuccess: invalidateCases,
    }),
    updateCase: useMutation({
      mutationFn: ({ testCaseId, body }: { testCaseId: number; body: Record<string, unknown> }) =>
        apiClient.updateCase(testCaseId, body),
      onSuccess: invalidateCases,
    }),
    deleteCase: useMutation({
      mutationFn: (testCaseId: number) => apiClient.deleteCase(testCaseId),
      onSuccess: invalidateCases,
    }),
    importCases: useMutation({
      mutationFn: (cases: Record<string, unknown>[]) => apiClient.importCases(cases),
      onSuccess: invalidateCases,
    }),
    updateCaseStatus: useMutation({
      mutationFn: ({ testCaseId, status }: { testCaseId: number; status: string }) => apiClient.updateCaseStatus(testCaseId, status),
      onSuccess: invalidateCases,
    }),
    updateCaseLinks: useMutation({
      mutationFn: ({ testCaseId, body }: { testCaseId: number; body: Record<string, unknown> }) =>
        apiClient.updateCaseLinks(testCaseId, body),
      onSuccess: invalidateTraceability,
    }),
    createRequirement: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.createRequirement(body),
      onSuccess: invalidateTraceability,
    }),
    updateRequirement: useMutation({
      mutationFn: ({ requirementId, body }: { requirementId: number; body: Record<string, unknown> }) =>
        apiClient.updateRequirement(requirementId, body),
      onSuccess: invalidateTraceability,
    }),
    deleteRequirement: useMutation({
      mutationFn: (requirementId: number) => apiClient.deleteRequirement(requirementId),
      onSuccess: invalidateTraceability,
    }),
    updateRequirementLinks: useMutation({
      mutationFn: ({ requirementId, body }: { requirementId: number; body: Record<string, unknown> }) =>
        apiClient.updateRequirementLinks(requirementId, body),
      onSuccess: invalidateTraceability,
    }),
    updateRequirementAssets: useMutation({
      mutationFn: ({ requirementId, body }: { requirementId: number; body: Record<string, unknown> }) =>
        apiClient.updateRequirementAssets(requirementId, body),
      onSuccess: invalidateTraceability,
    }),
    createTaraItem: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.createTaraItem(body),
      onSuccess: invalidateTraceability,
    }),
    updateTaraItem: useMutation({
      mutationFn: ({ taraId, body }: { taraId: number; body: Record<string, unknown> }) =>
        apiClient.updateTaraItem(taraId, body),
      onSuccess: invalidateTraceability,
    }),
    deleteTaraItem: useMutation({
      mutationFn: (taraId: number) => apiClient.deleteTaraItem(taraId),
      onSuccess: invalidateTraceability,
    }),
    updateTaraLinks: useMutation({
      mutationFn: ({ taraId, body }: { taraId: number; body: Record<string, unknown> }) =>
        apiClient.updateTaraLinks(taraId, body),
      onSuccess: invalidateTraceability,
    }),
    createSuite: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.createSuite(body),
      onSuccess: invalidateSuites,
    }),
    deleteSuite: useMutation({
      mutationFn: (suiteId: number) => apiClient.deleteSuite(suiteId),
      onSuccess: invalidateSuites,
    }),
    createAsset: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiClient.createAsset(body),
      onSuccess: invalidateAssets,
    }),
    updateAsset: useMutation({
      mutationFn: ({ assetId, body }: { assetId: number; body: Record<string, unknown> }) => apiClient.updateAsset(assetId, body),
      onSuccess: invalidateAssets,
    }),
    deleteAsset: useMutation({
      mutationFn: (assetId: number) => apiClient.deleteAsset(assetId),
      onSuccess: invalidateAssets,
    }),
    pingAsset: useMutation({
      mutationFn: (assetId: number) => apiClient.pingAsset(assetId),
    }),
    analyzeDefect: useMutation({
      mutationFn: (defectId: string) => apiClient.analyzeDefect(defectId),
      onSuccess: invalidateDefects,
    }),
    updateSetting: useMutation({
      mutationFn: ({ key, value }: { key: string; value: boolean }) => apiClient.updateSetting(key, value),
      onSuccess: invalidateSettings,
    }),
  };
};
