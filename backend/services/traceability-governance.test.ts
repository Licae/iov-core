import { describe, expect, it } from "vitest";
import {
  assertRequirementClosureIntegrity,
  markTestCaseChangeImpact,
  validateBaselineSuiteCases,
} from "./traceability-governance";

type TodoRow = {
  id: number;
  entity_type: "REQUIREMENT" | "TARA" | "TEST_CASE";
  entity_id: number;
  reason: string;
  status: "PENDING";
};

class MockTraceabilityDb {
  public readonly todos: TodoRow[] = [];
  public readonly requirementStatuses = new Map<number, string>();
  public readonly taraStatuses = new Map<number, string>();
  public readonly testCaseStatuses = new Map<number, string>();

  constructor(
    private readonly options: {
      cases?: Array<{ id: number; title: string; required_inputs?: string | null; default_runtime_inputs?: string | null }>;
      linkedRequirementsByCase?: Record<number, number[]>;
      linkedTarasByCase?: Record<number, number[]>;
      requirementAssetCounts?: Record<number, number>;
    } = {},
  ) {}

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.includes("SELECT id, title, required_inputs, default_runtime_inputs FROM test_cases")) {
      return {
        all: (...ids: number[]) =>
          (this.options.cases || []).filter((row) => ids.includes(row.id)),
      };
    }

    if (normalized.includes("SELECT COUNT(*) as count FROM requirement_assets")) {
      return {
        get: (requirementId: number) => ({
          count: this.options.requirementAssetCounts?.[requirementId] || 0,
        }),
      };
    }

    if (normalized.includes("SELECT requirement_id FROM test_case_requirements")) {
      return {
        all: (testCaseId: number) =>
          (this.options.linkedRequirementsByCase?.[testCaseId] || []).map((requirement_id) => ({ requirement_id })),
      };
    }

    if (normalized.includes("SELECT tara_id FROM test_case_tara_links")) {
      return {
        all: (testCaseId: number) =>
          (this.options.linkedTarasByCase?.[testCaseId] || []).map((tara_id) => ({ tara_id })),
      };
    }

    if (normalized.includes("SELECT id, reason FROM reverification_todos")) {
      return {
        get: (entityType: TodoRow["entity_type"], entityId: number) =>
          this.todos.find((row) => row.entity_type === entityType && row.entity_id === entityId && row.status === "PENDING"),
      };
    }

    if (normalized.includes("INSERT INTO reverification_todos")) {
      return {
        run: (
          entityType: TodoRow["entity_type"],
          entityId: number,
          reason: string,
        ) => {
          this.todos.push({
            id: this.todos.length + 1,
            entity_type: entityType,
            entity_id: entityId,
            reason,
            status: "PENDING",
          });
        },
      };
    }

    if (normalized.includes("UPDATE requirements")) {
      return {
        run: (verificationStatus: string, requirementId: number) => {
          this.requirementStatuses.set(requirementId, verificationStatus);
        },
      };
    }

    if (normalized.includes("UPDATE tara_items")) {
      return {
        run: (verificationStatus: string, taraId: number) => {
          this.taraStatuses.set(taraId, verificationStatus);
        },
      };
    }

    if (normalized.includes("UPDATE test_cases")) {
      return {
        run: (verificationStatus: string, testCaseId: number) => {
          this.testCaseStatuses.set(testCaseId, verificationStatus);
        },
      };
    }

    throw new Error(`Unhandled SQL in test: ${normalized}`);
  }
}

describe("traceability-governance", () => {
  it("validates baseline suite cases for missing default inputs", () => {
    const db = new MockTraceabilityDb({
      cases: [
        {
          id: 1,
          title: "SSH 弱口令检查",
          required_inputs: JSON.stringify(["connection_address", "ssh_port"]),
          default_runtime_inputs: JSON.stringify({}),
        },
        {
          id: 2,
          title: "ADB 访问检查",
          required_inputs: JSON.stringify(["connection_address", "adb_port"]),
          default_runtime_inputs: JSON.stringify({ adb_port: "5555" }),
        },
      ],
    });

    expect(validateBaselineSuiteCases(db as never, [1, 2, 999])).toEqual([
      {
        testCaseId: 1,
        title: "SSH 弱口令检查",
        valid: false,
        reason: "缺少默认输入值: ssh_port",
        missingInputs: ["ssh_port"],
      },
      {
        testCaseId: 2,
        title: "ADB 访问检查",
        valid: true,
        reason: undefined,
        missingInputs: [],
      },
      {
        testCaseId: 999,
        title: "用例#999",
        valid: false,
        reason: "用例不存在",
        missingInputs: [],
      },
    ]);
  });

  it("marks linked entities as pending reverification when a test case changes", () => {
    const db = new MockTraceabilityDb({
      linkedRequirementsByCase: { 3: [11] },
      linkedTarasByCase: { 3: [21] },
    });

    markTestCaseChangeImpact(db as never, 3, "测试用例内容变更后待复验");

    expect(db.testCaseStatuses.get(3)).toBe("PENDING_REVERIFICATION");
    expect(db.requirementStatuses.get(11)).toBe("PENDING_REVERIFICATION");
    expect(db.taraStatuses.get(21)).toBe("PENDING_REVERIFICATION");
    expect(db.todos).toEqual([
      expect.objectContaining({ entity_type: "TEST_CASE", entity_id: 3, reason: "测试用例内容变更后待复验" }),
      expect.objectContaining({ entity_type: "REQUIREMENT", entity_id: 11, reason: "受测试用例变更影响: CASE#3" }),
      expect.objectContaining({ entity_type: "TARA", entity_id: 21, reason: "受测试用例变更影响: CASE#3" }),
    ]);
  });

  it("prevents closing requirements without linked assets", () => {
    const db = new MockTraceabilityDb({
      requirementAssetCounts: { 8: 0 },
    });

    expect(() => assertRequirementClosureIntegrity(db as never, 8, "CLOSED")).toThrow("需求未绑定资产");
  });
});
