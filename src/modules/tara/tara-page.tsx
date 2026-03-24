import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Clock3,
  CheckCircle2,
  FileText,
  Info,
  Link2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
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

type DisposalDecision = "降低" | "接受" | "规避" | "转移";
type CALLevel = "CAL4" | "CAL3" | "CAL2" | "CAL1";
type VerificationStatus = "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "待复验" | string;
type DrawerTab = "overview" | "impact" | "feasibility" | "verification";

type ThreatDetailPayload = {
  schema: "tara-v2" | "tara-v3";
  asset: string;
  damageScenario?: string;
  threatScenario: string;
  attackPath: string;
  threatMethod: string;
  damageMethod: string;
  impactAssessment: {
    S: number;
    F: number;
    O: number;
    P: number;
  };
  feasibilityAssessment: {
    T: number;
    K: number;
    O: number;
    E: number;
    totalScore: number;
  };
  disposalDecision: DisposalDecision;
  verificationStatus: VerificationStatus;
  lastTestResult?: string;
  lastTestDate?: string;
  evidenceUrl?: string;
  relatedTestCases?: string[];
};

type ThreatViewModel = {
  id: number;
  threatId: string;
  asset: string;
  damageScenario: string;
  threatScenario: string;
  attackPath: string;
  threatMethod: string;
  damageMethod: string;
  impactAssessment: {
    S: number;
    F: number;
    O: number;
    P: number;
  };
  feasibilityAssessment: {
    T: number;
    K: number;
    O: number;
    E: number;
    totalScore: number;
    level: "高" | "中" | "低" | "非常低";
  };
  calLevel: CALLevel;
  disposalDecision: DisposalDecision;
  mitigationRequirement: string;
  verificationStatus: VerificationStatus;
  lastTestResult?: string;
  lastTestDate?: string;
  evidenceUrl?: string;
  relatedTestCases: string[];
  requirementIds: number[];
  requirementCount: number;
  testCaseCount: number;
  createdAt?: string;
  updatedAt?: string;
};

type TaraFormState = {
  asset: string;
  damageScenario: string;
  threatScenario: string;
  attackPath: string;
  threatMethod: string;
  damageMethod: string;
  s: number;
  f: number;
  o: number;
  p: number;
  t: number;
  k: number;
  oFeasibility: number;
  e: number;
  disposalDecision: DisposalDecision;
  requirementIds: number[];
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

const parseJSON = <T,>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const TOOLTIP_DELAY_MS = 200;

const HeaderExplain = ({ content }: { content: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const scheduleOpen = () => {
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      setOpen(true);
      timeoutRef.current = null;
    }, TOOLTIP_DELAY_MS);
  };

  const hide = () => {
    clearTimer();
    setOpen(false);
  };

  useEffect(() => () => clearTimer(), []);

  return (
    <span className="relative inline-flex" onMouseEnter={scheduleOpen} onMouseLeave={hide}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onFocus={scheduleOpen}
        onBlur={hide}
        aria-label="查看字段说明"
        className="inline-flex cursor-help items-center justify-center rounded-full p-0.5 text-muted transition-colors hover:text-text-primary focus:outline-none focus:text-text-primary"
      >
        <Info size={13} />
      </button>
      {open ? (
        <div className="absolute left-1/2 top-full z-40 mt-2 w-[300px] max-w-[300px] -translate-x-1/2 rounded-lg bg-[#05081a] px-3 py-2 text-[12px] normal-case tracking-normal shadow-2xl">
          <div className="space-y-1.5 text-white/95 leading-relaxed">{content}</div>
          <div className="absolute bottom-full left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1 rotate-45 bg-[#05081a]" />
        </div>
      ) : null}
    </span>
  );
};

const mapImpactTextToScore = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("severe") || normalized.includes("严重")) return 3;
  if (normalized.includes("major") || normalized.includes("主要") || normalized.includes("high")) return 2;
  if (normalized.includes("medium") || normalized.includes("中等")) return 1;
  return 0;
};

const parseImpactScores = (impactValue?: string | null, riskLevel?: string | null) => {
  const normalized = String(impactValue || "");
  const mS = normalized.match(/S:(\d+)/i);
  const mF = normalized.match(/F:(\d+)/i);
  const mO = normalized.match(/O:(\d+)/i);
  const mP = normalized.match(/P:(\d+)/i);
  if (mS || mF || mO || mP) {
    return {
      S: toNumber(mS?.[1], 0),
      F: toNumber(mF?.[1], 0),
      O: toNumber(mO?.[1], 0),
      P: toNumber(mP?.[1], 0),
    };
  }
  const mapped = mapImpactTextToScore(impactValue);
  if (mapped > 0) {
    return {
      S: mapped,
      F: mapped,
      O: mapped,
      P: mapped,
    };
  }

  // 兼容旧版数据：impact 为自然语言，risk_level 为 HIGH/MEDIUM/LOW/CALx
  const risk = String(riskLevel || "").trim().toUpperCase();
  let fallback = 0;
  if (risk === "CAL4" || risk === "HIGH") fallback = 3;
  else if (risk === "CAL3" || risk === "MEDIUM") fallback = 2;
  else if (risk === "CAL2" || risk === "LOW") fallback = 1;

  return {
    S: fallback,
    F: fallback,
    O: fallback,
    P: fallback,
  };
};

const parseFeasibilityScores = (likelihoodValue?: string | null) => {
  const normalized = String(likelihoodValue || "");
  const mT = normalized.match(/T:(\d+)/i);
  const mK = normalized.match(/K:(\d+)/i);
  const mO = normalized.match(/O:(\d+)/i);
  const mE = normalized.match(/E:(\d+)/i);
  const mTotal = normalized.match(/TOTAL:(\d+)/i);
  const base = {
    T: toNumber(mT?.[1], 0),
    K: toNumber(mK?.[1], 6),
    O: toNumber(mO?.[1], 4),
    E: toNumber(mE?.[1], 4),
  };
  const totalScore = mTotal ? toNumber(mTotal[1], 0) : base.T + base.K + base.O + base.E;
  return { ...base, totalScore };
};

const getFeasibilityLevel = (totalScore: number): "高" | "中" | "低" | "非常低" => {
  if (totalScore < 14) return "高";
  if (totalScore < 20) return "中";
  if (totalScore < 25) return "低";
  return "非常低";
};

const calculateCAL = (impactMax: number, feasibilityTotal: number): CALLevel => {
  if (impactMax >= 3) return feasibilityTotal < 25 ? "CAL4" : "CAL3";
  if (impactMax >= 2) return feasibilityTotal < 20 ? "CAL3" : "CAL2";
  if (impactMax >= 1) return "CAL2";
  return "CAL1";
};

const normalizeCAL = (value?: string | null, impactMax = 0, feasibilityTotal = 0): CALLevel => {
  const normalized = String(value || "").toUpperCase().trim();
  if (normalized === "CAL4" || normalized === "CAL3" || normalized === "CAL2" || normalized === "CAL1") return normalized;
  if (normalized === "HIGH") return "CAL4";
  if (normalized === "MEDIUM") return "CAL3";
  if (normalized === "LOW") return "CAL2";
  return calculateCAL(impactMax, feasibilityTotal);
};

const defaultDisposalByCAL = (cal: CALLevel): DisposalDecision => {
  if (cal === "CAL4") return "规避";
  if (cal === "CAL3") return "降低";
  return "接受";
};

const normalizeDisposal = (value?: string | null, cal?: CALLevel): DisposalDecision => {
  const normalized = String(value || "").trim();
  if (normalized === "降低" || normalized === "接受" || normalized === "规避" || normalized === "转移") return normalized;
  if (normalized.toUpperCase() === "OPEN") return defaultDisposalByCAL(cal || "CAL2");
  return defaultDisposalByCAL(cal || "CAL2");
};

const normalizeVerification = (value?: string | null): VerificationStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED" || normalized === "FAILED" || normalized === "BLOCKED" || normalized === "ERROR") return normalized;
  if (normalized === "PENDING_REVERIFICATION") return "待复验";
  return "待复验";
};

const formatAttackPath = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "未填写";
  const normalized = raw.replaceAll("→", "->");
  const parts = normalized
    .split(/\s*(?:->|=>|›|>)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw;
  return parts.join(" → ");
};

const normalizeAttackPath = (value?: string | null, scenario?: string | null, threatMethod?: string | null) => {
  const raw = String(value || "").trim();
  const context = `${String(scenario || "")} ${String(threatMethod || "")}`.toLowerCase();

  if (!raw) {
    if (context.includes("ssh")) return "外部网络 → SSH 服务(22) → 系统控制面";
    if (context.includes("adb")) return "以太网接口 → ADB TCP(5555) → 调试 shell";
    if (context.includes("telnet") || context.includes("ftp")) return "以太网接口 → Telnet/FTP 明文服务 → 业务数据面";
    if (context.includes("日志") || context.includes("log")) return "本地接口/远程通道 → 日志服务进程 → 日志存储";
    return "未填写攻击路径";
  }

  const normalizedRaw = raw.toLowerCase();
  if (normalizedRaw === "ssh") return "外部网络 → SSH 服务(22) → 系统控制面";
  if (normalizedRaw === "adb") return "以太网接口 → ADB TCP(5555) → 调试 shell";
  if (normalizedRaw === "ethernet/ssh") return "以太网接口 → SSH 服务(22) → 系统控制面";
  if (normalizedRaw === "ethernet/adb") return "以太网接口 → ADB TCP(5555) → 调试 shell";
  if (normalizedRaw === "ethernet/telnet/ftp") return "以太网接口 → Telnet/FTP 明文服务 → 业务数据面";
  if (normalizedRaw === "本地/远程日志通道") return "本地接口/远程通道 → 日志服务进程 → 日志存储";

  return formatAttackPath(raw);
};

const buildNextThreatKey = (items: TaraItem[]) => {
  const maxSeq = items.reduce((max, item) => {
    const match = String(item.threat_key || "").match(/(\d+)$/);
    const seq = match ? Number(match[1]) : 0;
    return seq > max ? seq : max;
  }, 0);
  return `TARA-SEC-${String(maxSeq + 1).padStart(3, "0")}`;
};

const parseThreatPayload = (item: TaraItem): ThreatDetailPayload | null => {
  const parsed = parseJSON<ThreatDetailPayload>(item.description || "");
  if (!parsed || !/^tara-v\d+$/i.test(String(parsed.schema || ""))) return null;
  return parsed;
};

const deriveLegacyDamageScenario = (raw: string) => {
  const normalized = raw.toLowerCase();
  if (normalized.includes("ssh") || normalized.includes("root")) return "远程登录控制面暴露，导致未授权控制风险上升。";
  if (normalized.includes("adb")) return "调试接口暴露导致系统访问边界失效，存在越权与数据泄露风险。";
  if (normalized.includes("telnet") || normalized.includes("ftp")) return "明文服务暴露导致凭据与业务数据泄露风险。";
  if (normalized.includes("日志") || normalized.includes("log")) return "关键日志完整性受损导致审计失真与事件不可追溯。";
  return "未填写损害场景（请补充）";
};

const parseLegacyThreatMethods = (description?: string | null) => {
  const raw = String(description || "").trim();
  if (!raw) {
    return {
      damageScenario: "未填写损害场景（请补充）",
      threatMethod: "未填写威胁方法",
      damageMethod: "未填写损害方法（请补充）",
    };
  }

  const tmMatch = raw.match(/TM[:：]\s*(.+?)(?:\r?\n|$)/i);
  const dmMatch = raw.match(/DM[:：]\s*(.+?)(?:\r?\n|$)/i);
  if (tmMatch?.[1] || dmMatch?.[1]) {
    const damageMethod = dmMatch?.[1]?.trim() || "未填写损害方法（请补充）";
    return {
      damageScenario: damageMethod !== "未填写损害方法（请补充）" ? damageMethod : deriveLegacyDamageScenario(raw),
      threatMethod: tmMatch?.[1]?.trim() || "未填写威胁方法",
      damageMethod,
    };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      damageScenario: lines.slice(1).join(" "),
      threatMethod: lines[0],
      damageMethod: lines.slice(1).join(" "),
    };
  }

  return {
    damageScenario: deriveLegacyDamageScenario(raw),
    threatMethod: lines[0] || raw,
    damageMethod: "未填写损害方法（请补充）",
  };
};

const getCALBadgeClass = (cal: CALLevel) => {
  if (cal === "CAL4") return "bg-danger/15 text-danger border border-danger/25";
  if (cal === "CAL3") return "bg-warning/15 text-warning border border-warning/25";
  if (cal === "CAL2") return "bg-success/15 text-success border border-success/25";
  return "bg-white/5 text-muted border border-border";
};

const getDisposalBadgeClass = (value: DisposalDecision) => {
  if (value === "规避") return "bg-danger/10 text-danger border border-danger/25";
  if (value === "降低") return "bg-warning/10 text-warning border border-warning/25";
  if (value === "转移") return "bg-accent/10 text-accent border border-accent/25";
  return "bg-success/10 text-success border border-success/25";
};

const getVerificationBadgeClass = (value: VerificationStatus) => {
  const normalized = String(value).toUpperCase();
  if (normalized === "PASSED") return "bg-success/15 text-success border border-success/25";
  if (normalized === "FAILED" || normalized === "ERROR") return "bg-danger/15 text-danger border border-danger/25";
  if (normalized === "BLOCKED") return "bg-warning/15 text-warning border border-warning/25";
  return "bg-white/5 text-muted border border-border";
};

const emptyFormState: TaraFormState = {
  asset: "",
  damageScenario: "",
  threatScenario: "",
  attackPath: "",
  threatMethod: "",
  damageMethod: "",
  s: 0,
  f: 0,
  o: 0,
  p: 0,
  t: 0,
  k: 6,
  oFeasibility: 4,
  e: 4,
  disposalDecision: "降低",
  requirementIds: [],
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
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [calFilter, setCalFilter] = useState<string>("all");
  const [disposalFilter, setDisposalFilter] = useState<string>("all");

  const [selectedThreat, setSelectedThreat] = useState<ThreatViewModel | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingThreat, setEditingThreat] = useState<ThreatViewModel | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>("overview");
  const [formState, setFormState] = useState<TaraFormState>(emptyFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ThreatViewModel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!showDrawer) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyOverflowX = document.body.style.overflowX;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevHtmlOverflowX = document.documentElement.style.overflowX;

    document.body.style.overflow = "hidden";
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overflowX = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.overflowX = prevBodyOverflowX;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overflowX = prevHtmlOverflowX;
    };
  }, [showDrawer]);

  const requirementMap = useMemo(
    () => new Map(requirements.map((item) => [item.id, item.requirement_key])),
    [requirements],
  );

  const threats = useMemo<ThreatViewModel[]>(() => {
    return taraItems.map((item) => {
      const payload = parseThreatPayload(item);
      const legacyMethods = parseLegacyThreatMethods(item.description);

      const impactAssessment = payload?.impactAssessment || parseImpactScores(item.impact, item.risk_level);
      const parsedFeasibility = payload?.feasibilityAssessment || parseFeasibilityScores(item.likelihood);
      const impactMax = Math.max(impactAssessment.S, impactAssessment.F, impactAssessment.O, impactAssessment.P);
      const calLevel = normalizeCAL(item.risk_level, impactMax, parsedFeasibility.totalScore);
      const disposalDecision = payload?.disposalDecision || normalizeDisposal(item.status, calLevel);
      const requirementIds = Array.isArray(item.requirement_ids) ? item.requirement_ids : [];
      const mitigationFromLinks = requirementIds
        .map((id) => requirementMap.get(id))
        .filter(Boolean)
        .join(", ");

      return {
        id: item.id,
        threatId: String(item.threat_key || `THR-${String(item.id).padStart(3, "0")}`),
        asset: payload?.asset || item.affected_asset || "未指定资产",
        damageScenario: payload?.damageScenario || payload?.damageMethod || legacyMethods.damageScenario,
        threatScenario: payload?.threatScenario || item.title || "未命名场景",
        attackPath: normalizeAttackPath(
          payload?.attackPath || item.attack_vector,
          payload?.threatScenario || item.title,
          payload?.threatMethod || item.description,
        ),
        threatMethod: payload?.threatMethod || legacyMethods.threatMethod,
        damageMethod: payload?.damageMethod || legacyMethods.damageMethod,
        impactAssessment,
        feasibilityAssessment: {
          T: parsedFeasibility.T,
          K: parsedFeasibility.K,
          O: parsedFeasibility.O,
          E: parsedFeasibility.E,
          totalScore: parsedFeasibility.totalScore,
          level: getFeasibilityLevel(parsedFeasibility.totalScore),
        },
        calLevel,
        disposalDecision,
        mitigationRequirement: mitigationFromLinks || item.mitigation || "未关联需求",
        verificationStatus: payload?.verificationStatus || normalizeVerification(item.verification_status),
        lastTestResult: payload?.lastTestResult,
        lastTestDate: payload?.lastTestDate,
        evidenceUrl: payload?.evidenceUrl,
        relatedTestCases: payload?.relatedTestCases || [],
        requirementIds,
        requirementCount: Number(item.requirement_count || 0),
        testCaseCount: Number(item.test_case_count || 0),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    });
  }, [taraItems, requirementMap]);

  const assetOptions = useMemo(() => {
    const names = threats
      .map((item) => item.asset)
      .filter((value): value is string => Boolean(value && value.trim()));

    return Array.from(new Set<string>(names)).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [threats]);

  const filteredThreats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return threats.filter((threat) => {
      if (assetFilter !== "all" && threat.asset !== assetFilter) return false;
      if (calFilter !== "all" && threat.calLevel !== calFilter) return false;
      if (disposalFilter !== "all" && threat.disposalDecision !== disposalFilter) return false;
      if (!query) return true;
      return (
        threat.threatId.toLowerCase().includes(query) ||
        threat.damageScenario.toLowerCase().includes(query) ||
        threat.threatScenario.toLowerCase().includes(query) ||
        threat.mitigationRequirement.toLowerCase().includes(query)
      );
    });
  }, [threats, assetFilter, calFilter, disposalFilter, searchQuery]);

  const kpiData = useMemo(() => {
    return {
      total: filteredThreats.length,
      cal4: filteredThreats.filter((item) => item.calLevel === "CAL4").length,
      cal3: filteredThreats.filter((item) => item.calLevel === "CAL3").length,
      cal2: filteredThreats.filter((item) => item.calLevel === "CAL2").length,
      linkedRequirements: filteredThreats.filter((item) => item.requirementCount > 0).length,
      pendingVerification: filteredThreats.filter((item) => item.verificationStatus === "待复验").length,
    };
  }, [filteredThreats]);

  const resetForm = () => setFormState(emptyFormState);

  const openCreateModal = () => {
    setEditingThreat(null);
    resetForm();
    setShowFormModal(true);
  };

  const populateFormFromThreat = (threat: ThreatViewModel) => {
    setFormState({
      asset: threat.asset,
      damageScenario: threat.damageScenario,
      threatScenario: threat.threatScenario,
      attackPath: threat.attackPath,
      threatMethod: threat.threatMethod,
      damageMethod: threat.damageMethod,
      s: threat.impactAssessment.S,
      f: threat.impactAssessment.F,
      o: threat.impactAssessment.O,
      p: threat.impactAssessment.P,
      t: threat.feasibilityAssessment.T,
      k: threat.feasibilityAssessment.K,
      oFeasibility: threat.feasibilityAssessment.O,
      e: threat.feasibilityAssessment.E,
      disposalDecision: threat.disposalDecision,
      requirementIds: threat.requirementIds,
    });
  };

  const openDrawerEditor = (threat: ThreatViewModel) => {
    setSelectedThreat(threat);
    setEditingThreat(threat);
    populateFormFromThreat(threat);
    setActiveDrawerTab("overview");
    setShowDrawer(true);
  };

  const toggleRequirementSelection = (requirementId: number) => {
    setFormState((prev) => {
      const existed = prev.requirementIds.includes(requirementId);
      return {
        ...prev,
        requirementIds: existed
          ? prev.requirementIds.filter((id) => id !== requirementId)
          : [...prev.requirementIds, requirementId],
      };
    });
  };

  const feasibilityTotal = formState.t + formState.k + formState.oFeasibility + formState.e;
  const impactMax = Math.max(formState.s, formState.f, formState.o, formState.p);
  const currentCAL = calculateCAL(impactMax, feasibilityTotal);
  const traceabilityPreview = `${formState.asset || "未指定资产"} → ${formState.damageScenario || "未填写损害场景"} → ${formState.threatScenario || "未命名威胁场景"} → 需求(${formState.requirementIds.length}) → 用例(${selectedThreat?.testCaseCount ?? 0}) → 证据(${selectedThreat?.verificationStatus || "待复验"})`;

  const handleSaveThreat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const threatKey = editingThreat?.threatId || buildNextThreatKey(taraItems);
      const linkedRequirementKeys = formState.requirementIds
        .map((id) => requirementMap.get(id))
        .filter(Boolean)
        .join(", ");

      const payload: ThreatDetailPayload = {
        schema: "tara-v3",
        asset: formState.asset,
        damageScenario: formState.damageScenario,
        threatScenario: formState.threatScenario,
        attackPath: formState.attackPath,
        threatMethod: formState.threatMethod,
        damageMethod: formState.damageMethod,
        impactAssessment: {
          S: formState.s,
          F: formState.f,
          O: formState.o,
          P: formState.p,
        },
        feasibilityAssessment: {
          T: formState.t,
          K: formState.k,
          O: formState.oFeasibility,
          E: formState.e,
          totalScore: feasibilityTotal,
        },
        disposalDecision: formState.disposalDecision,
        verificationStatus: "待复验",
      };

      const body: TaraPayload = {
        threat_key: threatKey,
        title: formState.threatScenario.trim().slice(0, 80),
        risk_level: currentCAL,
        status: formState.disposalDecision,
        affected_asset: formState.asset.trim(),
        attack_vector: formState.attackPath.trim(),
        impact: `S:${formState.s}|F:${formState.f}|O:${formState.o}|P:${formState.p}`,
        likelihood: `T:${formState.t}|K:${formState.k}|O:${formState.oFeasibility}|E:${formState.e}|TOTAL:${feasibilityTotal}|LEVEL:${getFeasibilityLevel(feasibilityTotal)}`,
        mitigation: linkedRequirementKeys,
        description: JSON.stringify(payload),
      };

      let targetId = editingThreat?.id ?? null;
      if (editingThreat) {
        await onUpdateTaraItem(editingThreat.id, body);
      } else {
        targetId = await onCreateTaraItem(body);
      }

      if (targetId) {
        await onUpdateTaraLinks(targetId, { requirement_ids: formState.requirementIds });
      }

      setShowFormModal(false);
      setEditingThreat(null);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDrawerThreat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThreat) return;
    if (
      !formState.asset.trim() ||
      !formState.damageScenario.trim() ||
      !formState.threatScenario.trim() ||
      !formState.attackPath.trim() ||
      !formState.threatMethod.trim() ||
      !formState.damageMethod.trim()
    ) {
      setActiveDrawerTab("overview");
      window.alert("请先完善概览中的必填信息（资产、场景、攻击路径、TM、DM）。");
      return;
    }

    setIsSubmitting(true);
    try {
      const linkedRequirementKeys = formState.requirementIds
        .map((id) => requirementMap.get(id))
        .filter(Boolean)
        .join(", ");

      const payload: ThreatDetailPayload = {
        schema: "tara-v3",
        asset: formState.asset,
        damageScenario: formState.damageScenario,
        threatScenario: formState.threatScenario,
        attackPath: formState.attackPath,
        threatMethod: formState.threatMethod,
        damageMethod: formState.damageMethod,
        impactAssessment: {
          S: formState.s,
          F: formState.f,
          O: formState.o,
          P: formState.p,
        },
        feasibilityAssessment: {
          T: formState.t,
          K: formState.k,
          O: formState.oFeasibility,
          E: formState.e,
          totalScore: feasibilityTotal,
        },
        disposalDecision: formState.disposalDecision,
        verificationStatus: "待复验",
      };

      const body: TaraPayload = {
        threat_key: selectedThreat.threatId,
        title: formState.threatScenario.trim().slice(0, 80),
        risk_level: currentCAL,
        status: formState.disposalDecision,
        affected_asset: formState.asset.trim(),
        attack_vector: formState.attackPath.trim(),
        impact: `S:${formState.s}|F:${formState.f}|O:${formState.o}|P:${formState.p}`,
        likelihood: `T:${formState.t}|K:${formState.k}|O:${formState.oFeasibility}|E:${formState.e}|TOTAL:${feasibilityTotal}|LEVEL:${getFeasibilityLevel(feasibilityTotal)}`,
        mitigation: linkedRequirementKeys,
        description: JSON.stringify(payload),
      };

      await onUpdateTaraItem(selectedThreat.id, body);
      await onUpdateTaraLinks(selectedThreat.id, { requirement_ids: formState.requirementIds });

      setShowDrawer(false);
      setSelectedThreat(null);
      setEditingThreat(null);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDeleteThreat = (threat: ThreatViewModel) => {
    setDeleteCandidate(threat);
  };

  const confirmDeleteThreat = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      await onDeleteTaraItem(deleteCandidate.id);
      if (selectedThreat?.id === deleteCandidate.id) {
        setSelectedThreat(null);
        setShowDrawer(false);
      }
      setDeleteCandidate(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">TARA 威胁分析与风险评估</h2>
          <p className="text-sm text-text-secondary">识别威胁、评估风险并定义缓解措施。</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center justify-end">
          <select
            value={assetFilter}
            onChange={(event) => setAssetFilter(event.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-28 focus:outline-none focus:border-accent transition-all"
          >
            <option value="all">全部资产</option>
            {assetOptions.map((asset) => (
              <option key={asset} value={asset}>{asset}</option>
            ))}
          </select>
          <select
            value={calFilter}
            onChange={(event) => setCalFilter(event.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-24 focus:outline-none focus:border-accent transition-all"
          >
            <option value="all">全部 CAL</option>
            <option value="CAL4">CAL4</option>
            <option value="CAL3">CAL3</option>
            <option value="CAL2">CAL2</option>
            <option value="CAL1">CAL1</option>
          </select>
          <select
            value={disposalFilter}
            onChange={(event) => setDisposalFilter(event.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-24 focus:outline-none focus:border-accent transition-all"
          >
            <option value="all">全部处置</option>
            <option value="降低">降低</option>
            <option value="接受">接受</option>
            <option value="规避">规避</option>
            <option value="转移">转移</option>
          </select>
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索威胁 ID / 场景 / 需求ID..."
              className="bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent transition-all"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
          >
            <Plus size={14} /> 新增威胁分析
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          {
            label: "总场景数",
            value: kpiData.total,
            icon: TrendingUp,
            iconWrapClass: "bg-accent/10 border-accent/25",
            iconClass: "text-accent",
          },
          {
            label: "CAL4 数量",
            value: kpiData.cal4,
            icon: CircleAlert,
            iconWrapClass: "bg-blue-500/10 border-blue-500/25",
            iconClass: "text-blue-500",
          },
          {
            label: "CAL3 数量",
            value: kpiData.cal3,
            icon: AlertTriangle,
            iconWrapClass: "bg-warning/10 border-warning/25",
            iconClass: "text-warning",
          },
          {
            label: "CAL2 数量",
            value: kpiData.cal2,
            icon: CircleAlert,
            iconWrapClass: "bg-danger/10 border-danger/25",
            iconClass: "text-danger",
          },
          {
            label: "已关联需求数",
            value: kpiData.linkedRequirements,
            icon: Link2,
            iconWrapClass: "bg-success/10 border-success/25",
            iconClass: "text-success",
          },
          {
            label: "待复验数",
            value: kpiData.pendingVerification,
            icon: Clock3,
            iconWrapClass: "bg-amber-500/10 border-amber-500/25",
            iconClass: "text-amber-500",
          },
        ].map((item) => (
          <div key={item.label} className="glass-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted font-bold">{item.label}</div>
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${item.iconWrapClass}`}>
                <item.icon size={14} className={item.iconClass} />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-primary">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden table-shell">
        <div className={showDrawer ? "overflow-x-hidden" : "overflow-x-auto"}>
          <table className="w-full text-left data-table min-w-[1520px]">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-16 text-center">序号</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-40">威胁 ID</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-40">受影响资产</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted min-w-[300px]">威胁/损害场景 (TM/DM)</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted min-w-[220px]">攻击路径</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-[180px]">
                  <div className="inline-flex items-center gap-1">
                    <span>影响评估</span>
                    <HeaderExplain
                      content={(
                        <>
                          <div className="font-bold">ISO/SAE 21434 影响维度</div>
                          <div><span className="font-bold">S (Safety)</span>: 人身安全影响</div>
                          <div><span className="font-bold">F (Financial)</span>: 财务损失影响</div>
                          <div><span className="font-bold">O (Operational)</span>: 运营中断影响</div>
                          <div><span className="font-bold">P (Privacy)</span>: 隐私数据泄露</div>
                          <div className="pt-1 text-white/75">评分范围：0-3（严重程度递增）</div>
                        </>
                      )}
                    />
                  </div>
                </th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-[170px]">
                  <div className="inline-flex items-center gap-1">
                    <span>可行性</span>
                    <HeaderExplain
                      content={(
                        <>
                          <div className="font-bold">攻击可行性评估 (TOKE)</div>
                          <div><span className="font-bold">T</span>: 所需时间</div>
                          <div><span className="font-bold">K</span>: 专业知识</div>
                          <div><span className="font-bold">O</span>: 攻击机会</div>
                          <div><span className="font-bold">E</span>: 设备成本</div>
                          <div className="pt-1 text-white/75">总分越高，攻击越困难（0-47）</div>
                        </>
                      )}
                    />
                  </div>
                </th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-28">
                  <div className="inline-flex items-center gap-1">
                    <span>CAL</span>
                    <HeaderExplain
                      content={(
                        <>
                          <div className="font-bold">网络安全保障等级 (Cybersecurity Assurance Level)</div>
                          <div>基于影响和可行性评估计算，范围从 <span className="font-bold">CAL1</span>（低风险）到 <span className="font-bold">CAL4</span>（关键风险）。</div>
                        </>
                      )}
                    />
                  </div>
                </th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-24">
                  <div className="inline-flex items-center gap-1">
                    <span>处置</span>
                    <HeaderExplain
                      content={(
                        <>
                          <div className="font-bold">风险处置决策</div>
                          <div><span className="font-bold">缓解</span>: 实施控制措施降低风险</div>
                          <div><span className="font-bold">接受</span>: 风险在可接受范围内</div>
                          <div><span className="font-bold">规避</span>: 避免高风险活动</div>
                          <div><span className="font-bold">转移</span>: 通过合同等方式转移</div>
                        </>
                      )}
                    />
                  </div>
                </th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted min-w-[180px]">缓解需求</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-28">验证状态</th>
                <th className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted w-28 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredThreats.map((threat, index) => (
                <tr
                  key={threat.id}
                  className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => openDrawerEditor(threat)}
                >
                  <td className="px-4 py-4 text-center text-sm text-text-secondary font-mono">{index + 1}</td>
                  <td className="px-4 py-4">
                    <div className="font-mono text-xs text-accent font-semibold">{threat.threatId}</div>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold">{threat.asset}</td>
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold line-clamp-1">{threat.threatScenario}</div>
                    <div className="text-xs text-warning mt-1 line-clamp-1">损害场景: {threat.damageScenario}</div>
                    <div className="text-xs text-muted mt-1 line-clamp-1">TM: {threat.threatMethod}</div>
                    <div className="text-xs text-muted line-clamp-1">DM: {threat.damageMethod}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs text-text-secondary line-clamp-2">
                      {threat.attackPath}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-text-secondary">
                      <span>S:{threat.impactAssessment.S}</span>
                      <span>F:{threat.impactAssessment.F}</span>
                      <span>O:{threat.impactAssessment.O}</span>
                      <span>P:{threat.impactAssessment.P}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-center">{threat.feasibilityAssessment.totalScore}</div>
                    <div className="mt-1 text-[10px] text-center text-muted">{threat.feasibilityAssessment.level}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${getCALBadgeClass(threat.calLevel)}`}>
                      {threat.calLevel}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${getDisposalBadgeClass(threat.disposalDecision)}`}>
                      {threat.disposalDecision}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs text-accent font-mono line-clamp-2">
                      {threat.mitigationRequirement}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${getVerificationBadgeClass(threat.verificationStatus)}`}>
                      {threat.verificationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end items-center gap-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openDrawerEditor(threat);
                        }}
                        className="p-1.5 rounded-md border border-border hover:bg-white/5 transition-colors"
                        title="编辑"
                      >
                        <Pencil size={14} className="text-text-secondary" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          requestDeleteThreat(threat);
                        }}
                        className="p-1.5 rounded-md border border-danger/25 hover:bg-danger/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} className="text-danger" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredThreats.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-text-secondary">暂无 TARA 数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showDrawer && selectedThreat && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] !m-0"
              onClick={() => {
                setShowDrawer(false);
                setSelectedThreat(null);
                setEditingThreat(null);
              }}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-xl bg-bg border-l border-border shadow-2xl flex flex-col drawer-surface !m-0"
            >
              <div className="p-6 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <ShieldAlert size={20} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">编辑威胁</h3>
                    <p className="text-xs text-muted uppercase tracking-wider font-bold">{selectedThreat.threatId}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setSelectedThreat(null);
                    setEditingThreat(null);
                  }}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <XCircle size={24} className="text-muted" />
                </button>
              </div>

              <form id="tara-drawer-form" onSubmit={handleSaveDrawerThreat} className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
                <section className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">受影响资产 *</label>
                    <select
                      value={formState.asset}
                      onChange={(event) => setFormState((prev) => ({ ...prev, asset: event.target.value }))}
                      className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                      required
                    >
                      <option value="">请选择资产</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.name}>
                          {asset.name} {asset.connection_address ? `· ${asset.connection_address}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">威胁场景 *</label>
                    <input
                      value={formState.threatScenario}
                      onChange={(event) => setFormState((prev) => ({ ...prev, threatScenario: event.target.value }))}
                      className="field-surface w-full rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                </section>

                <section className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border px-3 py-2">
                    <div className="text-[11px] text-text-secondary font-bold">CAL</div>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${getCALBadgeClass(currentCAL)}`}>{currentCAL}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-2">
                    <label className="text-[11px] text-text-secondary font-bold block">处置</label>
                    <select
                      value={formState.disposalDecision}
                      onChange={(event) => setFormState((prev) => ({ ...prev, disposalDecision: event.target.value as DisposalDecision }))}
                      className="field-surface mt-1 w-full rounded-md px-2 py-1 text-sm font-bold"
                    >
                      <option value="降低">降低</option>
                      <option value="接受">接受</option>
                      <option value="规避">规避</option>
                      <option value="转移">转移</option>
                    </select>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-2">
                    <div className="text-[11px] text-text-secondary font-bold">状态</div>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${getVerificationBadgeClass(selectedThreat.verificationStatus)}`}>
                        {selectedThreat.verificationStatus}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="border-t border-border pt-4">
                  <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
                    {[
                      { key: "overview" as DrawerTab, label: "概览", icon: FileText },
                      { key: "impact" as DrawerTab, label: "影响评估", icon: AlertTriangle },
                      { key: "feasibility" as DrawerTab, label: "可行性", icon: Target },
                      { key: "verification" as DrawerTab, label: "验证", icon: CheckCircle2 },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = activeDrawerTab === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setActiveDrawerTab(item.key)}
                          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                            active ? "bg-white/90 text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          <Icon size={13} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {activeDrawerTab === "overview" && (
                  <section className="space-y-4">
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">损害场景 *</label>
                      <textarea
                        value={formState.damageScenario}
                        onChange={(event) => setFormState((prev) => ({ ...prev, damageScenario: event.target.value }))}
                        className="field-surface w-full rounded-lg px-3 py-2 text-sm min-h-16"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">攻击路径 *</label>
                      <input
                        value={formState.attackPath}
                        onChange={(event) => setFormState((prev) => ({ ...prev, attackPath: event.target.value }))}
                        className="field-surface w-full rounded-lg px-3 py-2 text-sm text-accent"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">威胁方法 (TM) *</label>
                      <textarea
                        value={formState.threatMethod}
                        onChange={(event) => setFormState((prev) => ({ ...prev, threatMethod: event.target.value }))}
                        className="field-surface w-full rounded-lg px-3 py-2 text-sm min-h-16"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">损害方法 (DM) *</label>
                      <textarea
                        value={formState.damageMethod}
                        onChange={(event) => setFormState((prev) => ({ ...prev, damageMethod: event.target.value }))}
                        className="field-surface w-full rounded-lg px-3 py-2 text-sm min-h-16"
                        required
                      />
                    </div>
                    <div className="pt-2 border-t border-border">
                      <label className="text-xs text-text-secondary font-bold mb-2 block">关联需求</label>
                      <div className="field-surface rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                        {requirements.map((req) => (
                          <label key={req.id} className="flex items-start gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formState.requirementIds.includes(req.id)}
                              onChange={() => toggleRequirementSelection(req.id)}
                              className="mt-0.5"
                            />
                            <span className="leading-relaxed">
                              <span className="font-mono text-accent mr-2">{req.requirement_key}</span>
                              {req.title}
                            </span>
                          </label>
                        ))}
                        {requirements.length === 0 && <div className="text-sm text-muted">暂无可关联需求</div>}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border text-xs text-text-secondary space-y-1">
                      <div>创建时间：{selectedThreat.createdAt || "暂无"}</div>
                      <div>更新时间：{selectedThreat.updatedAt || "暂无"}</div>
                      <div className="text-[11px] text-muted mt-2">链路预览：{traceabilityPreview}</div>
                    </div>
                  </section>
                )}

                {activeDrawerTab === "impact" && (
                  <section className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ["Safety (S)", "s", formState.s, "人身安全影响", "border-danger/35 bg-danger/5 text-danger"],
                        ["Financial (F)", "f", formState.f, "财务损失影响", "border-warning/35 bg-warning/5 text-warning"],
                        ["Operational (O)", "o", formState.o, "运营影响", "border-accent/35 bg-accent/5 text-accent"],
                        ["Privacy (P)", "p", formState.p, "隐私泄露影响", "border-purple-400/35 bg-purple-500/5 text-purple-500"],
                      ].map(([label, field, value, helper, classes]) => (
                        <div key={field as string} className={`rounded-xl border p-4 ${classes as string}`}>
                          <div className="text-sm font-bold">{label as string}</div>
                          <div className="mt-2 flex items-end justify-between">
                            <div className="text-xs text-text-secondary">{helper as string}</div>
                            <input
                              type="number"
                              min={0}
                              max={3}
                              value={value as number}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                setFormState((prev) => ({ ...prev, [field as string]: Number.isFinite(nextValue) ? nextValue : 0 }));
                              }}
                              className="field-surface w-16 rounded-md px-1 py-0.5 text-right text-4xl font-bold"
                              required
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-secondary leading-relaxed">
                      <div className="font-bold text-text-primary mb-1">评分说明</div>
                      <div>0 - 无影响；1 - 轻微可接受；2 - 中等显著可控；3 - 严重不可接受。</div>
                    </div>
                  </section>
                )}

                {activeDrawerTab === "feasibility" && (
                  <section className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ["Elapsed Time (T)", "t", formState.t, 0, 19, "攻击所需时间"],
                        ["Specialist Knowledge (K)", "k", formState.k, 0, 11, "所需专业知识"],
                        ["Opportunity (O)", "oFeasibility", formState.oFeasibility, 0, 10, "攻击机会窗口"],
                        ["Equipment (E)", "e", formState.e, 0, 9, "所需设备成本"],
                      ].map(([label, field, value, min, max, helper]) => (
                        <div key={field as string} className="rounded-xl border border-border p-4">
                          <div className="text-xs font-bold text-text-secondary">{label as string}</div>
                          <div className="mt-2 flex items-end justify-between">
                            <div className="text-xs text-muted">{helper as string}</div>
                            <input
                              type="number"
                              min={min as number}
                              max={max as number}
                              value={value as number}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                setFormState((prev) => ({ ...prev, [field as string]: Number.isFinite(nextValue) ? nextValue : 0 }));
                              }}
                              className="field-surface w-20 rounded-md px-1 py-0.5 text-right text-4xl font-bold"
                              required
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 flex items-end justify-between">
                      <div>
                        <div className="text-sm font-bold text-accent">可行性总分</div>
                        <div className="text-xs text-accent/80 mt-1">T({formState.t}) + K({formState.k}) + O({formState.oFeasibility}) + E({formState.e}) = {feasibilityTotal}</div>
                      </div>
                      <div className="text-5xl font-bold text-accent">{feasibilityTotal}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-secondary leading-relaxed">
                      <div className="font-bold text-text-primary mb-1">评分说明</div>
                      <div>分数越高，攻击可行性越低（攻击越困难）。总分区间：0-57，当前等级：{getFeasibilityLevel(feasibilityTotal)}。</div>
                    </div>
                  </section>
                )}

                {activeDrawerTab === "verification" && (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-border p-4 flex items-center justify-between">
                      <div className="text-sm font-bold">验证状态</div>
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${getVerificationBadgeClass(selectedThreat.verificationStatus)}`}>
                        {selectedThreat.verificationStatus}
                      </span>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">最近测试日期</label>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">{selectedThreat.lastTestDate || "暂无"}</div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">测试结果</label>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">{selectedThreat.lastTestResult || "暂无测试结果"}</div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">关联测试用例</label>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                        {selectedThreat.relatedTestCases.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedThreat.relatedTestCases.map((testCase) => (
                              <span key={testCase} className="inline-flex px-2 py-1 rounded border border-accent/30 bg-accent/10 text-accent font-mono text-xs">
                                {testCase}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-secondary">未关联测试用例</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">证据文档</label>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                        {selectedThreat.evidenceUrl ? (
                          <a href={selectedThreat.evidenceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            查看完整测试报告
                          </a>
                        ) : (
                          <span className="text-text-secondary">暂无证据链接</span>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </form>

              <div className="p-4 border-t border-border bg-bg flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => requestDeleteThreat(selectedThreat)}
                  className="px-4 py-2 rounded-lg border border-danger/20 text-danger font-bold text-sm hover:bg-danger/5 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDrawer(false);
                      setSelectedThreat(null);
                      setEditingThreat(null);
                    }}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg border border-border text-sm font-bold hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    关闭
                  </button>
                  <button
                    type="submit"
                    form="tara-drawer-form"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFormModal && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 !m-0"
            onClick={() => {
              if (!isSubmitting) setShowFormModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden bg-card modal-surface"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-border flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold">{editingThreat ? "编辑威胁分析" : "新增威胁分析"}</h3>
                  <p className="text-xs text-muted mt-1">{editingThreat ? "更新已存在的 TARA 记录" : "创建新的 TARA 记录"}</p>
                </div>
                <button onClick={() => setShowFormModal(false)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
                  <XCircle size={20} className="text-muted" />
                </button>
              </div>

              <form onSubmit={handleSaveThreat} className="flex-1 overflow-y-auto p-6 space-y-6">
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">闭环链路预览</h4>
                  <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-xs text-text-secondary leading-relaxed">
                    {traceabilityPreview}
                  </div>
                </section>

                <section className="space-y-4">
                  <h4 className="text-sm font-bold">基本信息</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">受影响资产 *</label>
                      <select
                        value={formState.asset}
                        onChange={(event) => setFormState((prev) => ({ ...prev, asset: event.target.value }))}
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        required
                      >
                        <option value="">请选择资产</option>
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.name}>
                            {asset.name} {asset.connection_address ? `· ${asset.connection_address}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">攻击路径 *</label>
                    <input
                      value={formState.attackPath}
                      onChange={(event) => setFormState((prev) => ({ ...prev, attackPath: event.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                      placeholder="例如：诊断接口 -> 以太网服务 -> SSH控制面"
                      required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">损害场景 *</label>
                    <p className="text-[11px] text-muted mb-2">描述攻击成功后，业务/安全会受到的影响后果。</p>
                    <textarea
                      value={formState.damageScenario}
                      onChange={(event) => setFormState((prev) => ({ ...prev, damageScenario: event.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:border-accent"
                      placeholder="例如：认证链路被绕过后，系统控制面被非授权访问"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">威胁场景 *</label>
                    <p className="text-[11px] text-muted mb-2">描述“攻击对象 + 暴露条件 + 业务影响”的完整场景。</p>
                  <textarea
                    value={formState.threatScenario}
                    onChange={(event) => setFormState((prev) => ({ ...prev, threatScenario: event.target.value }))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:border-accent"
                    placeholder="例如：日志清理或篡改导致认证异常无法追溯"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">威胁方法 (TM) *</label>
                    <p className="text-[11px] text-muted mb-2">TM 表示攻击者如何实施攻击。</p>
                    <textarea
                      value={formState.threatMethod}
                      onChange={(event) => setFormState((prev) => ({ ...prev, threatMethod: event.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:border-accent"
                      placeholder="例如：利用弱鉴权接口注入恶意请求或执行口令爆破"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary font-bold mb-2 block">损害方法 (DM) *</label>
                    <p className="text-[11px] text-muted mb-2">DM 表示攻击成功后对系统造成的具体损害。</p>
                    <textarea
                      value={formState.damageMethod}
                      onChange={(event) => setFormState((prev) => ({ ...prev, damageMethod: event.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:border-accent"
                      placeholder="例如：导致权限提升、关键服务中断或关键数据被篡改"
                      required
                    />
                  </div>
                </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-bold">影响评估 (0-3)</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      ["Safety (S)", "s", formState.s],
                      ["Financial (F)", "f", formState.f],
                      ["Operational (O)", "o", formState.o],
                      ["Privacy (P)", "p", formState.p],
                    ].map(([label, field, value]) => (
                      <div key={field as string}>
                        <label className="text-xs text-text-secondary font-bold mb-2 block">{label as string}</label>
                        <input
                          type="number"
                          min={0}
                          max={3}
                          value={value as number}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            setFormState((prev) => ({ ...prev, [field as string]: Number.isFinite(nextValue) ? nextValue : 0 }));
                          }}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-bold">可行性评估</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      ["Elapsed Time (T)", "t", formState.t, 0, 19],
                      ["Specialist Knowledge (K)", "k", formState.k, 0, 11],
                      ["Opportunity (O)", "oFeasibility", formState.oFeasibility, 0, 10],
                      ["Equipment (E)", "e", formState.e, 0, 9],
                    ].map(([label, field, value, min, max]) => (
                      <div key={field as string}>
                        <label className="text-xs text-text-secondary font-bold mb-2 block">{label as string}</label>
                        <input
                          type="number"
                          min={min as number}
                          max={max as number}
                          value={value as number}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            setFormState((prev) => ({ ...prev, [field as string]: Number.isFinite(nextValue) ? nextValue : 0 }));
                          }}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-bold">自动计算结果</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-accent/25 bg-accent/10 p-4">
                      <div className="text-xs text-accent font-bold">可行性总分</div>
                      <div className="text-2xl font-bold text-accent mt-1">{feasibilityTotal}</div>
                      <div className="text-[11px] text-accent/80 mt-1">T({formState.t}) + K({formState.k}) + O({formState.oFeasibility}) + E({formState.e})</div>
                    </div>
                    <div className="rounded-lg border border-warning/25 bg-warning/10 p-4">
                      <div className="text-xs text-warning font-bold">计算得出 CAL</div>
                      <div className="text-2xl font-bold text-warning mt-1">{currentCAL}</div>
                      <div className="text-[11px] text-warning/80 mt-1">
                        影响最高值：{impactMax} · 可行性等级：{getFeasibilityLevel(feasibilityTotal)}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-bold">处置决策与关联需求</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">处置方式 *</label>
                      <select
                        value={formState.disposalDecision}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, disposalDecision: event.target.value as DisposalDecision }))
                        }
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                      >
                        <option value="降低">降低 - 通过安全措施降低风险</option>
                        <option value="接受">接受 - 接受当前风险</option>
                        <option value="规避">规避 - 避免此风险场景</option>
                        <option value="转移">转移 - 将风险转移给第三方</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary font-bold mb-2 block">已选需求数</label>
                      <div className="h-10 px-3 rounded-lg border border-border bg-white/[0.02] flex items-center text-sm font-semibold">
                        {formState.requirementIds.length}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-white/[0.02] p-3 max-h-48 overflow-y-auto space-y-2">
                    {requirements.map((req) => (
                      <label key={req.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formState.requirementIds.includes(req.id)}
                          onChange={() => toggleRequirementSelection(req.id)}
                          className="mt-0.5"
                        />
                        <span className="leading-relaxed">
                          <span className="font-mono text-accent mr-2">{req.requirement_key}</span>
                          {req.title}
                        </span>
                      </label>
                    ))}
                    {requirements.length === 0 && <div className="text-sm text-muted">暂无可关联需求</div>}
                  </div>
                </section>

                <div className="pt-2 flex justify-end items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg border border-border text-sm font-bold hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-[#4433EE] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "保存中..." : editingThreat ? "保存修改" : "创建威胁分析"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteCandidate && (
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 !m-0"
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
              <div className="text-lg font-bold">确认删除威胁分析</div>
              <div className="mt-3 text-sm text-text-secondary leading-relaxed">
                即将删除
                <span className="mx-1 font-semibold text-text-primary">{deleteCandidate.threatId}</span>
                <span className="font-semibold text-text-primary">{deleteCandidate.threatScenario}</span>
                。
              </div>
              <div className="mt-2 text-xs text-muted">关联需求和测试用例映射也会一并删除。</div>
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
                  onClick={confirmDeleteThreat}
                  className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold hover:bg-danger/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
