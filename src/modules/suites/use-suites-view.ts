import { useMemo } from "react";
import type { SuiteRun } from "../../api/types";

type NormalizeExecutionStatus = (status?: string | null) => "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";

export const useSuitesView = (
  suiteRuns: SuiteRun[],
  normalizeExecutionStatus: NormalizeExecutionStatus,
) => {
  const runningSuiteIds = useMemo(
    () =>
      suiteRuns
        .filter((run) => {
          const normalized = normalizeExecutionStatus(run.status);
          return normalized === "PENDING" || normalized === "RUNNING";
        })
        .map((run) => run.suite_id),
    [suiteRuns, normalizeExecutionStatus],
  );

  return {
    runningSuiteIds,
  };
};

