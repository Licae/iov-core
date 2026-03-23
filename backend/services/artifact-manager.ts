import path from "path";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";

type ArtifactSubdir = "payloads" | "adb-push" | "adb-pull" | "logs";

type ExecutionTaskSnapshot = {
  id: number;
  status?: string | null;
  failed_items?: number | null;
  blocked_items?: number | null;
  error_message?: string | null;
};

type ArtifactManagerOptions = {
  rootDir: string;
  retentionHoursPass: number;
  retentionHoursFail: number;
  retentionHoursCancel: number;
  maxSizeMb: number;
  maxDirs: number;
  cleanOnStart: boolean;
};

const SUBDIRS: ArtifactSubdir[] = ["payloads", "adb-push", "adb-pull", "logs"];

const safePositiveNumber = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

export const createArtifactManager = (options: ArtifactManagerOptions) => {
  const artifactRoot = options.rootDir;
  const taskArtifactPaths = new Map<number, Set<string>>();
  const taskArtifactCleanupTimers = new Map<number, NodeJS.Timeout>();

  const ensureDirectories = () => {
    mkdirSync(artifactRoot, { recursive: true });
    SUBDIRS.forEach((dir) => mkdirSync(path.join(artifactRoot, dir), { recursive: true }));
  };

  const getPathSizeBytes = (targetPath: string): number => {
    try {
      const stats = statSync(targetPath);
      if (stats.isFile()) return stats.size;
      if (!stats.isDirectory()) return 0;
      return readdirSync(targetPath).reduce((acc, entry) => acc + getPathSizeBytes(path.join(targetPath, entry)), 0);
    } catch {
      return 0;
    }
  };

  const listManagedArtifactDirs = () => {
    const entries: Array<{ path: string; mtimeMs: number; sizeBytes: number }> = [];
    SUBDIRS.forEach((subdir) => {
      const base = path.join(artifactRoot, subdir);
      try {
        readdirSync(base, { withFileTypes: true }).forEach((entry) => {
          if (!entry.isDirectory()) return;
          if (!entry.name.startsWith("task-")) return;
          const fullPath = path.join(base, entry.name);
          const stats = statSync(fullPath);
          entries.push({
            path: fullPath,
            mtimeMs: stats.mtimeMs,
            sizeBytes: getPathSizeBytes(fullPath),
          });
        });
      } catch {
        // ignore missing subdirs
      }
    });
    return entries;
  };

  const deleteArtifactDir = (artifactPath: string) => {
    try {
      rmSync(artifactPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  const enforceQuota = () => {
    const maxSizeBytes = safePositiveNumber(options.maxSizeMb, 2048) * 1024 * 1024;
    const maxDirs = safePositiveNumber(options.maxDirs, 5000);
    const dirs = listManagedArtifactDirs().sort((a, b) => a.mtimeMs - b.mtimeMs);
    let totalSize = dirs.reduce((acc, item) => acc + item.sizeBytes, 0);
    let totalDirs = dirs.length;

    for (const entry of dirs) {
      if (totalSize <= maxSizeBytes && totalDirs <= maxDirs) break;
      deleteArtifactDir(entry.path);
      totalSize -= entry.sizeBytes;
      totalDirs -= 1;
    }
  };

  const cleanupExpiredOnStart = () => {
    if (!options.cleanOnStart) return;
    const maxRetentionHours = Math.max(
      safePositiveNumber(options.retentionHoursPass, 0),
      safePositiveNumber(options.retentionHoursFail, 24),
      safePositiveNumber(options.retentionHoursCancel, 2)
    );
    const cutoff = Date.now() - maxRetentionHours * 60 * 60 * 1000;
    listManagedArtifactDirs().forEach((entry) => {
      if (entry.mtimeMs < cutoff) {
        deleteArtifactDir(entry.path);
      }
    });
    enforceQuota();
  };

  const registerTaskArtifactPath = (taskId: number, artifactPath: string) => {
    const bucket = taskArtifactPaths.get(taskId) || new Set<string>();
    bucket.add(artifactPath);
    taskArtifactPaths.set(taskId, bucket);
  };

  const createTaskArtifactDir = (taskId: number, itemId: number, subdir: ArtifactSubdir) => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const dir = path.join(artifactRoot, subdir, `task-${taskId}-item-${itemId}-${unique}`);
    mkdirSync(dir, { recursive: true });
    registerTaskArtifactPath(taskId, dir);
    return dir;
  };

  const getTaskArtifactRetentionMs = (task: ExecutionTaskSnapshot) => {
    const passMs = safePositiveNumber(options.retentionHoursPass, 0) * 60 * 60 * 1000;
    const failMs = safePositiveNumber(options.retentionHoursFail, 24) * 60 * 60 * 1000;
    const cancelMs = safePositiveNumber(options.retentionHoursCancel, 2) * 60 * 60 * 1000;

    if (String(task.status || "").toUpperCase() === "CANCELLED") return cancelMs;
    const hasFailure = Number(task.failed_items || 0) > 0 || Number(task.blocked_items || 0) > 0 || Boolean(task.error_message);
    if (hasFailure) return failMs;
    return passMs;
  };

  const scheduleTaskCleanup = (task: ExecutionTaskSnapshot) => {
    const taskId = Number(task.id);
    const paths = Array.from(taskArtifactPaths.get(taskId) || []);
    if (paths.length === 0) return;

    const existingTimer = taskArtifactCleanupTimers.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      taskArtifactCleanupTimers.delete(taskId);
    }

    const cleanupNow = () => {
      paths.forEach((artifactPath) => deleteArtifactDir(artifactPath));
      taskArtifactPaths.delete(taskId);
      taskArtifactCleanupTimers.delete(taskId);
      enforceQuota();
    };

    const retentionMs = getTaskArtifactRetentionMs(task);
    if (retentionMs <= 0) {
      cleanupNow();
      return;
    }

    const timer = setTimeout(cleanupNow, retentionMs);
    taskArtifactCleanupTimers.set(taskId, timer);
  };

  const prepareOnStart = () => {
    ensureDirectories();
    cleanupExpiredOnStart();
  };

  return {
    artifactRoot,
    createTaskArtifactDir,
    scheduleTaskCleanup,
    prepareOnStart,
    exists: () => existsSync(artifactRoot),
  };
};

