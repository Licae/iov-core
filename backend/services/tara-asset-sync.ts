type SqliteDb = {
  prepare: (sql: string) => {
    get: (...args: any[]) => any;
    all: (...args: any[]) => any[];
    run: (...args: any[]) => any;
  };
};

const parseIds = (rows: Array<{ requirement_id?: number }> | undefined) =>
  Array.from(
    new Set(
      (rows || [])
        .map((row) => Number(row?.requirement_id || 0))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

const getLinkedRequirementIds = (db: SqliteDb, taraId: number) =>
  parseIds(
    db.prepare("SELECT requirement_id FROM requirement_tara_links WHERE tara_id = ? ORDER BY requirement_id ASC").all(taraId),
  );

const getAssetNamesByRequirementIds = (db: SqliteDb, requirementIds: number[]) => {
  if (requirementIds.length === 0) return [];
  const placeholders = requirementIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`
      SELECT DISTINCT a.name AS name
      FROM requirement_assets ras
      JOIN assets a ON a.id = ras.asset_id
      WHERE ras.requirement_id IN (${placeholders})
      ORDER BY a.name COLLATE NOCASE ASC, a.id ASC
    `)
    .all(...requirementIds) as Array<{ name?: string | null }>;

  return rows
    .map((row) => String(row?.name || "").trim())
    .filter((value) => value.length > 0);
};

const joinAssetNames = (names: string[]) => names.join("、");

export const deriveAffectedAssetFromRequirementLinks = (db: SqliteDb, taraId: number) => {
  const requirementIds = getLinkedRequirementIds(db, taraId);
  const names = getAssetNamesByRequirementIds(db, requirementIds);
  return joinAssetNames(names);
};

export const syncTaraAffectedAssetById = (db: SqliteDb, taraId: number) => {
  const current = db.prepare("SELECT affected_asset FROM tara_items WHERE id = ?").get(taraId) as
    | { affected_asset?: string | null }
    | undefined;
  if (!current) return false;

  const nextValue = deriveAffectedAssetFromRequirementLinks(db, taraId);
  if (!nextValue) return false;

  const prevValue = String(current.affected_asset || "").trim();
  if (prevValue === nextValue) return false;

  db.prepare("UPDATE tara_items SET affected_asset = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextValue, taraId);
  return true;
};

export const syncTaraAffectedAssetsForRequirement = (db: SqliteDb, requirementId: number) => {
  const taraIds = db
    .prepare("SELECT tara_id FROM requirement_tara_links WHERE requirement_id = ? ORDER BY tara_id ASC")
    .all(requirementId)
    .map((row: { tara_id: number }) => Number(row.tara_id))
    .filter((value: number) => Number.isInteger(value) && value > 0);

  let updated = 0;
  for (const taraId of taraIds) {
    if (syncTaraAffectedAssetById(db, taraId)) updated += 1;
  }
  return updated;
};

export const syncAllTaraAffectedAssets = (db: SqliteDb) => {
  const taraIds = db
    .prepare("SELECT id FROM tara_items ORDER BY id ASC")
    .all()
    .map((row: { id: number }) => Number(row.id))
    .filter((value: number) => Number.isInteger(value) && value > 0);

  let updated = 0;
  for (const taraId of taraIds) {
    if (syncTaraAffectedAssetById(db, taraId)) updated += 1;
  }
  return updated;
};
