import React, { useState, useEffect, useMemo } from 'react';
import { useAppMutations, useBootstrapData, useDefectsPageData, useManagementPageData, useRefreshExecutionData, useReportsPageData, useTaskDetailData, useTestCaseHistory } from './api/queries';
import {
  CASE_CATEGORY_OPTIONS,
  DEFAULT_RUNTIME_INPUT_SUGGESTIONS,
  REQUIRED_INPUT_OPTIONS,
  SECURITY_BASELINE_SUITE_NAME,
  SECURITY_DOMAIN_OPTIONS,
} from './app/app-config';
import {
  applyManualTemplateToForm,
  buildCaseDraftFromFormData,
  formatServerDateTime,
  getExecutionStatusLabel,
  getFormControl,
  getStepExecutionBadge,
  inferInputsFromScript,
  isExecutionActive,
  normalizeExecutionStatus,
  normalizeFailureCategory,
  normalizeTestResult,
  parseCaseSteps,
  parseDefaultRuntimeInputs,
  parseStepResults,
} from './app/app-utils';
import { AppSidebar } from './app/app-sidebar';
import { AppTopbar } from './app/app-topbar';
import { Toast } from './app/app-shell-components';
import { useAssetsView } from './modules/assets/use-assets-view';
import { AssetDetailModal } from './modules/assets/asset-detail-modal';
import { AssetsPage } from './modules/assets/assets-page';
import { EditAssetModal } from './modules/assets/edit-asset-modal';
import { RegisterAssetModal } from './modules/assets/register-asset-modal';
import { DashboardPage } from './modules/dashboard/dashboard-page';
import { DefectsPage } from './modules/defects/defects-page';
import { useManagementFilters } from './modules/management/use-management-filters';
import { CreateTestCaseModal } from './modules/management/create-test-case-modal';
import { DeleteTestCaseModal } from './modules/management/delete-test-case-modal';
import { ImportCasesModal } from './modules/management/import-cases-modal';
import { ManagementPage } from './modules/management/management-page';
import { TestCaseDrawer } from './modules/management/test-case-drawer';
import { RequirementsPage } from './modules/requirements/requirements-page';
import { ReportsPage } from './modules/reports/reports-page';
import { RunningPage } from './modules/running/running-page';
import { CreateSuiteModal } from './modules/suites/create-suite-modal';
import { useSuitesView } from './modules/suites/use-suites-view';
import { SuitesPage } from './modules/suites/suites-page';
import { TaraPage } from './modules/tara/tara-page';
import { useTaskDetail } from './modules/task-detail/use-task-detail';
import { TaskDetailModal } from './modules/task-detail/task-detail-modal';
import { useTaskLaunch } from './modules/task-launch/use-task-launch';
import { TaskLaunchModal } from './modules/task-launch/task-launch-modal';
import type {
  Asset,
  Defect,
  ManualTaskItemResultPayload,
  RecentRun,
  Stats,
  SuiteRun,
  TestCase,
  TestSuite,
} from './api/types';
import { ShieldCheck, AlertTriangle, Cpu, Layers3, XCircle, Clock, Trash2, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEFECTS_PAGE_SIZE = 10;
const MANAGEMENT_PAGE_SIZE = 10;

export default function App() {
  const [view, setView] = useState<'dashboard' | 'running' | 'defects' | 'assets' | 'reports' | 'management' | 'suites' | 'requirements' | 'tara'>('dashboard');
  const bootstrapData = useBootstrapData();
  const [defectsPage, setDefectsPage] = useState(1);
  const [managementPage, setManagementPage] = useState(1);
  const defectsPageData = useDefectsPageData(view === 'defects', defectsPage, DEFECTS_PAGE_SIZE);
  const reportsPageData = useReportsPageData(view === 'reports');
  const refreshExecutionData = useRefreshExecutionData();
  const mutations = useAppMutations();
  const testCases = bootstrapData.testCases;
  const testSuites = bootstrapData.testSuites;
  const suiteRuns = bootstrapData.suiteRuns;
  const executionTasks = bootstrapData.executionTasks;
  const stats = bootstrapData.stats;
  const trendData = bootstrapData.trendData;
  const coverageData = bootstrapData.coverageData;
  const defects = bootstrapData.defects;
  const assets = bootstrapData.assets;
  const settings = bootstrapData.settings;
  const requirements = bootstrapData.requirements;
  const requirementCoverage = bootstrapData.requirementCoverage;
  const taraItems = bootstrapData.taraItems;
  const recentRuns = bootstrapData.recentRuns;
  const {
    runSuite: runSuiteMutation,
    runCases: runCasesMutation,
    cancelTask: cancelTaskMutation,
    retryTask: retryTaskMutation,
    submitManualTaskResult: submitManualTaskResultMutation,
    createCase: createCaseMutation,
    updateCase: updateCaseMutation,
    deleteCase: deleteCaseMutation,
    importCases: importCasesMutation,
    updateCaseStatus: updateCaseStatusMutation,
    createRequirement: createRequirementMutation,
    updateRequirement: updateRequirementMutation,
    deleteRequirement: deleteRequirementMutation,
    updateRequirementLinks: updateRequirementLinksMutation,
    updateRequirementAssets: updateRequirementAssetsMutation,
    createTaraItem: createTaraItemMutation,
    updateTaraItem: updateTaraItemMutation,
    deleteTaraItem: deleteTaraItemMutation,
    updateTaraLinks: updateTaraLinksMutation,
    createSuite: createSuiteMutation,
    deleteSuite: deleteSuiteMutation,
    createAsset: createAssetMutation,
    updateAsset: updateAssetMutation,
    deleteAsset: deleteAssetMutation,
    pingAsset: pingAssetMutation,
    analyzeDefect: analyzeDefectMutation,
    updateSetting: updateSettingMutation,
  } = mutations;
  const [searchQuery, setSearchQuery] = useState('');
  const [managementSearchQuery, setManagementSearchQuery] = useState('');
  const [managementCategoryFilter, setManagementCategoryFilter] = useState<string>('All');
  const [managementSecurityDomainFilter, setManagementSecurityDomainFilter] = useState<string>('All');
  const [managementAutomationFilter, setManagementAutomationFilter] = useState<string>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showEditAssetModal, setShowEditAssetModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [launchMode, setLaunchMode] = useState<'suite' | 'cases'>('suite');
  const [showSuiteModal, setShowSuiteModal] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | string>('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
  const [isCasePickerOpen, setIsCasePickerOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isRuntimeInputsOpen, setIsRuntimeInputsOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | string>('');
  const [taskRuntimeInputs, setTaskRuntimeInputs] = useState<Record<string, string>>({});
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [selectedSuiteCaseIds, setSelectedSuiteCaseIds] = useState<number[]>([]);
  const [importText, setImportText] = useState('');
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'success' | 'error' }[]>([]);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [manualSubmittingItemId, setManualSubmittingItemId] = useState<number | null>(null);
  const [pingingAssetId, setPingingAssetId] = useState<number | null>(null);
  const [analyzingDefectId, setAnalyzingDefectId] = useState<string | null>(null);
  const [isUpdatingAsset, setIsUpdatingAsset] = useState(false);
  const [defectAnalysis, setDefectAnalysis] = useState<Record<string, string>>({});
  const [filterProtocol, setFilterProtocol] = useState<string>('All');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [createScriptPath, setCreateScriptPath] = useState('');
  const [createTestTool, setCreateTestTool] = useState('');
  const [editScriptPath, setEditScriptPath] = useState('');
  const [editTestTool, setEditTestTool] = useState('');
  const [deleteTestCaseCandidate, setDeleteTestCaseCandidate] = useState<{ id: number; title: string } | null>(null);
  const [isDeletingTestCase, setIsDeletingTestCase] = useState(false);

  const filteredTestCases = testCases.filter(tc => {
    const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tc.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProtocol = filterProtocol === 'All' || tc.protocol === filterProtocol;
    return matchesSearch && matchesProtocol;
  });
  const {
    managementCategoryOptions,
    managementSecurityDomainOptions,
    managementFilteredTestCases,
  } = useManagementFilters(testCases, {
    searchQuery: managementSearchQuery,
    categoryFilter: managementCategoryFilter,
    securityDomainFilter: managementSecurityDomainFilter,
    automationFilter: managementAutomationFilter,
  });
  const managementPageData = useManagementPageData(view === 'management', managementPage, MANAGEMENT_PAGE_SIZE, {
    search: managementSearchQuery,
    category: managementCategoryFilter,
    securityDomain: managementSecurityDomainFilter,
    automationLevel: managementAutomationFilter,
  });

  const parseRequiredInputs = (value?: string | null) => {
    if (!value) return [] as string[];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const resolveRuntimeInputs = (scriptPath?: string | null, testTool?: string | null, fallback?: string | null) => {
    const inferred = inferInputsFromScript(scriptPath || undefined, testTool || undefined);
    if (inferred.length > 0) return inferred;
    return parseRequiredInputs(fallback);
  };

  const {
    selectedLaunchTestCases,
    selectedLaunchSuite,
    selectedBaselineSuite,
    selectedLaunchAsset,
    onlineAssets,
    selectedLaunchRequiredInputs,
    selectedLaunchDefaultInputs,
    selectedLaunchInputConflicts,
    selectedAssetSummary,
    selectedCaseSummary,
    selectedSuiteSummary,
  } = useTaskLaunch({
    testCases,
    testSuites,
    assets,
    selectedCaseIds,
    selectedSuiteId,
    selectedAssetId,
    baselineSuiteName: SECURITY_BASELINE_SUITE_NAME,
    resolveRuntimeInputs,
    parseDefaultRuntimeInputs,
    defaultRuntimeInputSuggestions: DEFAULT_RUNTIME_INPUT_SUGGESTIONS,
  });
  const { runningSuiteIds } = useSuitesView(suiteRuns, normalizeExecutionStatus);
  const { assetSummary } = useAssetsView(assets);
  const createRequiredInputs = useMemo(
    () => resolveRuntimeInputs(createScriptPath, createTestTool, null),
    [createScriptPath, createTestTool]
  );
  const editRequiredInputs = useMemo(
    () => resolveRuntimeInputs(editScriptPath, editTestTool, selectedTestCase?.required_inputs),
    [editScriptPath, editTestTool, selectedTestCase?.required_inputs]
  );
  const historyData = useTestCaseHistory(Boolean(selectedTestCase?.id), selectedTestCase?.id || null);
  const taskDetailData = useTaskDetailData(Boolean(selectedTaskId), selectedTaskId);
  const selectedTaskDetail = taskDetailData.detail;
  const isTaskDetailLoading = taskDetailData.isLoading || taskDetailData.isFetching;
  const history = historyData.history;
  const isHistoryLoading = historyData.isLoading || historyData.isFetching;
  const taskDetailView = useTaskDetail(selectedTaskDetail);

  useEffect(() => {
    if (!showCreateModal) {
      setCreateScriptPath('');
      setCreateTestTool('');
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (!selectedTestCase) return;
    setEditScriptPath(selectedTestCase.script_path || '');
    setEditTestTool(selectedTestCase.test_tool || '');
  }, [selectedTestCase]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('iov-core-theme') as 'dark' | 'light' | null;
    const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'light';
    const nextTheme = savedTheme || preferredTheme;
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (!showTaskModal || launchMode !== 'cases') return;
    setTaskRuntimeInputs((prev) => {
      const next: Record<string, string> = {};
      selectedLaunchRequiredInputs.forEach((key: string) => {
        if (key !== 'connection_address') {
          next[key] = prev[key] || selectedLaunchDefaultInputs[key] || '';
        }
      });
      return next;
    });
  }, [showTaskModal, launchMode, selectedCaseIds, selectedLaunchDefaultInputs, selectedLaunchRequiredInputs]);

  useEffect(() => {
    if (!showTaskModal) {
      setIsRuntimeInputsOpen(false);
    }
  }, [showTaskModal]);

  useEffect(() => {
    if (launchMode === 'suite') {
      setTaskRuntimeInputs({});
      setIsRuntimeInputsOpen(false);
    }
  }, [launchMode]);

  useEffect(() => {
    if (!showTaskModal || launchMode !== 'suite') return;
    if (selectedSuiteId) return;
    if (selectedBaselineSuite) {
      setSelectedSuiteId(String(selectedBaselineSuite.id));
      return;
    }
    if (testSuites.length > 0) {
      setSelectedSuiteId(String(testSuites[0].id));
    }
  }, [showTaskModal, launchMode, selectedSuiteId, selectedBaselineSuite, testSuites]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('iov-core-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'SIMULATION_COMPLETE') {
        refreshExecutionData();
        if (selectedTestCase?.id === data.testCaseId) {
          void historyData.refetch();
          setSelectedTestCase(prev => prev ? { ...prev, status: data.result } : null);
        }
      } else if (data.type === 'EXECUTION_TASK_UPDATED' || data.type === 'EXECUTION_TASK_COMPLETED') {
        refreshExecutionData();
        if (selectedTaskId && data.task?.id === selectedTaskId) {
          void taskDetailData.refetch();
        }
        if (data.type === 'EXECUTION_TASK_COMPLETED') {
          addToast(data.task?.type === 'suite' ? '测试套件执行完成' : '测试任务执行完成', 'success');
        }
      }
    };

    return () => ws.close();
  }, [historyData, refreshExecutionData, selectedTaskId, selectedTestCase?.id, taskDetailData]);

  useEffect(() => {
    if (selectedTaskId && taskDetailData.error && !selectedTaskDetail) {
      addToast('读取任务详情失败', 'error');
      setSelectedTaskId(null);
    }
  }, [selectedTaskDetail, selectedTaskId, taskDetailData.error]);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分 ${secs}秒`;
  };

  const getExecutionStatusBadgeClass = (status?: string | null) => {
    switch (normalizeExecutionStatus(status)) {
      case 'PENDING':
        return 'badge-queued';
      case 'RUNNING':
        return 'badge-running';
      case 'COMPLETED':
        return 'badge-completed';
      case 'CANCELLED':
        return 'badge-cancelled';
      default:
        return 'badge-info';
    }
  };

  const getFailureCategoryMeta = (category?: string | null) => {
    switch (normalizeFailureCategory(category)) {
      case 'ENVIRONMENT':
        return { label: '环境失败', className: 'text-warning' };
      case 'PERMISSION':
        return { label: '权限失败', className: 'text-danger' };
      case 'SCRIPT':
        return { label: '脚本失败', className: 'text-accent' };
      default:
        return { label: '无', className: 'text-muted' };
    }
  };

  const getTestResultBadge = (result?: string | null) => {
    switch (normalizeTestResult(result)) {
      case 'PASSED':
        return {
          className: 'text-success',
          icon: <ShieldCheck size={12} />,
          label: '测试通过',
        };
      case 'FAILED':
        return {
          className: 'text-danger',
          icon: <AlertTriangle size={12} />,
          label: '测试不通过',
        };
      case 'BLOCKED':
        return {
          className: 'text-warning',
          icon: <Clock size={12} />,
          label: '条件不足',
        };
      case 'ERROR':
        return {
          className: 'text-danger',
          icon: <AlertTriangle size={12} />,
          label: '执行异常',
        };
      default:
        return {
          className: 'text-muted',
          icon: <Clock size={12} />,
          label: '未产出',
        };
    }
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const submitManualTaskItemResult = async (
    taskId: number,
    itemId: number,
    payload: ManualTaskItemResultPayload,
  ) => {
    setManualSubmittingItemId(itemId);
    try {
      const response = await submitManualTaskResultMutation.mutateAsync({ taskId, itemId, body: payload });
      addToast(response.resumed ? '人工结果已提交，任务继续执行。' : '人工结果已提交。', 'success');
      await refreshExecutionData();
      if (selectedTaskId === taskId) {
        await taskDetailData.refetch();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交人工结果失败';
      addToast(message, 'error');
    } finally {
      setManualSubmittingItemId(null);
    }
  };

  const analyzeDefect = async (defect: Defect) => {
    setAnalyzingDefectId(defect.id);
    try {
      const data = await analyzeDefectMutation.mutateAsync(defect.id);
      setDefectAnalysis(prev => ({ ...prev, [defect.id]: data.analysis || "无法生成分析结果" }));
    } catch (error) {
      console.error('AI Analysis failed:', error);
      addToast('AI 诊断失败，请检查 API 配置', 'error');
    } finally {
      setAnalyzingDefectId(null);
    }
  };

  const exportReport = () => {
    window.open('/api/reports/export', '_blank', 'noopener,noreferrer');
  };

  const defectSummary = defects.reduce((acc, defect) => {
    acc[defect.severity] = (acc[defect.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const currentDefects = reportsPageData.isLoading ? defects : reportsPageData.defects;
  const currentDefectSummary = currentDefects.reduce((acc, defect) => {
    acc[defect.severity] = (acc[defect.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const reportsTrendData = reportsPageData.isLoading ? trendData : reportsPageData.trendData;
  const reportsCoverageData = reportsPageData.isLoading ? coverageData : reportsPageData.coverageData;
  const fallbackDefectsPageItems = defects.slice((defectsPage - 1) * DEFECTS_PAGE_SIZE, defectsPage * DEFECTS_PAGE_SIZE);
  const defectsPageItems = defectsPageData.isLoading ? fallbackDefectsPageItems : defectsPageData.defects;
  const defectsPageSummary = defectsPageData.isLoading ? defectSummary : defectsPageData.summary;
  const defectsPageTotal = defectsPageData.isLoading ? defects.length : defectsPageData.pagination.total;
  const defectsPageTotalPages = defectsPageData.isLoading
    ? Math.max(1, Math.ceil(defects.length / DEFECTS_PAGE_SIZE))
    : defectsPageData.pagination.totalPages;
  const fallbackManagementItems = managementFilteredTestCases.slice((managementPage - 1) * MANAGEMENT_PAGE_SIZE, managementPage * MANAGEMENT_PAGE_SIZE);
  const managementPageItems = managementPageData.isLoading ? fallbackManagementItems : managementPageData.testCases;
  const managementTotal = managementPageData.isLoading ? managementFilteredTestCases.length : managementPageData.pagination.total;
  const managementTotalPages = managementPageData.isLoading
    ? Math.max(1, Math.ceil(managementFilteredTestCases.length / MANAGEMENT_PAGE_SIZE))
    : managementPageData.pagination.totalPages;
  const totalRuns = stats?.results?.reduce((sum, item) => sum + Number(item.count || 0), 0) || 0;
  const passedRuns = stats?.results?.find((item) => normalizeTestResult(item.result) === 'PASSED')?.count || 0;
  const reliability = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
  const latestTrend = trendData[trendData.length - 1];
  const previousTrend = trendData[trendData.length - 2];
  const reliabilityDelta = latestTrend && previousTrend
    ? Number(latestTrend.passRate || 0) - Number(previousTrend.passRate || 0)
    : 0;
  const reliabilityTrendText = totalRuns > 0
    ? `${reliabilityDelta >= 0 ? '通过率 +' : '通过率 '}${reliabilityDelta.toFixed(1)}%`
    : undefined;
  const severeDefectCount = Number(defectSummary.Critical || 0) + Number(defectSummary.Major || 0);
  const assetCount = assetSummary.total;
  const dashboardDefectDistribution = [
    { label: 'Critical', count: Number(defectSummary.Critical || 0), color: 'bg-danger' },
    { label: 'Major', count: Number(defectSummary.Major || 0), color: 'bg-warning' },
    { label: 'Minor', count: Number(defectSummary.Minor || 0), color: 'bg-accent' },
  ];
  const totalDashboardDefects = dashboardDefectDistribution.reduce((sum, item) => sum + item.count, 0);
  const reportDefectDistribution = [
    { label: 'Critical', count: Number(currentDefectSummary.Critical || 0), color: 'bg-danger' },
    { label: 'Major', count: Number(currentDefectSummary.Major || 0), color: 'bg-warning' },
    { label: 'Minor', count: Number(currentDefectSummary.Minor || 0), color: 'bg-accent' },
    { label: 'Low', count: Number(currentDefectSummary.Low || 0), color: 'bg-success' },
  ];

  useEffect(() => {
    if (defectsPage > defectsPageTotalPages) {
      setDefectsPage(defectsPageTotalPages);
    }
  }, [defectsPage, defectsPageTotalPages]);

  useEffect(() => {
    setManagementPage(1);
  }, [managementSearchQuery, managementCategoryFilter, managementSecurityDomainFilter, managementAutomationFilter]);

  useEffect(() => {
    if (managementPage > managementTotalPages) {
      setManagementPage(managementTotalPages);
    }
  }, [managementPage, managementTotalPages]);

  const pingAsset = async (asset: Asset) => {
    setPingingAssetId(asset.id);
    addToast(`正在 Ping ${asset.name}...`, 'success');
    try {
      const data = await pingAssetMutation.mutateAsync(asset.id);
      const latency = typeof data.latency_ms === 'number' ? `${data.latency_ms.toFixed(1)}ms` : '已响应';
      addToast(`${asset.name} (${data.address}) 响应正常，延迟 ${latency}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ping 失败';
      addToast(`${asset.name} Ping 失败: ${message}`, 'error');
    } finally {
      setPingingAssetId(null);
    }
  };

  const updateFirmware = (name: string) => {
    setIsUpdatingAsset(true);
    addToast(`正在向 ${name} 推送固件更新包...`, 'success');
    setTimeout(() => {
      setIsUpdatingAsset(false);
      addToast(`资产 ${name} 固件已成功升级至最新版本`, 'success');
    }, 3000);
  };

  const registerAsset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const assetData = {
      name: formData.get('name'),
      type: formData.get('type'),
      status: 'Online',
      hardware_version: formData.get('hardware_version') || '-',
      software_version: formData.get('software_version') || 'v1.0.0',
      connection_address: formData.get('connection_address') || '',
      description: formData.get('description') || '',
    };

    try {
      await createAssetMutation.mutateAsync(assetData as Record<string, unknown>);
      addToast('资产注册成功', 'success');
      setShowAssetModal(false);
    } catch (error) {
      addToast('注册失败', 'error');
    }
  };

  const deleteAsset = async (id: number) => {
    try {
      await deleteAssetMutation.mutateAsync(id);
      addToast('资产已删除', 'success');
      setSelectedAsset(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  const editAsset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const formData = new FormData(e.currentTarget);
    const assetData = {
      name: formData.get('name'),
      type: formData.get('type'),
      status: formData.get('status'),
      hardware_version: formData.get('hardware_version') || '-',
      software_version: formData.get('software_version') || 'v1.0.0',
      connection_address: formData.get('connection_address') || '',
      description: formData.get('description') || '',
    };

    try {
      await updateAssetMutation.mutateAsync({ assetId: selectedAsset.id, body: assetData as Record<string, unknown> });
      addToast('资产已更新', 'success');
      setSelectedAsset((prev) => prev ? { ...prev, ...assetData } : prev);
      setShowEditAssetModal(false);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新资产失败', 'error');
    }
  };

  const createTestCase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const draft = buildCaseDraftFromFormData({
      formData,
      resolveRuntimeInputs,
    });
    if (!draft.ok) {
      addToast(draft.error, 'error');
      return;
    }

    try {
      await createCaseMutation.mutateAsync(draft.value as Record<string, unknown>);
      addToast('测试用例创建成功', 'success');
      setShowCreateModal(false);
      setCreateScriptPath('');
      setCreateTestTool('');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建失败', 'error');
    }
  };

  const createTestTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId) return;
    if (launchMode === 'suite' && !selectedSuiteId) return;
    if (launchMode === 'cases' && selectedCaseIds.length === 0) return;
    const runtimeInputs = Object.fromEntries(
      Object.entries(taskRuntimeInputs)
        .map(([key, value]) => [key, String(value).trim()] as const)
        .filter(([, value]) => value !== '')
    );

    try {
      if (launchMode === 'suite') {
        await runSuiteMutation.mutateAsync({
          suiteId: selectedSuiteId,
          body: {
            asset_id: selectedAssetId,
            stop_on_failure: stopOnFailure,
            runtime_inputs: runtimeInputs,
          },
        });
      } else {
        await runCasesMutation.mutateAsync({
          asset_id: selectedAssetId,
          test_case_ids: selectedCaseIds,
          stop_on_failure: stopOnFailure,
          runtime_inputs: runtimeInputs,
        });
      }
      addToast(launchMode === 'suite' ? '基线套件任务已发起' : '测试任务已发起', 'success');
      setShowTaskModal(false);
      setStopOnFailure(false);
      setTaskRuntimeInputs({});
      setSelectedCaseIds([]);
      setIsCasePickerOpen(false);
      setIsAssetPickerOpen(false);
      setSelectedAssetId('');
      setSelectedSuiteId('');
      setLaunchMode('suite');
      setView('running');
      refreshExecutionData();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '发起任务失败', 'error');
    }
  };

  const editTestCase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTestCase) return;
    const formData = new FormData(e.currentTarget);
    const draft = buildCaseDraftFromFormData({
      formData,
      resolveRuntimeInputs,
      fallbackRequiredInputs: selectedTestCase.required_inputs,
    });
    if (!draft.ok) {
      addToast(draft.error, 'error');
      return;
    }

    try {
      await updateCaseMutation.mutateAsync({ testCaseId: selectedTestCase.id, body: draft.value as Record<string, unknown> });
      const patchedCase = {
        ...selectedTestCase,
        ...draft.value,
        timeout_sec: Number(draft.value.timeout_sec || selectedTestCase.timeout_sec || 300),
        steps: JSON.stringify(draft.value.steps),
        required_inputs: JSON.stringify(draft.value.required_inputs),
        default_runtime_inputs: JSON.stringify(draft.value.default_runtime_inputs),
      } as TestCase;
      addToast('测试用例已更新', 'success');
      setSelectedTestCase(patchedCase);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新失败', 'error');
    }
  };

  const handleImport = async () => {
    const lines = importText.split('\n').filter(l => l.includes('|'));
    if (lines.length < 3) return;
    const hasSecurityDomainColumn = lines[0].includes('安全分类');
    if (!hasSecurityDomainColumn) {
      addToast('导入模板缺少“安全分类”列，无法通过质量门禁', 'error');
      return;
    }

    // Skip header and separator
    const dataLines = lines.slice(2);
    const cases = dataLines.map(line => {
      const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
      if (parts.length < 7) return null;
      if (hasSecurityDomainColumn) {
        if (parts.length >= 15) {
          return {
            category: parts[0],
            security_domain: parts[1] || '未分类',
            title: parts[2],
            protocol: parts[3],
            type: parts[4],
            test_input: parts[5],
            test_tool: parts[6],
            steps: parts[7],
            expected_result: parts[8],
            automation_level: parts[9],
            description: parts[10] || '',
            executor_type: parts[11] || 'python',
            script_path: parts[12] || '',
            command_template: '',
            args_template: '',
            timeout_sec: parts[13] || '300',
            default_runtime_inputs: (() => {
              if (!parts[14]) return {};
              try {
                const parsed = JSON.parse(parts[14]);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
              } catch {
                return {};
              }
            })(),
          };
        }
        return null;
      }
      if (parts.length >= 15) {
        return {
          category: parts[0],
          security_domain: '未分类',
          title: parts[1],
          protocol: parts[2],
          type: parts[3],
          test_input: parts[4],
          test_tool: parts[5],
          steps: parts[6],
          expected_result: parts[7],
          automation_level: parts[8],
          description: parts[9] || '',
          executor_type: parts[10] || 'python',
          script_path: parts[11] || '',
          command_template: '',
          args_template: '',
          timeout_sec: parts[14] || '300',
          default_runtime_inputs: (() => {
            if (!parts[15]) return {};
            try {
              const parsed = JSON.parse(parts[15]);
              return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch {
              return {};
            }
          })(),
        };
      }
      if (parts.length >= 14) {
        return {
          category: parts[0],
          security_domain: '未分类',
          title: parts[1],
          protocol: parts[2],
          type: parts[3],
          test_input: parts[4],
          test_tool: parts[5],
          steps: parts[6],
          expected_result: parts[7],
          automation_level: parts[8],
          description: parts[9] || '',
          executor_type: parts[10] || 'python',
          script_path: parts[11] || '',
          command_template: '',
          args_template: '',
          timeout_sec: parts[12] || '300',
          default_runtime_inputs: (() => {
            if (!parts[13]) return {};
            try {
              const parsed = JSON.parse(parts[13]);
              return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch {
              return {};
            }
          })(),
        };
      }
      if (parts.length >= 10) {
        return {
          category: parts[0],
          security_domain: '未分类',
          title: parts[1],
          protocol: parts[2],
          type: parts[3],
          test_input: parts[4],
          test_tool: parts[5],
          steps: parts[6],
          expected_result: parts[7],
          automation_level: parts[8],
          description: parts[9] || '',
          executor_type: 'python',
          script_path: '',
          command_template: '',
          args_template: '',
          timeout_sec: '300',
          default_runtime_inputs: {},
        };
      }
      return {
        category: parts[0],
        security_domain: '未分类',
        title: parts[1],
        test_input: parts[2],
        test_tool: parts[3],
        steps: parts[4],
        expected_result: parts[5],
        automation_level: parts[6],
        executor_type: 'python',
        script_path: '',
        command_template: '',
        args_template: '',
        timeout_sec: '300',
        default_runtime_inputs: {},
      };
    }).filter((c): c is Record<string, unknown> => c !== null);

    try {
      await importCasesMutation.mutateAsync(cases);
      addToast(`成功导入 ${cases.length} 条测试用例`, 'success');
      setShowImportModal(false);
      setImportText('');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '导入失败', 'error');
    }
  };

  const requestDeleteTestCase = (id: number, title?: string) => {
    const resolvedTitle = title || testCases.find((tc) => tc.id === id)?.title || `ID ${id}`;
    setDeleteTestCaseCandidate({ id, title: resolvedTitle });
  };

  const closeTestCaseDrawer = () => {
    setSelectedTestCase(null);
  };

  const confirmDeleteTestCase = async () => {
    if (!deleteTestCaseCandidate) return;
    setIsDeletingTestCase(true);
    try {
      await deleteCaseMutation.mutateAsync(deleteTestCaseCandidate.id);
      addToast('测试用例已删除', 'success');
      if (selectedTestCase?.id === deleteTestCaseCandidate.id) {
        setSelectedTestCase(null);
      }
      setDeleteTestCaseCandidate(null);
    } catch (error) {
      addToast('删除失败', 'error');
    } finally {
      setIsDeletingTestCase(false);
    }
  };

  const createSuite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedSuiteCaseIds.length === 0) {
      addToast('至少选择一个测试用例', 'error');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name'),
      description: formData.get('description'),
      test_case_ids: selectedSuiteCaseIds,
    };

    try {
      await createSuiteMutation.mutateAsync(payload as Record<string, unknown>);
      addToast('测试套件创建成功', 'success');
      setShowSuiteModal(false);
      setSelectedSuiteCaseIds([]);
    } catch (error) {
      addToast('创建测试套件失败', 'error');
    }
  };

  const toggleSuiteCase = (testCaseId: number) => {
    setSelectedSuiteCaseIds(prev =>
      prev.includes(testCaseId) ? prev.filter(id => id !== testCaseId) : [...prev, testCaseId]
    );
  };

  const runSuite = (suiteId: number) => {
    setLaunchMode('suite');
    setSelectedSuiteId(String(suiteId));
    setIsCasePickerOpen(false);
    if (onlineAssets.length === 1) {
      setSelectedAssetId(String(onlineAssets[0].id));
    }
    setShowTaskModal(true);
  };

  const cancelTask = async (taskId: number) => {
    try {
      await cancelTaskMutation.mutateAsync(taskId);
      addToast('任务已取消', 'success');
      refreshExecutionData();
    } catch (error) {
      addToast('取消任务失败', 'error');
    }
  };

  const retryTask = async (taskId: number) => {
    try {
      await retryTaskMutation.mutateAsync(taskId);
      addToast('任务已重新加入执行队列', 'success');
      refreshExecutionData();
      setView('running');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '重试任务失败', 'error');
    }
  };

  const deleteSuite = async (suiteId: number) => {
    try {
      await deleteSuiteMutation.mutateAsync(suiteId);
      addToast('测试套件已删除', 'success');
    } catch (error) {
      addToast('删除测试套件失败', 'error');
    }
  };

  const chartAccent = theme === 'dark' ? '#5544FF' : '#3156e8';
  const chartAccentStrong = theme === 'dark' ? '#4433EE' : '#2446cb';
  const chartGrid = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.28)';
  const chartAxis = theme === 'dark' ? '#888888' : '#64748b';
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? 'rgba(17,17,17,0.96)' : 'rgba(255,255,255,0.96)',
    border: `1px solid ${theme === 'dark' ? '#333333' : '#d9e0ee'}`,
    borderRadius: '10px',
    fontSize: '10px',
    color: theme === 'dark' ? '#ffffff' : '#0f172a',
    boxShadow: theme === 'dark' ? '0 18px 40px rgba(0,0,0,0.32)' : '0 18px 40px rgba(148,163,184,0.18)',
  } as const;
  const tooltipItemStyle = { color: theme === 'dark' ? '#ffffff' : '#0f172a' };
  const activeExecutionTasks = executionTasks.filter(task => isExecutionActive(task.status));
  const runningTaskCount = activeExecutionTasks.length;

  const toggleSetting = async (key: string) => {
    const newValue = !settings[key];
    try {
      await updateSettingMutation.mutateAsync({ key, value: newValue });
      addToast(`设置已更新`, 'success');
    } catch (error) {
      console.error('Failed to update setting:', error);
      addToast('网络错误', 'error');
    }
  };
  const updateTestCaseStatus = async (id: number, status: string) => {
    setUpdatingIds(prev => [...prev, id]);
    try {
      await updateCaseStatusMutation.mutateAsync({ testCaseId: id, status });
      addToast(`测试状态已更新为 ${status}`, 'success');
    } catch (error) {
      console.error('Failed to update status:', error);
      addToast('网络错误，请稍后重试', 'error');
    } finally {
      setUpdatingIds(prev => prev.filter(uid => uid !== id));
    }
  };

  const createRequirement = async (payload: Record<string, unknown>) => {
    try {
      const data = await createRequirementMutation.mutateAsync(payload);
      addToast('需求已创建', 'success');
      return Number((data as { id?: number })?.id || 0) || null;
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建需求失败', 'error');
      return null;
    }
  };

  const updateRequirement = async (id: number, payload: Record<string, unknown>) => {
    try {
      await updateRequirementMutation.mutateAsync({ requirementId: id, body: payload });
      addToast('需求已更新', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新需求失败', 'error');
    }
  };

  const deleteRequirement = async (id: number) => {
    try {
      await deleteRequirementMutation.mutateAsync(id);
      addToast('需求已删除', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '删除需求失败', 'error');
    }
  };

  const updateRequirementLinks = async (id: number, payload: Record<string, unknown>) => {
    try {
      await updateRequirementLinksMutation.mutateAsync({ requirementId: id, body: payload });
      addToast('需求关联已更新', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新需求关联失败', 'error');
    }
  };

  const updateRequirementAssets = async (id: number, payload: Record<string, unknown>) => {
    try {
      await updateRequirementAssetsMutation.mutateAsync({ requirementId: id, body: payload });
      addToast('需求适用资产已更新', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新需求适用资产失败', 'error');
    }
  };

  const createTaraItem = async (payload: Record<string, unknown>) => {
    try {
      const data = await createTaraItemMutation.mutateAsync(payload);
      addToast('威胁项已创建', 'success');
      return Number((data as { id?: number })?.id || 0) || null;
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建威胁项失败', 'error');
      return null;
    }
  };

  const updateTaraItem = async (id: number, payload: Record<string, unknown>) => {
    try {
      await updateTaraItemMutation.mutateAsync({ taraId: id, body: payload });
      addToast('威胁项已更新', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新威胁项失败', 'error');
    }
  };

  const deleteTaraItem = async (id: number) => {
    try {
      await deleteTaraItemMutation.mutateAsync(id);
      addToast('威胁项已删除', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '删除威胁项失败', 'error');
    }
  };

  const updateTaraLinks = async (id: number, payload: Record<string, unknown>) => {
    try {
      await updateTaraLinksMutation.mutateAsync({ taraId: id, body: payload });
      addToast('TARA 关联已更新', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '更新 TARA 关联失败', 'error');
    }
  };

  return (
    <div className="flex h-screen bg-bg text-text-primary overflow-hidden">
      <AppSidebar
        view={view}
        testSuitesCount={testSuites.length}
        activeExecutionTasksCount={activeExecutionTasks.length}
        onChangeView={setView}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <AppTopbar
          view={view}
          theme={theme}
          setTheme={setTheme}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {view === 'dashboard' ? (
            <DashboardPage
              filterProtocol={filterProtocol}
              onChangeProtocol={setFilterProtocol}
              onOpenLaunchTask={() => {
                setLaunchMode('suite');
                setIsCasePickerOpen(false);
                if (selectedBaselineSuite) {
                  setSelectedSuiteId(String(selectedBaselineSuite.id));
                }
                if (onlineAssets.length === 1) {
                  setSelectedAssetId(String(onlineAssets[0].id));
                }
                setShowTaskModal(true);
              }}
              reliability={reliability}
              reliabilityTrendText={reliabilityTrendText}
              totalRuns={totalRuns}
              severeDefectCount={severeDefectCount}
              runningTaskCount={runningTaskCount}
              assetCount={assetCount}
              recentRuns={recentRuns}
              testCases={testCases}
              onSelectRecentRun={(run) => {
                const matchedCase = testCases.find((testCase) => testCase.id === run.test_case_id);
                if (matchedCase) {
                  setSelectedTestCase(matchedCase);
                }
              }}
              getExecutionStatusBadgeClass={getExecutionStatusBadgeClass}
              getExecutionStatusLabel={getExecutionStatusLabel}
              getTestResultBadge={getTestResultBadge}
              formatDuration={formatDuration}
              trendData={trendData}
              chartAccentStrong={chartAccentStrong}
              chartGrid={chartGrid}
              chartAxis={chartAxis}
              tooltipStyle={tooltipStyle}
              tooltipItemStyle={tooltipItemStyle}
              dashboardDefectDistribution={dashboardDefectDistribution}
              totalDashboardDefects={totalDashboardDefects}
              onViewDefects={() => setView('defects')}
              settings={settings}
              onToggleSetting={toggleSetting}
            />
          ) : view === 'requirements' ? (
            <RequirementsPage
              requirements={requirements}
              requirementCoverage={requirementCoverage}
              assets={assets}
              testCases={testCases}
              onCreateRequirement={createRequirement}
              onUpdateRequirement={updateRequirement}
              onDeleteRequirement={deleteRequirement}
              onUpdateRequirementLinks={updateRequirementLinks}
              onUpdateRequirementAssets={updateRequirementAssets}
            />
          ) : view === 'tara' ? (
            <TaraPage
              taraItems={taraItems}
              requirements={requirements}
              assets={assets}
              onCreateTaraItem={createTaraItem}
              onUpdateTaraItem={updateTaraItem}
              onDeleteTaraItem={deleteTaraItem}
              onUpdateTaraLinks={updateTaraLinks}
            />
          ) : view === 'management' ? (
            <ManagementPage
              managementCategoryFilter={managementCategoryFilter}
              managementSecurityDomainFilter={managementSecurityDomainFilter}
              managementAutomationFilter={managementAutomationFilter}
              managementSearchQuery={managementSearchQuery}
              managementCategoryOptions={managementCategoryOptions}
              managementSecurityDomainOptions={managementSecurityDomainOptions}
              managementFilteredTestCases={managementPageItems}
              managementPage={managementPage}
              managementPageSize={MANAGEMENT_PAGE_SIZE}
              managementTotal={managementTotal}
              managementTotalPages={managementTotalPages}
              managementIsFetching={managementPageData.isFetching}
              setManagementCategoryFilter={setManagementCategoryFilter}
              setManagementSecurityDomainFilter={setManagementSecurityDomainFilter}
              setManagementAutomationFilter={setManagementAutomationFilter}
              setManagementSearchQuery={setManagementSearchQuery}
              onChangePage={(page) => setManagementPage(Math.max(1, Math.min(page, managementTotalPages)))}
              onOpenImport={() => setShowImportModal(true)}
              onOpenCreate={() => setShowCreateModal(true)}
              onViewCase={(tc) => {
                setSelectedTestCase(tc);
              }}
              onEditCase={(tc) => {
                setSelectedTestCase(tc);
              }}
              onDeleteCase={(id) => requestDeleteTestCase(id)}
            />
          ) : view === 'suites' ? (
            <SuitesPage
              testSuites={testSuites}
              suiteRuns={suiteRuns}
              runningSuiteIds={runningSuiteIds}
              onlineAssetsCount={onlineAssets.length}
              securityBaselineSuiteName={SECURITY_BASELINE_SUITE_NAME}
              normalizeExecutionStatus={normalizeExecutionStatus}
              getExecutionStatusLabel={getExecutionStatusLabel}
              onOpenCreateSuite={() => setShowSuiteModal(true)}
              onRunSuite={(suiteId) => runSuite(suiteId)}
              onDeleteSuite={(suiteId) => deleteSuite(suiteId)}
            />
          ) : view === 'running' ? (
            <RunningPage
              activeExecutionTasks={activeExecutionTasks}
              executionTasks={executionTasks}
              getExecutionStatusLabel={getExecutionStatusLabel}
              getFailureCategoryMeta={getFailureCategoryMeta}
              normalizeExecutionStatus={normalizeExecutionStatus}
              onOpenTaskDetail={(taskId) => setSelectedTaskId(taskId)}
              onCancelTask={cancelTask}
              onRetryTask={retryTask}
              onReturnDashboard={() => setView('dashboard')}
            />
          ) : view === 'defects' ? (
            <DefectsPage
              defects={defectsPageItems}
              defectSummary={defectsPageSummary}
              page={defectsPage}
              total={defectsPageTotal}
              totalPages={defectsPageTotalPages}
              isFetching={defectsPageData.isFetching}
              analyzingDefectId={analyzingDefectId}
              defectAnalysis={defectAnalysis}
              onAnalyzeDefect={analyzeDefect}
              onChangePage={(page) => setDefectsPage(Math.max(1, Math.min(page, defectsPageTotalPages)))}
              onExportReport={exportReport}
            />
          ) : view === 'reports' ? (
            <ReportsPage
              trendData={reportsTrendData}
              coverageData={reportsCoverageData}
              defectDistribution={reportDefectDistribution}
              chartAccent={chartAccent}
              chartAccentStrong={chartAccentStrong}
              chartGrid={chartGrid}
              chartAxis={chartAxis}
              tooltipStyle={tooltipStyle}
              onExportReport={exportReport}
            />
          ) : (
            <AssetsPage
              assets={assets}
              pingingAssetId={pingingAssetId}
              onOpenRegisterAsset={() => setShowAssetModal(true)}
              onSelectAsset={(asset) => setSelectedAsset(asset)}
              onPingAsset={(asset) => pingAsset(asset)}
              onUpdateFirmware={(name) => updateFirmware(name)}
              onDeleteAsset={(id) => deleteAsset(id)}
            />
          )}
        </div>
      </main>

      <CreateTestCaseModal
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        createTestCase={createTestCase}
        createScriptPath={createScriptPath}
        setCreateScriptPath={setCreateScriptPath}
        createTestTool={createTestTool}
        setCreateTestTool={setCreateTestTool}
        createRequiredInputs={createRequiredInputs}
      />

      {/* Task Modal (Launch Test) */}
      <TaskLaunchModal
        showTaskModal={showTaskModal}
        setShowTaskModal={setShowTaskModal}
        createTestTask={createTestTask}
        launchMode={launchMode}
        setLaunchMode={setLaunchMode}
        setIsAssetPickerOpen={setIsAssetPickerOpen}
        selectedLaunchAsset={selectedLaunchAsset}
        selectedAssetSummary={selectedAssetSummary}
        isAssetPickerOpen={isAssetPickerOpen}
        onlineAssets={onlineAssets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={setSelectedAssetId}
        selectedLaunchSuite={selectedLaunchSuite}
        selectedSuiteSummary={selectedSuiteSummary}
        isCasePickerOpen={isCasePickerOpen}
        setIsCasePickerOpen={setIsCasePickerOpen}
        testSuites={testSuites}
        selectedSuiteId={selectedSuiteId}
        setSelectedSuiteId={setSelectedSuiteId}
        securityBaselineSuiteName={SECURITY_BASELINE_SUITE_NAME}
        selectedCaseIds={selectedCaseIds}
        selectedCaseSummary={selectedCaseSummary}
        testCases={testCases}
        setSelectedCaseIds={setSelectedCaseIds}
        selectedLaunchRequiredInputs={selectedLaunchRequiredInputs}
        requiredInputOptions={REQUIRED_INPUT_OPTIONS}
        selectedLaunchInputConflicts={selectedLaunchInputConflicts}
        isRuntimeInputsOpen={isRuntimeInputsOpen}
        setIsRuntimeInputsOpen={setIsRuntimeInputsOpen}
        selectedLaunchDefaultInputs={selectedLaunchDefaultInputs}
        taskRuntimeInputs={taskRuntimeInputs}
        setTaskRuntimeInputs={setTaskRuntimeInputs}
        stopOnFailure={stopOnFailure}
        setStopOnFailure={setStopOnFailure}
      />

      <CreateSuiteModal
        showSuiteModal={showSuiteModal}
        selectedSuiteCaseIds={selectedSuiteCaseIds}
        testCases={testCases}
        onClose={() => setShowSuiteModal(false)}
        onSubmit={createSuite}
        onToggleSuiteCase={toggleSuiteCase}
      />

      <ImportCasesModal
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        importText={importText}
        setImportText={setImportText}
        onImport={handleImport}
      />

      <RegisterAssetModal
        showAssetModal={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        onSubmit={registerAsset}
      />

      <AssetDetailModal
        asset={selectedAsset}
        pingingAssetId={pingingAssetId}
        isUpdatingAsset={isUpdatingAsset}
        onClose={() => setSelectedAsset(null)}
        onOpenEdit={() => setShowEditAssetModal(true)}
        onDeleteAsset={deleteAsset}
        onPingAsset={pingAsset}
        onUpdateFirmware={updateFirmware}
      />

      <EditAssetModal
        showEditAssetModal={showEditAssetModal}
        asset={selectedAsset}
        onClose={() => setShowEditAssetModal(false)}
        onSubmit={editAsset}
      />

      {/* Toasts */}
      <AnimatePresence>
        {toasts.map(toast => (
          <Toast 
            key={toast.id} 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} 
          />
        ))}
      </AnimatePresence>

      {/* Task Detail Modal */}
      <TaskDetailModal
        selectedTaskDetail={selectedTaskDetail}
        onClose={() => setSelectedTaskId(null)}
        getExecutionStatusLabel={getExecutionStatusLabel}
        getFailureCategoryMeta={getFailureCategoryMeta}
        formatServerDateTime={formatServerDateTime}
        isTaskDetailLoading={isTaskDetailLoading}
        taskDetailView={taskDetailView}
        normalizeTestResult={normalizeTestResult}
        normalizeExecutionStatus={normalizeExecutionStatus}
        formatDuration={formatDuration}
        parseStepResults={parseStepResults}
        getStepExecutionBadge={getStepExecutionBadge}
        manualSubmittingItemId={manualSubmittingItemId}
        submitManualTaskItemResult={submitManualTaskItemResult}
      />

      <DeleteTestCaseModal
        deleteTestCaseCandidate={deleteTestCaseCandidate}
        isDeletingTestCase={isDeletingTestCase}
        onClose={() => setDeleteTestCaseCandidate(null)}
        onConfirm={confirmDeleteTestCase}
      />

      <TestCaseDrawer
        selectedTestCase={selectedTestCase}
        closeDrawer={closeTestCaseDrawer}
        editTestCase={editTestCase}
        requestDeleteTestCase={requestDeleteTestCase}
        editTestTool={editTestTool}
        setEditTestTool={setEditTestTool}
        editScriptPath={editScriptPath}
        setEditScriptPath={setEditScriptPath}
        editRequiredInputs={editRequiredInputs}
        history={history}
        isHistoryLoading={isHistoryLoading}
      />
    </div>
  );
}
