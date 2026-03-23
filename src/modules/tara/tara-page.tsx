import { type FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Plus, Shield, Trash2, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Asset, Requirement, TaraItem } from "../../api/types";

type TaraPayload = {
  threat_key: string;
  title: string;
  risk_level: string;
  status: string;
  affected_asset: string;
  attack_vector: string;
  impact: string;
  likelihood: string;
  mitigation: string;
  description: string;
};

type TaraDraft = {
  affected_asset: string;
  scenario: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  probability: "HIGH" | "MEDIUM" | "LOW";
  status: string;
  requirement_id: string;
};

type TaraPageProps = {
  taraItems: TaraItem[];
  requirements: Requirement[];
  assets: Asset[];
  onCreateTaraItem: (payload: TaraPayload) => Promise<number | null>;
  onUpdateTaraItem: (id: number, payload: TaraPayload) => Promise<void>;
  onDeleteTaraItem: (id: number) => Promise<void>;
  onUpdateTaraLinks: (id: number, payload: { requirement_ids: number[]; test_case_ids?: number[] }) => Promise<void>;
};

const emptyDraft: TaraDraft = {
  affected_asset: "",
  scenario: "",
  impact: "HIGH",
  probability: "HIGH",
  status: "OPEN",
  requirement_id: "",
};

const weightMap: Record<TaraDraft["impact"], number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const calculateRiskScore = (impact: TaraDraft["impact"], probability: TaraDraft["probability"]) => {
  return weightMap[impact] * weightMap[probability];
};

const toRiskLevel = (score: number) => {
  if (score >= 8) return "CRITICAL";
  if (score >= 6) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
};

const riskBadgeClass = (score: number) => {
  if (score >= 8) return "bg-danger/20 text-danger border border-danger/35";
  if (score >= 6) return "bg-warning/20 text-warning border border-warning/35";
  if (score >= 4) return "bg-accent/20 text-accent border border-accent/35";
  return "bg-success/20 text-success border border-success/25";
};

const normalizeLevel = (value?: string | null): TaraDraft["impact"] => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "HIGH") return "HIGH";
  if (normalized === "MEDIUM") return "MEDIUM";
  return "LOW";
};

const buildNextThreatKey = (items: TaraItem[]) => {
  const maxSeq = items.reduce((max, item) => {
    const match = String(item.threat_key || "").match(/(\d+)$/);
    const seq = match ? Number(match[1]) : 0;
    return seq > max ? seq : max;
  }, 0);
  return `TARA-SEC-${String(maxSeq + 1).padStart(3, "0")}`;
};

export const TaraPage = ({
  taraItems,
  requirements,
  assets,
  onCreateTaraItem,
  onUpdateTaraItem,
  onDeleteTaraItem,
  onUpdateTaraLinks,
}: TaraPageProps) => {
  const [showModal, setShowModal] = useState(false);
  const [editingTaraId, setEditingTaraId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TaraDraft>(emptyDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requirementMap = useMemo(
    () => new Map(requirements.map((item) => [item.id, `${item.requirement_key} ${item.title}`])),
    [requirements],
  );

  const openCreateModal = () => {
    setEditingTaraId(null);
    setDraft(emptyDraft);
    setShowModal(true);
  };

  const openEditModal = (item: TaraItem) => {
    setEditingTaraId(item.id);
    setDraft({
      affected_asset: String(item.affected_asset || ""),
      scenario: String(item.description || item.title || ""),
      impact: normalizeLevel(item.impact),
      probability: normalizeLevel(item.likelihood),
      status: String(item.status || "OPEN"),
      requirement_id: item.requirement_ids?.[0] ? String(item.requirement_ids[0]) : "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.scenario.trim()) return;
    setIsSubmitting(true);
    try {
      const score = calculateRiskScore(draft.impact, draft.probability);
      const riskLevel = toRiskLevel(score);
      const selectedRequirement = requirements.find((item) => String(item.id) === draft.requirement_id);
      const mitigation = selectedRequirement ? selectedRequirement.title : "";
      const scenario = draft.scenario.trim();
      const title = scenario.length > 48 ? `${scenario.slice(0, 48)}...` : scenario;

      const payload: TaraPayload = {
        threat_key: editingTaraId
          ? String(taraItems.find((item) => item.id === editingTaraId)?.threat_key || "")
          : buildNextThreatKey(taraItems),
        title,
        risk_level: riskLevel,
        status: draft.status || "OPEN",
        affected_asset: draft.affected_asset,
        attack_vector: draft.affected_asset,
        impact: draft.impact,
        likelihood: draft.probability,
        mitigation,
        description: scenario,
      };

      let targetId = editingTaraId;
      if (editingTaraId) {
        await onUpdateTaraItem(editingTaraId, payload);
      } else {
        targetId = await onCreateTaraItem(payload);
      }

      if (targetId) {
        const requirementIds = draft.requirement_id ? [Number(draft.requirement_id)] : [];
        await onUpdateTaraLinks(targetId, { requirement_ids: requirementIds });
      }
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">TARA 威胁分析与风险评估</h2>
          <p className="text-sm text-text-secondary">识别资产威胁、评估风险并定义缓解措施。</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
        >
          <Plus size={14} /> 新增威胁分析
        </button>
      </div>

      <div className="glass-card overflow-hidden table-shell">
        <div className="overflow-x-auto">
        <table className="w-full text-left data-table min-w-[960px]">
          <thead>
            <tr className="border-b border-border bg-white/[0.02]">
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted w-16 text-center">序号</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">受影响资产</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">威胁场景</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">影响/概率</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">风险等级</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">缓解需求</th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {taraItems.map((item, index) => {
              const impactLevel = normalizeLevel(item.impact);
              const probabilityLevel = normalizeLevel(item.likelihood);
              const score = calculateRiskScore(impactLevel, probabilityLevel);
              const linkedRequirement = item.requirement_ids?.[0] ? requirementMap.get(Number(item.requirement_ids[0])) : "";
              return (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => openEditModal(item)}>
                  <td className="px-6 py-4 text-sm text-text-secondary font-mono text-center">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-bold">{item.affected_asset || "-"}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">{item.description || item.title}</div>
                    <div className="text-xs text-muted mt-1 font-mono">{item.threat_key}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-danger">IMPACT: {impactLevel}</div>
                    <div className="text-xs font-bold text-danger">PROB: {probabilityLevel}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${riskBadgeClass(score)}`}>
                      <AlertTriangle size={18} />
                      SCORE: {score}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-2 text-accent text-sm font-bold">
                      <Shield size={18} />
                      {linkedRequirement || item.mitigation || "未关联需求"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!window.confirm("确认删除该 TARA 分析吗？")) return;
                        onDeleteTaraItem(item.id);
                      }}
                      className="p-2 rounded-lg border border-danger/25 text-danger hover:bg-danger/10 transition-colors"
                      title="删除威胁分析"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {taraItems.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-text-secondary">暂无 TARA 数据</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-3xl p-8 bg-card modal-surface"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-8">
                <h3 className="text-xl font-bold tracking-tight">{editingTaraId ? "编辑 TARA 威胁分析" : "新增TARA威胁分析"}</h3>
                <button onClick={() => setShowModal(false)} className="text-muted hover:text-white transition-colors">
                  <XCircle size={32} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">受影响资产</label>
                  <select
                    value={draft.affected_asset}
                    onChange={(event) => setDraft((prev) => ({ ...prev, affected_asset: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">-- 选择资产 --</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.name}>{asset.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">威胁场景</label>
                  <textarea
                    value={draft.scenario}
                    onChange={(event) => setDraft((prev) => ({ ...prev, scenario: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm min-h-32 focus:outline-none focus:border-accent"
                    placeholder="描述可能的威胁场景..."
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-bold text-text-secondary mb-2 block">影响等级 (IMPACT)</label>
                    <select
                      value={draft.impact}
                      onChange={(event) => setDraft((prev) => ({ ...prev, impact: event.target.value as TaraDraft["impact"] }))}
                      className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="HIGH">High (高)</option>
                      <option value="MEDIUM">Medium (中)</option>
                      <option value="LOW">Low (低)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-text-secondary mb-2 block">发生概率 (PROBABILITY)</label>
                    <select
                      value={draft.probability}
                      onChange={(event) => setDraft((prev) => ({ ...prev, probability: event.target.value as TaraDraft["probability"] }))}
                      className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="HIGH">High (高)</option>
                      <option value="MEDIUM">Medium (中)</option>
                      <option value="LOW">Low (低)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">缓解措施（关联需求）</label>
                  <select
                    value={draft.requirement_id}
                    onChange={(event) => setDraft((prev) => ({ ...prev, requirement_id: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">-- 不关联需求 --</option>
                    {requirements.map((item) => (
                      <option key={item.id} value={item.id}>{item.requirement_key} · {item.title}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-accent py-4 rounded-2xl text-white text-sm font-bold hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "保存中..." : "保存分析结果"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
