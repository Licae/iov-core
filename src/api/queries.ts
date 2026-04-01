import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type {
  Asset,
  CoveragePoint,
  DashboardBootstrapPayload,
  Defect,
  ExecutionTask,
  ExecutionTaskDetail,
  ManualTaskItemResultPayload,
  PaginatedResponse,
  RecentRun,
  Requirement,
  RequirementCoverageSnapshot,
  SettingsMap,
  Stats,
  SuiteRun,
  TaraItem,
  TestCase,
  TestRun,
  TestSuite,
  TrendPoint,
} from "./types";

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  defects: ["defects"] as const,
  defectsPage: (page: number, pageSize: number) => ["defects", "page", page, pageSize] as const,
  reports: ["reports"] as const,
  testCases: ["test-cases"] as const,
  testCasesPage: (
    page: number,
    pageSize: number,
    filters: { search: string; category: string; securityDomain: string; automationLevel: string },
  ) => ["test-cases", "page", page, pageSize, filters.search, filters.category, filters.securityDomain, filters.automationLevel] as const,
  history: (testCaseId: number) => ["history", testCaseId] as const,
  taskDetail: (taskId: number) => ["task-detail", taskId] as const,
};

type BootstrapData = {
  testCases: TestCase[];
  stats: Stats | null;
  trendData: TrendPoint[];
  coverageData: CoveragePoint[];
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

type DefectsPageData = {
  defects: Defect[];
  summary: Record<string, number>;
  pagination: PaginatedResponse<Defect>;
  isLoading: boolean;
  isFetching: boolean;
};

type ReportsPageData = {
  stats: Stats | null;
  trendData: TrendPoint[];
  coverageData: CoveragePoint[];
  defects: Defect[];
  isLoading: boolean;
  isFetching: boolean;
};

type ManagementPageData = {
  testCases: TestCase[];
  pagination: PaginatedResponse<TestCase>;
  isLoading: boolean;
  isFetching: boolean;
};

type TestCaseHistoryData = {
  history: TestRun[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

type TaskDetailData = {
  detail: ExecutionTaskDetail | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

const queryConfig = { staleTime: 10_000, gcTime: 5 * 60_000 };
const emptyBootstrapPayload: DashboardBootstrapPayload = {
  testCases: [],
  stats: null,
  trendData: [],
  coverageData: [],
  defects: [],
  assets: [],
  settings: { abort_on_critical_dtc: true, pr_requires_sil: true },
  requirements: [],
  requirementCoverage: { summary: { total: 0, covered: 0, gap: 0, asset_count: 0 }, rows: [], uncovered: [] },
  taraItems: [],
  testSuites: [],
  suiteRuns: [],
  executionTasks: [],
  recentRuns: [],
};

export const useBootstrapData = (): BootstrapData => {
  const bootstrapQuery = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: ({ signal }) => apiClient.getBootstrapData(signal),
    ...queryConfig,
  });
  const data = bootstrapQuery.data || emptyBootstrapPayload;

  return useMemo(
    () => ({
      testCases: data.testCases,
      stats: data.stats,
      trendData: data.trendData,
      coverageData: data.coverageData,
      defects: data.defects,
      assets: data.assets,
      settings: data.settings,
      requirements: data.requirements,
      taraItems: data.taraItems,
      testSuites: data.testSuites,
      suiteRuns: data.suiteRuns,
      executionTasks: data.executionTasks,
      recentRuns: data.recentRuns,
      requirementCoverage: data.requirementCoverage,
      isLoading: bootstrapQuery.isLoading,
      isFetching: bootstrapQuery.isFetching,
    }),
    [bootstrapQuery.isFetching, bootstrapQuery.isLoading, data],
  );
};

export const useDefectsPageData = (enabled: boolean, page: number, pageSize: number): DefectsPageData => {
  const defectsQuery = useQuery({
    queryKey: queryKeys.defectsPage(page, pageSize),
    queryFn: ({ signal }) => apiClient.getDefectsPage(page, pageSize, signal),
    enabled,
    ...queryConfig,
  });

  return {
    defects: defectsQuery.data?.items || [],
    summary: defectsQuery.data?.summary || {},
    pagination: defectsQuery.data || {
      items: [],
      page,
      pageSize,
      total: 0,
      totalPages: 1,
    },
    isLoading: defectsQuery.isLoading,
    isFetching: defectsQuery.isFetching,
  };
};

export const useReportsPageData = (enabled: boolean): ReportsPageData => {
  const reportsQuery = useQuery({
    queryKey: queryKeys.reports,
    queryFn: ({ signal }) =>
      Promise.all([
        apiClient.getStats(signal),
        apiClient.getTrend(signal),
        apiClient.getCoverage(signal),
        apiClient.getDefects(signal),
      ]).then(([stats, trendData, coverageData, defects]) => ({
        stats,
        trendData,
        coverageData,
        defects,
      })),
    enabled,
    ...queryConfig,
  });

  return {
    stats: reportsQuery.data?.stats || null,
    trendData: reportsQuery.data?.trendData || [],
    coverageData: reportsQuery.data?.coverageData || [],
    defects: reportsQuery.data?.defects || [],
    isLoading: reportsQuery.isLoading,
    isFetching: reportsQuery.isFetching,
  };
};

export const useManagementPageData = (
  enabled: boolean,
  page: number,
  pageSize: number,
  filters: { search: string; category: string; securityDomain: string; automationLevel: string },
): ManagementPageData => {
  const managementQuery = useQuery({
    queryKey: queryKeys.testCasesPage(page, pageSize, filters),
    queryFn: ({ signal }) =>
      apiClient.getTestCasesPage(page, pageSize, {
        search: filters.search,
        category: filters.category,
        securityDomain: filters.securityDomain,
        automationLevel: filters.automationLevel,
      }, signal),
    enabled,
    ...queryConfig,
  });

  return {
    testCases: managementQuery.data?.items || [],
    pagination: managementQuery.data || {
      items: [],
      page,
      pageSize,
      total: 0,
      totalPages: 1,
    },
    isLoading: managementQuery.isLoading,
    isFetching: managementQuery.isFetching,
  };
};

export const useTestCaseHistory = (enabled: boolean, testCaseId: number | null): TestCaseHistoryData => {
  const historyQuery = useQuery({
    queryKey: queryKeys.history(testCaseId || 0),
    queryFn: ({ signal }) => apiClient.getHistory(testCaseId || 0, signal),
    enabled: enabled && Boolean(testCaseId),
    ...queryConfig,
  });

  return {
    history: historyQuery.data || [],
    isLoading: historyQuery.isLoading,
    isFetching: historyQuery.isFetching,
    refetch: () => historyQuery.refetch(),
  };
};

export const useTaskDetailData = (enabled: boolean, taskId: number | null): TaskDetailData => {
  const taskDetailQuery = useQuery({
    queryKey: queryKeys.taskDetail(taskId || 0),
    queryFn: ({ signal }) => apiClient.getTaskDetail(taskId || 0, signal),
    enabled: enabled && Boolean(taskId),
    ...queryConfig,
  });

  return {
    detail: taskDetailQuery.data || null,
    isLoading: taskDetailQuery.isLoading,
    isFetching: taskDetailQuery.isFetching,
    error: taskDetailQuery.error instanceof Error ? taskDetailQuery.error : null,
    refetch: () => taskDetailQuery.refetch(),
  };
};

const allRefreshKeys = [queryKeys.bootstrap, queryKeys.defects, queryKeys.reports, queryKeys.testCases] as const;

export const useRefreshAllData = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      allRefreshKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  };
};

const executionRefreshKeys = [queryKeys.bootstrap, queryKeys.reports] as const;

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
    await invalidateKeys(queryClient, [queryKeys.bootstrap, queryKeys.reports, queryKeys.testCases]);
  };
  const invalidateExecution = async () => {
    await invalidateKeys(queryClient, executionRefreshKeys);
  };
  const invalidateSuites = async () => {
    await invalidateKeys(queryClient, [queryKeys.bootstrap, queryKeys.reports]);
  };
  const invalidateAssets = async () => {
    await invalidateKeys(queryClient, [queryKeys.bootstrap]);
  };
  const invalidateDefects = async () => {
    await invalidateKeys(queryClient, [queryKeys.bootstrap, queryKeys.defects, queryKeys.reports]);
  };
  const invalidateSettings = async () => {
    await invalidateKeys(queryClient, [queryKeys.bootstrap]);
  };
  const invalidateTraceability = async () => {
    await invalidateKeys(queryClient, [queryKeys.bootstrap, queryKeys.reports]);
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
    submitManualTaskResult: useMutation({
      mutationFn: ({ taskId, itemId, body }: { taskId: number; itemId: number; body: ManualTaskItemResultPayload }) =>
        apiClient.submitManualTaskResult(taskId, itemId, body),
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
