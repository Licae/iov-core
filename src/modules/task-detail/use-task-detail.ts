import { useMemo } from "react";
import type { ExecutionTaskDetail } from "../../api/types";

export const useTaskDetail = (detail: ExecutionTaskDetail | null) => {
  return useMemo(() => {
    if (!detail) {
      return {
        hasError: false,
        hasItems: false,
      };
    }

    return {
      hasError: Boolean(detail.task.error_message),
      hasItems: detail.items.length > 0,
    };
  }, [detail]);
};

