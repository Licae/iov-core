import { motion } from "motion/react";
import { Plus } from "lucide-react";
import type { SuiteRun, TestSuite } from "../../api/types";

type SuitesPageProps = {
  testSuites: TestSuite[];
  suiteRuns: SuiteRun[];
  runningSuiteIds: number[];
  onlineAssetsCount: number;
  securityBaselineSuiteName: string;
  normalizeExecutionStatus: (status?: string | null) => "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";
  getExecutionStatusLabel: (status?: string | null) => string;
  onOpenCreateSuite: () => void;
  onRunSuite: (suiteId: number) => void;
  onDeleteSuite: (suiteId: number) => void;
};

export const SuitesPage = ({
  testSuites,
  suiteRuns,
  runningSuiteIds,
  onlineAssetsCount,
  securityBaselineSuiteName,
  normalizeExecutionStatus,
  getExecutionStatusLabel,
  onOpenCreateSuite,
  onRunSuite,
  onDeleteSuite,
}: SuitesPageProps) => {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">测试套件编排</h2>
          <p className="text-sm text-text-secondary">将多个测试用例组合为顺序执行任务，适合核心回归与冒烟验证。</p>
        </div>
        <button
          onClick={onOpenCreateSuite}
          className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
        >
          <Plus size={14} /> 新建套件
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card overflow-hidden table-shell">
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
                        {Number(suite.is_baseline || 0) === 1 || suite.name === securityBaselineSuiteName ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-accent/20 text-accent">
                            Baseline
                          </span>
                        ) : null}
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-muted">
                          {suite.case_count} 条用例
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">{suite.description || "未填写套件说明"}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => onRunSuite(suite.id)}
                        disabled={runningSuiteIds.includes(suite.id) || onlineAssetsCount === 0}
                        className="px-3 py-2 rounded-lg bg-accent text-white text-[10px] font-bold uppercase disabled:opacity-50"
                      >
                        {runningSuiteIds.includes(suite.id) ? "执行中" : "选择资产执行"}
                      </button>
                      <button
                        onClick={() => onDeleteSuite(suite.id)}
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

        <div className="glass-card overflow-hidden table-shell">
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
                        normalizeExecutionStatus(run.status) === "COMPLETED" ? "bg-success/20 text-success" :
                        normalizeExecutionStatus(run.status) === "RUNNING" ? "bg-accent/20 text-accent" :
                        "bg-warning/20 text-warning"
                      }`}>
                        {getExecutionStatusLabel(run.status)}
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
                      <div>{run.current_case_title ? `当前 ${run.current_case_title}` : "已结束"}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
