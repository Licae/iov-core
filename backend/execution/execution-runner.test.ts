import { describe, expect, it } from "vitest";
import { ExecutionRunner } from "./execution-runner";
import { FAILURE_CATEGORY, TEST_RESULT } from "./execution-types";

const createRunner = (overrides?: Partial<ConstructorParameters<typeof ExecutionRunner>[0]>) =>
  new ExecutionRunner({
    executionMode: "python",
    executionScript: "",
    pythonExecutable: "python3",
    pythonSecurityRunner: "scripts/security_runner.py",
    artifactRoot: "/tmp",
    createTaskArtifactDir: () => "/tmp",
    broadcast: () => {},
    ...overrides,
  });

const baseTask = {
  id: 1,
  type: "single" as const,
  status: "PENDING" as const,
  runtime_inputs: null,
};

const baseItem = {
  id: 10,
  test_case_id: 100,
  title: "SSH 安全检查",
  protocol: "SSH",
  category: "IVI",
  description: "验证 SSH 前置检查",
  test_tool: "ssh_access_check",
  expected_result: "未授权访问应被拒绝",
  executor_type: "python",
  script_path: "scripts/ssh_access_check.py",
  required_inputs: JSON.stringify(["connection_address", "ssh_port"]),
};

describe("ExecutionRunner preflight", () => {
  it("blocks execution when connection_address is missing", async () => {
    const runner = createRunner();
    const outcome = await runner.runWithPreflight(baseTask, baseItem, () => {});

    expect(outcome.adapterName).toBe("python");
    expect(outcome.result).toBe(TEST_RESULT.BLOCKED);
    expect(outcome.failureCategory).toBe(FAILURE_CATEGORY.ENVIRONMENT);
    expect(outcome.summary).toContain("连接地址为空");
    expect(outcome.stepResults[0]?.name).toContain("连接地址");
  });

  it("blocks execution when required command is unavailable", async () => {
    const runner = createRunner({ pythonExecutable: "definitely-missing-python-binary" });
    const outcome = await runner.runWithPreflight(
      {
        ...baseTask,
        runtime_inputs: JSON.stringify({ connection_address: "127.0.0.1" }),
      },
      {
        ...baseItem,
        required_inputs: JSON.stringify(["connection_address"]),
      },
      () => {},
    );

    expect(outcome.result).toBe(TEST_RESULT.BLOCKED);
    expect(outcome.failureCategory).toBe(FAILURE_CATEGORY.ENVIRONMENT);
    expect(outcome.summary).toContain("未安装或未配置 definitely-missing-python-binary");
  });
});
