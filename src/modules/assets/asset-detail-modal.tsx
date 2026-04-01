import { Cpu, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Asset } from "../../api/types";

type AssetDetailModalProps = {
  asset: Asset | null;
  pingingAssetId: number | null;
  isUpdatingAsset: boolean;
  onClose: () => void;
  onOpenEdit: () => void;
  onDeleteAsset: (id: number) => void;
  onPingAsset: (asset: Asset) => void;
  onUpdateFirmware: (name: string) => void;
};

export const AssetDetailModal = ({
  asset,
  pingingAssetId,
  isUpdatingAsset,
  onClose,
  onOpenEdit,
  onDeleteAsset,
  onPingAsset,
  onUpdateFirmware,
}: AssetDetailModalProps) => {
  return (
    <AnimatePresence>
      {asset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-lg p-8 bg-card modal-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <Cpu size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tighter uppercase">{asset.name}</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">
                    {asset.type} • {asset.status}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">硬件版本</div>
                  <div className="font-mono text-sm">{asset.hardware_version || "-"}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">软件版本</div>
                  <div className="font-mono text-sm">{asset.software_version || "-"}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">最后同步</div>
                  <div className="text-sm">刚刚</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/2 border border-border">
                <div className="text-[10px] text-muted uppercase font-bold mb-1">连接地址</div>
                <div className="font-mono text-sm">{asset.connection_address || "未配置"}</div>
              </div>

              {asset.description ? (
                <div className="p-4 rounded-xl bg-white/2 border border-border">
                  <div className="text-[10px] text-muted uppercase font-bold mb-2">资产描述</div>
                  <div className="text-sm text-text-secondary leading-relaxed">{asset.description}</div>
                </div>
              ) : null}

              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold text-muted tracking-widest">实时健康指标</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                      <span>CPU 负载</span>
                      <span className="text-accent">24%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: "24%" }} className="h-full bg-accent" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                      <span>内存占用</span>
                      <span className="text-success">12%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: "12%" }} className="h-full bg-success" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onOpenEdit}
                  className="flex-1 py-3 rounded-xl border border-accent/30 text-accent font-bold text-xs uppercase hover:bg-accent/5 transition-colors"
                >
                  编辑资产
                </button>
                <button
                  onClick={() => onDeleteAsset(asset.id)}
                  className="flex-1 py-3 rounded-xl border border-danger/30 text-danger font-bold text-xs uppercase hover:bg-danger/5 transition-colors"
                >
                  删除资产
                </button>
                <button
                  onClick={() => onPingAsset(asset)}
                  className="flex-1 py-3 rounded-xl border border-border font-bold text-xs uppercase hover:bg-white/5 transition-colors"
                >
                  {pingingAssetId === asset.id ? "Ping 中..." : "Ping 测试"}
                </button>
                <button
                  onClick={() => onUpdateFirmware(asset.name)}
                  disabled={isUpdatingAsset}
                  className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-xs uppercase hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                >
                  {isUpdatingAsset ? "正在升级..." : "固件升级"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
