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

type TrendPoint = {
  date: string;
  passRate: number;
  runs: number;
};

type CoveragePoint = {
  name: string;
  coverage: number;
  status: string;
};

type ReportsPageProps = {
  trendData: TrendPoint[];
  coverageData: CoveragePoint[];
  defectDistribution: Array<{ label: string; count: number; color: string }>;
  chartAccent: string;
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
  onExportReport: () => void;
};

export const ReportsPage = ({
  trendData,
  coverageData,
  defectDistribution,
  chartAccent,
  chartAccentStrong,
  chartGrid,
  chartAxis,
  tooltipStyle,
  onExportReport,
}: ReportsPageProps) => {
  const totalDefects = defectDistribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">测试分析报告</h2>
          <p className="text-sm text-text-secondary">多维度的测试质量、效率与覆盖率分析。</p>
        </div>
        <button onClick={onExportReport} className="px-4 py-2 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors">
          导出 HTML 报告
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
                    <stop offset="5%" stopColor={chartAccent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartAccent} stopOpacity={0} />
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
              {defectDistribution.map((item) => (
                <div key={item.label} className="p-6 rounded-2xl bg-white/2 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-[10px] font-bold uppercase text-muted">{item.label}</span>
                  </div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-[10px] text-muted mt-1">
                    占总数 {totalDefects > 0 ? Math.round((item.count / totalDefects) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-8">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-8">ECU 模块测试覆盖率</h3>
        <div className="space-y-6">
          {coverageData.map((ecu) => (
            <div key={ecu.name} className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm">{ecu.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    ecu.status === "Passed" ? "bg-success/20 text-success" :
                    ecu.status === "Warning" ? "bg-warning/20 text-warning" : "bg-danger/20 text-danger"
                  }`}>{ecu.coverage}% 覆盖</span>
                </div>
                <span className="text-[10px] text-muted font-mono">目标: 95%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${ecu.coverage}%` }}
                  className={`h-full ${
                    ecu.status === "Passed" ? "bg-success" :
                    ecu.status === "Warning" ? "bg-warning" : "bg-danger"
                  }`}
                />
              </div>
            </div>
          ))}
          {coverageData.length === 0 ? (
            <div className="py-10 text-center text-muted italic">暂无覆盖率数据</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
