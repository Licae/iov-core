import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, XCircle, Zap } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { Asset, TestCase, TestSuite } from "../../api/types";

type RequiredInputOption = {
  value: string;
  label: string;
  description: string;
};

type TaskLaunchModalProps = {
  showTaskModal: boolean;
  setShowTaskModal: Dispatch<SetStateAction<boolean>>;
  createTestTask: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  launchMode: "suite" | "cases";
  setLaunchMode: Dispatch<SetStateAction<"suite" | "cases">>;
  setIsAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
  selectedLaunchAsset: Asset | undefined;
  selectedAssetSummary: string;
  isAssetPickerOpen: boolean;
  onlineAssets: Asset[];
  selectedAssetId: number | string;
  setSelectedAssetId: Dispatch<SetStateAction<number | string>>;
  selectedLaunchSuite: TestSuite | undefined;
  selectedSuiteSummary: string;
  isCasePickerOpen: boolean;
  setIsCasePickerOpen: Dispatch<SetStateAction<boolean>>;
  testSuites: TestSuite[];
  selectedSuiteId: number | string;
  setSelectedSuiteId: Dispatch<SetStateAction<number | string>>;
  securityBaselineSuiteName: string;
  selectedCaseIds: number[];
  selectedCaseSummary: string;
  testCases: TestCase[];
  setSelectedCaseIds: Dispatch<SetStateAction<number[]>>;
  selectedLaunchRequiredInputs: string[];
  requiredInputOptions: readonly RequiredInputOption[];
  selectedLaunchInputConflicts: string[];
  isRuntimeInputsOpen: boolean;
  setIsRuntimeInputsOpen: Dispatch<SetStateAction<boolean>>;
  selectedLaunchDefaultInputs: Record<string, string>;
  taskRuntimeInputs: Record<string, string>;
  setTaskRuntimeInputs: Dispatch<SetStateAction<Record<string, string>>>;
  stopOnFailure: boolean;
  setStopOnFailure: Dispatch<SetStateAction<boolean>>;
};

export const TaskLaunchModal = (props: TaskLaunchModalProps) => {
  const {
    showTaskModal,
    setShowTaskModal,
    createTestTask,
    launchMode,
    setLaunchMode,
    setIsAssetPickerOpen,
    selectedLaunchAsset,
    selectedAssetSummary,
    isAssetPickerOpen,
    onlineAssets,
    selectedAssetId,
    setSelectedAssetId,
    selectedLaunchSuite,
    selectedSuiteSummary,
    isCasePickerOpen,
    setIsCasePickerOpen,
    testSuites,
    selectedSuiteId,
    setSelectedSuiteId,
    securityBaselineSuiteName,
    selectedCaseIds,
    selectedCaseSummary,
    testCases,
    setSelectedCaseIds,
    selectedLaunchRequiredInputs,
    requiredInputOptions,
    selectedLaunchInputConflicts,
    isRuntimeInputsOpen,
    setIsRuntimeInputsOpen,
    selectedLaunchDefaultInputs,
    taskRuntimeInputs,
    setTaskRuntimeInputs,
    stopOnFailure,
    setStopOnFailure,
  } = props;

  return (
    <AnimatePresence>
      {showTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowTaskModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-md p-8 bg-card modal-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold tracking-tighter uppercase">发起测试任务</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-muted hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={createTestTask} className="space-y-6">
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-2 block">任务模式</label>
                <div className="rounded-xl border border-border bg-bg p-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setLaunchMode("suite")}
                    className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${launchMode === "suite" ? "bg-accent text-white" : "text-muted hover:text-text-primary"}`}
                  >
                    资产 + 套件
                  </button>
                  <button
                    type="button"
                    onClick={() => setLaunchMode("cases")}
                    className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${launchMode === "cases" ? "bg-accent text-white" : "text-muted hover:text-text-primary"}`}
                  >
                    资产 + 用例
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-2 block">1. 选择在线资产</label>
                <div className="rounded-xl border border-border bg-white/2 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsAssetPickerOpen((prev: boolean) => !prev)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className={`text-sm ${selectedLaunchAsset ? "text-text-primary font-semibold" : "text-muted"} truncate`}>
                        {selectedAssetSummary}
                      </div>
                      <div className="text-[10px] text-muted mt-1">点击展开后选择一个在线资产</div>
                    </div>
                    <div className={`text-muted transition-transform ${isAssetPickerOpen ? "rotate-90" : ""}`}>
                      <ChevronRight size={16} />
                    </div>
                  </button>

                  {isAssetPickerOpen && (
                    <div className="max-h-72 overflow-y-auto space-y-2 border-t border-border p-3">
                      {onlineAssets.map((asset) => {
                        const checked = String(selectedAssetId) === String(asset.id);
                        return (
                          <label key={asset.id} className={`flex items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${checked ? "border-accent bg-accent/5" : "border-border bg-transparent"}`}>
                            <input
                              type="radio"
                              name="selected-asset"
                              checked={checked}
                              onChange={() => setSelectedAssetId(String(asset.id))}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-bold">{asset.name}</div>
                                <div className="text-[11px] text-muted font-mono whitespace-nowrap">
                                  IP:{asset.connection_address || "未配置"}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      {onlineAssets.length === 0 && (
                        <div className="text-center py-6 text-sm text-muted italic">当前没有在线资产可选</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {launchMode === "suite" ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase font-bold text-text-secondary block">2. 选择要执行的测试套件</label>
                    {selectedLaunchSuite ? (
                      <span className="text-[10px] text-muted font-bold">{selectedLaunchSuite.case_count} 条用例</span>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-border bg-bg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsCasePickerOpen((prev: boolean) => !prev)}
                      className="w-full min-h-12 px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${selectedLaunchSuite ? "text-text-primary" : "text-muted"} truncate`}>
                          {selectedSuiteSummary}
                        </div>
                      </div>
                      <div className={`text-muted transition-transform ${isCasePickerOpen ? "rotate-180" : ""}`}>
                        <ChevronRight size={18} className="rotate-90" />
                      </div>
                    </button>
                    {isCasePickerOpen && (
                      <div className="max-h-64 overflow-y-auto space-y-2 border-t border-border p-2">
                        {testSuites.map((suite) => {
                          const checked = String(selectedSuiteId) === String(suite.id);
                          const isBaseline = Number(suite.is_baseline || 0) === 1 || suite.name === securityBaselineSuiteName;
                          return (
                            <label key={suite.id} className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${checked ? "bg-accent/8" : "hover:bg-white/5"}`}>
                              <input
                                type="radio"
                                name="selected-suite"
                                checked={checked}
                                onChange={() => setSelectedSuiteId(String(suite.id))}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <span>{suite.name}</span>
                                  {isBaseline ? (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-accent/20 text-accent">Baseline</span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-muted mt-1">{suite.case_count} 条用例</div>
                              </div>
                            </label>
                          );
                        })}
                        {testSuites.length === 0 && (
                          <div className="text-center py-4 text-[12px] text-muted">暂无可用套件</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase font-bold text-text-secondary block">2. 选择要执行的测试用例</label>
                    <span className="text-[10px] text-muted font-bold">{selectedCaseIds.length} 项已选</span>
                  </div>
                  <div className="rounded-xl border border-border bg-bg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsCasePickerOpen((prev: boolean) => !prev)}
                      className="w-full min-h-12 px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${selectedCaseIds.length === 0 ? "text-muted" : "text-text-primary"} truncate`}>
                          {selectedCaseSummary}
                        </div>
                      </div>
                      <div className={`text-muted transition-transform ${isCasePickerOpen ? "rotate-180" : ""}`}>
                        <ChevronRight size={18} className="rotate-90" />
                      </div>
                    </button>

                    {isCasePickerOpen && (
                      <div className="max-h-64 overflow-y-auto space-y-2 border-t border-border p-2">
                        {testCases.map((tc) => {
                          const checked = selectedCaseIds.includes(tc.id);
                          return (
                            <label key={tc.id} className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${checked ? "bg-accent/8" : "hover:bg-white/5"}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedCaseIds((prev: number[]) => e.target.checked ? [...prev, tc.id] : prev.filter((id) => id !== tc.id));
                                }}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{tc.title}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {launchMode === "cases" && selectedLaunchRequiredInputs.length > 0 && (
                <div className="space-y-3">
                  {(() => {
                    const editableRuntimeOptions = requiredInputOptions.filter(
                      (option) => option.value !== "connection_address" && selectedLaunchRequiredInputs.includes(option.value),
                    );
                    return (
                      <div className="rounded-xl border border-border bg-white/2 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setIsRuntimeInputsOpen((prev: boolean) => !prev)}
                          className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">运行时输入</div>
                            <div className="text-[11px] text-muted mt-1">
                              {editableRuntimeOptions.length === 0
                                ? "无手工输入字段，连接地址将自动注入。"
                                : `共 ${editableRuntimeOptions.length} 个可配置字段${selectedLaunchInputConflicts.length > 0 ? `，${selectedLaunchInputConflicts.length} 个默认值冲突` : ""}`}
                            </div>
                          </div>
                          <div className={`text-muted transition-transform ${isRuntimeInputsOpen ? "rotate-180" : ""}`}>
                            <ChevronRight size={16} className="rotate-90" />
                          </div>
                        </button>

                        {isRuntimeInputsOpen && (
                          <div className="border-t border-border p-4 space-y-3">
                            {selectedLaunchInputConflicts.length > 0 && (
                              <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-text-secondary">
                                已选择用例存在默认值冲突，请手工确认以下字段：{selectedLaunchInputConflicts.map((key: string) => requiredInputOptions.find((option) => option.value === key)?.label || key).join("、")}
                              </div>
                            )}
                            {selectedLaunchRequiredInputs.includes("connection_address") && (
                              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-text-secondary">
                                连接地址将从所选测试资产自动注入脚本，不需要手工填写。
                              </div>
                            )}
                            {editableRuntimeOptions.map((option) => (
                              <div key={option.value} className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-text-secondary block">{option.label}</label>
                                <input
                                  type={option.value.toLowerCase().includes("password") ? "password" : option.value.endsWith("_port") ? "number" : "text"}
                                  value={taskRuntimeInputs[option.value] || ""}
                                  required={!selectedLaunchDefaultInputs[option.value]}
                                  min={option.value.endsWith("_port") ? 1 : undefined}
                                  onChange={(e) => setTaskRuntimeInputs((prev) => ({ ...prev, [option.value]: e.target.value }))}
                                  className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-accent"
                                  placeholder={selectedLaunchDefaultInputs[option.value] ? `${option.description}（已预填）` : option.description}
                                />
                                {selectedLaunchDefaultInputs[option.value] && (
                                  <div className="text-[10px] text-muted">
                                    已从用例默认值预填：<span className="font-mono">{selectedLaunchDefaultInputs[option.value]}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                <div className="flex items-center gap-3 text-accent mb-2">
                  <Zap size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">任务预检</span>
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  发起任务后，系统会先做前置检查（连接地址、端口连通性、adb/ssh 工具可用性），通过后再执行。
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
                disabled={launchMode === "suite" ? (!selectedSuiteId || !selectedAssetId) : (selectedCaseIds.length === 0 || !selectedAssetId)}
                className="w-full bg-accent py-4 rounded-xl text-xs font-bold uppercase hover:bg-[#4433EE] transition-all shadow-lg shadow-accent/20 disabled:opacity-50"
              >
                {launchMode === "suite" ? "对当前资产执行套件" : "对当前资产开始执行"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
