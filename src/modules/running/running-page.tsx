import { Activity, Layers3 } from "lucide-react";
import type { ExecutionTask } from "../../api/types";

type FailureCategoryMeta = {
  label: string;
  className: string;
};

type RunningPageProps = {
  activeExecutionTasks: ExecutionTask[];
  executionTasks: ExecutionTask[];
  getExecutionStatusLabel: (status?: string | null) => string;
  getFailureCategoryMeta: (category?: string | null) => FailureCategoryMeta;
  normalizeExecutionStatus: (status?: string | null) => string;
  onOpenTaskDetail: (taskId: number) => void;
  onCancelTask: (taskId: number) => void;
  onRetryTask: (taskId: number) => void;
  onReturnDashboard: () => void;
};

export const RunningPage = ({
  activeExecutionTasks,
  executionTasks,
  getExecutionStatusLabel,
  getFailureCategoryMeta,
  normalizeExecutionStatus,
  onOpenTaskDetail,
  onCancelTask,
  onRetryTask,
  onReturnDashboard,
}: RunningPageProps) => {
  return (
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
          const title = task.type === "suite" ? task.suite_name : task.test_case_title;
          const subtitle = task.type === "suite"
            ? `测试套件 • ${task.total_items} 条用例`
            : `${task.asset_name || "未绑定资产"} • ${task.current_case_title || task.test_case_title || "单用例任务"}`;
          const failureCategoryMeta = getFailureCategoryMeta(task.failure_category);

          return (
            <div key={`task-${task.id}`} className="glass-card p-6 flex items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                {task.type === "suite" ? <Layers3 size={24} /> : <Activity size={24} />}
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
                      <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted font-mono">
                  <span>状态: {getExecutionStatusLabel(task.status)}</span>
                  <span>完成: {task.completed_items}/{task.total_items}</span>
                  <span>通过: {task.passed_items}</span>
                  <span>失败: {task.failed_items}</span>
                  <span>{task.stop_on_failure ? "策略: 失败即停" : "策略: 全部执行"}</span>
                  <span>执行器: {task.executor || "python"}</span>
                  <span className={failureCategoryMeta.className}>分类: {failureCategoryMeta.label}</span>
                  <span className="text-accent">
                    {task.current_case_title ? `当前: ${task.current_case_title}` : (
                      normalizeExecutionStatus(task.status) === "PENDING" ? "等待调度" : "执行中"
                    )}
                  </span>
                </div>
                {task.error_message ? (
                  <div className="mt-2 text-[10px] text-danger font-medium">{task.error_message}</div>
                ) : null}
                {task.retry_count ? (
                  <div className="mt-2 text-[10px] text-muted font-medium">重试次数: {task.retry_count}</div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onOpenTaskDetail(task.id)}
                  className="px-3 py-2 rounded-lg border border-border text-text-secondary text-[10px] font-bold uppercase"
                >
                  详情
                </button>
                {normalizeExecutionStatus(task.status) === "PENDING" || normalizeExecutionStatus(task.status) === "RUNNING" ? (
                  <button
                    onClick={() => onCancelTask(task.id)}
                    className="px-3 py-2 rounded-lg border border-danger/30 text-danger text-[10px] font-bold uppercase"
                  >
                    取消
                  </button>
                ) : (
                  <button
                    onClick={() => onRetryTask(task.id)}
                    disabled={!task.can_retry}
                    title={task.can_retry ? "按原配置重新执行任务" : (task.retry_block_reason || "当前任务不可重试")}
                    className="px-3 py-2 rounded-lg border border-accent/30 text-accent text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    重试
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {executionTasks.length === 0 ? (
          <div className="glass-card p-20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-muted">
              <Activity size={32} />
            </div>
            <div>
              <h4 className="font-bold text-xl">暂无运行中的仿真</h4>
              <p className="text-muted text-sm">前往仪表盘启动新的测试任务</p>
            </div>
            <button
              onClick={onReturnDashboard}
              className="px-6 py-2 bg-accent rounded-lg text-xs font-bold uppercase"
            >
              返回仪表盘
            </button>
          </div>
        ) : null}

        {activeExecutionTasks.length === 0 && executionTasks.length > 0 ? (
          executionTasks.slice(0, 6).map((task) => {
            const progress = task.total_items > 0 ? Math.round((task.completed_items / task.total_items) * 100) : 0;
            const title = task.type === "suite" ? task.suite_name : task.test_case_title;
            const failureCategoryMeta = getFailureCategoryMeta(task.failure_category);

            return (
              <div key={`history-task-${task.id}`} className="glass-card p-6 flex items-center gap-6 opacity-80">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-muted">
                  {task.type === "suite" ? <Layers3 size={24} /> : <Activity size={24} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-lg">{title || `任务 #${task.id}`}</h4>
                      <p className="text-xs text-muted uppercase font-bold tracking-wider">
                        {task.status} • 进度 {progress}%
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onOpenTaskDetail(task.id)}
                        className="px-3 py-2 rounded-lg border border-border text-text-secondary text-[10px] font-bold uppercase"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => onRetryTask(task.id)}
                        disabled={!task.can_retry}
                        title={task.can_retry ? "按原配置重新执行任务" : (task.retry_block_reason || "当前任务不可重试")}
                        className="px-3 py-2 rounded-lg border border-accent/30 text-accent text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        重新执行
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted font-mono">
                    <span>执行器: {task.executor || "python"}</span>
                    <span>{task.stop_on_failure ? "策略: 失败即停" : "策略: 全部执行"}</span>
                    <span>通过: {task.passed_items}</span>
                    <span>失败: {task.failed_items}</span>
                    <span className={failureCategoryMeta.className}>分类: {failureCategoryMeta.label}</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : null}
      </div>
    </div>
  );
};
