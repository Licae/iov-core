import type { SqliteDb } from "../types";

const SCHEMA_VERSION = 5;

type Migration = {
  id: string;
  up: (db: SqliteDb) => void;
};

const safeExec = (db: SqliteDb, sql: string) => {
  try {
    db.exec(sql);
  } catch {}
};

const ensureSchemaVersionTable = (db: SqliteDb) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const existing = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version?: number } | undefined;
  if (!existing?.version) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(0);
  }
};

const setSchemaVersion = (db: SqliteDb, version: number) => {
  const latest = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version?: number } | undefined;
  if ((latest?.version || 0) >= version) return;
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
};

const ensureSchemaMigrationsTable = (db: SqliteDb) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const runMigrations = (db: SqliteDb, migrations: Migration[]) => {
  ensureSchemaMigrationsTable(db);
  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1");
  const insertMigration = db.prepare("INSERT INTO schema_migrations (id) VALUES (?)");
  const transaction = db.transaction((migration: Migration) => {
    migration.up(db);
    insertMigration.run(migration.id);
  });
  migrations.forEach((migration) => {
    const applied = hasMigration.get(migration.id);
    if (applied) return;
    transaction(migration);
  });
};

const ensurePerformanceIndexes = (db: SqliteDb) => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_test_cases_created_at ON test_cases(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
    CREATE INDEX IF NOT EXISTS idx_test_cases_security_domain ON test_cases(security_domain);
    CREATE INDEX IF NOT EXISTS idx_test_runs_test_case_id ON test_runs(test_case_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_executed_at ON test_runs(executed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_test_runs_result ON test_runs(result);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_execution_tasks_status_started_at ON execution_tasks(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_tasks_finished_at ON execution_tasks(finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_tasks_asset_id ON execution_tasks(asset_id);
    CREATE INDEX IF NOT EXISTS idx_execution_tasks_suite_id ON execution_tasks(suite_id);
    CREATE INDEX IF NOT EXISTS idx_execution_task_items_task_sort ON execution_task_items(task_id, sort_order ASC);
    CREATE INDEX IF NOT EXISTS idx_execution_task_items_status ON execution_task_items(status);
    CREATE INDEX IF NOT EXISTS idx_execution_task_items_run_id ON execution_task_items(run_id);
    CREATE INDEX IF NOT EXISTS idx_suite_runs_suite_started ON suite_runs(suite_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_test_suite_cases_suite_sort ON test_suite_cases(suite_id, sort_order ASC);
  `);
};

const ensureArchiveTables = (db: SqliteDb) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_runs_archive (
      id INTEGER PRIMARY KEY,
      test_case_id INTEGER,
      result TEXT,
      logs TEXT,
      summary TEXT,
      step_results TEXT,
      duration INTEGER,
      executed_by TEXT,
      executed_at DATETIME,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_test_runs_archive_executed_at ON test_runs_archive(executed_at DESC);

    CREATE TABLE IF NOT EXISTS execution_tasks_archive (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      asset_id INTEGER,
      suite_id INTEGER,
      test_case_id INTEGER,
      total_items INTEGER,
      completed_items INTEGER,
      passed_items INTEGER,
      failed_items INTEGER,
      blocked_items INTEGER,
      current_test_case_id INTEGER,
      current_item_label TEXT,
      started_at DATETIME,
      finished_at DATETIME,
      initiated_by TEXT,
      error_message TEXT,
      stop_on_failure INTEGER,
      executor TEXT,
      runtime_inputs TEXT,
      source_task_id INTEGER,
      retry_count INTEGER,
      failure_category TEXT,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_execution_tasks_archive_finished_at ON execution_tasks_archive(finished_at DESC);

    CREATE TABLE IF NOT EXISTS execution_task_items_archive (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      test_case_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      failure_category TEXT,
      run_id INTEGER,
      started_at DATETIME,
      finished_at DATETIME,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_execution_task_items_archive_task_sort ON execution_task_items_archive(task_id, sort_order ASC);
  `);
};

const ensureTraceabilityTables = (db: SqliteDb) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '通用',
      priority TEXT NOT NULL DEFAULT 'P2',
      status TEXT NOT NULL DEFAULT 'OPEN',
      satisfaction_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      latest_result TEXT,
      latest_result_at DATETIME,
      verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
      owner TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tara_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threat_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'OPEN',
      verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
      affected_asset TEXT,
      attack_vector TEXT,
      impact TEXT,
      likelihood TEXT,
      mitigation TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_case_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL,
      requirement_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(test_case_id, requirement_id),
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
      FOREIGN KEY(requirement_id) REFERENCES requirements(id)
    );

    CREATE TABLE IF NOT EXISTS requirement_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      applicability TEXT NOT NULL DEFAULT 'APPLICABLE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requirement_id, asset_id),
      FOREIGN KEY(requirement_id) REFERENCES requirements(id),
      FOREIGN KEY(asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS requirement_tara_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL,
      tara_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requirement_id, tara_id),
      FOREIGN KEY(requirement_id) REFERENCES requirements(id),
      FOREIGN KEY(tara_id) REFERENCES tara_items(id)
    );

    CREATE TABLE IF NOT EXISTS test_case_tara_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL,
      tara_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(test_case_id, tara_id),
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
      FOREIGN KEY(tara_id) REFERENCES tara_items(id)
    );

    CREATE TABLE IF NOT EXISTS reverification_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL, -- REQUIREMENT, TARA, TEST_CASE
      entity_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RESOLVED
      source_entity_type TEXT,
      source_entity_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_requirements_key ON requirements(requirement_key);
    CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status);
    CREATE INDEX IF NOT EXISTS idx_requirements_satisfaction ON requirements(satisfaction_status);
    CREATE INDEX IF NOT EXISTS idx_requirements_verification_status ON requirements(verification_status);
    CREATE INDEX IF NOT EXISTS idx_tara_items_key ON tara_items(threat_key);
    CREATE INDEX IF NOT EXISTS idx_tara_items_status ON tara_items(status);
    CREATE INDEX IF NOT EXISTS idx_tara_items_verification_status ON tara_items(verification_status);
    CREATE INDEX IF NOT EXISTS idx_tara_items_affected_asset ON tara_items(affected_asset);
    CREATE INDEX IF NOT EXISTS idx_test_case_requirements_case ON test_case_requirements(test_case_id);
    CREATE INDEX IF NOT EXISTS idx_test_case_requirements_requirement ON test_case_requirements(requirement_id);
    CREATE INDEX IF NOT EXISTS idx_requirement_assets_requirement ON requirement_assets(requirement_id);
    CREATE INDEX IF NOT EXISTS idx_requirement_assets_asset ON requirement_assets(asset_id);
    CREATE INDEX IF NOT EXISTS idx_requirement_tara_requirement ON requirement_tara_links(requirement_id);
    CREATE INDEX IF NOT EXISTS idx_requirement_tara_tara ON requirement_tara_links(tara_id);
    CREATE INDEX IF NOT EXISTS idx_test_case_tara_case ON test_case_tara_links(test_case_id);
    CREATE INDEX IF NOT EXISTS idx_test_case_tara_tara ON test_case_tara_links(tara_id);
    CREATE INDEX IF NOT EXISTS idx_reverification_todos_entity_status ON reverification_todos(entity_type, entity_id, status);
    CREATE INDEX IF NOT EXISTS idx_reverification_todos_created_at ON reverification_todos(created_at DESC);
  `);
};

const migrations: Migration[] = [
  {
    id: "20260323_archive_tables",
    up: (db) => {
      ensureArchiveTables(db);
    },
  },
];

export const archiveHistoricalTestRuns = (
  db: SqliteDb,
  options?: { retentionDays?: number; batchSize?: number },
) => {
  const retentionDays = Math.max(1, Number(options?.retentionDays ?? 30));
  const batchSize = Math.max(50, Number(options?.batchSize ?? 500));
  ensureArchiveTables(db);

  const eligibleRows = db.prepare(`
    SELECT tr.id
    FROM test_runs tr
    WHERE tr.executed_at < datetime('now', ?)
      AND NOT EXISTS (
        SELECT 1 FROM execution_task_items eti WHERE eti.run_id = tr.id
      )
    ORDER BY tr.executed_at ASC
    LIMIT ?
  `).all(`-${retentionDays} days`, batchSize) as Array<{ id: number }>;

  if (eligibleRows.length === 0) {
    return { archivedCount: 0, retentionDays, batchSize };
  }

  const transaction = db.transaction((ids: number[]) => {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`
      INSERT OR REPLACE INTO test_runs_archive (
        id, test_case_id, result, logs, summary, step_results, duration, executed_by, executed_at
      )
      SELECT id, test_case_id, result, logs, summary, step_results, duration, executed_by, executed_at
      FROM test_runs
      WHERE id IN (${placeholders})
    `).run(...ids);
    db.prepare(`DELETE FROM test_runs WHERE id IN (${placeholders})`).run(...ids);
  });

  transaction(eligibleRows.map((row) => row.id));
  return { archivedCount: eligibleRows.length, retentionDays, batchSize };
};

export const archiveHistoricalExecutionRecords = (
  db: SqliteDb,
  options?: { retentionDays?: number; batchSize?: number },
) => {
  const retentionDays = Math.max(1, Number(options?.retentionDays ?? 30));
  const batchSize = Math.max(20, Number(options?.batchSize ?? 300));
  ensureArchiveTables(db);

  const eligibleTasks = db.prepare(`
    SELECT et.id
    FROM execution_tasks et
    WHERE UPPER(et.status) IN ('COMPLETED', 'CANCELLED')
      AND COALESCE(et.finished_at, et.started_at) < datetime('now', ?)
    ORDER BY COALESCE(et.finished_at, et.started_at) ASC
    LIMIT ?
  `).all(`-${retentionDays} days`, batchSize) as Array<{ id: number }>;

  if (eligibleTasks.length === 0) {
    return { archivedTaskCount: 0, archivedItemCount: 0, retentionDays, batchSize };
  }

  const ids = eligibleTasks.map((task) => task.id);
  const placeholders = ids.map(() => "?").join(",");
  const archivedItemCount = Number(
    (db.prepare(`SELECT COUNT(*) as count FROM execution_task_items WHERE task_id IN (${placeholders})`).get(...ids) as { count?: number } | undefined)?.count || 0,
  );

  const transaction = db.transaction((taskIds: number[]) => {
    const marks = taskIds.map(() => "?").join(",");
    db.prepare(`
      INSERT OR REPLACE INTO execution_tasks_archive (
        id, type, status, asset_id, suite_id, test_case_id, total_items, completed_items, passed_items, failed_items, blocked_items,
        current_test_case_id, current_item_label, started_at, finished_at, initiated_by, error_message, stop_on_failure,
        executor, runtime_inputs, source_task_id, retry_count, failure_category
      )
      SELECT
        id, type, status, asset_id, suite_id, test_case_id, total_items, completed_items, passed_items, failed_items, blocked_items,
        current_test_case_id, current_item_label, started_at, finished_at, initiated_by, error_message, stop_on_failure,
        executor, runtime_inputs, source_task_id, retry_count, failure_category
      FROM execution_tasks
      WHERE id IN (${marks})
    `).run(...taskIds);

    db.prepare(`
      INSERT OR REPLACE INTO execution_task_items_archive (
        id, task_id, test_case_id, sort_order, status, result, failure_category, run_id, started_at, finished_at
      )
      SELECT
        id, task_id, test_case_id, sort_order, status, result, failure_category, run_id, started_at, finished_at
      FROM execution_task_items
      WHERE task_id IN (${marks})
    `).run(...taskIds);

    db.prepare(`DELETE FROM execution_task_items WHERE task_id IN (${marks})`).run(...taskIds);
    db.prepare(`DELETE FROM execution_tasks WHERE id IN (${marks})`).run(...taskIds);
  });

  transaction(ids);
  return {
    archivedTaskCount: ids.length,
    archivedItemCount,
    retentionDays,
    batchSize,
  };
};

export const initializeDatabase = (db: SqliteDb) => {
  ensureSchemaVersionTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- ECU, T-Box, Gateway, IVI, Full Vehicle
      security_domain TEXT DEFAULT '未分类',
      type TEXT NOT NULL,     -- Automated, Manual
      protocol TEXT,          -- CAN, DoIP, V2X, Bluetooth, etc.
      description TEXT,
      steps TEXT,             -- JSON string
      test_input TEXT,
      test_tool TEXT,
      expected_result TEXT,
      automation_level TEXT,
      executor_type TEXT DEFAULT 'python',
      script_path TEXT,
      command_template TEXT,
      args_template TEXT,
      timeout_sec INTEGER DEFAULT 300,
      default_runtime_inputs TEXT,
      verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
      status TEXT DEFAULT 'Draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER,
      result TEXT,            -- PASSED, FAILED, BLOCKED, ERROR
      logs TEXT,
      summary TEXT,
      step_results TEXT,
      duration INTEGER,       -- In seconds
      executed_by TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS defects (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      module TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      version TEXT,
      hardware_version TEXT,
      software_version TEXT,
      connection_address TEXT,
      description TEXT,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_suites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_baseline INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_suite_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suite_id INTEGER NOT NULL,
      test_case_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY(suite_id) REFERENCES test_suites(id),
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id)
    );

    CREATE TABLE IF NOT EXISTS suite_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suite_id INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING',
      total_cases INTEGER DEFAULT 0,
      completed_cases INTEGER DEFAULT 0,
      passed_cases INTEGER DEFAULT 0,
      failed_cases INTEGER DEFAULT 0,
      blocked_cases INTEGER DEFAULT 0,
      current_case_id INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      FOREIGN KEY(suite_id) REFERENCES test_suites(id),
      FOREIGN KEY(current_case_id) REFERENCES test_cases(id)
    );

    CREATE TABLE IF NOT EXISTS execution_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      asset_id INTEGER,
      suite_id INTEGER,
      test_case_id INTEGER,
      total_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      passed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      blocked_items INTEGER NOT NULL DEFAULT 0,
      current_test_case_id INTEGER,
      current_item_label TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      initiated_by TEXT,
      error_message TEXT,
      stop_on_failure INTEGER NOT NULL DEFAULT 0,
      executor TEXT DEFAULT 'python',
      runtime_inputs TEXT,
      source_task_id INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0,
      failure_category TEXT NOT NULL DEFAULT 'NONE',
      FOREIGN KEY(asset_id) REFERENCES assets(id),
      FOREIGN KEY(suite_id) REFERENCES test_suites(id),
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
      FOREIGN KEY(current_test_case_id) REFERENCES test_cases(id),
      FOREIGN KEY(source_task_id) REFERENCES execution_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS execution_task_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      test_case_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      result TEXT,
      failure_category TEXT,
      run_id INTEGER,
      started_at DATETIME,
      finished_at DATETIME,
      FOREIGN KEY(task_id) REFERENCES execution_tasks(id),
      FOREIGN KEY(test_case_id) REFERENCES test_cases(id),
      FOREIGN KEY(run_id) REFERENCES test_runs(id)
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('abort_on_critical_dtc', 'true');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('pr_requires_sil', 'true');
  `);

  safeExec(db, "ALTER TABLE test_runs ADD COLUMN duration INTEGER;");

  safeExec(db, "ALTER TABLE test_cases ADD COLUMN steps TEXT;");

  const testCaseColumns = [
    "test_input",
    "test_tool",
    "expected_result",
    "automation_level",
    "executor_type",
    "script_path",
    "command_template",
    "args_template",
    "timeout_sec",
    "required_inputs",
    "default_runtime_inputs",
    "security_domain",
  ];
  testCaseColumns.forEach((col) => {
    safeExec(db, `ALTER TABLE test_cases ADD COLUMN ${col} TEXT;`);
  });

  try {
    db.exec(`
      UPDATE test_cases
      SET security_domain = '未分类'
      WHERE security_domain IS NULL OR TRIM(security_domain) = '';
    `);
  } catch {}

  ["summary", "step_results"].forEach((col) => safeExec(db, `ALTER TABLE test_runs ADD COLUMN ${col} TEXT;`));

  ["hardware_version", "software_version", "connection_address", "description"].forEach((col) => safeExec(db, `ALTER TABLE assets ADD COLUMN ${col} TEXT;`));

  db.exec(`
    UPDATE execution_tasks
    SET status = CASE UPPER(status)
      WHEN 'QUEUED' THEN 'PENDING'
      WHEN 'PENDING' THEN 'PENDING'
      WHEN 'RUNNING' THEN 'RUNNING'
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'FAILED' THEN 'COMPLETED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      ELSE 'PENDING'
    END;

    UPDATE execution_task_items
    SET status = CASE UPPER(status)
      WHEN 'QUEUED' THEN 'PENDING'
      WHEN 'PENDING' THEN 'PENDING'
      WHEN 'RUNNING' THEN 'RUNNING'
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      ELSE 'PENDING'
    END;

    UPDATE test_runs
    SET result = CASE UPPER(result)
      WHEN 'PASSED' THEN 'PASSED'
      WHEN 'FAILED' THEN 'FAILED'
      WHEN 'BLOCKED' THEN 'BLOCKED'
      WHEN 'RUNNING' THEN 'ERROR'
      WHEN 'SKIPPED' THEN 'ERROR'
      ELSE COALESCE(result, 'ERROR')
    END;

    UPDATE execution_task_items
    SET result = CASE UPPER(result)
      WHEN 'PASSED' THEN 'PASSED'
      WHEN 'FAILED' THEN 'FAILED'
      WHEN 'BLOCKED' THEN 'BLOCKED'
      WHEN 'ERROR' THEN 'ERROR'
      ELSE result
    END
    WHERE result IS NOT NULL;
  `);

  safeExec(db, `
    UPDATE assets
    SET software_version = COALESCE(NULLIF(software_version, ''), NULLIF(version, ''), 'v1.0.0')
    WHERE software_version IS NULL OR software_version = '';
  `);

  safeExec(db, "ALTER TABLE execution_tasks ADD COLUMN stop_on_failure INTEGER NOT NULL DEFAULT 0;");

  ["executor TEXT DEFAULT 'python'", "runtime_inputs TEXT", "source_task_id INTEGER", "retry_count INTEGER NOT NULL DEFAULT 0"].forEach((definition) => {
    safeExec(db, `ALTER TABLE execution_tasks ADD COLUMN ${definition};`);
  });

  ["failure_category TEXT NOT NULL DEFAULT 'NONE'"].forEach((definition) => {
    safeExec(db, `ALTER TABLE execution_tasks ADD COLUMN ${definition};`);
  });

  ["failure_category TEXT"].forEach((definition) => {
    safeExec(db, `ALTER TABLE execution_task_items ADD COLUMN ${definition};`);
  });

  safeExec(db, "ALTER TABLE tara_items ADD COLUMN affected_asset TEXT;");
  safeExec(db, "ALTER TABLE requirements ADD COLUMN satisfaction_status TEXT NOT NULL DEFAULT 'UNKNOWN';");
  safeExec(db, "ALTER TABLE requirements ADD COLUMN latest_result TEXT;");
  safeExec(db, "ALTER TABLE requirements ADD COLUMN latest_result_at DATETIME;");
  safeExec(db, "ALTER TABLE requirements ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIED';");
  safeExec(db, "ALTER TABLE tara_items ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIED';");
  safeExec(db, "ALTER TABLE test_cases ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIED';");
  safeExec(db, "ALTER TABLE test_suites ADD COLUMN is_baseline INTEGER NOT NULL DEFAULT 0;");

  db.exec(`
    UPDATE execution_tasks
    SET failure_category = CASE UPPER(COALESCE(failure_category, 'NONE'))
      WHEN 'ENVIRONMENT' THEN 'ENVIRONMENT'
      WHEN 'PERMISSION' THEN 'PERMISSION'
      WHEN 'SCRIPT' THEN 'SCRIPT'
      ELSE 'NONE'
    END;

    UPDATE execution_task_items
    SET failure_category = CASE UPPER(COALESCE(failure_category, ''))
      WHEN 'ENVIRONMENT' THEN 'ENVIRONMENT'
      WHEN 'PERMISSION' THEN 'PERMISSION'
      WHEN 'SCRIPT' THEN 'SCRIPT'
      ELSE NULL
    END;

    UPDATE requirements
    SET verification_status = CASE UPPER(COALESCE(verification_status, 'VERIFIED'))
      WHEN 'PENDING_REVERIFICATION' THEN 'PENDING_REVERIFICATION'
      ELSE 'VERIFIED'
    END;

    UPDATE requirements
    SET satisfaction_status = CASE UPPER(COALESCE(satisfaction_status, 'UNKNOWN'))
      WHEN 'SATISFIED' THEN 'SATISFIED'
      WHEN 'UNSATISFIED' THEN 'UNSATISFIED'
      WHEN 'PENDING_REVERIFICATION' THEN 'PENDING_REVERIFICATION'
      ELSE 'UNKNOWN'
    END;

    UPDATE tara_items
    SET verification_status = CASE UPPER(COALESCE(verification_status, 'VERIFIED'))
      WHEN 'PENDING_REVERIFICATION' THEN 'PENDING_REVERIFICATION'
      ELSE 'VERIFIED'
    END;

    UPDATE test_cases
    SET verification_status = CASE UPPER(COALESCE(verification_status, 'VERIFIED'))
      WHEN 'PENDING_REVERIFICATION' THEN 'PENDING_REVERIFICATION'
      ELSE 'VERIFIED'
    END;
  `);

  ensureTraceabilityTables(db);
  ensurePerformanceIndexes(db);
  ensureArchiveTables(db);
  runMigrations(db, migrations);
  setSchemaVersion(db, SCHEMA_VERSION);
};

export const runDatabaseMaintenance = (
  db: SqliteDb,
  options?: { retentionDays?: number; batchSize?: number },
) => {
  const runArchive = archiveHistoricalTestRuns(db, options);
  const executionArchive = archiveHistoricalExecutionRecords(db, options);
  return {
    testRunsArchived: runArchive.archivedCount,
    executionTasksArchived: executionArchive.archivedTaskCount,
    executionTaskItemsArchived: executionArchive.archivedItemCount,
    totalArchived: runArchive.archivedCount + executionArchive.archivedTaskCount + executionArchive.archivedItemCount,
    retentionDays: runArchive.retentionDays,
    batchSize: runArchive.batchSize,
  };
};
