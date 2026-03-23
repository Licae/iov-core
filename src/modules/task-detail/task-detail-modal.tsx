import { AnimatePresence, motion } from "motion/react";
import { Activity, XCircle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { CanonicalTestResult, ExecutionStatus, ExecutionTaskDetail, StepExecutionResult } from "../../api/types";

type TaskDetailModalProps = {
  selectedTaskDetail: ExecutionTaskDetail | null;
  setSelectedTaskDetail: Dispatch<SetStateAction<ExecutionTaskDetail | null>>;
  getExecutionStatusLabel: (status?: string | null) => string;
  getFailureCategoryMeta: (category?: string | null) => { label: string; className: string };
  formatServerDateTime: (value?: string | null) => string;
  isTaskDetailLoading: boolean;
  taskDetailView: { hasError: boolean; hasItems: boolean };
  normalizeTestResult: (value?: string | null) => CanonicalTestResult | null;
  normalizeExecutionStatus: (status?: string | null) => ExecutionStatus;
  formatDuration: (seconds: number) => string;
  parseStepResults: (value?: string | null) => StepExecutionResult[];
  getStepExecutionBadge: (step: StepExecutionResult) => { label: string; className: string };
};

export const TaskDetailModal = (props: TaskDetailModalProps) => {
  const {
    selectedTaskDetail,
    setSelectedTaskDetail,
    getExecutionStatusLabel,
    getFailureCategoryMeta,
    formatServerDateTime,
    isTaskDetailLoading,
    taskDetailView,
    normalizeTestResult,
    normalizeExecutionStatus,
    formatDuration,
    parseStepResults,
    getStepExecutionBadge,
  } = props;

  return (
    <AnimatePresence>
      {selectedTaskDetail && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedTaskDetail(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="glass-card w-full max-w-4xl max-h-[88vh] overflow-hidden bg-card modal-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-xl font-bold tracking-tighter uppercase">
                  {selectedTaskDetail.task.type === "suite" ? selectedTaskDetail.task.suite_name : selectedTaskDetail.task.test_case_title || `任务 #${selectedTaskDetail.task.id}`}
                </h3>
                <p className="text-[10px] text-muted uppercase font-bold tracking-widest mt-2">
                  任务 #{selectedTaskDetail.task.id} • {selectedTaskDetail.task.type === "suite" ? "套件任务" : "单用例任务"} • {selectedTaskDetail.task.executor || "python"}
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
                  <div className="font-bold text-sm">{getExecutionStatusLabel(selectedTaskDetail.task.status)}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">执行资产</div>
                  <div className="font-bold text-sm">{selectedTaskDetail.task.asset_name || "未绑定资产"}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">执行策略</div>
                  <div className="font-bold text-sm">{selectedTaskDetail.task.stop_on_failure ? "失败即停" : "全部执行"}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">重试次数</div>
                  <div className="font-bold text-sm">{selectedTaskDetail.task.retry_count || 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">失败分类</div>
                  <div className={`font-bold text-sm ${getFailureCategoryMeta(selectedTaskDetail.task.failure_category).className}`}>
                    {getFailureCategoryMeta(selectedTaskDetail.task.failure_category).label}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">重试策略</div>
                  <div className="font-bold text-sm">{selectedTaskDetail.task.can_retry ? "可重试" : "不可重试"}</div>
                  {!selectedTaskDetail.task.can_retry && selectedTaskDetail.task.retry_block_reason ? (
                    <div className="text-[10px] text-muted mt-1">{selectedTaskDetail.task.retry_block_reason}</div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">开始时间</div>
                  <div>{formatServerDateTime(selectedTaskDetail.task.started_at)}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">结束时间</div>
                  <div>{formatServerDateTime(selectedTaskDetail.task.finished_at)}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">通过/失败</div>
                  <div>{selectedTaskDetail.task.passed_items}/{selectedTaskDetail.task.failed_items}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">当前项</div>
                  <div>{selectedTaskDetail.task.current_case_title || selectedTaskDetail.task.current_item_label || "已结束"}</div>
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
                  {!taskDetailView.hasItems && (
                    <div className="rounded-2xl border border-border bg-white/2 p-6 text-sm text-muted">
                      当前任务暂无执行明细。
                    </div>
                  )}
                  {selectedTaskDetail.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-white/2 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-bold text-sm">{item.sort_order}. {item.title}</div>
                          <div className="text-[10px] text-muted uppercase font-bold mt-1">
                            {item.category || "未分类"} • {item.protocol || "未标记协议"} • {item.test_tool || "未指定工具"}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          normalizeTestResult(item.result || item.run_result) === "PASSED" ? "bg-success/20 text-success" :
                          normalizeTestResult(item.result || item.run_result) === "FAILED" ? "bg-danger/20 text-danger" :
                          normalizeTestResult(item.result || item.run_result) === "ERROR" ? "bg-danger/20 text-danger" :
                          normalizeTestResult(item.result || item.run_result) === "BLOCKED" ? "bg-warning/20 text-warning" :
                          normalizeExecutionStatus(item.status) === "RUNNING" ? "bg-accent/20 text-accent" :
                          "bg-white/5 text-muted"
                        }`}>
                          {normalizeTestResult(item.result || item.run_result) || getExecutionStatusLabel(item.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl border border-border bg-white/2 p-3">
                          <div className="text-[10px] text-muted uppercase font-bold mb-1">预期结果</div>
                          <div className="text-text-secondary">{item.expected_result || "-"}</div>
                        </div>
                        <div className="rounded-xl border border-border bg-white/2 p-3">
                          <div className="text-[10px] text-muted uppercase font-bold mb-1">测试输入</div>
                          <div className="text-text-secondary font-mono break-all">{item.test_input || "-"}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-[10px] text-muted font-mono">
                        <div>开始: {formatServerDateTime(item.started_at)}</div>
                        <div>结束: {formatServerDateTime(item.finished_at)}</div>
                        <div>耗时: {item.duration ? formatDuration(item.duration) : "--"}</div>
                      </div>

                      <div className="rounded-xl border border-border bg-black/20 p-3">
                        <div className="text-[10px] text-muted uppercase font-bold mb-2">执行日志</div>
                        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
                          {item.summary || item.logs || "当前任务没有返回日志。若是刚启动，请等待执行器回传结果。"}
                        </pre>
                      </div>

                      {parseStepResults(item.step_results).length > 0 && (
                        <div className="rounded-xl border border-border bg-white/2 p-3 space-y-2">
                          <div className="text-[10px] text-muted uppercase font-bold mb-1">脚本返回步骤结果</div>
                          {parseStepResults(item.step_results).map((step, index: number) => (
                            <div key={`${item.id}-${index}`} className="rounded-lg border border-border bg-white/2 px-3 py-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 text-sm text-text-primary font-semibold">
                                  {step.name}
                                </div>
                                <span className={`text-[10px] font-bold uppercase ${getStepExecutionBadge(step).className}`}>
                                  {getStepExecutionBadge(step).label}
                                </span>
                              </div>
                              <div className="text-[11px] text-text-secondary">
                                {step.conclusion || step.security_assessment || step.logs || "无额外结论。"}
                              </div>
                              {(step.command || step.stdout || step.stderr || step.output || typeof step.exit_code === "number" || step.timestamp) && (
                                <details className="rounded-md border border-border bg-black/10 px-2 py-1">
                                  <summary className="text-[10px] text-muted cursor-pointer select-none">展开明细</summary>
                                  <div className="mt-2 space-y-1.5 text-[11px] text-text-secondary">
                                    {step.command ? (
                                      <div>
                                        命令: <span className="font-mono break-all">{step.command}</span>
                                      </div>
                                    ) : null}
                                    {typeof step.exit_code === "number" ? (
                                      <div>
                                        退出码: <span className="font-mono">{step.exit_code}</span>
                                      </div>
                                    ) : null}
                                    {step.timestamp ? (
                                      <div>
                                        时间: <span className="font-mono">{formatServerDateTime(step.timestamp)}</span>
                                      </div>
                                    ) : null}
                                    {step.stdout || step.output ? (
                                      <div>
                                        stdout: <span className="font-mono break-all">{step.stdout || step.output}</span>
                                      </div>
                                    ) : null}
                                    {step.stderr ? (
                                      <div>
                                        stderr: <span className="font-mono break-all">{step.stderr}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
