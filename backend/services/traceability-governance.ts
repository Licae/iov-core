import type { SqliteDb } from "../types";

type ReverificationEntityType = "REQUIREMENT" | "TARA" | "TEST_CASE";

type ReverificationReason = {
  reason: string;
  sourceEntityType?: ReverificationEntityType;
  sourceEntityId?: number | null;
};

type BaselineCaseValidation = {
  testCaseId: number;
  title: string;
  valid: boolean;
  reason?: string;
  missingInputs?: string[];
};

const PENDING_REVERIFICATION = "PENDING_REVERIFICATION";
const VERIFIED = "VERIFIED";

const REQUIREMENT_CLOSED_STATUS = new Set([
  "CLOSED",
  "COVERED",
  "SATISFIED",
  "DONE",
  "已闭环",
  "已满足",
]);

const TARA_MITIGATED_STATUS = new Set([
  "MITIGATED",
  "CLOSED",
  "DONE",
  "已缓解",
  "已闭环",
]);

const normalizeStatusToken = (value: unknown) => String(value || "").trim().toUpperCase();

const parseJsonArray = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseJsonObject = (value?: string | null): Record<string, string> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, raw]) => [key, String(raw ?? "").trim()] as const)
        .filter(([key]) => key.trim() !== ""),
    );
  } catch {
    return {};
  }
};

const updateEntityVerificationStatus = (
  db: SqliteDb,
  entityType: ReverificationEntityType,
  entityId: number,
  verificationStatus: typeof PENDING_REVERIFICATION | typeof VERIFIED,
) => {
  if (!Number.isInteger(entityId) || entityId <= 0) return;

  if (entityType === "REQUIREMENT") {
    db.prepare(`
      UPDATE requirements
      SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(verificationStatus, entityId);
    return;
  }

  if (entityType === "TARA") {
    db.prepare(`
      UPDATE tara_items
      SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(verificationStatus, entityId);
    return;
  }

  db.prepare(`
    UPDATE test_cases
    SET verification_status = ?
    WHERE id = ?
  `).run(verificationStatus, entityId);
};

const upsertPendingReverificationTodo = (
  db: SqliteDb,
  entityType: ReverificationEntityType,
  entityId: number,
  metadata: ReverificationReason,
) => {
  if (!Number.isInteger(entityId) || entityId <= 0) return;
  const nextReason = String(metadata.reason || "").trim();
  if (!nextReason) return;

  const existing = db.prepare(`
    SELECT id, reason
    FROM reverification_todos
    WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'
    ORDER BY id DESC
    LIMIT 1
  `).get(entityType, entityId) as { id: number; reason?: string | null } | undefined;

  if (existing?.id) {
    const reasonTokens = String(existing.reason || "")
      .split("；")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!reasonTokens.includes(nextReason)) {
      reasonTokens.push(nextReason);
    }
    db.prepare(`
      UPDATE reverification_todos
      SET reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reasonTokens.join("；"), existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO reverification_todos (
      entity_type, entity_id, reason, status, source_entity_type, source_entity_id
    ) VALUES (?, ?, ?, 'PENDING', ?, ?)
  `).run(
    entityType,
    entityId,
    nextReason,
    metadata.sourceEntityType || null,
    Number.isInteger(metadata.sourceEntityId || 0) ? metadata.sourceEntityId : null,
  );
};

const markEntityPendingReverification = (
  db: SqliteDb,
  entityType: ReverificationEntityType,
  entityId: number,
  metadata: ReverificationReason,
) => {
  updateEntityVerificationStatus(db, entityType, entityId, PENDING_REVERIFICATION);
  upsertPendingReverificationTodo(db, entityType, entityId, metadata);
};

const resolveEntityPendingReverification = (
  db: SqliteDb,
  entityType: ReverificationEntityType,
  entityId: number,
) => {
  if (!Number.isInteger(entityId) || entityId <= 0) return;
  updateEntityVerificationStatus(db, entityType, entityId, VERIFIED);
  db.prepare(`
    UPDATE reverification_todos
    SET status = 'RESOLVED',
        resolved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'
  `).run(entityType, entityId);
};

const queryLinkedRequirementIdsByTara = (db: SqliteDb, taraId: number) =>
  db
    .prepare("SELECT requirement_id FROM requirement_tara_links WHERE tara_id = ? ORDER BY requirement_id ASC")
    .all(taraId)
    .map((row: { requirement_id: number }) => Number(row.requirement_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const queryLinkedRequirementIdsByTestCase = (db: SqliteDb, testCaseId: number) =>
  db
    .prepare("SELECT requirement_id FROM test_case_requirements WHERE test_case_id = ? ORDER BY requirement_id ASC")
    .all(testCaseId)
    .map((row: { requirement_id: number }) => Number(row.requirement_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const queryLinkedTaraIdsByRequirement = (db: SqliteDb, requirementId: number) =>
  db
    .prepare("SELECT tara_id FROM requirement_tara_links WHERE requirement_id = ? ORDER BY tara_id ASC")
    .all(requirementId)
    .map((row: { tara_id: number }) => Number(row.tara_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const queryLinkedTaraIdsByTestCase = (db: SqliteDb, testCaseId: number) =>
  db
    .prepare("SELECT tara_id FROM test_case_tara_links WHERE test_case_id = ? ORDER BY tara_id ASC")
    .all(testCaseId)
    .map((row: { tara_id: number }) => Number(row.tara_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const queryLinkedTestCaseIdsByRequirement = (db: SqliteDb, requirementId: number) =>
  db
    .prepare("SELECT test_case_id FROM test_case_requirements WHERE requirement_id = ? ORDER BY test_case_id ASC")
    .all(requirementId)
    .map((row: { test_case_id: number }) => Number(row.test_case_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const queryLinkedTestCaseIdsByTara = (db: SqliteDb, taraId: number) =>
  db
    .prepare("SELECT test_case_id FROM test_case_tara_links WHERE tara_id = ? ORDER BY test_case_id ASC")
    .all(taraId)
    .map((row: { test_case_id: number }) => Number(row.test_case_id))
    .filter((id: number) => Number.isInteger(id) && id > 0);

const deriveSatisfactionStatus = (result: string) => {
  if (result === "PASSED") return "SATISFIED";
  if (result === "PENDING_REVERIFICATION") return "PENDING_REVERIFICATION";
  return "UNSATISFIED";
};

const validateBaselineInputConfig = (requiredInputsRaw?: string | null, defaultInputsRaw?: string | null) => {
  const requiredInputs = parseJsonArray(requiredInputsRaw);
  if (requiredInputs.length === 0) {
    return {
      valid: false,
      reason: "缺少脚本驱动输入字段定义（required_inputs 为空）",
      missingInputs: [] as string[],
    };
  }
  const defaultInputs = parseJsonObject(defaultInputsRaw);
  const missingInputs = requiredInputs.filter((inputKey) => {
    if (inputKey === "connection_address") return false;
    return !String(defaultInputs[inputKey] || "").trim();
  });
  if (missingInputs.length > 0) {
    return {
      valid: false,
      reason: `缺少默认输入值: ${missingInputs.join(", ")}`,
      missingInputs,
    };
  }
  return { valid: true, reason: "", missingInputs: [] as string[] };
};

export const isRequirementClosedStatus = (status: unknown) => {
  const token = normalizeStatusToken(status);
  return REQUIREMENT_CLOSED_STATUS.has(token);
};

export const isTaraMitigatedStatus = (status: unknown) => {
  const token = normalizeStatusToken(status);
  return TARA_MITIGATED_STATUS.has(token);
};

export const assertRequirementClosureIntegrity = (db: SqliteDb, requirementId: number, nextStatus: unknown) => {
  if (!isRequirementClosedStatus(nextStatus)) return;
  const linkedAssetCount = Number(
    (db.prepare("SELECT COUNT(*) as count FROM requirement_assets WHERE requirement_id = ?").get(requirementId) as { count?: number } | undefined)?.count || 0,
  );
  if (linkedAssetCount <= 0) {
    throw new Error("需求未绑定资产，不允许标记为已闭环。");
  }
};

export const assertTaraMitigationIntegrity = (db: SqliteDb, taraId: number, nextStatus: unknown) => {
  if (!isTaraMitigatedStatus(nextStatus)) return;
  const linkedRequirementCount = Number(
    (db.prepare("SELECT COUNT(*) as count FROM requirement_tara_links WHERE tara_id = ?").get(taraId) as { count?: number } | undefined)?.count || 0,
  );
  if (linkedRequirementCount <= 0) {
    throw new Error("TARA 未关联需求，不允许标记为已缓解。");
  }
};

export const validateBaselineSuiteCases = (db: SqliteDb, testCaseIds: number[]): BaselineCaseValidation[] => {
  const normalizedIds = Array.from(
    new Set(
      (testCaseIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
  if (normalizedIds.length === 0) return [];

  const placeholders = normalizedIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, title, required_inputs, default_runtime_inputs
    FROM test_cases
    WHERE id IN (${placeholders})
    ORDER BY id ASC
  `).all(...normalizedIds) as Array<{
    id: number;
    title: string;
    required_inputs?: string | null;
    default_runtime_inputs?: string | null;
  }>;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return normalizedIds.map((testCaseId) => {
    const row = rowById.get(testCaseId);
    if (!row) {
      return {
        testCaseId,
        title: `用例#${testCaseId}`,
        valid: false,
        reason: "用例不存在",
        missingInputs: [],
      };
    }
    const inputCheck = validateBaselineInputConfig(row.required_inputs, row.default_runtime_inputs);
    return {
      testCaseId,
      title: row.title,
      valid: inputCheck.valid,
      reason: inputCheck.valid ? undefined : inputCheck.reason,
      missingInputs: inputCheck.missingInputs,
    };
  });
};

export const markRequirementChangeImpact = (db: SqliteDb, requirementId: number, reason: string) => {
  markEntityPendingReverification(db, "REQUIREMENT", requirementId, {
    reason,
    sourceEntityType: "REQUIREMENT",
    sourceEntityId: requirementId,
  });

  queryLinkedTaraIdsByRequirement(db, requirementId).forEach((taraId) => {
    markEntityPendingReverification(db, "TARA", taraId, {
      reason: `受需求变更影响: REQ#${requirementId}`,
      sourceEntityType: "REQUIREMENT",
      sourceEntityId: requirementId,
    });
  });

  queryLinkedTestCaseIdsByRequirement(db, requirementId).forEach((testCaseId) => {
    markEntityPendingReverification(db, "TEST_CASE", testCaseId, {
      reason: `受需求变更影响: REQ#${requirementId}`,
      sourceEntityType: "REQUIREMENT",
      sourceEntityId: requirementId,
    });
  });
};

export const markTaraChangeImpact = (db: SqliteDb, taraId: number, reason: string) => {
  markEntityPendingReverification(db, "TARA", taraId, {
    reason,
    sourceEntityType: "TARA",
    sourceEntityId: taraId,
  });

  queryLinkedRequirementIdsByTara(db, taraId).forEach((requirementId) => {
    markEntityPendingReverification(db, "REQUIREMENT", requirementId, {
      reason: `受TARA变更影响: TARA#${taraId}`,
      sourceEntityType: "TARA",
      sourceEntityId: taraId,
    });
  });

  queryLinkedTestCaseIdsByTara(db, taraId).forEach((testCaseId) => {
    markEntityPendingReverification(db, "TEST_CASE", testCaseId, {
      reason: `受TARA变更影响: TARA#${taraId}`,
      sourceEntityType: "TARA",
      sourceEntityId: taraId,
    });
  });
};

export const markTestCaseChangeImpact = (db: SqliteDb, testCaseId: number, reason: string) => {
  markEntityPendingReverification(db, "TEST_CASE", testCaseId, {
    reason,
    sourceEntityType: "TEST_CASE",
    sourceEntityId: testCaseId,
  });

  queryLinkedRequirementIdsByTestCase(db, testCaseId).forEach((requirementId) => {
    markEntityPendingReverification(db, "REQUIREMENT", requirementId, {
      reason: `受测试用例变更影响: CASE#${testCaseId}`,
      sourceEntityType: "TEST_CASE",
      sourceEntityId: testCaseId,
    });
  });

  queryLinkedTaraIdsByTestCase(db, testCaseId).forEach((taraId) => {
    markEntityPendingReverification(db, "TARA", taraId, {
      reason: `受测试用例变更影响: CASE#${testCaseId}`,
      sourceEntityType: "TEST_CASE",
      sourceEntityId: testCaseId,
    });
  });
};

export const writebackRequirementSatisfactionFromRun = (
  db: SqliteDb,
  payload: {
    runId: number;
    testCaseId: number;
    result: string;
  },
) => {
  const testCaseId = Number(payload.testCaseId);
  if (!Number.isInteger(testCaseId) || testCaseId <= 0) return;

  const normalizedResult = normalizeStatusToken(payload.result);
  const acceptedResult = ["PASSED", "FAILED", "BLOCKED", "ERROR"].includes(normalizedResult) ? normalizedResult : "ERROR";
  const runRow = db.prepare("SELECT executed_at FROM test_runs WHERE id = ?").get(payload.runId) as { executed_at?: string | null } | undefined;
  const executedAt = String(runRow?.executed_at || "").trim() || new Date().toISOString();
  const satisfactionStatus = deriveSatisfactionStatus(acceptedResult);

  resolveEntityPendingReverification(db, "TEST_CASE", testCaseId);

  queryLinkedRequirementIdsByTestCase(db, testCaseId).forEach((requirementId) => {
    db.prepare(`
      UPDATE requirements
      SET
        latest_result = ?,
        latest_result_at = ?,
        satisfaction_status = ?,
        verification_status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(acceptedResult, executedAt, satisfactionStatus, VERIFIED, requirementId);
    resolveEntityPendingReverification(db, "REQUIREMENT", requirementId);
  });

  queryLinkedTaraIdsByTestCase(db, testCaseId).forEach((taraId) => {
    resolveEntityPendingReverification(db, "TARA", taraId);
  });
};

export const listPendingReverificationTodos = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT
      rt.id,
      rt.entity_type,
      rt.entity_id,
      rt.reason,
      rt.source_entity_type,
      rt.source_entity_id,
      rt.created_at,
      rt.updated_at,
      r.requirement_key,
      r.title AS requirement_title,
      t.threat_key,
      t.title AS tara_title,
      tc.title AS test_case_title
    FROM reverification_todos rt
    LEFT JOIN requirements r ON rt.entity_type = 'REQUIREMENT' AND rt.entity_id = r.id
    LEFT JOIN tara_items t ON rt.entity_type = 'TARA' AND rt.entity_id = t.id
    LEFT JOIN test_cases tc ON rt.entity_type = 'TEST_CASE' AND rt.entity_id = tc.id
    WHERE rt.status = 'PENDING'
    ORDER BY datetime(rt.created_at) DESC, rt.id DESC
  `).all() as Array<{
    id: number;
    entity_type: ReverificationEntityType;
    entity_id: number;
    reason: string;
    source_entity_type?: string | null;
    source_entity_id?: number | null;
    created_at: string;
    updated_at: string;
    requirement_key?: string | null;
    requirement_title?: string | null;
    threat_key?: string | null;
    tara_title?: string | null;
    test_case_title?: string | null;
  }>;

  return rows.map((row) => {
    let label = `#${row.entity_id}`;
    if (row.entity_type === "REQUIREMENT") {
      label = `${row.requirement_key || `REQ#${row.entity_id}`} ${row.requirement_title || ""}`.trim();
    } else if (row.entity_type === "TARA") {
      label = `${row.threat_key || `TARA#${row.entity_id}`} ${row.tara_title || ""}`.trim();
    } else if (row.entity_type === "TEST_CASE") {
      label = row.test_case_title || `CASE#${row.entity_id}`;
    }
    return {
      ...row,
      label,
      reasons: String(row.reason || "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  });
};

export const removeEntityReverificationTodos = (
  db: SqliteDb,
  entityType: ReverificationEntityType,
  entityId: number,
) => {
  if (!Number.isInteger(entityId) || entityId <= 0) return;
  db.prepare("DELETE FROM reverification_todos WHERE entity_type = ? AND entity_id = ?").run(entityType, entityId);
};
