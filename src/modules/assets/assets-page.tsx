import { Cpu, Plus } from "lucide-react";
import type { Asset } from "../../api/types";

type AssetsPageProps = {
  assets: Asset[];
  pingingAssetId: number | null;
  onOpenRegisterAsset: () => void;
  onSelectAsset: (asset: Asset) => void;
  onPingAsset: (asset: Asset) => void;
  onUpdateFirmware: (name: string) => void;
  onDeleteAsset: (id: number) => void;
};

export const AssetsPage = ({
  assets,
  pingingAssetId,
  onOpenRegisterAsset,
  onSelectAsset,
  onPingAsset,
  onUpdateFirmware,
  onDeleteAsset,
}: AssetsPageProps) => {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">测试资产库</h2>
          <p className="text-sm text-text-secondary">管理测试涉及的 ECU、车辆原型与仿真节点。</p>
        </div>
        <button
          onClick={onOpenRegisterAsset}
          className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
        >
          <Plus size={14} /> 注册新资产
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {assets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => onSelectAsset(asset)}
            className="glass-card p-6 space-y-4 cursor-pointer hover:border-accent/50 transition-all group"
          >
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                <Cpu size={20} />
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${asset.status === "Online" ? "bg-success/20 text-success" : "bg-muted/20 text-muted"}`}>
                {asset.status}
              </span>
            </div>
            <div>
              <h4 className="font-bold">{asset.name}</h4>
              <p className="text-[10px] text-muted uppercase font-bold">{asset.type}</p>
            </div>
            <div className="space-y-2 pt-4 border-t border-border">
              <div className="flex justify-between items-center text-[10px] text-muted font-mono">
                <span>HW: {asset.hardware_version || "-"}</span>
                <span>SW: {asset.software_version || "-"}</span>
              </div>
              {asset.description ? (
                <p className="text-[10px] text-text-secondary line-clamp-2">{asset.description}</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onPingAsset(asset); }}
                  className="text-accent hover:underline text-[10px] font-bold uppercase"
                >
                  {pingingAssetId === asset.id ? "Ping中" : "Ping"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateFirmware(asset.name); }}
                  className="text-accent hover:underline text-[10px] font-bold uppercase"
                >
                  升级
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id); }}
                  className="text-danger hover:underline text-[10px] font-bold uppercase"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {assets.length === 0 && (
          <div className="col-span-full py-20 text-center text-muted italic">资产库为空</div>
        )}
      </div>
    </div>
  );
};

