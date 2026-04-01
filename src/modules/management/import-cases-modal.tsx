import { XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Dispatch, SetStateAction } from "react";

type ImportCasesModalProps = {
  showImportModal: boolean;
  setShowImportModal: Dispatch<SetStateAction<boolean>>;
  importText: string;
  setImportText: Dispatch<SetStateAction<string>>;
  onImport: () => Promise<void>;
};

export const ImportCasesModal = ({
  showImportModal,
  setShowImportModal,
  importText,
  setImportText,
  onImport,
}: ImportCasesModalProps) => {
  return (
    <AnimatePresence>
      {showImportModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowImportModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-2xl p-8 bg-card"
            onClick={(event) => event.stopPropagation()}
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
                onChange={(event) => setImportText(event.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none h-64 scrollbar-hide"
                placeholder={`| 目标模块/业务域 | 安全分类 | 用例名称 | 测试协议 | 测试类型 | 测试输入 | 测试工具 | 测试步骤 | 预期结果 | 自动化等级 | 描述 | 执行器类型 | 脚本路径 | 超时秒数 | 默认输入(JSON) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IVI | 访问控制 | SSH访问控制验证 | Ethernet | Automated | 系统登录IP地址 | SSH | 步骤1\\n步骤2 | 未授权账号应被拒绝 | A | 验证IVI SSH访问控制 | python | scripts/ssh_access_check.py | 300 | {"ssh_port":"22"} |`}
              />
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 px-4 py-3 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => void onImport()}
                  disabled={!importText.trim()}
                  className="flex-1 bg-accent text-white px-4 py-3 rounded-lg text-xs font-bold uppercase hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                >
                  开始导入
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
