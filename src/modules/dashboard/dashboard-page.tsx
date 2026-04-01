import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Car,
  ChevronRight,
  Cpu,
  Database,
  MoreHorizontal,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { StatCard } from "../../app/app-shell-components";
import type { RecentRun, SettingsMap, TestCase, TrendPoint } from "../../api/types";

type DashboardBadge = {
  className: string;
  icon: ReactNode;
  label: string;
};

type DashboardDefectDistributionItem = {
  label: string;
  count: number;
  color: string;
};

type DashboardPageProps = {
  filterProtocol: string;
  onChangeProtocol: (protocol: string) => void;
  onOpenLaunchTask: () => void;
  reliability: number;
  reliabilityTrendText?: string;
  totalRuns: number;
  severeDefectCount: number;
  runningTaskCount: number;
  assetCount: number;
  recentRuns: RecentRun[];
  testCases: TestCase[];
  onSelectRecentRun: (run: RecentRun) => void;
  getExecutionStatusBadgeClass: (status?: string | null) => string;
  getExecutionStatusLabel: (status?: string | null) => string;
  getTestResultBadge: (result?: string | null) => DashboardBadge;
  formatDuration: (seconds: number) => string;
  trendData: TrendPoint[];
  chartAccentStrong: string;
  chartGrid: string;
  chartAxis: string;
  tooltipStyle: {
    backgroundColor: string;
    border: string;
    borderRadius: string;
    fontSize: string;
    color: string;
    boxShadow: string;
  };
  tooltipItemStyle: { color: string };
  dashboardDefectDistribution: DashboardDefectDistributionItem[];
  totalDashboardDefects: number;
  onViewDefects: () => void;
  settings: SettingsMap;
  onToggleSetting: (key: string) => void;
};

export const DashboardPage = ({
  filterProtocol,
  onChangeProtocol,
  onOpenLaunchTask,
  reliability,
  reliabilityTrendText,
  totalRuns,
  severeDefectCount,
  runningTaskCount,
  assetCount,
  recentRuns,
  testCases,
  onSelectRecentRun,
  getExecutionStatusBadgeClass,
  getExecutionStatusLabel,
  getTestResultBadge,
  formatDuration,
  trendData,
  chartAccentStrong,
  chartGrid,
  chartAxis,
  tooltipStyle,
  tooltipItemStyle,
  dashboardDefectDistribution,
  totalDashboardDefects,
  onViewDefects,
  settings,
  onToggleSetting,
}: DashboardPageProps) => {
  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">车辆与组件测试概览</h2>
          <p className="text-sm text-text-secondary">监控自动化测试运行、ECU 仿真及整车诊断。</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-card border border-border rounded-lg p-1">
            {["All", "CAN", "Ethernet", "V2X"].map((protocol) => (
              <button
                key={protocol}
                onClick={() => onChangeProtocol(protocol)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                  filterProtocol === protocol ? "bg-accent text-white" : "text-muted hover:text-white"
                }`}
              >
                {protocol}
              </button>
            ))}
          </div>
          <button
            onClick={onOpenLaunchTask}
            className="bg-accent px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-[#4433EE] transition-colors shadow-lg shadow-accent/20"
          >
            <Plus size={16} />
            发起测试任务
          </button>
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-2">
        <StatCard
          label="系统可靠性"
          value={`${reliability}%`}
          trend={reliabilityTrendText}
          footnote={totalRuns > 0 ? `基于 ${totalRuns} 次真实执行结果` : "暂无真实执行数据"}
          icon={ShieldCheck}
          color="bg-success"
        />
        <StatCard
          label="严重缺陷"
          value={severeDefectCount}
          footnote={severeDefectCount > 0 ? `Critical + Major 共 ${severeDefectCount} 条` : "当前无高优先级缺陷"}
          icon={AlertTriangle}
          color="bg-danger"
        />
        <StatCard
          label="运行中仿真"
          value={runningTaskCount}
          footnote={runningTaskCount > 0 ? "当前队列存在运行中或排队任务" : "当前没有活动中的测试任务"}
          icon={Activity}
          color="bg-accent"
        />
        <StatCard
          label="测试资产总数"
          value={assetCount}
          footnote={assetCount > 0 ? `已登记 ${assetCount} 个真实测试资产` : "当前尚未登记测试资产"}
          icon={Database}
          color="bg-text-secondary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card overflow-hidden dashboard-panel">
          <div className="p-6 border-b border-border flex justify-between items-center">
            <h3 className="font-bold">最近测试执行</h3>
            <button className="text-xs text-accent font-bold flex items-center gap-1 hover:underline">
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left data-table">
              <thead>
                <tr>
                  <th className="table-header">目标资产</th>
                  <th className="table-header">测试类型</th>
                  <th className="table-header">执行状态</th>
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
                        const matchedCase = testCases.find((testCase) => testCase.id === run.test_case_id);
                        if (matchedCase) {
                          onSelectRecentRun(run);
                        }
                      }}
                      className="table-row cursor-pointer transition-opacity"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center">
                            {run.category === "T-Box" || run.category === "IVI" || run.category === "Gateway" ? (
                              <Cpu size={16} className="text-text-secondary" />
                            ) : (
                              <Car size={16} className="text-text-secondary" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold">{run.asset_name || run.test_case_title}</div>
                            <div className="text-[10px] text-muted uppercase">
                              {run.category} ({run.protocol})
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-xs">{run.test_case_title}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`badge ${getExecutionStatusBadgeClass(run.task_status || "COMPLETED")}`}>
                          {getExecutionStatusLabel(run.task_status || "COMPLETED")}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const badge = getTestResultBadge(run.result);
                          return (
                            <div className={`flex items-center gap-2 ${badge.className}`}>
                              {badge.icon}
                              <span className="font-bold text-[10px]">{badge.label}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 text-text-secondary font-mono text-xs">
                        {formatDuration(run.duration)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

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
                    <linearGradient id="dashboardColorRuns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartAccentStrong} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartAccentStrong} stopOpacity={0} />
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
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} />
                  <Area
                    type="monotone"
                    dataKey="runs"
                    stroke={chartAccentStrong}
                    fillOpacity={1}
                    fill="url(#dashboardColorRuns)"
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
              {dashboardDefectDistribution.map((item, index) => (
                <div key={item.label} className="space-y-2">
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
                      transition={{ duration: 1, delay: index * 0.1 }}
                      className={`h-full ${item.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onViewDefects}
              className="w-full mt-8 bg-card border border-border py-2 rounded-lg text-xs font-bold hover:bg-border transition-colors"
            >
              查看诊断报告
            </button>
          </div>
        </div>
      </div>

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
              onClick={() => onToggleSetting("abort_on_critical_dtc")}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                settings.abort_on_critical_dtc ? "bg-accent" : "bg-white/10"
              }`}
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
              onClick={() => onToggleSetting("pr_requires_sil")}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                settings.pr_requires_sil ? "bg-accent" : "bg-white/10"
              }`}
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
  );
};
