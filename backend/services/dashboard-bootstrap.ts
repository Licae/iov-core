import type { ExecutionTaskService } from "../execution/execution-task-service";
import type { SqliteDb } from "../types";

type DashboardBootstrapOptions = {
  db: SqliteDb;
  listExecutionTasks: () => ReturnType<ExecutionTaskService["listExecutionTasks"]>;
  listTestSuites: () => ReturnType<ExecutionTaskService["listTestSuites"]>;
  listSuiteRuns: () => ReturnType<ExecutionTaskService["listSuiteRuns"]>;
};

type TrendRow = {
  date: string;
  total: number;
  passed: number;
};

type CoverageRow = {
  name: string;
  total: number;
  passed: number;
};

type RequirementRow = Record<string, unknown> & {
  linked_test_case_ids?: string | null;
  linked_tara_ids?: string | null;
  linked_asset_ids?: string | null;
  test_case_count?: number;
  tara_count?: number;
  asset_count?: number;
};

type RequirementCoverageQueryRow = {
  requirement_id?: number;
  requirement_key?: string;
  requirement_title?: string;
  requirement_verification_status?: string | null;
  satisfaction_status?: string | null;
  asset_id?: number | null;
  asset_name?: string | null;
  tara_count?: number;
  test_case_count?: number;
  latest_result?: string | null;
  latest_result_at?: string | null;
  pending_reverification_count?: number;
  pending_reverification_reasons?: string | null;
};

type RequirementCoverageItem = {
  requirement_id: number;
  requirement_key: string;
  requirement_title: string;
  asset_id: number | null;
  asset_name: string | null;
  tara_covered: boolean;
  test_case_covered: boolean;
  satisfaction_status: string;
  verification_status: string;
  latest_result: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | null;
  latest_result_at: string | null;
  has_recent_evidence: boolean;
  evidence_expired: boolean;
  evidence_expiry_days: number;
  pending_reverification_count: number;
  pending_reverification_reasons: string[];
  quality_tier: "LINK_MISSING" | "NO_EVIDENCE" | "EVIDENCE_EXPIRED" | "PENDING_REVERIFICATION" | "VERIFIED_PASS" | "VERIFIED_FAIL";
  closure_status: "COVERED" | "GAP";
  gap_reasons: string[];
};

type TaraItemRow = Record<string, unknown> & {
  requirement_count?: number;
  test_case_count?: number;
  linked_requirement_ids?: string | null;
  linked_test_case_ids?: string | null;
};

const parseCsvIds = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

const normalizeResult = (value: unknown): "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | null => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED" || normalized === "FAILED" || normalized === "BLOCKED" || normalized === "ERROR") {
    return normalized;
  }
  return null;
};

const loadTestCases = (db: SqliteDb) =>
  db.prepare(`
    SELECT
      tc.*,
      (
        SELECT COUNT(*)
        FROM test_case_requirements tcr
        WHERE tcr.test_case_id = tc.id
      ) AS requirement_count,
      (
        SELECT COUNT(*)
        FROM test_case_tara_links tctl
        WHERE tctl.test_case_id = tc.id
      ) AS tara_count
    FROM test_cases tc
    ORDER BY tc.created_at DESC
  `).all();

const loadStats = (db: SqliteDb) => ({
  total: db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count,
  automated: db.prepare("SELECT COUNT(*) as count FROM test_cases WHERE type = 'Automated'").get().count,
  manual: db.prepare("SELECT COUNT(*) as count FROM test_cases WHERE type = 'Manual'").get().count,
  results: db.prepare("SELECT result, COUNT(*) as count FROM test_runs GROUP BY result").all(),
});

const loadTrend = (db: SqliteDb) => {
  const trend = db.prepare(`
    SELECT
      date(executed_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN result = 'PASSED' THEN 1 ELSE 0 END) as passed
    FROM test_runs
    WHERE executed_at >= date('now', '-7 days')
    GROUP BY date(executed_at)
    ORDER BY date ASC
  `).all() as TrendRow[];

  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return trend.map((item) => ({
    date: days[new Date(item.date).getDay()],
    passRate: item.total > 0 ? Math.round((item.passed / item.total) * 100) : 0,
    runs: item.total,
  }));
};

const loadCoverage = (db: SqliteDb) => {
  const coverage = db.prepare(`
    SELECT
      category as name,
      COUNT(*) as total,
      SUM(CASE WHEN UPPER(status) = 'PASSED' THEN 1 ELSE 0 END) as passed
    FROM test_cases
    GROUP BY category
  `).all() as CoverageRow[];

  return coverage.map((item) => ({
    name: item.name,
    coverage: item.total > 0 ? Math.round((item.passed / item.total) * 100) : 0,
    status: (item.passed / item.total) > 0.8 ? "Passed" : (item.passed / item.total) > 0.5 ? "Warning" : "Critical",
  }));
};

const loadDefects = (db: SqliteDb) => db.prepare("SELECT * FROM defects ORDER BY created_at DESC").all();

const loadAssets = (db: SqliteDb) =>
  db.prepare(`
    SELECT
      id,
      name,
      status,
      type,
      COALESCE(NULLIF(hardware_version, ''), '-') as hardware_version,
      COALESCE(NULLIF(software_version, ''), NULLIF(version, ''), 'v1.0.0') as software_version,
      COALESCE(connection_address, '') as connection_address,
      COALESCE(description, '') as description,
      created_at
    FROM assets
    ORDER BY created_at DESC
  `).all();

const loadSettings = (db: SqliteDb) => {
  const settings = db.prepare("SELECT * FROM settings").all();
  return settings.reduce((acc: Record<string, boolean>, curr: { key: string; value: string }) => {
    acc[curr.key] = curr.value === "true";
    return acc;
  }, {});
};

const loadRequirements = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT
      r.*,
      (
        SELECT COUNT(*)
        FROM test_case_requirements tcr
        WHERE tcr.requirement_id = r.id
      ) AS test_case_count,
      (
        SELECT COUNT(*)
        FROM requirement_tara_links rtl
        WHERE rtl.requirement_id = r.id
      ) AS tara_count,
      (
        SELECT COUNT(*)
        FROM requirement_assets ras
        WHERE ras.requirement_id = r.id
      ) AS asset_count,
      (
        SELECT GROUP_CONCAT(tcr.test_case_id)
        FROM test_case_requirements tcr
        WHERE tcr.requirement_id = r.id
      ) AS linked_test_case_ids,
      (
        SELECT GROUP_CONCAT(rtl.tara_id)
        FROM requirement_tara_links rtl
        WHERE rtl.requirement_id = r.id
      ) AS linked_tara_ids,
      (
        SELECT GROUP_CONCAT(ras.asset_id)
        FROM requirement_assets ras
        WHERE ras.requirement_id = r.id
      ) AS linked_asset_ids
    FROM requirements r
    ORDER BY r.created_at DESC, r.id DESC
  `).all() as RequirementRow[];

  return rows.map((row) => {
    const { linked_test_case_ids, linked_tara_ids, linked_asset_ids, ...rest } = row || {};
    return {
      ...rest,
      test_case_count: Number(row.test_case_count || 0),
      tara_count: Number(row.tara_count || 0),
      asset_count: Number(row.asset_count || 0),
      test_case_ids: parseCsvIds(linked_test_case_ids),
      tara_ids: parseCsvIds(linked_tara_ids),
      asset_ids: parseCsvIds(linked_asset_ids),
    };
  });
};

const loadRequirementCoverage = (db: SqliteDb) => {
  const evidenceExpiryDays = Math.max(1, Number(process.env.COVERAGE_EVIDENCE_EXPIRY_DAYS || "14"));
  const rows = db.prepare(`
    SELECT
      r.id AS requirement_id,
      r.requirement_key,
      r.title AS requirement_title,
      r.verification_status AS requirement_verification_status,
      r.satisfaction_status,
      a.id AS asset_id,
      a.name AS asset_name,
      (
        SELECT COUNT(*)
        FROM requirement_tara_links rtl
        WHERE rtl.requirement_id = r.id
      ) AS tara_count,
      (
        SELECT COUNT(*)
        FROM test_case_requirements tcr
        WHERE tcr.requirement_id = r.id
      ) AS test_case_count,
      (
        SELECT tr.result
        FROM test_case_requirements tcr
        JOIN execution_task_items eti ON eti.test_case_id = tcr.test_case_id AND eti.run_id IS NOT NULL
        JOIN execution_tasks et ON et.id = eti.task_id
        JOIN test_runs tr ON tr.id = eti.run_id
        WHERE tcr.requirement_id = r.id
          AND (
            (a.id IS NOT NULL AND et.asset_id = a.id)
            OR (a.id IS NULL)
          )
        ORDER BY datetime(tr.executed_at) DESC, tr.id DESC
        LIMIT 1
      ) AS latest_result,
      (
        SELECT tr.executed_at
        FROM test_case_requirements tcr
        JOIN execution_task_items eti ON eti.test_case_id = tcr.test_case_id AND eti.run_id IS NOT NULL
        JOIN execution_tasks et ON et.id = eti.task_id
        JOIN test_runs tr ON tr.id = eti.run_id
        WHERE tcr.requirement_id = r.id
          AND (
            (a.id IS NOT NULL AND et.asset_id = a.id)
            OR (a.id IS NULL)
          )
        ORDER BY datetime(tr.executed_at) DESC, tr.id DESC
        LIMIT 1
      ) AS latest_result_at,
      (
        SELECT COUNT(*)
        FROM reverification_todos rt
        WHERE rt.entity_type = 'REQUIREMENT'
          AND rt.entity_id = r.id
          AND rt.status = 'PENDING'
      ) AS pending_reverification_count,
      (
        SELECT GROUP_CONCAT(rt.reason, '；')
        FROM reverification_todos rt
        WHERE rt.entity_type = 'REQUIREMENT'
          AND rt.entity_id = r.id
          AND rt.status = 'PENDING'
      ) AS pending_reverification_reasons
    FROM requirements r
    LEFT JOIN requirement_assets ras ON ras.requirement_id = r.id
    LEFT JOIN assets a ON a.id = ras.asset_id
    ORDER BY (a.name IS NULL) ASC, a.name ASC, r.id ASC
  `).all() as RequirementCoverageQueryRow[];

  const normalized: RequirementCoverageItem[] = rows.map((row) => {
    const toTimestamp = (value?: string | null) => {
      if (!value) return 0;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const taraCovered = Number(row?.tara_count || 0) > 0;
    const testCaseCovered = Number(row?.test_case_count || 0) > 0;
    const latestResult = normalizeResult(row?.latest_result);
    const latestResultAt = row?.latest_result_at ? String(row.latest_result_at) : null;
    const hasRecentEvidence = Boolean(latestResult && latestResultAt);
    const evidenceAgeMs = latestResultAt ? Date.now() - toTimestamp(latestResultAt) : Number.POSITIVE_INFINITY;
    const evidenceExpired = hasRecentEvidence && evidenceAgeMs > evidenceExpiryDays * 24 * 60 * 60 * 1000;
    const pendingReverificationCount = Number(row?.pending_reverification_count || 0);
    const pendingReasons = String(row?.pending_reverification_reasons || "")
      .split("；")
      .map((item) => item.trim())
      .filter(Boolean);
    const needsReverification =
      pendingReverificationCount > 0 || String(row?.requirement_verification_status || "").toUpperCase() === "PENDING_REVERIFICATION";
    const gapReasons: string[] = [];

    if (!row?.asset_id) gapReasons.push("未绑定资产");
    if (!taraCovered) gapReasons.push("未关联TARA");
    if (!testCaseCovered) gapReasons.push("未关联测试用例");
    if (!hasRecentEvidence) {
      gapReasons.push("暂无执行记录");
    } else if (evidenceExpired) {
      gapReasons.push("执行证据已过期");
    } else if (latestResult !== "PASSED") {
      gapReasons.push(`最近执行结果为 ${latestResult}`);
    }
    if (needsReverification) {
      if (pendingReasons.length > 0) {
        pendingReasons.forEach((reason) => gapReasons.push(`待复验: ${reason}`));
      } else {
        gapReasons.push("变更后待复验");
      }
    }

    let qualityTier: "LINK_MISSING" | "NO_EVIDENCE" | "EVIDENCE_EXPIRED" | "PENDING_REVERIFICATION" | "VERIFIED_PASS" | "VERIFIED_FAIL" = "LINK_MISSING";
    if (needsReverification) {
      qualityTier = "PENDING_REVERIFICATION";
    } else if (!row?.asset_id || !taraCovered || !testCaseCovered) {
      qualityTier = "LINK_MISSING";
    } else if (!hasRecentEvidence) {
      qualityTier = "NO_EVIDENCE";
    } else if (evidenceExpired) {
      qualityTier = "EVIDENCE_EXPIRED";
    } else if (latestResult === "PASSED") {
      qualityTier = "VERIFIED_PASS";
    } else {
      qualityTier = "VERIFIED_FAIL";
    }

    return {
      requirement_id: Number(row?.requirement_id || 0),
      requirement_key: String(row?.requirement_key || ""),
      requirement_title: String(row?.requirement_title || ""),
      asset_id: row?.asset_id ? Number(row.asset_id) : null,
      asset_name: row?.asset_name ? String(row.asset_name) : null,
      tara_covered: taraCovered,
      test_case_covered: testCaseCovered,
      satisfaction_status: String(row?.satisfaction_status || "UNKNOWN"),
      verification_status: String(row?.requirement_verification_status || "VERIFIED"),
      latest_result: latestResult,
      latest_result_at: latestResultAt,
      has_recent_evidence: hasRecentEvidence,
      evidence_expired: evidenceExpired,
      evidence_expiry_days: evidenceExpiryDays,
      pending_reverification_count: pendingReverificationCount,
      pending_reverification_reasons: pendingReasons,
      quality_tier: qualityTier,
      closure_status: gapReasons.length === 0 ? "COVERED" : "GAP",
      gap_reasons: gapReasons,
    };
  });

  const uncovered = normalized.filter((item) => item.closure_status === "GAP");
  const uniqueAssets = new Set(
    normalized
      .map((item) => Number(item.asset_id || 0))
      .filter((value: number) => value > 0),
  );

  return {
    summary: {
      total: normalized.length,
      covered: normalized.filter((item) => item.closure_status === "COVERED").length,
      gap: uncovered.length,
      asset_count: uniqueAssets.size,
      pending_reverification: normalized.filter((item) => Number(item.pending_reverification_count || 0) > 0).length,
    },
    rows: normalized,
    uncovered,
  };
};

const loadTaraItems = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT
      t.*,
      (
        SELECT COUNT(*)
        FROM requirement_tara_links rtl
        WHERE rtl.tara_id = t.id
      ) AS requirement_count,
      (
        SELECT COUNT(*)
        FROM test_case_tara_links tctl
        WHERE tctl.tara_id = t.id
      ) AS test_case_count,
      (
        SELECT GROUP_CONCAT(rtl.requirement_id)
        FROM requirement_tara_links rtl
        WHERE rtl.tara_id = t.id
      ) AS linked_requirement_ids,
      (
        SELECT GROUP_CONCAT(tctl.test_case_id)
        FROM test_case_tara_links tctl
        WHERE tctl.tara_id = t.id
      ) AS linked_test_case_ids
    FROM tara_items t
    ORDER BY t.threat_key ASC, t.id ASC
  `).all() as TaraItemRow[];

  return rows.map((row) => ({
    ...row,
    requirement_count: Number(row.requirement_count || 0),
    test_case_count: Number(row.test_case_count || 0),
    requirement_ids: parseCsvIds(row.linked_requirement_ids),
    test_case_ids: parseCsvIds(row.linked_test_case_ids),
  }));
};

const loadRecentRuns = (db: SqliteDb) =>
  db.prepare(`
    SELECT
      tr.id,
      tr.test_case_id,
      tr.result,
      tr.logs,
      tr.duration,
      tr.executed_by,
      tr.executed_at,
      tc.title as test_case_title,
      tc.category,
      tc.protocol,
      tc.status as test_case_status,
      et.id as task_id,
      et.type as task_type,
      et.status as task_status,
      a.name as asset_name
    FROM test_runs tr
    JOIN test_cases tc ON tc.id = tr.test_case_id
    LEFT JOIN execution_task_items eti ON eti.run_id = tr.id
    LEFT JOIN execution_tasks et ON et.id = eti.task_id
    LEFT JOIN assets a ON a.id = et.asset_id
    ORDER BY tr.executed_at DESC, tr.id DESC
    LIMIT 10
  `).all();

export const buildDashboardBootstrap = (options: DashboardBootstrapOptions) => {
  const { db, listExecutionTasks, listTestSuites, listSuiteRuns } = options;

  return {
    testCases: loadTestCases(db),
    stats: loadStats(db),
    trendData: loadTrend(db),
    coverageData: loadCoverage(db),
    defects: loadDefects(db),
    assets: loadAssets(db),
    settings: loadSettings(db),
    requirements: loadRequirements(db),
    requirementCoverage: loadRequirementCoverage(db),
    taraItems: loadTaraItems(db),
    testSuites: listTestSuites(),
    suiteRuns: listSuiteRuns(),
    executionTasks: listExecutionTasks(),
    recentRuns: loadRecentRuns(db),
  };
};
