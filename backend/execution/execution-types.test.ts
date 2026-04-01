import { describe, expect, it } from "vitest";
import {
  EXECUTION_STATUS,
  FAILURE_CATEGORY,
  TEST_RESULT,
  normalizeExecutionStatus,
  normalizeFailureCategory,
  normalizeTestResult,
} from "./execution-types";

describe("execution-types", () => {
  it("normalizes execution status aliases and defaults", () => {
    expect(normalizeExecutionStatus("running")).toBe(EXECUTION_STATUS.RUNNING);
    expect(normalizeExecutionStatus("FAILED")).toBe(EXECUTION_STATUS.COMPLETED);
    expect(normalizeExecutionStatus("cancelled")).toBe(EXECUTION_STATUS.CANCELLED);
    expect(normalizeExecutionStatus("unknown")).toBe(EXECUTION_STATUS.PENDING);
  });

  it("normalizes test results with fallback", () => {
    expect(normalizeTestResult("passed")).toBe(TEST_RESULT.PASSED);
    expect(normalizeTestResult("FAILED")).toBe(TEST_RESULT.FAILED);
    expect(normalizeTestResult("other", TEST_RESULT.BLOCKED)).toBe(TEST_RESULT.BLOCKED);
  });

  it("normalizes failure categories", () => {
    expect(normalizeFailureCategory("environment")).toBe(FAILURE_CATEGORY.ENVIRONMENT);
    expect(normalizeFailureCategory("permission")).toBe(FAILURE_CATEGORY.PERMISSION);
    expect(normalizeFailureCategory("script")).toBe(FAILURE_CATEGORY.SCRIPT);
    expect(normalizeFailureCategory("other")).toBe(FAILURE_CATEGORY.NONE);
  });
});
