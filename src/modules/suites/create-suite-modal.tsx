import { XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import type { TestCase } from "../../api/types";

type CreateSuiteModalProps = {
  showSuiteModal: boolean;
  selectedSuiteCaseIds: number[];
  testCases: TestCase[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggleSuiteCase: (testCaseId: number) => void;
};

export const CreateSuiteModal = ({
  showSuiteModal,
  selectedSuiteCaseIds,
  testCases,
  onClose,
  onSubmit,
  onToggleSuiteCase,
}: CreateSuiteModalProps) => {
  return (
    <AnimatePresence>
      {showSuiteModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-2xl p-8 bg-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold tracking-tighter uppercase">新建测试套件</h3>
              <button onClick={onClose} className="text-muted hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
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
                  {testCases.map((testCase) => (
                    <label key={testCase.id} className="flex items-start gap-3 p-4 hover:bg-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSuiteCaseIds.includes(testCase.id)}
                        onChange={() => onToggleSuiteCase(testCase.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-sm">{testCase.title}</div>
                        <div className="text-[10px] text-muted uppercase font-bold mt-1">
                          {testCase.category} • {testCase.protocol} • {testCase.type}
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
      ) : null}
    </AnimatePresence>
  );
};
