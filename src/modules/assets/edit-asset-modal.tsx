import { XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import type { Asset } from "../../api/types";

type EditAssetModalProps = {
  showEditAssetModal: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const EditAssetModal = ({
  showEditAssetModal,
  asset,
  onClose,
  onSubmit,
}: EditAssetModalProps) => {
  return (
    <AnimatePresence>
      {showEditAssetModal && asset ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
              <h3 className="text-xl font-bold tracking-tighter uppercase">编辑资产</h3>
              <button onClick={onClose} className="text-muted hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产名称</label>
                <input name="name" required defaultValue={asset.name} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">资产类型</label>
                  <select name="type" defaultValue={asset.type} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="Hardware">硬件 (Hardware)</option>
                    <option value="Simulation">仿真 (Simulation)</option>
                    <option value="Prototype">原型车 (Prototype)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">状态</label>
                  <select name="status" defaultValue={asset.status} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                    <option value="Busy">Busy</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">硬件版本</label>
                  <input name="hardware_version" defaultValue={asset.hardware_version || ""} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">软件版本</label>
                  <input name="software_version" defaultValue={asset.software_version || ""} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">连接地址</label>
                <input name="connection_address" defaultValue={asset.connection_address || ""} type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary mb-1 block">描述</label>
                <textarea name="description" defaultValue={asset.description || ""} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none h-20" />
              </div>
              <button type="submit" className="w-full bg-accent py-3 rounded-lg text-xs font-bold uppercase hover:bg-[#4433EE] transition-colors">
                保存修改
              </button>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
