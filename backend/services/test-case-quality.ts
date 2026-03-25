type NormalizeContext = {
  source: "create" | "update" | "import";
  row?: number;
};

type NormalizeSuccess = {
  ok: true;
  value: {
    title: string;
    category: string;
    security_domain: string;
    type: "Automated" | "Manual";
    protocol: string;
    description: string;
    steps: string[];
    test_input: string;
    test_tool: string;
    expected_result: string;
    automation_level: "A" | "B" | "C" | "D";
    executor_type: "python" | "shell" | "manual";
    script_path: string;
    command_template: string;
    args_template: string;
    timeout_sec: number;
    required_inputs: string[];
    default_runtime_inputs: Record<string, string>;
  };
};

type NormalizeFailure = {
  ok: false;
  error: string;
};

type NormalizeResult = NormalizeSuccess | NormalizeFailure;

export type NormalizedTestCasePayload = NormalizeSuccess["value"];

const MANUAL_DEFAULT_STEPS = [
  "步骤1：准备测试环境并确认前置条件（资产在线、权限与连接可用）。",
  "步骤2：按测试目标执行人工操作并记录关键现象与返回信息。",
  "步骤3：依据判定标准输出通过/失败结论并补充证据说明。",
];

const EXPECTED_RESULT_HINTS = [
  "通过",
  "失败",
  "拒绝",
  "允许",
  "禁止",
  "阻止",
  "拦截",
  "判定",
  "告警",
  "must",
  "pass",
  "fail",
  "deny",
  "allow",
  "blocked",
];

const isObjectRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) => String(value ?? "").trim();

const normalizeCaseType = (value: unknown): "Automated" | "Manual" => {
  return asString(value).toLowerCase() === "manual" ? "Manual" : "Automated";
};

const normalizeAutomationLevel = (value: unknown, type: "Automated" | "Manual"): "A" | "B" | "C" | "D" => {
  const normalized = asString(value).toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D") {
    return normalized;
  }
  return type === "Manual" ? "B" : "A";
};

const normalizeExecutorType = (value: unknown, type: "Automated" | "Manual"): "python" | "shell" | "manual" => {
  if (type === "Manual") return "manual";
  const normalized = asString(value).toLowerCase();
  if (normalized === "python" || normalized === "shell") return normalized;
  return "python";
};

const parseSteps = (raw: unknown): string[] => {
  const splitAndTrim = (text: string) =>
    text
      .replace(/[；;]+/g, "\n")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

  const normalizeContent = (step: string) =>
    step
      .replace(/^步骤\s*\d+\s*[：:、.)-]?\s*/i, "")
      .replace(/^\d+\s*[：:、.)-]\s*/, "")
      .trim();

  let candidates: string[] = [];
  if (Array.isArray(raw)) {
    candidates = raw.map((item) => asString(item)).filter(Boolean);
  } else {
    const text = asString(raw);
    if (text) candidates = splitAndTrim(text);
  }

  const cleaned = candidates.map(normalizeContent).filter(Boolean);
  return cleaned.map((content, index) => `步骤${index + 1}：${content}`);
};

const isExpectedResultDeterministic = (value: string) => {
  const text = value.trim();
  if (text.length < 8) return false;
  const lower = text.toLowerCase();
  return EXPECTED_RESULT_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
};

const buildManualTemplate = (payload: {
  title: string;
  protocol: string;
  test_tool: string;
  description: string;
  test_input: string;
  expected_result: string;
  steps: string[];
}) => {
  const target = payload.title || "该测试场景";
  const protocolOrTool = [payload.protocol, payload.test_tool].map((item) => item.trim()).filter(Boolean).join(" / ");
  const operationHint = protocolOrTool ? `（参考协议/工具：${protocolOrTool}）` : "";
  const description = payload.description || `手动验证${target}，通过人工操作与观察记录评估安全控制策略是否有效。`;
  const test_input = payload.test_input || "测试资产连接地址（自动注入）；人工操作记录；必要测试样本。";
  const expected_result =
    payload.expected_result || `${target}执行后，未授权或异常行为应被拒绝/拦截，并可明确判定通过或失败。`;
  const steps =
    payload.steps.length >= 2
      ? payload.steps
      : MANUAL_DEFAULT_STEPS.map((step, index) => {
          if (index !== 1 || !operationHint) return step;
          return `步骤2：按测试目标执行人工操作并记录关键现象与返回信息${operationHint}。`;
        });
  return { description, test_input, expected_result, steps };
};

const normalizeRequiredInputs = (value: unknown, type: "Automated" | "Manual"): string[] => {
  const raw = Array.isArray(value) ? value : [];
  const normalized = Array.from(
    new Set(
      raw
        .map((item) => asString(item))
        .filter(Boolean),
    ),
  );
  if (normalized.length > 0) return normalized;
  if (type === "Manual") return ["connection_address"];
  return [];
};

const normalizeDefaultRuntimeInputs = (value: unknown, requiredInputs: string[]): Record<string, string> => {
  if (!isObjectRecord(value)) return {};
  const allowed = new Set(requiredInputs);
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, rawValue]) => [key, asString(rawValue)] as const)
      .filter(([key, item]) => allowed.has(key) && item),
  );
};

const withContext = (context: NormalizeContext, message: string) => {
  if (context.source === "import" && context.row) {
    return `第 ${context.row} 条：${message}`;
  }
  return message;
};

export const normalizeAndValidateTestCasePayload = (raw: unknown, context: NormalizeContext): NormalizeResult => {
  if (!isObjectRecord(raw)) {
    return { ok: false, error: withContext(context, "请求体格式错误") };
  }

  const title = asString(raw.title);
  const category = asString(raw.category || raw.module);
  const security_domain = asString(raw.security_domain);
  const type = normalizeCaseType(raw.type);
  const protocol = asString(raw.protocol);
  let description = asString(raw.description);
  let steps = parseSteps(raw.steps);
  let test_input = asString(raw.test_input);
  let test_tool = asString(raw.test_tool);
  let expected_result = asString(raw.expected_result);
  const automation_level = normalizeAutomationLevel(raw.automation_level, type);
  const executor_type = normalizeExecutorType(raw.executor_type, type);
  const script_path = type === "Manual" ? "" : asString(raw.script_path);
  const command_template = asString(raw.command_template);
  const args_template = asString(raw.args_template);
  const timeout_sec = Math.max(1, Number(raw.timeout_sec || 300) || 300);
  const required_inputs = normalizeRequiredInputs(raw.required_inputs, type);
  const default_runtime_inputs = normalizeDefaultRuntimeInputs(raw.default_runtime_inputs, required_inputs);

  if (type === "Manual") {
    if (!test_tool) test_tool = "人工检查";
    const template = buildManualTemplate({
      title,
      protocol,
      test_tool,
      description,
      test_input,
      expected_result,
      steps,
    });
    description = template.description;
    test_input = template.test_input;
    expected_result = template.expected_result;
    steps = template.steps;
  }

  if (!title) return { ok: false, error: withContext(context, "用例名称不能为空") };
  if (!category) return { ok: false, error: withContext(context, "目标模块/业务域不能为空") };
  if (!security_domain || security_domain === "未分类") {
    return { ok: false, error: withContext(context, "安全分类不能为空，且不能为“未分类”") };
  }
  if (!protocol) return { ok: false, error: withContext(context, "测试协议不能为空") };
  if (!test_tool) return { ok: false, error: withContext(context, "测试工具不能为空") };
  if (steps.length < 2) return { ok: false, error: withContext(context, "测试步骤至少需要 2 步") };
  if (!isExpectedResultDeterministic(expected_result)) {
    return { ok: false, error: withContext(context, "预期结果不可判定，请明确通过/失败或允许/拒绝判定标准") };
  }

  if (type === "Automated") {
    if (executor_type === "manual") {
      return { ok: false, error: withContext(context, "自动化用例执行器不能为 manual") };
    }
    if (!script_path) {
      return { ok: false, error: withContext(context, "自动化用例必须填写脚本路径") };
    }
  }

  return {
    ok: true,
    value: {
      title,
      category,
      security_domain,
      type,
      protocol,
      description,
      steps,
      test_input,
      test_tool,
      expected_result,
      automation_level,
      executor_type,
      script_path,
      command_template,
      args_template,
      timeout_sec,
      required_inputs,
      default_runtime_inputs,
    },
  };
};
