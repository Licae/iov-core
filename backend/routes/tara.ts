import type { Express } from "express";
import { syncTaraAffectedAssetById } from "../services/tara-asset-sync";
import {
  assertTaraMitigationIntegrity,
  isTaraMitigatedStatus,
  markTaraChangeImpact,
  removeEntityReverificationTodos,
} from "../services/traceability-governance";
import type { SqliteDb } from "../types";

type TaraRouteDeps = {
  db: SqliteDb;
};

type TaraDetailPayload = {
  schema?: string;
  damageScenario?: string;
  threatScenario?: string;
  attackPath?: string;
  threatMethod?: string;
  damageMethod?: string;
};

type TaraItemRow = Record<string, unknown> & {
  requirement_count?: number;
  test_case_count?: number;
  linked_requirement_ids?: string | null;
  linked_test_case_ids?: string | null;
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

const parseTaraDetailPayload = (raw: unknown): TaraDetailPayload | null => {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as TaraDetailPayload;
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as TaraDetailPayload;
  } catch {
    return null;
  }
};

const validateTaraDetailPayload = (raw: unknown) => {
  const detail = parseTaraDetailPayload(raw);
  if (!detail || !/^tara-v\d+$/i.test(String(detail.schema || ""))) {
    return { valid: false, error: "description 需包含有效的 TARA 结构化 payload（schema: tara-vX）。" };
  }
  const requiredFieldMap: Array<[keyof TaraDetailPayload, string]> = [
    ["damageScenario", "损害场景"],
    ["threatScenario", "威胁场景"],
    ["attackPath", "攻击路径"],
    ["threatMethod", "威胁方法(TM)"],
    ["damageMethod", "损害方法(DM)"],
  ];
  const missingFields = requiredFieldMap
    .filter(([field]) => String(detail[field] || "").trim().length === 0)
    .map(([, label]) => label);
  if (missingFields.length > 0) {
    return { valid: false, error: `TARA 结构化字段缺失：${missingFields.join("、")}。` };
  }
  return { valid: true, error: "" };
};

export const registerTaraRoutes = (app: Express, deps: TaraRouteDeps) => {
  const { db } = deps;

  app.get("/api/tara-items", (req, res) => {
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

    const normalized = rows.map((row) => ({
      ...row,
      requirement_count: Number(row.requirement_count || 0),
      test_case_count: Number(row.test_case_count || 0),
      requirement_ids: parseCsvIds(row.linked_requirement_ids),
      test_case_ids: parseCsvIds(row.linked_test_case_ids),
    }));

    return res.json(normalized);
  });

  app.post("/api/tara-items", (req, res) => {
    const threatKey = String(req.body?.threat_key || "").trim();
    const title = String(req.body?.title || "").trim();
    const nextStatus = String(req.body?.status || "OPEN").trim() || "OPEN";
    const nextDescription = String(req.body?.description || "").trim();
    if (!threatKey || !title) {
      return res.status(400).json({ error: "threat_key and title are required" });
    }
    const validation = validateTaraDetailPayload(nextDescription);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    if (isTaraMitigatedStatus(nextStatus)) {
      return res.status(409).json({ error: "新建TARA尚未关联需求，不允许直接标记为已缓解。" });
    }

    const info = db.prepare(`
      INSERT INTO tara_items (
        threat_key, title, risk_level, status, affected_asset, attack_vector, impact, likelihood, mitigation, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      threatKey,
      title,
      String(req.body?.risk_level || "MEDIUM").trim() || "MEDIUM",
      nextStatus,
      String(req.body?.affected_asset || "").trim(),
      String(req.body?.attack_vector || "").trim(),
      String(req.body?.impact || "").trim(),
      String(req.body?.likelihood || "").trim(),
      String(req.body?.mitigation || "").trim(),
      nextDescription,
    );

    const taraId = Number(info.lastInsertRowid);
    markTaraChangeImpact(db, taraId, "TARA新建后待复验");
    return res.json({ id: taraId });
  });

  app.patch("/api/tara-items/:id", (req, res) => {
    const taraId = Number(req.params.id);
    if (!Number.isInteger(taraId) || taraId <= 0) {
      return res.status(400).json({ error: "Invalid tara id" });
    }

    const existing = db.prepare("SELECT * FROM tara_items WHERE id = ?").get(taraId) as Record<string, unknown> | undefined;
    if (!existing) {
      return res.status(404).json({ error: "TARA item not found" });
    }

    const threatKey = String(req.body?.threat_key ?? existing.threat_key ?? "").trim();
    const title = String(req.body?.title ?? existing.title ?? "").trim();
    const nextStatus = String(req.body?.status ?? existing.status ?? "OPEN").trim() || "OPEN";
    const nextDescription = String(req.body?.description ?? existing.description ?? "").trim();
    if (!threatKey || !title) {
      return res.status(400).json({ error: "threat_key and title are required" });
    }
    const validation = validateTaraDetailPayload(nextDescription);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    try {
      assertTaraMitigationIntegrity(db, taraId, nextStatus);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "TARA integrity check failed" });
    }

    db.prepare(`
      UPDATE tara_items
      SET
        threat_key = ?,
        title = ?,
        risk_level = ?,
        status = ?,
        affected_asset = ?,
        attack_vector = ?,
        impact = ?,
        likelihood = ?,
        mitigation = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      threatKey,
      title,
      String(req.body?.risk_level ?? existing.risk_level ?? "MEDIUM").trim() || "MEDIUM",
      nextStatus,
      String(req.body?.affected_asset ?? existing.affected_asset ?? "").trim(),
      String(req.body?.attack_vector ?? existing.attack_vector ?? "").trim(),
      String(req.body?.impact ?? existing.impact ?? "").trim(),
      String(req.body?.likelihood ?? existing.likelihood ?? "").trim(),
      String(req.body?.mitigation ?? existing.mitigation ?? "").trim(),
      nextDescription,
      taraId,
    );
    markTaraChangeImpact(db, taraId, "TARA内容变更后待复验");

    return res.json({ success: true });
  });

  app.delete("/api/tara-items/:id", (req, res) => {
    const taraId = Number(req.params.id);
    if (!Number.isInteger(taraId) || taraId <= 0) {
      return res.status(400).json({ error: "Invalid tara id" });
    }

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM requirement_tara_links WHERE tara_id = ?").run(taraId);
      db.prepare("DELETE FROM test_case_tara_links WHERE tara_id = ?").run(taraId);
      db.prepare("DELETE FROM tara_items WHERE id = ?").run(taraId);
    });
    transaction();
    removeEntityReverificationTodos(db, "TARA", taraId);

    return res.json({ success: true });
  });

  app.get("/api/tara-items/:id/links", (req, res) => {
    const taraId = Number(req.params.id);
    if (!Number.isInteger(taraId) || taraId <= 0) {
      return res.status(400).json({ error: "Invalid tara id" });
    }

    const requirementIds = db
      .prepare("SELECT requirement_id FROM requirement_tara_links WHERE tara_id = ? ORDER BY requirement_id ASC")
      .all(taraId)
      .map((row: { requirement_id: number }) => row.requirement_id);

    const testCaseIds = db
      .prepare("SELECT test_case_id FROM test_case_tara_links WHERE tara_id = ? ORDER BY test_case_id ASC")
      .all(taraId)
      .map((row: { test_case_id: number }) => row.test_case_id);

    return res.json({
      tara_id: taraId,
      requirement_ids: requirementIds,
      test_case_ids: testCaseIds,
    });
  });

  app.put("/api/tara-items/:id/links", (req, res) => {
    const taraId = Number(req.params.id);
    if (!Number.isInteger(taraId) || taraId <= 0) {
      return res.status(400).json({ error: "Invalid tara id" });
    }

    const hasRequirementIds = Array.isArray(req.body?.requirement_ids);
    const hasTestCaseIds = Array.isArray(req.body?.test_case_ids);
    if (!hasRequirementIds && !hasTestCaseIds) {
      return res.status(400).json({ error: "At least one link field is required" });
    }

    const requirementIds = parseIdArray(req.body?.requirement_ids);
    const testCaseIds = parseIdArray(req.body?.test_case_ids);

    const transaction = db.transaction(() => {
      if (hasRequirementIds) {
        db.prepare("DELETE FROM requirement_tara_links WHERE tara_id = ?").run(taraId);
        requirementIds.forEach((requirementId) => {
          db.prepare("INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id) VALUES (?, ?)").run(requirementId, taraId);
        });
      }
      if (hasTestCaseIds) {
        db.prepare("DELETE FROM test_case_tara_links WHERE tara_id = ?").run(taraId);
        testCaseIds.forEach((testCaseId) => {
          db.prepare("INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id) VALUES (?, ?)").run(testCaseId, taraId);
        });
      }
    });
    transaction();

    // Keep TARA impacted asset in sync with linked requirement assets.
    syncTaraAffectedAssetById(db, taraId);
    markTaraChangeImpact(db, taraId, "TARA关联关系变更后待复验");

    const requirement_ids = db
      .prepare("SELECT requirement_id FROM requirement_tara_links WHERE tara_id = ? ORDER BY requirement_id ASC")
      .all(taraId)
      .map((row: { requirement_id: number }) => row.requirement_id);
    const test_case_ids = db
      .prepare("SELECT test_case_id FROM test_case_tara_links WHERE tara_id = ? ORDER BY test_case_id ASC")
      .all(taraId)
      .map((row: { test_case_id: number }) => row.test_case_id);

    return res.json({
      success: true,
      tara_id: taraId,
      requirement_ids,
      test_case_ids,
    });
  });
};
