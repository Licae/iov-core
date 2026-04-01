import { Activity, Car, Cpu, Trash2, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  CASE_CATEGORY_OPTIONS,
  DEFAULT_RUNTIME_INPUT_SUGGESTIONS,
  REQUIRED_INPUT_OPTIONS,
  SECURITY_DOMAIN_OPTIONS,
} from "../../app/app-config";
import {
  applyManualTemplateToForm,
  formatServerDateTime,
  getFormControl,
  getStepExecutionBadge,
  getExecutionStatusLabel,
  normalizeExecutionStatus,
  normalizeTestResult,
  parseCaseSteps,
  parseDefaultRuntimeInputs,
  parseStepResults,
} from "../../app/app-utils";
import type { StepExecutionResult, TestCase, TestRun } from "../../api/types";

type TestCaseDrawerProps = {
  selectedTestCase: TestCase | null;
  closeDrawer: () => void;
  editTestCase: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  requestDeleteTestCase: (id: number, title?: string) => void;
  editTestTool: string;
  setEditTestTool: Dispatch<SetStateAction<string>>;
  editScriptPath: string;
  setEditScriptPath: Dispatch<SetStateAction<string>>;
  editRequiredInputs: string[];
  history: TestRun[];
  isHistoryLoading: boolean;
};

const TEST_PROTOCOL_OPTIONS = ["CAN", "DoIP", "Ethernet", "OTA", "V2X", "BLE"] as const;

const getStatusBadgeClass = (status?: string | null) => {
  const result = normalizeTestResult(status);
  if (result === "PASSED") return "bg-success/15 text-success";
  if (result === "FAILED" || result === "ERROR") return "bg-danger/15 text-danger";
  if (normalizeExecutionStatus(status) === "RUNNING") return "bg-accent/15 text-accent";
  return "bg-warning/15 text-warning";
};

export const TestCaseDrawer = ({
  selectedTestCase,
  closeDrawer,
  editTestCase,
  requestDeleteTestCase,
  editTestTool,
  setEditTestTool,
  editScriptPath,
  setEditScriptPath,
  editRequiredInputs,
  history,
  isHistoryLoading,
}: TestCaseDrawerProps) => {
  return (
    <AnimatePresence>
      {selectedTestCase ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-[70] flex w-full max-w-xl flex-col border-l border-border bg-bg shadow-2xl drawer-surface"
          >
            <div className="flex items-center justify-between border-b border-border p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                  {selectedTestCase.category === "T-Box" ? (
                    <Cpu size={20} className="text-accent" />
                  ) : (
                    <Car size={20} className="text-accent" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold leading-tight">编辑用例</h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">
                    {selectedTestCase.category} · {selectedTestCase.protocol}
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-full p-2 transition-colors hover:bg-white/5">
                <XCircle size={24} className="text-muted" />
              </button>
            </div>

            <form
              key={selectedTestCase.id}
              id="test-case-drawer-form"
              onSubmit={editTestCase}
              className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide"
            >
              <section className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-2 block text-xs font-bold text-text-secondary">用例名称 *</label>
                  <input
                    name="title"
                    required
                    defaultValue={selectedTestCase.title}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">测试类型 *</label>
                  <select
                    name="type"
                    defaultValue={selectedTestCase.type}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                    onChange={(event) => {
                      const form = event.currentTarget.form;
                      if (!form) return;
                      if (event.target.value === "Manual") {
                        applyManualTemplateToForm(form);
                        setEditScriptPath("");
                      } else {
                        const executorField = getFormControl<HTMLSelectElement>(form, "executor_type");
                        if (executorField?.value === "manual") executorField.value = "python";
                      }
                    }}
                  >
                    <option value="Automated">自动化 (Automated)</option>
                    <option value="Manual">手动 (Manual)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">安全分类 *</label>
                  <select
                    name="security_domain"
                    defaultValue={selectedTestCase.security_domain || "未分类"}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                  >
                    {SECURITY_DOMAIN_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border px-3 py-2">
                  <div className="text-[11px] font-bold text-text-secondary">当前状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${getStatusBadgeClass(selectedTestCase.status)}`}>
                      {normalizeTestResult(selectedTestCase.status) || getExecutionStatusLabel(selectedTestCase.status)}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-border px-3 py-2">
                  <label className="block text-[11px] font-bold text-text-secondary">自动化等级</label>
                  <select
                    name="automation_level"
                    defaultValue={selectedTestCase.automation_level || "B"}
                    className="field-surface mt-1 w-full rounded-md px-2 py-1 text-sm font-bold"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div className="rounded-xl border border-border px-3 py-2">
                  <label className="block text-[11px] font-bold text-text-secondary">测试协议</label>
                  <select
                    name="protocol"
                    defaultValue={selectedTestCase.protocol}
                    className="field-surface mt-1 w-full rounded-md px-2 py-1 text-sm font-bold"
                  >
                    {TEST_PROTOCOL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">业务域 / 模块 *</label>
                  <select name="category" defaultValue={selectedTestCase.category} className="field-surface w-full rounded-lg px-3 py-2 text-sm">
                    {CASE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">测试工具</label>
                  <input
                    name="test_tool"
                    value={editTestTool}
                    onChange={(event) => setEditTestTool(event.target.value)}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="例如 ADB / Nmap / ssh_access_check"
                  />
                </div>
              </section>

              <section>
                <label className="mb-2 block text-xs font-bold text-text-secondary">用例描述 *</label>
                <textarea
                  name="description"
                  defaultValue={selectedTestCase.description}
                  className="field-surface min-h-24 w-full rounded-xl px-4 py-3 text-sm leading-relaxed"
                />
              </section>

              <section>
                <label className="mb-2 block text-xs font-bold text-text-secondary">预期结果 *</label>
                <textarea
                  name="expected_result"
                  defaultValue={selectedTestCase.expected_result}
                  className="field-surface min-h-28 w-full rounded-xl px-4 py-3 text-sm leading-relaxed"
                />
              </section>

              <section>
                <label className="mb-2 block text-xs font-bold text-text-secondary">测试输入</label>
                <textarea
                  name="test_input"
                  defaultValue={selectedTestCase.test_input}
                  className="field-surface min-h-24 w-full rounded-xl px-4 py-3 text-sm leading-relaxed font-mono"
                />
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">执行器 *</label>
                  <select
                    name="executor_type"
                    defaultValue={selectedTestCase.executor_type || "python"}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="python">python</option>
                    <option value="shell">shell</option>
                    <option value="manual">manual</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold text-text-secondary">超时（秒）</label>
                  <input
                    name="timeout_sec"
                    type="number"
                    min="1"
                    defaultValue={selectedTestCase.timeout_sec || 300}
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-2 block text-xs font-bold text-text-secondary">脚本路径</label>
                  <input
                    name="script_path"
                    value={editScriptPath}
                    onChange={(event) => setEditScriptPath(event.target.value)}
                    placeholder="例如 scripts/ssh_access_check.py"
                    className="field-surface w-full rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted">执行输入需求</h4>
                  <p className="mt-1 text-[11px] text-text-secondary">根据脚本路径或测试工具自动识别。除连接地址外，其余字段可配置默认值。</p>
                </div>
                {editRequiredInputs.length === 0 ? (
                  <div className="rounded-xl border border-border px-4 py-3 text-xs italic text-muted">
                    脚本尚未识别出输入字段，请检查脚本路径或测试工具命名。
                  </div>
                ) : (
                  (() => {
                    const defaults = parseDefaultRuntimeInputs(selectedTestCase.default_runtime_inputs);
                    return editRequiredInputs.map((inputKey) => {
                      const option = REQUIRED_INPUT_OPTIONS.find((item) => item.value === inputKey);
                      return (
                        <div key={inputKey} className="rounded-xl border border-border px-4 py-3 space-y-3">
                          <div>
                            <div className="text-xs font-bold text-text-primary">{option?.label || inputKey}</div>
                            <div className="mt-1 text-[11px] text-text-secondary">{option?.description || "运行时由任务上下文提供。"}</div>
                          </div>
                          {inputKey !== "connection_address" ? (
                            <div>
                              <div className="mb-2 text-[11px] font-bold uppercase text-text-secondary">默认值</div>
                              <input
                                name={`default_input_${inputKey}`}
                                type={inputKey.toLowerCase().includes("password") ? "password" : inputKey.endsWith("_port") ? "number" : "text"}
                                min={inputKey.endsWith("_port") ? 1 : undefined}
                                defaultValue={defaults[inputKey] || DEFAULT_RUNTIME_INPUT_SUGGESTIONS[inputKey] || ""}
                                className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                                placeholder={option?.description || "任务发起时作为默认值自动带出"}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    });
                  })()
                )}
              </section>

              <section>
                <label className="mb-2 block text-xs font-bold text-text-secondary">测试步骤 *</label>
                <textarea
                  name="steps"
                  defaultValue={parseCaseSteps(selectedTestCase.steps).join("\n")}
                  className="field-surface min-h-40 w-full rounded-xl px-4 py-3 text-sm font-mono"
                />
              </section>

              <section className="space-y-4 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted">执行历史</h4>
                  {isHistoryLoading ? <Activity size={14} className="animate-spin text-accent" /> : null}
                </div>
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <div className="rounded-xl border border-border px-4 py-6 text-center text-sm italic text-muted">
                      暂无执行记录
                    </div>
                  ) : (
                    history.map((run) => (
                      <div key={run.id} className="rounded-xl border border-border px-4 py-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase ${getStatusBadgeClass(run.result)}`}>
                              {normalizeTestResult(run.result) || run.result}
                            </span>
                            <div className="mt-2 text-[11px] text-text-secondary">
                              {formatServerDateTime(run.executed_at)} · 执行人 {run.executed_by}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-text-secondary">
                            <div>耗时 {run.duration || 0}s</div>
                          </div>
                        </div>

                        <p className="text-sm leading-relaxed text-text-secondary">
                          {run.summary || run.logs || "无详细日志内容"}
                        </p>

                        {parseStepResults(run.step_results).length > 0 ? (
                          <div className="space-y-2">
                            {parseStepResults(run.step_results).map((step: StepExecutionResult, index: number) => {
                              const badge = getStepExecutionBadge(step);
                              return (
                                <div key={`${run.id}-${index}`} className="rounded-lg border border-border bg-white/2 px-3 py-3 space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 text-sm text-text-primary">
                                      <span className="font-semibold">{step.name}</span>
                                      {step.command ? (
                                        <span className="text-text-secondary">：<span className="break-all font-mono">{step.command}</span></span>
                                      ) : null}
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase ${badge.className}`}>{badge.label}</span>
                                  </div>
                                  {step.output ? (
                                    <div className="text-[11px] text-text-secondary">
                                      输出: <span className="break-all font-mono">{step.output}</span>
                                    </div>
                                  ) : null}
                                  {step.security_assessment ? (
                                    <div className="text-[11px] text-text-secondary">结论: {step.security_assessment}</div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </form>

            <div className="flex items-center justify-between border-t border-border bg-bg p-4">
              <button
                type="button"
                onClick={() => requestDeleteTestCase(selectedTestCase.id, selectedTestCase.title)}
                className="flex items-center gap-2 rounded-lg border border-danger/20 px-4 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/5"
              >
                <Trash2 size={14} />
                删除
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-white/5"
                >
                  关闭
                </button>
                <button
                  type="submit"
                  form="test-case-drawer-form"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#4433EE]"
                >
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
};
