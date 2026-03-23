import { type FormEvent, useMemo, useState } from "react";
import { Plus, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Asset, Requirement, RequirementCoverageSnapshot, TestCase } from "../../api/types";

type RequirementPayload = {
  requirement_key: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  owner: string;
  description: string;
};

type RequirementDraft = {
  requirement_key: string;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  status: string;
  description: string;
  case_ids: number[];
  asset_ids: number[];
};

type RequirementsPageProps = {
  requirements: Requirement[];
  requirementCoverage: RequirementCoverageSnapshot;
  assets: Asset[];
  testCases: TestCase[];
  onCreateRequirement: (payload: RequirementPayload) => Promise<number | null>;
  onUpdateRequirement: (id: number, payload: RequirementPayload) => Promise<void>;
  onDeleteRequirement: (id: number) => Promise<void>;
  onUpdateRequirementLinks: (id: number, payload: { test_case_ids: number[]; tara_ids?: number[] }) => Promise<void>;
  onUpdateRequirementAssets: (id: number, payload: { asset_ids: number[] }) => Promise<void>;
};

const emptyDraft: RequirementDraft = {
  requirement_key: "",
  title: "",
  priority: "HIGH",
  category: "Confidentiality",
  status: "OPEN",
  description: "",
  case_ids: [],
  asset_ids: [],
};

const toPriorityCode = (priority: RequirementDraft["priority"]) => {
  if (priority === "HIGH") return "P0";
  if (priority === "MEDIUM") return "P2";
  return "P3";
};

const fromPriorityCode = (value?: string | null): RequirementDraft["priority"] => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "P0" || normalized === "P1") return "HIGH";
  if (normalized === "P2") return "MEDIUM";
  return "LOW";
};

const getPriorityBadge = (priority?: string | null) => {
  const normalized = fromPriorityCode(priority);
  if (normalized === "HIGH") return { label: "HIGH", className: "bg-danger/20 text-danger border border-danger/30" };
  if (normalized === "MEDIUM") return { label: "MEDIUM", className: "bg-warning/20 text-warning border border-warning/30" };
  return { label: "LOW", className: "bg-success/20 text-success border border-success/20" };
};

const getLatestResultBadge = (result?: string | null) => {
  const normalized = String(result || "").trim().toUpperCase();
  if (normalized === "PASSED") return { label: "PASSED", className: "bg-success/15 text-success border border-success/25" };
  if (normalized === "FAILED") return { label: "FAILED", className: "bg-danger/15 text-danger border border-danger/25" };
  if (normalized === "BLOCKED") return { label: "BLOCKED", className: "bg-warning/15 text-warning border border-warning/25" };
  if (normalized === "ERROR") return { label: "ERROR", className: "bg-danger/15 text-danger border border-danger/25" };
  return { label: "NOT_RUN", className: "bg-white/5 text-muted border border-border" };
};

const getQualityTierBadge = (tier?: string | null) => {
  const normalized = String(tier || "").trim().toUpperCase();
  if (normalized === "VERIFIED_PASS") return { label: "质量 A", className: "bg-success/15 text-success border border-success/25" };
  if (normalized === "VERIFIED_FAIL") return { label: "质量 D", className: "bg-danger/15 text-danger border border-danger/25" };
  if (normalized === "PENDING_REVERIFICATION") return { label: "待复验", className: "bg-warning/15 text-warning border border-warning/25" };
  if (normalized === "EVIDENCE_EXPIRED") return { label: "证据过期", className: "bg-warning/15 text-warning border border-warning/25" };
  if (normalized === "NO_EVIDENCE") return { label: "无证据", className: "bg-warning/15 text-warning border border-warning/25" };
  return { label: "链路未全", className: "bg-white/5 text-muted border border-border" };
};

export const RequirementsPage = ({
  requirements,
  requirementCoverage,
  assets,
  testCases,
  onCreateRequirement,
  onUpdateRequirement,
  onDeleteRequirement,
  onUpdateRequirementLinks,
  onUpdateRequirementAssets,
}: RequirementsPageProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState<number | "all">("all");
  const [closureFilter, setClosureFilter] = useState<"all" | "gap" | "covered">("all");
  const [showModal, setShowModal] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RequirementDraft>(emptyDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Requirement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredRequirements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return requirements.filter((item) => {
      const inAssetScope = assetFilter === "all" || (item.asset_ids || []).some((id) => Number(id) === assetFilter);
      if (!inAssetScope) return false;
      if (!query) return true;
      return (
        String(item.requirement_key || "").toLowerCase().includes(query) ||
        String(item.title || "").toLowerCase().includes(query) ||
        String(item.category || "").toLowerCase().includes(query)
      );
    });
  }, [requirements, searchQuery, assetFilter]);

  const coverageRows = useMemo(
    () =>
      (requirementCoverage?.rows || []).filter((item) => (
        assetFilter === "all" ? true : Number(item.asset_id || 0) === assetFilter
      )),
    [requirementCoverage, assetFilter],
  );

  const coverageRowsByRequirementId = useMemo(() => {
    const map = new Map<number, typeof coverageRows>();
    coverageRows.forEach((row) => {
      const key = Number(row.requirement_id || 0);
      if (!key) return;
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    });
    return map;
  }, [coverageRows]);

  const mergedRequirementRows = useMemo(() => {
    const parseDateValue = (value?: string | null) => {
      if (!value) return 0;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return filteredRequirements
      .map((requirement) => {
        const rows = coverageRowsByRequirementId.get(requirement.id) || [];
        const hasRows = rows.length > 0;
        const taraCovered = hasRows && rows.every((item) => item.tara_covered);
        const caseCovered = hasRows && rows.every((item) => item.test_case_covered);
        const closureStatus = hasRows && rows.every((item) => String(item.closure_status || "").toUpperCase() === "COVERED") ? "COVERED" : "GAP";

        const latestRow = [...rows].sort((a, b) => parseDateValue(b.latest_result_at) - parseDateValue(a.latest_result_at))[0];
        const qualityPriority: Record<string, number> = {
          PENDING_REVERIFICATION: 60,
          LINK_MISSING: 50,
          NO_EVIDENCE: 40,
          EVIDENCE_EXPIRED: 35,
          VERIFIED_FAIL: 20,
          VERIFIED_PASS: 10,
        };
        const qualityTier = rows.reduce((current, rowItem) => {
          const next = String(rowItem.quality_tier || "LINK_MISSING").toUpperCase();
          return (qualityPriority[next] || 0) > (qualityPriority[current] || 0) ? next : current;
        }, "LINK_MISSING");
        const gapReasons = Array.from(new Set(rows.flatMap((item) => item.gap_reasons || [])));
        const pendingReasons = Array.from(new Set(rows.flatMap((item) => item.pending_reverification_reasons || [])));
        const pendingCount = rows.reduce((sum, rowItem) => sum + Number(rowItem.pending_reverification_count || 0), 0);
        const assetNames = Array.from(
          new Set(
            rows
              .map((item) => item.asset_name || "")
              .filter((value) => value.trim()),
          ),
        );

        return {
          requirement,
          rows,
          taraCovered,
          caseCovered,
          closureStatus,
          latestResult: latestRow?.latest_result || null,
          latestResultAt: latestRow?.latest_result_at || null,
          satisfactionStatus: latestRow?.satisfaction_status || "UNKNOWN",
          qualityTier,
          pendingCount,
          pendingReasons,
          gapReasons: gapReasons.length > 0 ? gapReasons : ["存在闭环缺口"],
          assetNames: assetNames.length > 0 ? assetNames : ["未绑定资产"],
        };
      })
      .filter((item) => {
        if (closureFilter === "covered") return item.closureStatus === "COVERED";
        if (closureFilter === "gap") return item.closureStatus === "GAP";
        return true;
      });
  }, [filteredRequirements, coverageRowsByRequirementId, closureFilter]);

  const closureSummary = useMemo(() => {
    const total = mergedRequirementRows.length;
    const covered = mergedRequirementRows.filter((item) => item.closureStatus === "COVERED").length;
    const gap = total - covered;
    const coverageRate = total > 0 ? Math.round((covered / total) * 100) : 0;
    const pending = mergedRequirementRows.filter((item) => Number(item.pendingCount || 0) > 0).length;
    return { total, covered, gap, coverageRate, pending };
  }, [mergedRequirementRows]);

  const openCreateModal = () => {
    setEditingRequirementId(null);
    setDraft({
      ...emptyDraft,
      case_ids: [],
      asset_ids: [],
    });
    setShowModal(true);
  };

  const openEditModal = (item: Requirement) => {
    setEditingRequirementId(item.id);
    setDraft({
      requirement_key: String(item.requirement_key || ""),
      title: String(item.title || ""),
      priority: fromPriorityCode(item.priority),
      category: String(item.category || "Confidentiality"),
      status: String(item.status || "OPEN"),
      description: String(item.description || ""),
      case_ids: (item.test_case_ids || []).map((value) => Number(value)).filter((value) => value > 0),
      asset_ids: (item.asset_ids || []).map((value) => Number(value)).filter((value) => value > 0),
    });
    setShowModal(true);
  };

  const toggleCaseId = (id: number) => {
    setDraft((prev) => ({
      ...prev,
      case_ids: prev.case_ids.includes(id) ? prev.case_ids.filter((value) => value !== id) : [...prev.case_ids, id],
    }));
  };

  const toggleAssetId = (id: number) => {
    setDraft((prev) => ({
      ...prev,
      asset_ids: prev.asset_ids.includes(id) ? prev.asset_ids.filter((value) => value !== id) : [...prev.asset_ids, id],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.requirement_key.trim() || !draft.title.trim()) return;
    setIsSubmitting(true);
    try {
      const payload: RequirementPayload = {
        requirement_key: draft.requirement_key.trim(),
        title: draft.title.trim(),
        category: draft.category.trim() || "Confidentiality",
        priority: toPriorityCode(draft.priority),
        status: draft.status || "OPEN",
        owner: "安全测试组",
        description: draft.description.trim(),
      };

      let targetId = editingRequirementId;
      if (editingRequirementId) {
        await onUpdateRequirement(editingRequirementId, payload);
      } else {
        targetId = await onCreateRequirement(payload);
      }

      if (targetId) {
        await Promise.all([
          onUpdateRequirementLinks(targetId, { test_case_ids: draft.case_ids }),
          onUpdateRequirementAssets(targetId, { asset_ids: draft.asset_ids }),
        ]);
      }
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDeleteRequirement = (item: Requirement) => {
    setDeleteCandidate(item);
  };

  const confirmDeleteRequirement = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      await onDeleteRequirement(deleteCandidate.id);
      setDeleteCandidate(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">网络安全需求管理</h2>
          <p className="text-sm text-text-secondary">定义网络安全需求并追踪其测试覆盖与满足情况。</p>
        </div>
        <div className="w-full sm:w-auto flex flex-wrap items-center gap-3 sm:justify-end">
          <select
            value={String(assetFilter)}
            onChange={(event) => {
              const value = event.target.value;
              setAssetFilter(value === "all" ? "all" : Number(value));
            }}
            className="bg-card border border-border rounded-xl px-4 py-2 text-xs w-full sm:w-56 focus:outline-none focus:border-accent"
          >
            <option value="all">全部资产</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} · {asset.connection_address || "未配置地址"}
              </option>
            ))}
          </select>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索需求 ID / 标题..."
            className="bg-card border border-border rounded-xl px-4 py-2 text-xs w-full sm:w-64 focus:outline-none focus:border-accent"
          />
          <button
            onClick={openCreateModal}
            className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
          >
            <Plus size={14} /> 新增安全需求
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-card p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">需求闭环总览</h3>
              <p className="text-xs text-text-secondary mt-1">单一列表视图：需求定义与闭环状态合并展示，避免重复信息。</p>
            </div>
            <div className="inline-flex rounded-xl border border-border bg-white/5 p-1">
              <button
                onClick={() => setClosureFilter("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${closureFilter === "all" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
              >
                全部
              </button>
              <button
                onClick={() => setClosureFilter("gap")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${closureFilter === "gap" ? "bg-warning text-black" : "text-text-secondary hover:text-text-primary"}`}
              >
                未闭环
              </button>
              <button
                onClick={() => setClosureFilter("covered")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${closureFilter === "covered" ? "bg-success text-black" : "text-text-secondary hover:text-text-primary"}`}
              >
                已闭环
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-2xl border border-border bg-white/5 p-4">
              <div className="text-[10px] text-muted uppercase font-bold">总需求</div>
              <div className="text-2xl font-bold mt-1">{closureSummary.total}</div>
            </div>
            <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
              <div className="text-[10px] text-success uppercase font-bold">已闭环</div>
              <div className="text-2xl font-bold mt-1 text-success">{closureSummary.covered}</div>
            </div>
            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4">
              <div className="text-[10px] text-warning uppercase font-bold">未闭环</div>
              <div className="text-2xl font-bold mt-1 text-warning">{closureSummary.gap}</div>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-accent/8 p-4">
              <div className="text-[10px] text-accent uppercase font-bold">闭环率</div>
              <div className="text-2xl font-bold mt-1 text-accent">{closureSummary.coverageRate}%</div>
            </div>
            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4">
              <div className="text-[10px] text-warning uppercase font-bold">待复验</div>
              <div className="text-2xl font-bold mt-1 text-warning">{closureSummary.pending}</div>
            </div>
          </div>
        </div>

        <div className="glass-card overflow-hidden table-shell">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1540px] text-left data-table">
              <thead>
                <tr className="border-b border-border bg-white/[0.02]">
                  <th className="w-16 px-6 py-4 text-center whitespace-nowrap text-[10px] font-bold uppercase tracking-normal text-muted">序号</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">需求ID</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">优先级</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">需求</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">类别</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">关联</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">覆盖状态</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">结果与闭环</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">未闭环原因</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted">最近执行</th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-muted text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mergedRequirementRows.map((row, index) => {
                  const item = row.requirement;
                  const serialNumber = index + 1;
                  const priorityBadge = getPriorityBadge(item.priority);
                  const latestResultBadge = getLatestResultBadge(row.latestResult);
                  const qualityBadge = getQualityTierBadge(row.qualityTier);
                  const linkedCaseCount = (item.test_case_ids || []).length;
                  const linkedTaraCount = (item.tara_ids || []).length;
                  const closureBadgeClass = row.closureStatus === "COVERED"
                    ? "bg-success/12 text-success border border-success/25"
                    : "bg-warning/12 text-warning border border-warning/25";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer align-top"
                      onClick={() => openEditModal(item)}
                    >
                      <td className="w-16 px-6 py-4 text-center align-middle text-xs text-muted font-mono">
                        {serialNumber}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-accent font-bold whitespace-nowrap">{item.requirement_key}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${priorityBadge.className}`}>{priorityBadge.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 min-w-[300px]">
                          <div className="text-base font-bold leading-tight">{item.title}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="min-w-[120px]">
                          <span className="inline-flex items-center rounded-md border border-border bg-white/5 px-2 py-1 text-[11px] text-muted">
                            {item.category || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted min-w-[220px]">
                          <span className="px-2 py-1 rounded-md bg-white/5 border border-border">
                            资产：{row.assetNames.join("、")}
                          </span>
                          <span className="px-2 py-1 rounded-md bg-white/5 border border-border">
                            TARA：{linkedTaraCount}
                          </span>
                          <span className="px-2 py-1 rounded-md bg-white/5 border border-border">
                            用例：{linkedCaseCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 min-w-[170px]">
                          <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${row.taraCovered ? "bg-success/12 text-success border border-success/25" : "bg-danger/12 text-danger border border-danger/25"}`}>
                            TARA {row.taraCovered ? "已覆盖" : "未覆盖"}
                          </span>
                          <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${row.caseCovered ? "bg-success/12 text-success border border-success/25" : "bg-danger/12 text-danger border border-danger/25"}`}>
                            用例 {row.caseCovered ? "已覆盖" : "未覆盖"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 min-w-[200px]">
                          <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${latestResultBadge.className}`}>
                            结果 {latestResultBadge.label}
                          </span>
                          <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${qualityBadge.className}`}>
                            {qualityBadge.label}
                          </span>
                          <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${closureBadgeClass}`}>
                            {row.closureStatus === "COVERED" ? "已闭环" : "未闭环"}
                          </span>
                          {row.pendingCount > 0 ? (
                            <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-warning/15 text-warning border border-warning/25">
                              待复验 {row.pendingCount}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {row.closureStatus === "GAP" ? (
                          <details onClick={(event) => event.stopPropagation()}>
                            <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[11px] font-bold text-warning">
                              原因（{row.gapReasons.length}）
                            </summary>
                            <div className="mt-2 space-y-1.5 rounded-xl border border-warning/20 bg-warning/5 p-3 min-w-[240px]">
                              {row.gapReasons.map((reason, reasonIndex) => (
                                <div key={`${item.id}-${reason}`} className="text-[11px] leading-relaxed text-warning">
                                  {reasonIndex + 1}. {reason}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <span className="text-[11px] text-success font-bold">无缺口</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[11px] text-muted min-w-[180px]">
                          <div>时间：{row.latestResultAt || "暂无"}</div>
                          <div className="mt-1">满足：{row.satisfactionStatus || "UNKNOWN"}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(item);
                            }}
                            className="text-[11px] font-bold text-accent hover:text-accent/80"
                          >
                            编辑
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDeleteRequirement(item);
                            }}
                            className="text-[11px] font-bold text-danger hover:text-danger/80"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {mergedRequirementRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-text-secondary">当前筛选下暂无需求数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {deleteCandidate && (
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => {
              if (!isDeleting) setDeleteCandidate(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="glass-card w-full max-w-md rounded-2xl bg-card p-6 modal-surface"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-lg font-bold">确认删除安全需求</div>
              <div className="mt-3 text-sm text-text-secondary leading-relaxed">
                即将删除
                <span className="mx-1 font-mono text-accent">{deleteCandidate.requirement_key}</span>
                <span className="font-semibold text-text-primary">{deleteCandidate.title}</span>。
              </div>
              <div className="mt-2 text-xs text-muted">关联资产、TARA、测试用例关系会一并删除。</div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteCandidate(null)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-bold text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDeleteRequirement}
                  className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold hover:bg-danger/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="glass-card flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-card p-6 md:p-8 modal-surface"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-6 flex items-start justify-between">
                <h3 className="text-xl font-bold tracking-tight">{editingRequirementId ? "编辑安全需求" : "新增安全需求"}</h3>
                <button onClick={() => setShowModal(false)} className="text-muted hover:text-white transition-colors">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto pr-1">
                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">需求 ID</label>
                  <input
                    value={draft.requirement_key}
                    onChange={(event) => setDraft((prev) => ({ ...prev, requirement_key: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    placeholder="例如：REQ-SEC-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">需求标题</label>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    placeholder="例如：CAN总线报文加密"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-bold text-text-secondary mb-2 block">优先级</label>
                    <select
                      value={draft.priority}
                      onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value as RequirementDraft["priority"] }))}
                      className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="HIGH">High (高)</option>
                      <option value="MEDIUM">Medium (中)</option>
                      <option value="LOW">Low (低)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-text-secondary mb-2 block">安全类别</label>
                    <select
                      value={draft.category}
                      onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                      className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="Confidentiality">机密性 (Confidentiality)</option>
                      <option value="Integrity">完整性 (Integrity)</option>
                      <option value="Availability">可用性 (Availability)</option>
                      <option value="Authenticity">真实性 (Authenticity)</option>
                      <option value="Access Control">访问控制 (Access Control)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">需求描述</label>
                  <textarea
                    value={draft.description}
                    onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-xl px-5 py-3 text-sm min-h-32 focus:outline-none focus:border-accent"
                    placeholder="详细描述该安全需求的技术要求..."
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">适用资产（多选）</label>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-bg p-4 grid grid-cols-1 gap-2">
                    {assets.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={draft.asset_ids.includes(item.id)} onChange={() => toggleAssetId(item.id)} />
                        <span className="text-text-secondary">
                          {item.name}
                          <span className="text-muted"> · {item.connection_address || "未配置地址"}</span>
                        </span>
                      </label>
                    ))}
                    {assets.length === 0 && <div className="text-xs text-muted">暂无资产，请先在资产库注册资产。</div>}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-text-secondary mb-2 block">关联测试用例</label>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-bg p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {testCases.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={draft.case_ids.includes(item.id)} onChange={() => toggleCaseId(item.id)} />
                        <span className="text-text-secondary">{item.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-accent py-4 rounded-2xl text-white text-sm font-bold hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "保存中..." : "保存需求"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
