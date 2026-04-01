import type { Express } from "express";
import type { SqliteDb } from "../types";

type AssetRoutesDeps = {
  db: SqliteDb;
  pingAddress: (address: string) => Promise<{ success: boolean; latency_ms?: number; output: string }>;
};

export const registerAssetRoutes = (app: Express, deps: AssetRoutesDeps) => {
  const { db, pingAddress } = deps;

  app.get("/api/assets", (req, res) => {
    const assets = db.prepare(`
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
    res.json(assets);
  });

  app.post("/api/assets", (req, res) => {
    const { name, status, type, hardware_version, software_version, connection_address, description } = req.body;
    if (!name || !status || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const normalizedSoftwareVersion = String(software_version || "").trim() || "v1.0.0";
    const normalizedHardwareVersion = String(hardware_version || "").trim() || "-";
    const normalizedConnectionAddress = String(connection_address || "").trim();
    const normalizedDescription = String(description || "").trim();
    const result = db.prepare(`
      INSERT INTO assets (name, status, version, hardware_version, software_version, connection_address, description, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      status,
      normalizedSoftwareVersion,
      normalizedHardwareVersion,
      normalizedSoftwareVersion,
      normalizedConnectionAddress,
      normalizedDescription,
      type
    );
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/assets/:id", (req, res) => {
    const assetId = Number(req.params.id);
    const existingAsset = db.prepare("SELECT id FROM assets WHERE id = ?").get(assetId);
    if (!existingAsset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const { name, status, type, hardware_version, software_version, connection_address, description } = req.body;
    if (!name || !status || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedSoftwareVersion = String(software_version || "").trim() || "v1.0.0";
    const normalizedHardwareVersion = String(hardware_version || "").trim() || "-";
    const normalizedConnectionAddress = String(connection_address || "").trim();
    const normalizedDescription = String(description || "").trim();

    db.prepare(`
      UPDATE assets
      SET name = ?,
          status = ?,
          type = ?,
          version = ?,
          hardware_version = ?,
          software_version = ?,
          connection_address = ?,
          description = ?
      WHERE id = ?
    `).run(
      name,
      status,
      type,
      normalizedSoftwareVersion,
      normalizedHardwareVersion,
      normalizedSoftwareVersion,
      normalizedConnectionAddress,
      normalizedDescription,
      assetId
    );

    res.json({ success: true });
  });

  app.post("/api/assets/:id/ping", async (req, res) => {
    const assetId = Number(req.params.id);
    const asset = db.prepare(`
      SELECT
        id,
        name,
        COALESCE(connection_address, '') as connection_address
      FROM assets
      WHERE id = ?
    `).get(assetId) as { id: number; name: string; connection_address: string } | undefined;

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    if (!asset.connection_address) {
      return res.status(400).json({ error: "Asset connection address is empty" });
    }

    const result = await pingAddress(asset.connection_address);
    if (!result.success) {
      return res.status(502).json({
        success: false,
        asset_id: asset.id,
        name: asset.name,
        address: asset.connection_address,
        output: result.output,
      });
    }

    res.json({
      success: true,
      asset_id: asset.id,
      name: asset.name,
      address: asset.connection_address,
      latency_ms: result.latency_ms,
      output: result.output,
    });
  });

  app.delete("/api/assets/:id", (req, res) => {
    const assetId = Number(req.params.id);
    const asset = db.prepare("SELECT id, name FROM assets WHERE id = ?").get(assetId);
    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const activeTask = db.prepare(`
      SELECT id
      FROM execution_tasks
      WHERE asset_id = ? AND status IN ('PENDING', 'RUNNING')
      LIMIT 1
    `).get(assetId);

    if (activeTask) {
      return res.status(409).json({ error: "Asset is currently bound to an active task" });
    }

    db.prepare("UPDATE execution_tasks SET asset_id = NULL WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
    res.json({ success: true });
  });
};
