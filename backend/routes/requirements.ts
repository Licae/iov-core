import type { Express } from "express";
import { syncTaraAffectedAssetsForRequirement } from "../services/tara-asset-sync";
import {
  assertRequirementClosureIntegrity,
  isRequirementClosedStatus,
  listPendingReverificationTodos,
  markRequirementChangeImpact,
  removeEntityReverificationTodos,
} from "../services/traceability-governance";

type RequirementRouteDeps = {
  db: any;
};

const parseIdArray = (value: unknown) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );

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

export const registerRequirementRoutes = (app: Express, deps: RequirementRouteDeps) => {
  const { db } = deps;
  const EVIDENCE_EXPIRY_DAYS = Math.max(1, Number(process.env.COVERAGE_EVIDENCE_EXPIRY_DAYS || "14"));

  app.get("/api/requirements", (req, res) => {
    const assetId = Number(req.query.asset_id);
    const hasAssetFilter = Number.isInteger(assetId) && assetId > 0;
    const sql = `
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
      ${hasAssetFilter ? "WHERE EXISTS (SELECT 1 FROM requirement_assets ras WHERE ras.requirement_id = r.id AND ras.asset_id = ?)" : ""}
      ORDER BY r.created_at DESC, r.id DESC
    `;
    const rows = hasAssetFilter ? db.prepare(sql).all(assetId) : db.prepare(sql).all();

    const normalized = rows.map((row: any) => {
      const {
        linked_test_case_ids,
        linked_tara_ids,
        linked_asset_ids,
        ...rest
      } = row || {};
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

    res.json(normalized);
  });

  app.get("/api/requirements/coverage-matrix", (req, res) => {
    const assetId = Number(req.query.asset_id);
    const hasAssetFilter = Number.isInteger(assetId) && assetId > 0;
    const sql = `
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
      ${hasAssetFilter ? "WHERE a.id = ?" : ""}
      ORDER BY (a.name IS NULL) ASC, a.name ASC, r.id ASC
    `;
    const rows = hasAssetFilter ? db.prepare(sql).all(assetId) : db.prepare(sql).all();

    const normalized = rows.map((row: any) => {
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
      const evidenceExpired = hasRecentEvidence && evidenceAgeMs > EVIDENCE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const pendingReverificationCount = Number(row?.pending_reverification_count || 0);
      const pendingReasons = String(row?.pending_reverification_reasons || "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean);
      const needsReverification = pendingReverificationCount > 0 || String(row?.requirement_verification_status || "").toUpperCase() === "PENDING_REVERIFICATION";
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
        evidence_expiry_days: EVIDENCE_EXPIRY_DAYS,
        pending_reverification_count: pendingReverificationCount,
        pending_reverification_reasons: pendingReasons,
        quality_tier: qualityTier,
        closure_status: gapReasons.length === 0 ? "COVERED" : "GAP",
        gap_reasons: gapReasons,
      };
    });

    const uncovered = normalized.filter((item: any) => item.closure_status === "GAP");
    const uniqueAssets = new Set(
      normalized
        .map((item: any) => Number(item.asset_id || 0))
        .filter((value: number) => value > 0),
    );

    return res.json({
      summary: {
        total: normalized.length,
        covered: normalized.filter((item: any) => item.closure_status === "COVERED").length,
        gap: uncovered.length,
        asset_count: uniqueAssets.size,
        pending_reverification: normalized.filter((item: any) => Number(item.pending_reverification_count || 0) > 0).length,
      },
      rows: normalized,
      uncovered,
    });
  });

  app.get("/api/reverification-todos", (_req, res) => {
    return res.json({
      todos: listPendingReverificationTodos(db),
    });
  });

  app.post("/api/requirements", (req, res) => {
    const requirementKey = String(req.body?.requirement_key || "").trim();
    const title = String(req.body?.title || "").trim();
    const nextStatus = String(req.body?.status || "OPEN").trim() || "OPEN";
    if (!requirementKey || !title) {
      return res.status(400).json({ error: "requirement_key and title are required" });
    }
    if (isRequirementClosedStatus(nextStatus)) {
      return res.status(409).json({ error: "新建需求尚未绑定资产，不允许直接标记为已闭环。" });
    }

    const info = db.prepare(`
      INSERT INTO requirements (
        requirement_key, title, category, priority, status, owner, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      requirementKey,
      title,
      String(req.body?.category || "通用").trim() || "通用",
      String(req.body?.priority || "P2").trim() || "P2",
      nextStatus,
      String(req.body?.owner || "").trim(),
      String(req.body?.description || "").trim(),
    );

    const requirementId = Number(info.lastInsertRowid);
    markRequirementChangeImpact(db, requirementId, "需求新建后待复验");
    return res.json({ id: requirementId });
  });

  app.patch("/api/requirements/:id", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }

    const existing = db.prepare("SELECT * FROM requirements WHERE id = ?").get(requirementId) as Record<string, unknown> | undefined;
    if (!existing) {
      return res.status(404).json({ error: "Requirement not found" });
    }

    const requirementKey = String(req.body?.requirement_key ?? existing.requirement_key ?? "").trim();
    const title = String(req.body?.title ?? existing.title ?? "").trim();
    const nextStatus = String(req.body?.status ?? existing.status ?? "OPEN").trim() || "OPEN";
    if (!requirementKey || !title) {
      return res.status(400).json({ error: "requirement_key and title are required" });
    }
    try {
      assertRequirementClosureIntegrity(db, requirementId, nextStatus);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "Requirement integrity check failed" });
    }

    db.prepare(`
      UPDATE requirements
      SET
        requirement_key = ?,
        title = ?,
        category = ?,
        priority = ?,
        status = ?,
        owner = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      requirementKey,
      title,
      String(req.body?.category ?? existing.category ?? "通用").trim() || "通用",
      String(req.body?.priority ?? existing.priority ?? "P2").trim() || "P2",
      nextStatus,
      String(req.body?.owner ?? existing.owner ?? "").trim(),
      String(req.body?.description ?? existing.description ?? "").trim(),
      requirementId,
    );
    markRequirementChangeImpact(db, requirementId, "需求内容变更后待复验");

    return res.json({ success: true });
  });

  app.delete("/api/requirements/:id", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM requirement_tara_links WHERE requirement_id = ?").run(requirementId);
      db.prepare("DELETE FROM test_case_requirements WHERE requirement_id = ?").run(requirementId);
      db.prepare("DELETE FROM requirement_assets WHERE requirement_id = ?").run(requirementId);
      db.prepare("DELETE FROM requirements WHERE id = ?").run(requirementId);
    });
    transaction();
    removeEntityReverificationTodos(db, "REQUIREMENT", requirementId);

    return res.json({ success: true });
  });

  app.get("/api/requirements/:id/links", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }

    const testCaseIds = db
      .prepare("SELECT test_case_id FROM test_case_requirements WHERE requirement_id = ? ORDER BY test_case_id ASC")
      .all(requirementId)
      .map((row: { test_case_id: number }) => row.test_case_id);

    const taraIds = db
      .prepare("SELECT tara_id FROM requirement_tara_links WHERE requirement_id = ? ORDER BY tara_id ASC")
      .all(requirementId)
      .map((row: { tara_id: number }) => row.tara_id);

    return res.json({
      requirement_id: requirementId,
      test_case_ids: testCaseIds,
      tara_ids: taraIds,
    });
  });

  app.get("/api/requirements/:id/assets", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }

    const assetIds = db
      .prepare("SELECT asset_id FROM requirement_assets WHERE requirement_id = ? ORDER BY asset_id ASC")
      .all(requirementId)
      .map((row: { asset_id: number }) => row.asset_id);

    return res.json({
      requirement_id: requirementId,
      asset_ids: assetIds,
    });
  });

  app.put("/api/requirements/:id/links", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }

    const hasTestCaseIds = Array.isArray(req.body?.test_case_ids);
    const hasTaraIds = Array.isArray(req.body?.tara_ids);
    if (!hasTestCaseIds && !hasTaraIds) {
      return res.status(400).json({ error: "At least one link field is required" });
    }

    const testCaseIds = parseIdArray(req.body?.test_case_ids);
    const taraIds = parseIdArray(req.body?.tara_ids);

    const transaction = db.transaction(() => {
      if (hasTestCaseIds) {
        db.prepare("DELETE FROM test_case_requirements WHERE requirement_id = ?").run(requirementId);
        testCaseIds.forEach((testCaseId) => {
          db.prepare("INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id) VALUES (?, ?)").run(testCaseId, requirementId);
        });
      }
      if (hasTaraIds) {
        db.prepare("DELETE FROM requirement_tara_links WHERE requirement_id = ?").run(requirementId);
        taraIds.forEach((taraId) => {
          db.prepare("INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id) VALUES (?, ?)").run(requirementId, taraId);
        });
      }
    });
    transaction();
    if (hasTaraIds) {
      syncTaraAffectedAssetsForRequirement(db, requirementId);
    }
    markRequirementChangeImpact(db, requirementId, "需求关联关系变更后待复验");

    const test_case_ids = db
      .prepare("SELECT test_case_id FROM test_case_requirements WHERE requirement_id = ? ORDER BY test_case_id ASC")
      .all(requirementId)
      .map((row: { test_case_id: number }) => row.test_case_id);
    const tara_ids = db
      .prepare("SELECT tara_id FROM requirement_tara_links WHERE requirement_id = ? ORDER BY tara_id ASC")
      .all(requirementId)
      .map((row: { tara_id: number }) => row.tara_id);

    return res.json({
      success: true,
      requirement_id: requirementId,
      test_case_ids,
      tara_ids,
    });
  });

  app.put("/api/requirements/:id/assets", (req, res) => {
    const requirementId = Number(req.params.id);
    if (!Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(400).json({ error: "Invalid requirement id" });
    }
    const hasAssetIds = Array.isArray(req.body?.asset_ids);
    if (!hasAssetIds) {
      return res.status(400).json({ error: "asset_ids is required" });
    }

    const assetIds = parseIdArray(req.body?.asset_ids);
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM requirement_assets WHERE requirement_id = ?").run(requirementId);
      assetIds.forEach((assetId) => {
        db.prepare("INSERT OR IGNORE INTO requirement_assets (requirement_id, asset_id, applicability) VALUES (?, ?, 'APPLICABLE')").run(requirementId, assetId);
      });
    });
    transaction();

    // Propagate requirement asset changes to linked TARA items.
    syncTaraAffectedAssetsForRequirement(db, requirementId);
    markRequirementChangeImpact(db, requirementId, "需求资产适用范围变更后待复验");

    return res.json({
      success: true,
      requirement_id: requirementId,
      asset_ids: assetIds,
    });
  });
};
