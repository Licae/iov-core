import { describe, expect, it } from "vitest";
import { normalizeAndValidateTestCasePayload } from "./test-case-quality";

describe("normalizeAndValidateTestCasePayload", () => {
  it("builds manual case defaults and injects connection input", () => {
    const result = normalizeAndValidateTestCasePayload({
      title: "登录控制检查",
      category: "IVI",
      security_domain: "访问控制",
      type: "Manual",
      protocol: "SSH",
      test_tool: "",
      description: "",
      test_input: "",
      expected_result: "",
      steps: "步骤1：登录\n步骤2：验证告警",
    }, { source: "create" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executor_type).toBe("manual");
    expect(result.value.test_tool).toBe("人工检查");
    expect(result.value.required_inputs).toEqual(["connection_address"]);
    expect(result.value.expected_result).toContain("拒绝/拦截");
  });

  it("rejects automated cases without script path", () => {
    const result = normalizeAndValidateTestCasePayload({
      title: "TLS 检查",
      category: "Gateway",
      security_domain: "网络暴露",
      type: "Automated",
      protocol: "TLS",
      test_tool: "openssl",
      expected_result: "连接失败时必须明确判定失败",
      steps: ["准备环境", "执行探测"],
      script_path: "",
    }, { source: "create" });

    expect(result).toEqual({
      ok: false,
      error: "自动化用例必须填写脚本路径",
    });
  });

  it("adds import row context to validation errors", () => {
    const result = normalizeAndValidateTestCasePayload({}, { source: "import", row: 3 });

    expect(result).toEqual({
      ok: false,
      error: "第 3 条：用例名称不能为空",
    });
  });
});
