import { XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";

type RegisterAssetModalProps = {
  showAssetModal: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const RegisterAssetModal = ({
  showAssetModal,
  onClose,
  onSubmit,
}: RegisterAssetModalProps) => {
  return (
    <AnimatePresence>
      {showAssetModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-md p-8 bg-card modal-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold tracking-tighter uppercase">注册新资产</h3>
              <button onClick={onClose} className="text-muted hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产名称</label>
                <input name="name" required type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：GW-02 (Gateway)" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产类型</label>
                  <select name="type" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="Hardware">硬件 (Hardware)</option>
                    <option value="Simulation">仿真 (Simulation)</option>
                    <option value="Prototype">原型车 (Prototype)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">硬件版本</label>
                  <input name="hardware_version" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="HW-A1" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">软件版本</label>
                  <input name="software_version" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="v1.0.0" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">连接地址</label>
                <input name="connection_address" type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" placeholder="例如：192.168.1.10 或 ivi-demo.local" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                <textarea name="description" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-20" placeholder="例如：IVI 主机样件，当前用于 SSH 访问控制与升级流程验证" />
              </div>
              <div className="text-[10px] text-muted">资产先记录基础识别信息和描述。功能点如果后面要参与调度或能力匹配，再单独建模会更合适。</div>
              <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase mt-4 hover:bg-[#4433EE] transition-colors">
                确认注册
              </button>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
