import { XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  CASE_CATEGORY_OPTIONS,
  DEFAULT_RUNTIME_INPUT_SUGGESTIONS,
  REQUIRED_INPUT_OPTIONS,
  SECURITY_DOMAIN_OPTIONS,
} from "../../app/app-config";
import { applyManualTemplateToForm, getFormControl } from "../../app/app-utils";

const TEST_PROTOCOL_OPTIONS = ["CAN", "DoIP", "Ethernet", "OTA", "V2X", "BLE"] as const;

type CreateTestCaseModalProps = {
  showCreateModal: boolean;
  setShowCreateModal: Dispatch<SetStateAction<boolean>>;
  createTestCase: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createScriptPath: string;
  setCreateScriptPath: Dispatch<SetStateAction<string>>;
  createTestTool: string;
  setCreateTestTool: Dispatch<SetStateAction<string>>;
  createRequiredInputs: string[];
};

export const CreateTestCaseModal = ({
  showCreateModal,
  setShowCreateModal,
  createTestCase,
  createScriptPath,
  setCreateScriptPath,
  createTestTool,
  setCreateTestTool,
  createRequiredInputs,
}: CreateTestCaseModalProps) => {
  return (
    <AnimatePresence>
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-md p-8 bg-card modal-surface"
            onClick={(event) => event.stopPropagation()}
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
                    {TEST_PROTOCOL_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">安全分类</label>
                <select name="security_domain" defaultValue="未分类" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {SECURITY_DOMAIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试类型</label>
                  <select
                    name="type"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    onChange={(event) => {
                      const form = event.currentTarget.form;
                      if (!form) return;
                      if (event.target.value === "Manual") {
                        applyManualTemplateToForm(form);
                        setCreateScriptPath("");
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
                <input
                  name="test_tool"
                  type="text"
                  value={createTestTool}
                  onChange={(event) => setCreateTestTool(event.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="例如：ADB, SSH, Scapy"
                />
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
              <div className="rounded-xl border border-border bg-white/2 p-4 space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">执行器类型</label>
                  <select name="executor_type" defaultValue="python" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="python">python</option>
                    <option value="shell">shell</option>
                    <option value="manual">manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">脚本路径</label>
                  <input
                    name="script_path"
                    type="text"
                    value={createScriptPath}
                    onChange={(event) => setCreateScriptPath(event.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
                    placeholder="例如：scripts/ssh_access_check.py"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">超时 (秒)</label>
                  <input name="timeout_sec" defaultValue="300" type="number" min="1" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-white/2 p-4 space-y-3">
                <div className="text-[10px] uppercase font-bold text-text-secondary">执行输入需求</div>
                {createRequiredInputs.length === 0 ? (
                  <div className="text-xs text-muted italic">请先填写脚本路径（或测试工具），系统会自动识别所需输入字段。</div>
                ) : (
                  createRequiredInputs.map((inputKey) => {
                    const option = REQUIRED_INPUT_OPTIONS.find((item) => item.value === inputKey);
                    return (
                      <div key={`create-runtime-${inputKey}`} className="rounded-xl border border-border px-3 py-3 space-y-2">
                        <div className="text-xs font-bold">{option?.label || inputKey}</div>
                        <div className="text-[10px] text-muted">{option?.description || "运行时由任务上下文提供。"}</div>
                        {inputKey !== "connection_address" && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase font-bold text-text-secondary">默认值</div>
                            <input
                              name={`default_input_${inputKey}`}
                              type={inputKey.toLowerCase().includes("password") ? "password" : inputKey.endsWith("_port") ? "number" : "text"}
                              min={inputKey.endsWith("_port") ? 1 : undefined}
                              defaultValue={DEFAULT_RUNTIME_INPUT_SUGGESTIONS[inputKey] || ""}
                              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                              placeholder={option?.description}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">测试步骤 (每行一步)</label>
                <textarea name="steps" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none h-32" placeholder={"步骤 1: ...\n步骤 2: ..."} />
              </div>
              <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase mt-4 hover:bg-[#4433EE] transition-colors">
                确认创建
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
