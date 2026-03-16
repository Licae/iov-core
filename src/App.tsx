import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  PlayCircle, 
  FileWarning, 
  Database, 
  BarChart3, 
  Users, 
  Settings,
  Search,
  Plus,
  Bell,
  ChevronRight,
  MoreHorizontal,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Cpu,
  Car,
  Layers3,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Sun,
  Moon,
  Terminal as TerminalIcon,
  BrainCircuit,
  Trash2,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';

// --- Types ---
interface TestCase {
  id: number;
  title: string;
  category: string;
  type: 'Automated' | 'Manual';
  protocol: string;
  description: string;
  test_input?: string;
  test_tool?: string;
  expected_result?: string;
  automation_level?: string;
  status: string;
  created_at: string;
  steps?: string; // JSON string
}

interface TestRun {
  id: number;
  test_case_id: number;
  result: string;
  logs: string;
  duration: number;
  executed_by: string;
  executed_at: string;
}

interface RecentRun {
  id: number;
  test_case_id: number;
  result: string;
  logs: string;
  duration: number;
  executed_by: string;
  executed_at: string;
  test_case_title: string;
  category: string;
  protocol: string;
  test_case_status: string;
  task_id?: number | null;
  task_type?: string | null;
  task_status?: string | null;
  asset_name?: string | null;
}

interface Stats {
  total: number;
  automated: number;
  manual: number;
  results: { result: string; count: number }[];
}

interface TestSuite {
  id: number;
  name: string;
  description: string;
  created_at: string;
  case_count: number;
}

interface SuiteRun {
  id: number;
  suite_id: number;
  suite_name: string;
  status: string;
  total_cases: number;
  completed_cases: number;
  passed_cases: number;
  failed_cases: number;
  blocked_cases: number;
  current_case_id?: number | null;
  current_case_title?: string | null;
  started_at: string;
  finished_at?: string | null;
}

interface ExecutionTask {
  id: number;
  type: 'single' | 'suite';
  status: 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  asset_id?: number | null;
  asset_name?: string | null;
  suite_id?: number | null;
  suite_name?: string | null;
  test_case_id?: number | null;
  test_case_title?: string | null;
  total_items: number;
  completed_items: number;
  passed_items: number;
  failed_items: number;
  blocked_items: number;
  current_test_case_id?: number | null;
  current_case_title?: string | null;
  current_item_label?: string | null;
  started_at: string;
  finished_at?: string | null;
  stop_on_failure?: number;
  error_message?: string | null;
  executor?: string | null;
  retry_count?: number;
  source_task_id?: number | null;
}

interface ExecutionTaskDetailItem {
  id: number;
  task_id: number;
  test_case_id: number;
  sort_order: number;
  status: string;
  result?: string | null;
  run_id?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  title: string;
  category?: string | null;
  protocol?: string | null;
  test_tool?: string | null;
  test_input?: string | null;
  expected_result?: string | null;
  run_result?: string | null;
  logs?: string | null;
  duration?: number | null;
  executed_at?: string | null;
}

interface ExecutionTaskDetail {
  task: ExecutionTask;
  items: ExecutionTaskDetailItem[];
}

const CASE_CATEGORY_OPTIONS = ['IVI', 'T-Box', 'Gateway', 'ADAS', 'BMS', 'OTA', '整车', '云控平台', '移动端', 'CAN总线'];

// --- Components ---

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  key?: any;
}

const Toast = ({ message, type, onClose }: ToastProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20, x: 20 }}
    animate={{ opacity: 1, y: 0, x: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
      type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
    }`}
  >
    {type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
    <span className="text-sm font-medium">{message}</span>
    <button onClick={onClose} className="ml-2 hover:opacity-70 transition-opacity">
      <MoreHorizontal size={14} />
    </button>
  </motion.div>
);

const SidebarItem = ({ icon: Icon, label, active, badge, onClick }: { icon: any, label: string, active?: boolean, badge?: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-6 py-3 text-sm transition-all relative ${
      active ? 'text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={18} className={active ? 'text-accent' : ''} />
      <span className="font-medium">{label}</span>
    </div>
    {badge && (
      <span className="bg-accent/20 text-accent text-[10px] px-1.5 py-0.5 rounded font-bold">
        {badge}
      </span>
    )}
    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />}
  </button>
);

const StatCard = ({ label, value, trend, footnote, icon: Icon, color }: { label: string, value: string | number, trend?: string, footnote?: string, icon: any, color: string }) => (
  <div className="glass-card p-6 flex-1 min-w-[240px]">
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[12px] text-text-secondary font-medium">{label}</span>
      </div>
      <div className="bg-white/5 p-2 rounded-lg">
        <Icon size={20} className="text-text-secondary" />
      </div>
    </div>
    <div className="flex items-end gap-3">
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {trend && <div className="text-[11px] text-success font-medium pb-1">{trend}</div>}
    </div>
    <div className="mt-4 text-[10px] text-text-secondary uppercase tracking-wider font-bold">
      {footnote || '实时统计'}
    </div>
  </div>
);

export default function App() {
  const [view, setView] = useState<'dashboard' | 'running' | 'defects' | 'assets' | 'reports' | 'management' | 'suites'>('dashboard');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);
  const [executionTasks, setExecutionTasks] = useState<ExecutionTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [managementSearchQuery, setManagementSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showEditAssetModal, setShowEditAssetModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showSuiteModal, setShowSuiteModal] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<number | string>('');
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [selectedSuiteCaseIds, setSelectedSuiteCaseIds] = useState<number[]>([]);
  const [importText, setImportText] = useState('');
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'success' | 'error' }[]>([]);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<ExecutionTaskDetail | null>(null);
  const [isTaskDetailLoading, setIsTaskDetailLoading] = useState(false);
  const [pingingAssetId, setPingingAssetId] = useState<number | null>(null);
  const [history, setHistory] = useState<TestRun[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isRunningSimulation, setIsRunningSimulation] = useState(false);
  const [simulationLogs, setSimulationLogs] = useState<any[]>([]);
  const [analyzingDefectId, setAnalyzingDefectId] = useState<string | null>(null);
  const [isUpdatingAsset, setIsUpdatingAsset] = useState(false);
  const [defectAnalysis, setDefectAnalysis] = useState<Record<string, string>>({});
  const [filterProtocol, setFilterProtocol] = useState<string>('All');
  const [trendData, setTrendData] = useState<any[]>([]);
  const [coverageData, setCoverageData] = useState<any[]>([]);
  const [defects, setDefects] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ [key: string]: boolean }>({
    abort_on_critical_dtc: true,
    pr_requires_sil: true
  });
  const [runningSuiteIds, setRunningSuiteIds] = useState<number[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const filteredTestCases = testCases.filter(tc => {
    const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tc.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProtocol = filterProtocol === 'All' || tc.protocol === filterProtocol;
    return matchesSearch && matchesProtocol;
  });

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('iov-core-theme') as 'dark' | 'light' | null;
    const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const nextTheme = savedTheme || preferredTheme;
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('iov-core-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchData();

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'SIMULATION_LOG') {
        if (selectedTestCase?.id === data.testCaseId) {
          setSimulationLogs(prev => [...prev, data].slice(-10));
        }
      } else if (data.type === 'SIMULATION_COMPLETE') {
        fetchData();
        if (selectedTestCase?.id === data.testCaseId) {
          fetchHistory(data.testCaseId);
          setIsRunningSimulation(false);
          setSelectedTestCase(prev => prev ? { ...prev, status: data.result } : null);
        }
      } else if (data.type === 'EXECUTION_TASK_UPDATED' || data.type === 'EXECUTION_TASK_COMPLETED') {
        fetchData();
        if (selectedTaskDetail?.task.id && data.task?.id === selectedTaskDetail.task.id) {
          fetchTaskDetail(selectedTaskDetail.task.id, false);
        }
        if (data.type === 'EXECUTION_TASK_COMPLETED') {
          addToast(data.task?.type === 'suite' ? '测试套件执行完成' : '测试任务执行完成', 'success');
        }
      }
    };

    return () => ws.close();
  }, [selectedTestCase?.id, selectedTaskDetail?.task.id]);

  const fetchData = async () => {
    try {
      const [casesRes, statsRes, trendRes, coverageRes, defectsRes, assetsRes, settingsRes, suitesRes, suiteRunsRes, tasksRes, recentRunsRes] = await Promise.all([
        fetch('/api/test-cases'),
        fetch('/api/stats'),
        fetch('/api/stats/trend'),
        fetch('/api/stats/coverage'),
        fetch('/api/defects'),
        fetch('/api/assets'),
        fetch('/api/settings'),
        fetch('/api/test-suites'),
        fetch('/api/suite-runs'),
        fetch('/api/tasks'),
        fetch('/api/dashboard/recent-runs')
      ]);
      const cases = await casesRes.json();
      const statsData = await statsRes.json();
      const trend = await trendRes.json();
      const coverage = await coverageRes.json();
      const defectsData = await defectsRes.json();
      const assetsData = await assetsRes.json();
      const settingsData = await settingsRes.json();
      const suitesData = await suitesRes.json();
      const suiteRunsData = await suiteRunsRes.json();
      const tasksData = await tasksRes.json();
      const recentRunsData = await recentRunsRes.json();
      setTestCases(cases);
      setStats(statsData);
      setTrendData(trend);
      setCoverageData(coverage);
      setDefects(defectsData);
      setAssets(assetsData);
      setSettings(settingsData);
      setTestSuites(suitesData);
      setSuiteRuns(suiteRunsData);
      setExecutionTasks(tasksData);
      setRecentRuns(recentRunsData);
      setRunningSuiteIds(suiteRunsData.filter((run: SuiteRun) => run.status === 'Running' || run.status === 'Queued').map((run: SuiteRun) => run.suite_id));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分 ${secs}秒`;
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const fetchHistory = async (id: number) => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/test-cases/${id}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const fetchTaskDetail = async (taskId: number, openModal = true) => {
    setIsTaskDetailLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch task detail');
      }
      const data = await res.json();
      setSelectedTaskDetail(data);
    } catch (error) {
      console.error('Failed to fetch task detail:', error);
      addToast('读取任务详情失败', 'error');
      if (openModal) {
        setSelectedTaskDetail(null);
      }
    } finally {
      setIsTaskDetailLoading(false);
    }
  };

  const runSimulation = async (id: number) => {
    setIsRunningSimulation(true);
    setSimulationLogs([]);
    addToast('正在创建测试任务...', 'success');
    try {
      const res = await fetch(`/api/test-cases/${id}/run`, { method: 'POST' });
      if (res.ok) {
        await res.json();
        await fetchData();
        addToast('测试任务已开始执行', 'success');
      } else {
        addToast('模拟执行启动失败', 'error');
        setIsRunningSimulation(false);
      }
    } catch (error) {
      console.error('Simulation failed:', error);
      addToast('模拟执行过程中发生错误', 'error');
      setIsRunningSimulation(false);
    }
  };

  const analyzeDefect = async (defect: any) => {
    setAnalyzingDefectId(defect.id);
    try {
      const res = await fetch(`/api/defects/${defect.id}/analyze`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to analyze defect');
      }
      const data = await res.json();
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
  const totalRuns = stats?.results?.reduce((sum, item) => sum + Number(item.count || 0), 0) || 0;
  const passedRuns = stats?.results?.find((item) => item.result === 'Passed')?.count || 0;
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
  const assetCount = assets.length;
  const dashboardDefectDistribution = [
    { label: 'Critical', count: Number(defectSummary.Critical || 0), color: 'bg-danger' },
    { label: 'Major', count: Number(defectSummary.Major || 0), color: 'bg-warning' },
    { label: 'Minor', count: Number(defectSummary.Minor || 0), color: 'bg-accent' },
  ];
  const totalDashboardDefects = dashboardDefectDistribution.reduce((sum, item) => sum + item.count, 0);

  const pingAsset = async (asset: any) => {
    setPingingAssetId(asset.id);
    addToast(`正在 Ping ${asset.name}...`, 'success');
    try {
      const res = await fetch(`/api/assets/${asset.id}/ping`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.output || 'Ping failed');
      }
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
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetData)
      });
      if (res.ok) {
        addToast('资产注册成功', 'success');
        fetchData();
        setShowAssetModal(false);
      } else {
        addToast('资产注册失败', 'error');
      }
    } catch (error) {
      addToast('注册失败', 'error');
    }
  };

  const deleteAsset = async (id: number) => {
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('资产已删除', 'success');
        fetchData();
        setSelectedAsset(null);
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || '删除失败', 'error');
      }
    } catch (error) {
      addToast('删除失败', 'error');
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
      const res = await fetch(`/api/assets/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetData),
      });
      if (res.ok) {
        addToast('资产已更新', 'success');
        await fetchData();
        setSelectedAsset((prev: any) => prev ? { ...prev, ...assetData } : prev);
        setShowEditAssetModal(false);
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || '更新资产失败', 'error');
      }
    } catch (error) {
      addToast('更新资产失败', 'error');
    }
  };

  const createTestCase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const steps = (formData.get('steps') as string).split('\n').filter(s => s.trim());
    const newCase = {
      title: formData.get('title'),
      category: formData.get('category'),
      type: formData.get('type'),
      protocol: formData.get('protocol'),
      description: formData.get('description'),
      steps,
      test_input: formData.get('test_input'),
      test_tool: formData.get('test_tool'),
      expected_result: formData.get('expected_result'),
      automation_level: formData.get('automation_level')
    };

    try {
      const res = await fetch('/api/test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCase)
      });
      if (res.ok) {
        addToast('测试用例创建成功', 'success');
        fetchData();
        setShowCreateModal(false);
      }
    } catch (error) {
      addToast('创建失败', 'error');
    }
  };

  const createTestTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId || !selectedAssetId) return;

    try {
      const res = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          test_case_id: selectedCaseId,
          asset_id: selectedAssetId,
          stop_on_failure: stopOnFailure,
        })
      });
      if (res.ok) {
        addToast('测试任务已发起', 'success');
        setShowTaskModal(false);
        setStopOnFailure(false);
        setView('running');
        fetchData();
      }
    } catch (error) {
      addToast('发起任务失败', 'error');
    }
  };

  const editTestCase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTestCase) return;
    const formData = new FormData(e.currentTarget);
    const steps = (formData.get('steps') as string).split('\n').filter(s => s.trim());
    const updatedCase = {
      title: formData.get('title'),
      category: formData.get('category'),
      type: formData.get('type'),
      protocol: formData.get('protocol'),
      description: formData.get('description'),
      steps,
      test_input: formData.get('test_input'),
      test_tool: formData.get('test_tool'),
      expected_result: formData.get('expected_result'),
      automation_level: formData.get('automation_level')
    };

    try {
      const res = await fetch(`/api/test-cases/${selectedTestCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCase)
      });
      if (res.ok) {
        addToast('测试用例已更新', 'success');
        fetchData();
        setShowEditModal(false);
        setSelectedTestCase(null);
      }
    } catch (error) {
      addToast('更新失败', 'error');
    }
  };

  const handleImport = async () => {
    const lines = importText.split('\n').filter(l => l.includes('|'));
    if (lines.length < 3) return;

    // Skip header and separator
    const dataLines = lines.slice(2);
    const cases = dataLines.map(line => {
      const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
      if (parts.length < 7) return null;
      if (parts.length >= 9) {
        return {
          category: parts[0],
          title: parts[1],
          protocol: parts[2],
          type: parts[3],
          test_input: parts[4],
          test_tool: parts[5],
          steps: parts[6],
          expected_result: parts[7],
          automation_level: parts[8],
          description: parts[9] || '',
        };
      }
      return {
        category: parts[0],
        title: parts[1],
        test_input: parts[2],
        test_tool: parts[3],
        steps: parts[4],
        expected_result: parts[5],
        automation_level: parts[6]
      };
    }).filter(c => c !== null);

    try {
      const res = await fetch('/api/test-cases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases })
      });
      if (res.ok) {
        addToast(`成功导入 ${cases.length} 条测试用例`, 'success');
        fetchData();
        setShowImportModal(false);
        setImportText('');
      }
    } catch (error) {
      addToast('导入失败', 'error');
    }
  };

  const deleteTestCase = async (id: number) => {
    // In iframe environment, native confirm might be blocked. 
    // For now, we proceed with deletion to ensure functionality works.
    try {
      const res = await fetch(`/api/test-cases/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('测试用例已删除', 'success');
        fetchData();
        setSelectedTestCase(null);
      }
    } catch (error) {
      addToast('删除失败', 'error');
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
      const res = await fetch('/api/test-suites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to create suite');
      }
      addToast('测试套件创建成功', 'success');
      setShowSuiteModal(false);
      setSelectedSuiteCaseIds([]);
      fetchData();
    } catch (error) {
      addToast('创建测试套件失败', 'error');
    }
  };

  const toggleSuiteCase = (testCaseId: number) => {
    setSelectedSuiteCaseIds(prev =>
      prev.includes(testCaseId) ? prev.filter(id => id !== testCaseId) : [...prev, testCaseId]
    );
  };

  const runSuite = async (suiteId: number) => {
    try {
      const res = await fetch(`/api/test-suites/${suiteId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stop_on_failure: true }),
      });
      if (!res.ok) {
        throw new Error('Failed to run suite');
      }
      addToast('测试套件已加入执行队列（失败即停）', 'success');
      fetchData();
      setView('suites');
    } catch (error) {
      addToast('启动测试套件失败', 'error');
    }
  };

  const cancelTask = async (taskId: number) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'PATCH' });
      if (!res.ok) {
        throw new Error('Failed to cancel task');
      }
      addToast('任务已取消', 'success');
      fetchData();
      setIsRunningSimulation(false);
    } catch (error) {
      addToast('取消任务失败', 'error');
    }
  };

  const retryTask = async (taskId: number) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to retry task');
      }
      addToast('任务已重新加入执行队列', 'success');
      fetchData();
      setView('running');
    } catch (error) {
      addToast('重试任务失败', 'error');
    }
  };

  const deleteSuite = async (suiteId: number) => {
    try {
      const res = await fetch(`/api/test-suites/${suiteId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Failed to delete suite');
      }
      addToast('测试套件已删除', 'success');
      fetchData();
    } catch (error) {
      addToast('删除测试套件失败', 'error');
    }
  };

  const currentViewLabel = {
    dashboard: '仪表盘',
    management: '用例管理',
    suites: '测试套件',
    running: '仿真执行',
    defects: '缺陷日志',
    assets: '测试资产',
    reports: '分析报告',
  }[view];

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
  const activeExecutionTasks = executionTasks.filter(task => task.status === 'Running' || task.status === 'Queued');
  const runningTaskCount = activeExecutionTasks.length;

  const toggleSetting = async (key: string) => {
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));
    try {
      const res = await fetch(`/api/settings/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      });
      if (res.ok) {
        addToast(`设置已更新`, 'success');
      } else {
        addToast('更新设置失败', 'error');
        // Rollback
        setSettings(prev => ({ ...prev, [key]: !newValue }));
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
      addToast('网络错误', 'error');
      setSettings(prev => ({ ...prev, [key]: !newValue }));
    }
  };
  const updateTestCaseStatus = async (id: number, status: string) => {
    setUpdatingIds(prev => [...prev, id]);
    try {
      const res = await fetch(`/api/test-cases/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchData();
        addToast(`测试状态已更新为 ${status}`, 'success');
      } else {
        addToast('更新状态失败', 'error');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      addToast('网络错误，请稍后重试', 'error');
    } finally {
      setUpdatingIds(prev => prev.filter(uid => uid !== id));
    }
  };

  return (
    <div className="flex h-screen bg-bg text-text-primary overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col bg-bg z-20">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center">
              <Zap size={18} className="text-white" fill="white" />
            </div>
            <h1 className="text-lg font-bold tracking-tighter uppercase">IOV-CORE</h1>
          </div>
        </div>

        <div className="flex-1 py-4">
          <div className="px-8 mb-4 text-[10px] uppercase tracking-widest text-muted font-bold">平台功能</div>
          <nav className="space-y-1">
            <SidebarItem icon={LayoutDashboard} label="仪表盘" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
            <SidebarItem icon={Database} label="用例管理" active={view === 'management'} onClick={() => setView('management')} />
            <SidebarItem icon={Layers3} label="测试套件" badge={testSuites.length ? String(testSuites.length) : undefined} active={view === 'suites'} onClick={() => setView('suites')} />
            <SidebarItem icon={PlayCircle} label="仿真执行" badge={String(activeExecutionTasks.length)} active={view === 'running'} onClick={() => setView('running')} />
            <SidebarItem icon={FileWarning} label="缺陷日志" active={view === 'defects'} onClick={() => setView('defects')} />
            <SidebarItem icon={Database} label="测试资产" active={view === 'assets'} onClick={() => setView('assets')} />
            <SidebarItem icon={BarChart3} label="分析报告" active={view === 'reports'} onClick={() => setView('reports')} />
          </nav>

          <div className="px-8 mt-8 mb-4 text-[10px] uppercase tracking-widest text-muted font-bold">系统管理</div>
          <nav className="space-y-1">
            <SidebarItem icon={Users} label="团队成员" onClick={() => {}} />
            <SidebarItem icon={Settings} label="偏好设置" onClick={() => {}} />
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">平台</span>
            <ChevronRight size={14} className="text-muted" />
            <span className="text-white font-medium">{currentViewLabel}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="theme-toggle-glow" />
              <div className="segmented-control">
                <div
                  className="segmented-thumb"
                  style={{ transform: theme === 'dark' ? 'translateX(0)' : 'translateX(calc(100% + 4px))' }}
                />
                <button
                  onClick={() => setTheme('dark')}
                  className={`segmented-option ${theme === 'dark' ? 'is-active' : ''}`}
                >
                  <Moon size={14} />
                  <span>深色</span>
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`segmented-option ${theme === 'light' ? 'is-active' : ''}`}
                >
                  <Sun size={14} />
                  <span>浅色</span>
                </button>
              </div>
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="搜索 ECU、VIN、DTC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-card border border-border rounded-lg pl-10 pr-4 py-1.5 text-xs w-64 focus:outline-none focus:border-accent transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                <span className="text-[10px] bg-border px-1 rounded text-text-secondary">⌘</span>
                <span className="text-[10px] bg-border px-1 rounded text-text-secondary">K</span>
              </div>
            </div>
            <button className="text-text-secondary hover:text-white transition-colors">
              <Bell size={20} />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent to-sky-400" />
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {view === 'dashboard' ? (
            <>
              {/* Header Section */}
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">车辆与组件测试概览</h2>
                  <p className="text-sm text-text-secondary">监控自动化测试运行、ECU 仿真及整车诊断。</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex bg-card border border-border rounded-lg p-1">
                    {['All', 'CAN', 'Ethernet', 'V2X'].map(p => (
                      <button 
                        key={p}
                        onClick={() => setFilterProtocol(p)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${filterProtocol === p ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShowTaskModal(true)}
                    className="bg-accent px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-[#4433EE] transition-colors shadow-lg shadow-accent/20"
                  >
                    <Plus size={16} />
                    发起测试任务
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="flex gap-6 overflow-x-auto pb-2">
                <StatCard
                  label="系统可靠性"
                  value={`${reliability}%`}
                  trend={reliabilityTrendText}
                  footnote={totalRuns > 0 ? `基于 ${totalRuns} 次真实执行结果` : '暂无真实执行数据'}
                  icon={ShieldCheck}
                  color="bg-success"
                />
                <StatCard
                  label="严重缺陷"
                  value={severeDefectCount}
                  footnote={severeDefectCount > 0 ? `Critical + Major 共 ${severeDefectCount} 条` : '当前无高优先级缺陷'}
                  icon={AlertTriangle}
                  color="bg-danger"
                />
                <StatCard
                  label="运行中仿真"
                  value={runningTaskCount}
                  footnote={runningTaskCount > 0 ? '当前队列存在运行中或排队任务' : '当前没有活动中的测试任务'}
                  icon={Activity}
                  color="bg-accent"
                />
                <StatCard
                  label="测试资产总数"
                  value={assetCount}
                  footnote={assetCount > 0 ? `已登记 ${assetCount} 个真实测试资产` : '当前尚未登记测试资产'}
                  icon={Database}
                  color="bg-text-secondary"
                />
              </div>

              {/* Main Dashboard Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Executions */}
                <div className="lg:col-span-2 glass-card overflow-hidden">
                  <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="font-bold">最近测试执行</h3>
                    <button className="text-xs text-accent font-bold flex items-center gap-1 hover:underline">
                      查看全部 <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className="table-header">目标资产</th>
                          <th className="table-header">测试类型</th>
                          <th className="table-header">状态</th>
                          <th className="table-header">测试结果</th>
                          <th className="table-header">耗时</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {recentRuns.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-muted italic">未找到匹配的测试用例</td>
                          </tr>
                        ) : (
                          recentRuns.map((run) => (
                            <tr 
                              key={run.id} 
                              onClick={() => {
                                const matchedCase = testCases.find((tc) => tc.id === run.test_case_id);
                                if (matchedCase) {
                                  setSelectedTestCase(matchedCase);
                                  fetchHistory(matchedCase.id);
                                }
                              }}
                              className="table-row cursor-pointer transition-opacity"
                            >
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center">
                                  {run.category === 'T-Box' || run.category === 'IVI' || run.category === 'Gateway'
                                    ? <Cpu size={16} className="text-text-secondary" />
                                    : <Car size={16} className="text-text-secondary" />}
                                </div>
                                <div>
                                  <div className="font-bold">{run.asset_name || run.test_case_title}</div>
                                  <div className="text-[10px] text-muted uppercase">{run.category} ({run.protocol})</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs">{run.test_case_title}</div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`badge ${
                                (run.task_status || run.test_case_status) === 'Running' ? 'badge-info' :
                                (run.task_status || run.test_case_status) === 'Passed' || run.result === 'Passed' ? 'badge-success' :
                                (run.task_status || run.test_case_status) === 'Failed' || run.result === 'Failed' ? 'badge-danger' :
                                (run.task_status || run.test_case_status) === 'Blocked' ? 'badge-warning' : 'badge-info'
                              }`}>
                                {run.task_status || run.test_case_status || 'Completed'}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              {run.result === 'Running' || run.task_status === 'Running' ? (
                                <div className="flex items-center gap-2 text-accent">
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                  >
                                    <Zap size={12} />
                                  </motion.div>
                                  <span className="text-[10px] font-bold">执行中...</span>
                                </div>
                              ) : run.result === 'Failed' ? (
                                <div className="flex items-center gap-2 text-danger">
                                  <AlertTriangle size={12} />
                                  <span className="font-bold text-[10px]">执行失败</span>
                                </div>
                              ) : run.result === 'Passed' ? (
                                <div className="flex items-center gap-2 text-success">
                                  <ShieldCheck size={12} />
                                  <span className="font-bold text-[10px]">全部通过</span>
                                </div>
                              ) : run.result === 'Blocked' ? (
                                <div className="flex items-center gap-2 text-warning">
                                  <Clock size={12} />
                                  <span className="font-bold text-[10px]">已阻塞</span>
                                </div>
                              ) : (
                                <span className="text-muted text-[10px]">未执行</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-text-secondary font-mono text-xs">
                              {formatDuration(run.duration)}
                            </td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Defect Distribution */}
                <div className="flex flex-col gap-8">
                  <div className="glass-card p-6 flex-1">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold">执行趋势</h3>
                      <div className="text-[10px] text-muted font-bold uppercase tracking-widest">过去 7 天</div>
                    </div>
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="colorRuns" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={chartAccentStrong} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={chartAccentStrong} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: chartAxis, fontSize: 10 }} 
                            dy={10}
                          />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={tooltipStyle}
                            itemStyle={tooltipItemStyle}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="runs" 
                            stroke={chartAccentStrong} 
                            fillOpacity={1} 
                            fill="url(#colorRuns)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-6 flex-1">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="font-bold">缺陷分布</h3>
                      <MoreHorizontal size={18} className="text-muted" />
                    </div>
                  <div className="space-y-6">
                    {dashboardDefectDistribution.map((item, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                            <span>{item.label}</span>
                          </div>
                          <span>{item.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${totalDashboardDefects > 0 ? (item.count / totalDashboardDefects) * 100 : 0}%` }}
                            transition={{ duration: 1, delay: i * 0.1 }}
                            className={`h-full ${item.color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setView('defects')} className="w-full mt-8 bg-card border border-border py-2 rounded-lg text-xs font-bold hover:bg-border transition-colors">
                    查看诊断报告
                  </button>
                </div>
              </div>
            </div>

            {/* Automation Rules */}
            <div className="glass-card p-8">
              <h3 className="font-bold mb-2">自动化测试规则</h3>
              <p className="text-xs text-text-secondary mb-8">管理 ECU 固件与车辆网络的流水线触发器。</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-white/2">
                  <div>
                    <div className="font-bold text-sm mb-1">遇到安全关键 DTC 时中止</div>
                    <div className="text-[10px] text-muted">如果抛出严重的故障码，则自动停止仿真测试。</div>
                  </div>
                  <div 
                    onClick={() => toggleSetting('abort_on_critical_dtc')}
                    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${settings.abort_on_critical_dtc ? 'bg-accent' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.abort_on_critical_dtc ? 20 : 2 }}
                      className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" 
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-white/2">
                  <div>
                    <div className="font-bold text-sm mb-1">PR 需通过 SIL 验证</div>
                    <div className="text-[10px] text-muted">强制对所有 ECU 固件的代码提交进行软件在环 (SIL) 验证。</div>
                  </div>
                  <div 
                    onClick={() => toggleSetting('pr_requires_sil')}
                    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${settings.pr_requires_sil ? 'bg-accent' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.pr_requires_sil ? 20 : 2 }}
                      className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" 
                    />
                  </div>
                </div>
              </div>
            </div>
            </>
          ) : view === 'management' ? (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">测试用例管理</h2>
                  <p className="text-sm text-text-secondary">维护全球 V2X 与车载系统安全测试基准库。</p>
                </div>
                <div className="flex gap-3">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={14} />
                    <input 
                      type="text" 
                      placeholder="搜索用例名称、类别或工具..."
                      value={managementSearchQuery}
                      onChange={(e) => setManagementSearchQuery(e.target.value)}
                      className="bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent transition-all"
                    />
                  </div>
                  <button 
                    onClick={() => setShowImportModal(true)}
                    className="px-4 py-2 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <Plus size={14} /> 批量导入
                  </button>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
                  >
                    <Plus size={14} /> 新建用例
                  </button>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-white/2">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase text-muted tracking-widest w-16">序号</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">类别</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">名称</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">预期结果</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">工具</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">自动化</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {testCases
                      .filter(tc => 
                        tc.title.toLowerCase().includes(managementSearchQuery.toLowerCase()) ||
                        tc.category.toLowerCase().includes(managementSearchQuery.toLowerCase()) ||
                        (tc.test_tool && tc.test_tool.toLowerCase().includes(managementSearchQuery.toLowerCase()))
                      )
                      .map((tc, index) => (
                      <tr key={tc.id} className="hover:bg-white/2 transition-colors group">
                        <td className="px-6 py-4 text-xs text-muted font-mono">
                          {String(index + 1).padStart(2, '0')}
                        </td>
                        <td className="px-8 py-4">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-muted">
                            {tc.category}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          <div className="font-bold text-sm">{tc.title}</div>
                          <div className="text-[10px] text-muted truncate max-w-xs">{tc.protocol} • {tc.type}</div>
                        </td>
                        <td className="px-8 py-4 text-xs text-text-secondary max-w-sm">
                          <div className="line-clamp-2">{tc.expected_result || '-'}</div>
                        </td>
                        <td className="px-8 py-4 text-xs font-mono text-accent">{tc.test_tool || '-'}</td>
                        <td className="px-8 py-4">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tc.automation_level === 'A' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {tc.automation_level || 'B'}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setSelectedTestCase(tc)} className="p-1.5 hover:bg-white/10 rounded text-muted hover:text-white">
                              <Search size={14} />
                            </button>
                            <button onClick={() => { setSelectedTestCase(tc); setShowEditModal(true); }} className="p-1.5 hover:bg-white/10 rounded text-muted hover:text-white">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => deleteTestCase(tc.id)} className="p-1.5 hover:bg-white/10 rounded text-danger/50 hover:text-danger">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : view === 'suites' ? (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">测试套件编排</h2>
                  <p className="text-sm text-text-secondary">将多个测试用例组合为顺序执行任务，适合核心回归与冒烟验证。</p>
                </div>
                <button
                  onClick={() => setShowSuiteModal(true)}
                  className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
                >
                  <Plus size={14} /> 新建套件
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold">已定义套件</h3>
                    <span className="text-[10px] text-muted uppercase font-bold">{testSuites.length} 个套件</span>
                  </div>
                  <div className="divide-y divide-border">
                    {testSuites.length === 0 ? (
                      <div className="p-10 text-center text-muted italic">暂无测试套件</div>
                    ) : (
                      testSuites.map((suite) => (
                        <div key={suite.id} className="p-6 space-y-4 hover:bg-white/2 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-bold text-lg">{suite.name}</h4>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-muted">
                                  {suite.case_count} 条用例
                                </span>
                              </div>
                              <p className="text-sm text-text-secondary">{suite.description || '未填写套件说明'}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => runSuite(suite.id)}
                                disabled={runningSuiteIds.includes(suite.id)}
                                className="px-3 py-2 rounded-lg bg-accent text-white text-[10px] font-bold uppercase disabled:opacity-50"
                              >
                                {runningSuiteIds.includes(suite.id) ? '执行中' : '执行套件'}
                              </button>
                              <button
                                onClick={() => deleteSuite(suite.id)}
                                className="px-3 py-2 rounded-lg border border-danger/30 text-danger text-[10px] font-bold uppercase"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold">最近套件执行</h3>
                    <span className="text-[10px] text-muted uppercase font-bold">实时刷新</span>
                  </div>
                  <div className="divide-y divide-border">
                    {suiteRuns.length === 0 ? (
                      <div className="p-10 text-center text-muted italic">暂无执行记录</div>
                    ) : (
                      suiteRuns.map((run) => {
                        const progress = run.total_cases > 0 ? Math.round((run.completed_cases / run.total_cases) * 100) : 0;
                        return (
                          <div key={run.id} className="p-6 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="font-bold text-sm mb-1">{run.suite_name}</div>
                                <div className="text-[10px] text-muted uppercase font-bold">
                                  {run.status} • {run.completed_cases}/{run.total_cases}
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                run.status === 'Completed' ? 'bg-success/20 text-success' :
                                run.status === 'Running' ? 'bg-accent/20 text-accent' :
                                'bg-warning/20 text-warning'
                              }`}>
                                {run.status}
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-accent"
                              />
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-[10px] font-bold uppercase text-muted">
                              <div>通过 {run.passed_cases}</div>
                              <div>失败 {run.failed_cases}</div>
                              <div>阻塞 {run.blocked_cases}</div>
                              <div>{run.current_case_title ? `当前 ${run.current_case_title}` : '已结束'}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : view === 'running' ? (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">运行中测试任务</h2>
                  <p className="text-sm text-text-secondary">当前正在执行的 HIL/SIL 仿真任务实时监控。</p>
                </div>
                <div className="flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-lg border border-success/20">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-bold uppercase">集群状态: 正常</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {activeExecutionTasks.map((task) => {
                  const progress = task.total_items > 0 ? Math.round((task.completed_items / task.total_items) * 100) : 0;
                  const title = task.type === 'suite' ? task.suite_name : task.test_case_title;
                  const subtitle = task.type === 'suite'
                    ? `测试套件 • ${task.total_items} 条用例`
                    : `${task.asset_name || '未绑定资产'} • ${task.current_case_title || task.test_case_title || '单用例任务'}`;

                  return (
                    <div key={`task-${task.id}`} className="glass-card p-6 flex items-center gap-6">
                      <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        {task.type === 'suite' ? <Layers3 size={24} /> : <Activity size={24} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-lg">{title || `任务 #${task.id}`}</h4>
                            <p className="text-xs text-muted uppercase font-bold tracking-wider">{subtitle}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold text-accent mb-1">进度: {progress}%</div>
                            <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-accent"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-muted font-mono">
                          <span>状态: {task.status}</span>
                          <span>完成: {task.completed_items}/{task.total_items}</span>
                          <span>通过: {task.passed_items}</span>
                          <span>失败: {task.failed_items}</span>
                          <span>{task.stop_on_failure ? '策略: 失败即停' : '策略: 全部执行'}</span>
                          <span>执行器: {task.executor || 'simulate'}</span>
                          <span className="text-accent">{task.current_case_title ? `当前: ${task.current_case_title}` : '等待调度'}</span>
                        </div>
                        {task.error_message && (
                          <div className="mt-2 text-[10px] text-danger font-medium">{task.error_message}</div>
                        )}
                        {task.retry_count ? (
                          <div className="mt-2 text-[10px] text-muted font-medium">重试次数: {task.retry_count}</div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchTaskDetail(task.id)}
                          className="px-3 py-2 rounded-lg border border-border text-text-secondary text-[10px] font-bold uppercase"
                        >
                          详情
                        </button>
                        {(task.status === 'Running' || task.status === 'Queued') ? (
                          <button
                            onClick={() => cancelTask(task.id)}
                            className="px-3 py-2 rounded-lg border border-danger/30 text-danger text-[10px] font-bold uppercase"
                          >
                            取消
                          </button>
                        ) : (
                          <button
                            onClick={() => retryTask(task.id)}
                            className="px-3 py-2 rounded-lg border border-accent/30 text-accent text-[10px] font-bold uppercase"
                          >
                            重试
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {executionTasks.length === 0 && (
                  <div className="glass-card p-20 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-muted">
                      <Activity size={32} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xl">暂无运行中的仿真</h4>
                      <p className="text-muted text-sm">前往仪表盘启动新的测试任务</p>
                    </div>
                    <button 
                      onClick={() => setView('dashboard')}
                      className="px-6 py-2 bg-accent rounded-lg text-xs font-bold uppercase"
                    >
                      返回仪表盘
                    </button>
                  </div>
                )}

                {activeExecutionTasks.length === 0 && executionTasks.length > 0 && executionTasks.slice(0, 6).map((task) => {
                  const progress = task.total_items > 0 ? Math.round((task.completed_items / task.total_items) * 100) : 0;
                  const title = task.type === 'suite' ? task.suite_name : task.test_case_title;
                  return (
                    <div key={`history-task-${task.id}`} className="glass-card p-6 flex items-center gap-6 opacity-80">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-muted">
                        {task.type === 'suite' ? <Layers3 size={24} /> : <Activity size={24} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-lg">{title || `任务 #${task.id}`}</h4>
                            <p className="text-xs text-muted uppercase font-bold tracking-wider">{task.status} • 进度 {progress}%</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => fetchTaskDetail(task.id)}
                              className="px-3 py-2 rounded-lg border border-border text-text-secondary text-[10px] font-bold uppercase"
                            >
                              详情
                            </button>
                            <button
                              onClick={() => retryTask(task.id)}
                              className="px-3 py-2 rounded-lg border border-accent/30 text-accent text-[10px] font-bold uppercase"
                            >
                              重新执行
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-muted font-mono">
                          <span>执行器: {task.executor || 'simulate'}</span>
                          <span>{task.stop_on_failure ? '策略: 失败即停' : '策略: 全部执行'}</span>
                          <span>通过: {task.passed_items}</span>
                          <span>失败: {task.failed_items}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : view === 'defects' ? (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">缺陷与诊断日志</h2>
                  <p className="text-sm text-text-secondary">从测试中捕获的 DTC 故障码与安全漏洞。</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={exportReport} className="px-4 py-2 rounded-lg bg-danger text-white text-xs font-bold uppercase">导出报告</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 border-l-4 border-danger">
                  <div className="text-[10px] font-bold text-danger uppercase mb-1">致命 (Critical)</div>
                  <div className="text-3xl font-bold">{String(defectSummary.Critical || 0).padStart(2, '0')}</div>
                  <div className="text-[10px] text-muted mt-2">需要立即修复的安全漏洞</div>
                </div>
                <div className="glass-card p-6 border-l-4 border-warning">
                  <div className="text-[10px] font-bold text-warning uppercase mb-1">严重 (Major)</div>
                  <div className="text-3xl font-bold">{String(defectSummary.Major || 0).padStart(2, '0')}</div>
                  <div className="text-[10px] text-muted mt-2">影响核心功能的逻辑错误</div>
                </div>
                <div className="glass-card p-6 border-l-4 border-accent">
                  <div className="text-[10px] font-bold text-accent uppercase mb-1">一般 (Minor)</div>
                  <div className="text-3xl font-bold">{String(defectSummary.Minor || 0).padStart(2, '0')}</div>
                  <div className="text-[10px] text-muted mt-2">非关键性的显示或性能问题</div>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/[0.02] text-[10px] uppercase tracking-widest font-bold text-muted">
                      <th className="py-4 px-8 border-b border-border">缺陷 ID</th>
                      <th className="py-4 px-4 border-b border-border">描述</th>
                      <th className="py-4 px-4 border-b border-border">来源模块</th>
                      <th className="py-4 px-4 border-b border-border">严重程度</th>
                      <th className="py-4 px-4 border-b border-border">状态</th>
                      <th className="py-4 px-4 border-b border-border">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {defects.map((defect, i) => (
                      <React.Fragment key={i}>
                        <tr className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-4 px-8 font-mono text-xs font-bold text-accent">{defect.id}</td>
                          <td className="py-4 px-4 text-sm font-medium">{defect.description}</td>
                          <td className="py-4 px-4 text-xs text-muted">{defect.module}</td>
                          <td className="py-4 px-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                              defect.severity === 'Critical' ? 'bg-danger/20 text-danger border border-danger/30' :
                              defect.severity === 'Major' ? 'bg-warning/20 text-warning border border-warning/30' :
                              'bg-accent/20 text-accent border border-accent/30'
                            }`}>
                              {defect.severity}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs font-bold uppercase">{defect.status}</td>
                          <td className="py-4 px-4">
                            <button 
                              onClick={() => analyzeDefect(defect)}
                              disabled={analyzingDefectId === defect.id}
                              className="flex items-center gap-2 text-accent hover:text-white transition-colors text-[10px] font-bold uppercase"
                            >
                              {analyzingDefectId === defect.id ? (
                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                                  <BrainCircuit size={14} />
                                </motion.div>
                              ) : <BrainCircuit size={14} />}
                              AI 诊断
                            </button>
                          </td>
                        </tr>
                        {defectAnalysis[defect.id] && (
                          <tr>
                            <td colSpan={6} className="px-8 py-4 bg-accent/5 border-y border-accent/10">
                              <div className="flex gap-4">
                                <BrainCircuit size={20} className="text-accent shrink-0 mt-1" />
                                <div className="text-xs text-text-secondary leading-relaxed prose prose-invert prose-sm max-w-none">
                                  <div className="font-bold text-accent mb-2 uppercase tracking-widest">AI 智能分析报告</div>
                                  <div dangerouslySetInnerHTML={{ __html: defectAnalysis[defect.id].replace(/\n/g, '<br/>') }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {defects.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted italic">未发现缺陷记录</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : view === 'reports' ? (
            <div className="space-y-8 pb-20">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">测试分析报告</h2>
                  <p className="text-sm text-text-secondary">多维度的测试质量、效率与覆盖率分析。</p>
                </div>
                <button onClick={exportReport} className="px-4 py-2 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors">
                  导出 PDF 报告
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card p-8">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-8">测试通过率趋势</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartAccent} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={chartAccent} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="date" stroke={chartAxis} fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartAxis} fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={tooltipStyle}
                          itemStyle={{ color: chartAccentStrong }}
                        />
                        <Area type="monotone" dataKey="passRate" stroke={chartAccent} fillOpacity={1} fill="url(#colorPass)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-8">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-8">缺陷严重程度分布</h3>
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-8 w-full">
                      {[
                        { label: 'Critical', count: 12, color: 'bg-danger' },
                        { label: 'Major', count: 24, color: 'bg-warning' },
                        { label: 'Minor', count: 45, color: 'bg-accent' },
                        { label: 'Low', count: 18, color: 'bg-success' }
                      ].map(item => (
                        <div key={item.label} className="p-6 rounded-2xl bg-white/2 border border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full ${item.color}`} />
                            <span className="text-[10px] font-bold uppercase text-muted">{item.label}</span>
                          </div>
                          <div className="text-2xl font-bold">{item.count}</div>
                          <div className="text-[10px] text-muted mt-1">占总数 {Math.round(item.count / 99 * 100)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-8">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-8">ECU 模块测试覆盖率</h3>
                <div className="space-y-6">
                  {coverageData.map(ecu => (
                    <div key={ecu.name} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm">{ecu.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            ecu.status === 'Passed' ? 'bg-success/20 text-success' :
                            ecu.status === 'Warning' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                          }`}>{ecu.coverage}% 覆盖</span>
                        </div>
                        <span className="text-[10px] text-muted font-mono">目标: 95%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${ecu.coverage}%` }}
                          className={`h-full ${
                            ecu.status === 'Passed' ? 'bg-success' :
                            ecu.status === 'Warning' ? 'bg-warning' : 'bg-danger'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                  {coverageData.length === 0 && (
                    <div className="py-10 text-center text-muted italic">暂无覆盖率数据</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold mb-2">测试资产库</h2>
                  <p className="text-sm text-text-secondary">管理测试涉及的 ECU、车辆原型与仿真节点。</p>
                </div>
                <button 
                  onClick={() => setShowAssetModal(true)}
                  className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
                >
                  <Plus size={14} /> 注册新资产
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {assets.map((asset, i) => (
                  <div 
                    key={i} 
                    onClick={() => setSelectedAsset(asset)}
                    className="glass-card p-6 space-y-4 cursor-pointer hover:border-accent/50 transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <Cpu size={20} />
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${asset.status === 'Online' ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted'}`}>
                        {asset.status}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold">{asset.name}</h4>
                      <p className="text-[10px] text-muted uppercase font-bold">{asset.type}</p>
                    </div>
                    <div className="space-y-2 pt-4 border-t border-border">
                      <div className="flex justify-between items-center text-[10px] text-muted font-mono">
                        <span>HW: {asset.hardware_version || '-'}</span>
                        <span>SW: {asset.software_version || '-'}</span>
                      </div>
                      {asset.description ? (
                        <p className="text-[10px] text-text-secondary line-clamp-2">{asset.description}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); pingAsset(asset); }}
                          className="text-accent hover:underline text-[10px] font-bold uppercase"
                        >
                          {pingingAssetId === asset.id ? 'Ping中' : 'Ping'}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); updateFirmware(asset.name); }}
                          className="text-accent hover:underline text-[10px] font-bold uppercase"
                        >
                          升级
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteAsset(asset.id); }}
                          className="text-danger hover:underline text-[10px] font-bold uppercase"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {assets.length === 0 && (
                  <div className="col-span-full py-20 text-center text-muted italic">资产库为空</div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">新建测试用例</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={createTestCase} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 scrollbar-hide">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">用例名称</label>
                  <input name="title" required type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：BMS 热失控仿真" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">目标模块 / 业务域</label>
                    <select name="category" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      {CASE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-muted mt-1">用于检索、分组和套件编排，不直接绑定执行资产。</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试协议</label>
                    <select name="protocol" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="CAN">CAN</option>
                      <option value="DoIP">DoIP</option>
                      <option value="Ethernet">Ethernet</option>
                      <option value="OTA">OTA</option>
                      <option value="V2X">V2X</option>
                      <option value="BLE">BLE</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试类型</label>
                    <select name="type" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="Automated">自动化 (Automated)</option>
                      <option value="Manual">手动 (Manual)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">自动化等级</label>
                    <select name="automation_level" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="A">A (完全自动)</option>
                      <option value="B">B (半自动)</option>
                      <option value="C">C (人工交互)</option>
                      <option value="D">D (无法自动)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试工具</label>
                  <input name="test_tool" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：ZCANPRO, Wireshark" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试输入</label>
                  <input name="test_input" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：合法OTA包、篡改后OTA包" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">预期结果</label>
                  <textarea name="expected_result" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-16" placeholder="描述预期行为..." />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                  <textarea name="description" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-16" placeholder="简述测试目的..." />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试步骤 (每行一步)</label>
                  <textarea name="steps" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none h-32" placeholder="步骤 1: ...&#10;步骤 2: ..." />
                </div>
                <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase mt-4 hover:bg-[#4433EE] transition-colors">
                  确认创建
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Task Modal (Launch Test) */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">发起测试任务</h3>
                <button onClick={() => setShowTaskModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={createTestTask} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-2 block">选择测试用例</label>
                  <select 
                    required
                    value={selectedCaseId}
                    onChange={(e) => setSelectedCaseId(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">请选择一个用例...</option>
                    {testCases.map(tc => (
                      <option key={tc.id} value={tc.id}>[{tc.category}] {tc.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-2 block">选择执行资产</label>
                  <select 
                    required
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">请选择一个在线资产...</option>
                    {assets.filter(a => a.status === 'Online').map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                  <div className="flex items-center gap-3 text-accent mb-2">
                    <Zap size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">任务预检</span>
                  </div>
                  <p className="text-[10px] text-muted leading-relaxed">
                    发起任务后，系统会按用例匹配执行适配器并加载对应脚本/安全检查逻辑，再与目标资产建立执行链路。
                  </p>
                </div>

                <label className="flex items-center justify-between p-4 rounded-xl border border-border bg-white/2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">失败即停</div>
                    <div className="text-[10px] text-muted mt-1">任务内任一步失败后，立即停止后续执行。</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={stopOnFailure}
                    onChange={(e) => setStopOnFailure(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>

                <button 
                  type="submit" 
                  disabled={!selectedCaseId || !selectedAssetId}
                  className="w-full bg-accent py-4 rounded-xl text-xs font-bold uppercase hover:bg-[#4433EE] transition-all shadow-lg shadow-accent/20 disabled:opacity-50"
                >
                  立即开始执行
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Suite Modal */}
      <AnimatePresence>
        {showSuiteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-2xl p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">新建测试套件</h3>
                <button onClick={() => setShowSuiteModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={createSuite} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">套件名称</label>
                  <input name="name" required type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：核心 ECU 回归套件" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">套件说明</label>
                  <textarea name="description" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-20" placeholder="描述执行目标、适用场景和覆盖范围..." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] uppercase font-bold text-text-secondary block">包含用例</label>
                    <span className="text-[10px] text-muted font-bold uppercase">已选 {selectedSuiteCaseIds.length}</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                    {testCases.map((tc) => (
                      <label key={tc.id} className="flex items-start gap-3 p-4 hover:bg-white/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSuiteCaseIds.includes(tc.id)}
                          onChange={() => toggleSuiteCase(tc.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-sm">{tc.title}</div>
                          <div className="text-[10px] text-muted uppercase font-bold mt-1">
                            {tc.category} • {tc.protocol} • {tc.type}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase hover:bg-[#4433EE] transition-colors">
                  创建套件
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-2xl p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">批量导入测试用例</h3>
                <button onClick={() => setShowImportModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-muted">请粘贴 Markdown 表格内容。推荐列顺序与新建表单保持一致：</p>
                <textarea 
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none h-64 scrollbar-hide"
                  placeholder="| 目标模块/业务域 | 用例名称 | 测试协议 | 测试类型 | 测试输入 | 测试工具 | 测试步骤 | 预期结果 | 自动化等级 | 描述 |&#10;| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |&#10;| IVI | SSH访问控制验证 | Ethernet | Automated | 白名单IP/非法IP | SSH | 步骤1\\n步骤2 | 仅授权账号允许登录 | A | 验证IVI SSH访问控制 |"
                />
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowImportModal(false)}
                    className="flex-1 px-4 py-3 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleImport}
                    disabled={!importText.trim()}
                    className="flex-1 bg-accent text-white px-4 py-3 rounded-lg text-xs font-bold uppercase hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                  >
                    开始导入
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Test Case Modal */}
      <AnimatePresence>
        {showEditModal && selectedTestCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">编辑测试用例</h3>
                <button onClick={() => setShowEditModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={editTestCase} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 scrollbar-hide">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">用例名称</label>
                  <input name="title" required defaultValue={selectedTestCase.title} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">目标模块 / 业务域</label>
                    <select name="category" defaultValue={selectedTestCase.category} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      {CASE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-muted mt-1">只表示测试覆盖对象或业务域，不等于具体执行资产。</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试协议</label>
                    <select name="protocol" defaultValue={selectedTestCase.protocol} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="CAN">CAN</option>
                      <option value="DoIP">DoIP</option>
                      <option value="Ethernet">Ethernet</option>
                      <option value="OTA">OTA</option>
                      <option value="V2X">V2X</option>
                      <option value="BLE">BLE</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试类型</label>
                    <select name="type" defaultValue={selectedTestCase.type} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="Automated">自动化 (Automated)</option>
                      <option value="Manual">手动 (Manual)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">自动化等级</label>
                    <select name="automation_level" defaultValue={selectedTestCase.automation_level || 'B'} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="A">A (完全自动)</option>
                      <option value="B">B (半自动)</option>
                      <option value="C">C (人工交互)</option>
                      <option value="D">D (无法自动)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试工具</label>
                  <input name="test_tool" defaultValue={selectedTestCase.test_tool} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试输入</label>
                  <input name="test_input" defaultValue={selectedTestCase.test_input} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">预期结果</label>
                  <textarea name="expected_result" defaultValue={selectedTestCase.expected_result} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-16" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                  <textarea name="description" defaultValue={selectedTestCase.description} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-16" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试步骤 (每行一步)</label>
                  <textarea name="steps" defaultValue={JSON.parse(selectedTestCase.steps || '[]').join('\n')} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none h-32" />
                </div>
                <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase mt-4 hover:bg-[#4433EE] transition-colors">
                  保存修改
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Register Asset Modal */}
      <AnimatePresence>
        {showAssetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">注册新资产</h3>
                <button onClick={() => setShowAssetModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={registerAsset} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产名称</label>
                  <input name="name" required type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：GW-02 (Gateway)" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产类型</label>
                    <select name="type" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="Hardware">硬件 (Hardware)</option>
                      <option value="Simulation">仿真 (Simulation)</option>
                      <option value="Prototype">原型车 (Prototype)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">硬件版本</label>
                    <input name="hardware_version" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="HW-A1" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">软件版本</label>
                    <input name="software_version" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="v1.0.0" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">连接地址</label>
                  <input name="connection_address" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：192.168.1.10 或 ivi-demo.local" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                  <textarea name="description" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-20" placeholder="例如：IVI 主机样件，当前用于 SSH 访问控制与升级流程验证" />
                </div>
                <div className="text-[10px] text-muted">资产先记录基础识别信息和描述。功能点如果后面要参与调度或能力匹配，再单独建模会更合适。</div>
                <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase mt-4 hover:bg-[#4433EE] transition-colors">
                  确认注册
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Asset Detail Modal */}
      <AnimatePresence>
        {selectedAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <Cpu size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tighter uppercase">{selectedAsset.name}</h3>
                    <p className="text-[10px] text-muted uppercase font-bold tracking-widest">{selectedAsset.type} • {selectedAsset.status}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAsset(null)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

                <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">硬件版本</div>
                    <div className="font-mono text-sm">{selectedAsset.hardware_version || '-'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">软件版本</div>
                    <div className="font-mono text-sm">{selectedAsset.software_version || '-'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">最后同步</div>
                    <div className="text-sm">刚刚</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">连接地址</div>
                  <div className="font-mono text-sm">{selectedAsset.connection_address || '未配置'}</div>
                </div>

                {selectedAsset.description ? (
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-2">资产描述</div>
                    <div className="text-sm text-text-secondary leading-relaxed">{selectedAsset.description}</div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-bold text-muted tracking-widest">实时健康指标</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                        <span>CPU 负载</span>
                        <span className="text-accent">24%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: '24%' }} className="h-full bg-accent" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                        <span>内存占用</span>
                        <span className="text-success">12%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: '12%' }} className="h-full bg-success" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowEditAssetModal(true)}
                    className="flex-1 py-3 rounded-xl border border-accent/30 text-accent font-bold text-xs uppercase hover:bg-accent/5 transition-colors"
                  >
                    编辑资产
                  </button>
                  <button 
                    onClick={() => deleteAsset(selectedAsset.id)}
                    className="flex-1 py-3 rounded-xl border border-danger/30 text-danger font-bold text-xs uppercase hover:bg-danger/5 transition-colors"
                  >
                    删除资产
                  </button>
                  <button 
                    onClick={() => pingAsset(selectedAsset)}
                    className="flex-1 py-3 rounded-xl border border-border font-bold text-xs uppercase hover:bg-white/5 transition-colors"
                  >
                    {pingingAssetId === selectedAsset.id ? 'Ping 中...' : 'Ping 测试'}
                  </button>
                  <button 
                    onClick={() => updateFirmware(selectedAsset.name)}
                    disabled={isUpdatingAsset}
                    className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-xs uppercase hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                  >
                    {isUpdatingAsset ? '正在升级...' : '固件升级'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Asset Modal */}
      <AnimatePresence>
        {showEditAssetModal && selectedAsset && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md p-8 bg-card"
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold tracking-tighter uppercase">编辑资产</h3>
                <button onClick={() => setShowEditAssetModal(false)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={editAsset} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产名称</label>
                  <input name="name" required defaultValue={selectedAsset.name} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产类型</label>
                    <select name="type" defaultValue={selectedAsset.type} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="Hardware">硬件 (Hardware)</option>
                      <option value="Simulation">仿真 (Simulation)</option>
                      <option value="Prototype">原型车 (Prototype)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">状态</label>
                    <select name="status" defaultValue={selectedAsset.status} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Busy">Busy</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">硬件版本</label>
                    <input name="hardware_version" defaultValue={selectedAsset.hardware_version || ''} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">软件版本</label>
                    <input name="software_version" defaultValue={selectedAsset.software_version || ''} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">连接地址</label>
                  <input name="connection_address" defaultValue={selectedAsset.connection_address || ''} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                  <textarea name="description" defaultValue={selectedAsset.description || ''} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-20" />
                </div>
                <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase hover:bg-[#4433EE] transition-colors">
                  保存修改
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
      <AnimatePresence>
        {selectedTaskDetail && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-4xl max-h-[88vh] overflow-hidden bg-card"
            >
              <div className="flex items-start justify-between p-6 border-b border-border">
                <div>
                  <h3 className="text-xl font-bold tracking-tighter uppercase">
                    {selectedTaskDetail.task.type === 'suite' ? selectedTaskDetail.task.suite_name : selectedTaskDetail.task.test_case_title || `任务 #${selectedTaskDetail.task.id}`}
                  </h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest mt-2">
                    任务 #{selectedTaskDetail.task.id} • {selectedTaskDetail.task.type === 'suite' ? '套件任务' : '单用例任务'} • {selectedTaskDetail.task.executor || 'simulate'}
                  </p>
                </div>
                <button onClick={() => setSelectedTaskDetail(null)} className="text-muted hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(88vh-88px)]">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">任务状态</div>
                    <div className="font-bold text-sm">{selectedTaskDetail.task.status}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">执行资产</div>
                    <div className="font-bold text-sm">{selectedTaskDetail.task.asset_name || '未绑定资产'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">执行策略</div>
                    <div className="font-bold text-sm">{selectedTaskDetail.task.stop_on_failure ? '失败即停' : '全部执行'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">重试次数</div>
                    <div className="font-bold text-sm">{selectedTaskDetail.task.retry_count || 0}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">开始时间</div>
                    <div>{selectedTaskDetail.task.started_at ? new Date(selectedTaskDetail.task.started_at).toLocaleString() : '-'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">结束时间</div>
                    <div>{selectedTaskDetail.task.finished_at ? new Date(selectedTaskDetail.task.finished_at).toLocaleString() : '-'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">通过/失败</div>
                    <div>{selectedTaskDetail.task.passed_items}/{selectedTaskDetail.task.failed_items}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">当前项</div>
                    <div>{selectedTaskDetail.task.current_case_title || selectedTaskDetail.task.current_item_label || '已结束'}</div>
                  </div>
                </div>

                {selectedTaskDetail.task.error_message && (
                  <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
                    <div className="text-[10px] text-danger uppercase font-bold mb-1">失败原因</div>
                    <div className="text-sm text-danger">{selectedTaskDetail.task.error_message}</div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-bold text-muted tracking-widest">执行明细</h4>
                    {isTaskDetailLoading && <Activity size={14} className="animate-spin text-accent" />}
                  </div>

                  <div className="space-y-3">
                    {selectedTaskDetail.items.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-white/2 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-bold text-sm">{item.sort_order + 1}. {item.title}</div>
                            <div className="text-[10px] text-muted uppercase font-bold mt-1">
                              {item.category || '未分类'} • {item.protocol || '未标记协议'} • {item.test_tool || '未指定工具'}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            (item.result || item.run_result) === 'Passed' ? 'bg-success/20 text-success' :
                            (item.result || item.run_result) === 'Failed' ? 'bg-danger/20 text-danger' :
                            item.status === 'Running' ? 'bg-accent/20 text-accent' :
                            'bg-white/5 text-muted'
                          }`}>
                            {item.result || item.run_result || item.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl border border-border bg-white/2 p-3">
                            <div className="text-[10px] text-muted uppercase font-bold mb-1">预期结果</div>
                            <div className="text-text-secondary">{item.expected_result || '-'}</div>
                          </div>
                          <div className="rounded-xl border border-border bg-white/2 p-3">
                            <div className="text-[10px] text-muted uppercase font-bold mb-1">测试输入</div>
                            <div className="text-text-secondary font-mono break-all">{item.test_input || '-'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-[10px] text-muted font-mono">
                          <div>开始: {item.started_at ? new Date(item.started_at).toLocaleString() : '-'}</div>
                          <div>结束: {item.finished_at ? new Date(item.finished_at).toLocaleString() : '-'}</div>
                          <div>耗时: {item.duration ? formatDuration(item.duration) : '--'}</div>
                        </div>

                        <div className="rounded-xl border border-border bg-black/20 p-3">
                          <div className="text-[10px] text-muted uppercase font-bold mb-2">执行日志</div>
                          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
                            {item.logs || '当前任务没有返回日志。若是刚启动，请等待执行器回传结果。'}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedTestCase && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTestCase(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-bg border-l border-border z-[70] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    {selectedTestCase.category === 'T-Box' ? <Cpu size={20} className="text-accent" /> : <Car size={20} className="text-accent" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{selectedTestCase.title}</h3>
                    <p className="text-xs text-muted uppercase tracking-wider font-bold">{selectedTestCase.category} • {selectedTestCase.protocol}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedTestCase(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <XCircle size={24} className="text-muted" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Actions */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => runSimulation(selectedTestCase.id)}
                    disabled={isRunningSimulation || selectedTestCase.status === 'Running'}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all ${
                      isRunningSimulation || selectedTestCase.status === 'Running'
                        ? 'bg-white/5 text-muted cursor-not-allowed'
                        : 'bg-accent text-white hover:bg-[#4433EE] shadow-lg shadow-accent/20'
                    }`}
                  >
                    {isRunningSimulation ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                        <Activity size={16} />
                      </motion.div>
                    ) : <PlayCircle size={16} />}
                    {isRunningSimulation ? '正在执行模拟...' : '立即执行测试'}
                  </button>
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="px-4 py-3 rounded-xl border border-border font-bold text-xs uppercase hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <Edit3 size={16} />
                    编辑用例
                  </button>
                  <button 
                    onClick={() => deleteTestCase(selectedTestCase.id)}
                    className="px-4 py-3 rounded-xl border border-danger/20 text-danger font-bold text-xs uppercase hover:bg-danger/5 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Simulation Terminal */}
                {isRunningSimulation && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-muted uppercase tracking-widest">实时仿真终端</h4>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-[10px] text-accent font-bold">报文流同步中...</span>
                      </div>
                    </div>
                    <div className="bg-black/40 rounded-xl border border-white/5 p-4 font-mono text-[10px] space-y-1 h-48 overflow-y-auto scrollbar-hide">
                      {simulationLogs.length === 0 ? (
                        <div className="text-muted italic">等待报文流...</div>
                      ) : (
                        simulationLogs.map((log, i) => (
                          <div key={i} className="flex gap-3">
                            <span className="text-muted">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className="text-accent">{log.message}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">当前状态</div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedTestCase.status === 'Passed' ? 'bg-success' :
                        selectedTestCase.status === 'Failed' ? 'bg-danger' :
                        selectedTestCase.status === 'Running' ? 'bg-accent' : 'bg-warning'
                      }`} />
                      <span className="font-bold text-sm">{selectedTestCase.status}</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">自动化等级</div>
                    <div className="font-bold text-sm">{selectedTestCase.automation_level || 'B'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">测试工具</div>
                    <div className="font-bold text-sm font-mono text-accent">{selectedTestCase.test_tool || '-'}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/2 border border-border">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1">测试类型</div>
                    <div className="font-bold text-sm">{selectedTestCase.type}</div>
                  </div>
                </div>

                {/* Expected Result */}
                {selectedTestCase.expected_result && (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase font-bold text-muted tracking-widest">预期结果</h4>
                    <div className="text-sm text-emerald-400 leading-relaxed bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10">
                      {selectedTestCase.expected_result}
                    </div>
                  </div>
                )}

                {/* Test Input */}
                {selectedTestCase.test_input && (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase font-bold text-muted tracking-widest">测试输入</h4>
                    <div className="text-sm text-text-secondary leading-relaxed bg-white/2 p-4 rounded-xl border border-border font-mono">
                      {selectedTestCase.test_input}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-bold text-muted tracking-widest">用例描述</h4>
                  <p className="text-sm text-text-secondary leading-relaxed bg-white/2 p-4 rounded-xl border border-border">
                    {selectedTestCase.description}
                  </p>
                </div>

                {/* Steps */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-bold text-muted tracking-widest">测试步骤</h4>
                  <div className="space-y-2">
                    {(() => {
                      try {
                        const steps = JSON.parse(selectedTestCase.steps || '[]');
                        return steps.map((step: string, index: number) => (
                          <div key={index} className="flex gap-3 items-start p-3 rounded-xl bg-white/2 border border-border">
                            <div className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                              {index + 1}
                            </div>
                            <span className="text-sm text-text-secondary">{step}</span>
                          </div>
                        ));
                      } catch (e) {
                        return <div className="text-xs text-muted italic">无法解析测试步骤</div>;
                      }
                    })()}
                  </div>
                </div>

                {/* History */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs uppercase font-bold text-muted tracking-widest">执行历史</h4>
                    {isHistoryLoading && <Activity size={14} className="animate-spin text-accent" />}
                  </div>
                  
                  <div className="space-y-3">
                    {history.length === 0 ? (
                      <div className="text-center py-8 text-muted text-sm italic">暂无执行记录</div>
                    ) : (
                      history.map((run) => (
                        <div key={run.id} className="p-4 rounded-xl border border-border bg-white/2 hover:bg-white/5 transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              run.result === 'Passed' ? 'bg-success/20 text-success' :
                              run.result === 'Failed' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
                            }`}>
                              {run.result}
                            </div>
                            <span className="text-[10px] text-muted font-mono">{new Date(run.executed_at).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-text-secondary line-clamp-2 group-hover:line-clamp-none transition-all">
                            {run.logs || '无详细日志内容'}
                          </p>
                          <div className="mt-2 text-[10px] text-muted font-bold">执行人: {run.executed_by}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
