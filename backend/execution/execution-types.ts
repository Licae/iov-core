export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type TestResult = "PASSED" | "FAILED" | "BLOCKED" | "ERROR";
export type FailureCategory = "NONE" | "ENVIRONMENT" | "PERMISSION" | "SCRIPT";

export const EXECUTION_STATUS = {
  PENDING: "PENDING" as ExecutionStatus,
  RUNNING: "RUNNING" as ExecutionStatus,
  COMPLETED: "COMPLETED" as ExecutionStatus,
  CANCELLED: "CANCELLED" as ExecutionStatus,
};

export const TEST_RESULT = {
  PASSED: "PASSED" as TestResult,
  FAILED: "FAILED" as TestResult,
  BLOCKED: "BLOCKED" as TestResult,
  ERROR: "ERROR" as TestResult,
};

export const FAILURE_CATEGORY = {
  NONE: "NONE" as FailureCategory,
  ENVIRONMENT: "ENVIRONMENT" as FailureCategory,
  PERMISSION: "PERMISSION" as FailureCategory,
  SCRIPT: "SCRIPT" as FailureCategory,
};

export const normalizeExecutionStatus = (value?: string | null): ExecutionStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RUNNING") return EXECUTION_STATUS.RUNNING;
  if (normalized === "COMPLETED" || normalized === "FAILED") return EXECUTION_STATUS.COMPLETED;
  if (normalized === "CANCELLED") return EXECUTION_STATUS.CANCELLED;
  return EXECUTION_STATUS.PENDING;
};

export const normalizeTestResult = (value?: string | null, fallback: TestResult = TEST_RESULT.ERROR): TestResult => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED") return TEST_RESULT.PASSED;
  if (normalized === "FAILED") return TEST_RESULT.FAILED;
  if (normalized === "BLOCKED") return TEST_RESULT.BLOCKED;
  if (normalized === "ERROR") return TEST_RESULT.ERROR;
  return fallback;
};

export const normalizeFailureCategory = (value?: string | null): FailureCategory => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ENVIRONMENT") return FAILURE_CATEGORY.ENVIRONMENT;
  if (normalized === "PERMISSION") return FAILURE_CATEGORY.PERMISSION;
  if (normalized === "SCRIPT") return FAILURE_CATEGORY.SCRIPT;
  return FAILURE_CATEGORY.NONE;
};

