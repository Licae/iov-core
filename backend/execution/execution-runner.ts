import net from "net";
import path from "path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "child_process";
import { writeFileSync } from "fs";
import { createExecutorAdapterRegistry } from "../executors";
import {
  FAILURE_CATEGORY,
  TEST_RESULT,
  normalizeTestResult,
  type ExecutionStatus,
  type FailureCategory,
  type TestResult,
} from "./execution-types";

type ExecutionTaskRecord = {
  id: number;
  type: "single" | "suite";
  status: ExecutionStatus;
  asset_id?: number | null;
  suite_id?: number | null;
  runtime_inputs?: string | null;
};

type ExecutionTaskItemRecord = {
  id: number;
  test_case_id: number;
  title: string;
  protocol?: string | null;
  category?: string | null;
  description?: string | null;
  test_input?: string | null;
  test_tool?: string | null;
  expected_result?: string | null;
  executor_type?: string | null;
  script_path?: string | null;
  command_template?: string | null;
  args_template?: string | null;
  required_inputs?: string | null;
  default_runtime_inputs?: string | null;
  asset_name?: string | null;
  connection_address?: string | null;
};

type StepExecutionResult = {
  name: string;
  result: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "RUNNING" | "SKIPPED";
  logs?: string;
  duration?: number;
  command?: string;
  command_result?: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "RUNNING" | "SKIPPED";
  output?: string;
  security_assessment?: string;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  timestamp?: string;
  conclusion?: string;
};

type CommandEvidence = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  signal?: NodeJS.Signals | null;
};

type ExecutorResult = {
  result: TestResult;
  duration: number;
  logs: string;
  summary?: string;
  stepResults?: StepExecutionResult[];
  failureCategory?: FailureCategory;
  evidence?: CommandEvidence;
};

type PreflightResult = {
  ok: boolean;
  duration: number;
  logs: string;
  summary: string;
  stepResults: StepExecutionResult[];
  failureCategory?: FailureCategory;
};

type RunnerOutcome = {
  adapterName: string;
  result: TestResult;
  duration: number;
  logs: string;
  summary: string;
  stepResults: StepExecutionResult[];
  failureCategory: FailureCategory;
};

type TaskExecutor = (
  task: ExecutionTaskRecord,
  item: ExecutionTaskItemRecord,
  broadcast: (data: unknown) => void,
  registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
) => Promise<ExecutorResult>;

type ExecutorAdapter = {
  name: string;
  matches: (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) => boolean;
  run: TaskExecutor;
};

type ExecutionRunnerOptions = {
  executionMode: string;
  executionScript?: string;
  pythonExecutable: string;
  pythonSecurityRunner: string;
  enabledExecutorPlugins?: string[];
  artifactRoot: string;
  createTaskArtifactDir: (taskId: number, itemId: number, artifactType: "payloads" | "adb-push" | "adb-pull" | "logs") => string;
  broadcast: (data: unknown) => void;
};

const normalizeStepResult = (value?: string | null): StepExecutionResult["result"] => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PASSED") return "PASSED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "BLOCKED") return "BLOCKED";
  if (normalized === "ERROR") return "ERROR";
  if (normalized === "RUNNING") return "RUNNING";
  if (normalized === "SKIPPED") return "SKIPPED";
  return "ERROR";
};

export class ExecutionRunner {
  private readonly executionMode: string;
  private readonly executionScript?: string;
  private readonly pythonExecutable: string;
  private readonly pythonSecurityRunner: string;
  private readonly artifactRoot: string;
  private readonly createTaskArtifactDir: (taskId: number, itemId: number, artifactType: "payloads" | "adb-push" | "adb-pull" | "logs") => string;
  private readonly broadcast: (data: unknown) => void;
  private readonly commandAvailabilityCache = new Map<string, { checkedAt: number; available: boolean; stdout: string; stderr: string }>();
  private readonly adapterRegistry: ExecutorAdapter[];

  constructor(options: ExecutionRunnerOptions) {
    this.executionMode = options.executionMode;
    this.executionScript = options.executionScript;
    this.pythonExecutable = options.pythonExecutable;
    this.pythonSecurityRunner = options.pythonSecurityRunner;
    this.artifactRoot = options.artifactRoot;
    this.createTaskArtifactDir = options.createTaskArtifactDir;
    this.broadcast = options.broadcast;
    this.adapterRegistry = createExecutorAdapterRegistry({
      executionMode: this.executionMode,
      shellExecutor: this.shellExecutor,
      pythonExecutor: this.pythonExecutor,
      scapyExecutor: this.scapyExecutor,
      canoeExecutor: this.canoeExecutor,
      simulateExecutor: this.simulateExecutor,
    }, {
      enabledPluginNames: options.enabledExecutorPlugins,
    });
  }

  async runWithPreflight(
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
  ): Promise<RunnerOutcome> {
    const adapter = this.resolveExecutorAdapter(task, item);
    const preflight = await this.runPreflightChecks(task, item, adapter);
    if (!preflight.ok) {
      return {
        adapterName: adapter.name,
        result: TEST_RESULT.BLOCKED,
        duration: preflight.duration,
        logs: preflight.logs,
        summary: preflight.summary,
        stepResults: preflight.stepResults,
        failureCategory: preflight.failureCategory || FAILURE_CATEGORY.ENVIRONMENT,
      };
    }

    try {
      const execution = await adapter.run(task, item, this.broadcast, registerChild);
      const result = normalizeTestResult(execution.result);
      const logs = execution.logs;
      const summary = execution.summary || "";
      const stepResults = this.enrichStepResultsWithEvidence(execution.stepResults, result, logs, execution.evidence);
      const failureCategory = result === TEST_RESULT.PASSED
        ? FAILURE_CATEGORY.NONE
        : (execution.failureCategory || this.classifyFailureCategory(result, logs, summary, stepResults));
      return {
        adapterName: adapter.name,
        result,
        duration: execution.duration,
        logs,
        summary,
        stepResults,
        failureCategory,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution error";
      return {
        adapterName: adapter.name,
        result: TEST_RESULT.ERROR,
        duration: 0,
        logs: message,
        summary: `执行器异常: ${message}`,
        stepResults: this.enrichStepResultsWithEvidence(
          [{ name: "执行器异常", result: "ERROR", logs: message, duration: 0, conclusion: "执行器异常导致任务失败。" }],
          TEST_RESULT.ERROR,
          message,
        ),
        failureCategory: FAILURE_CATEGORY.SCRIPT,
      };
    }
  }

  private parseJsonArray(value?: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private parseJsonObject(value?: string | null): Record<string, string> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .map(([key, raw]) => [key, String(raw ?? "").trim()] as const)
          .filter(([, normalized]) => normalized !== "")
      );
    } catch {
      return {};
    }
  }

  private resolveTaskRuntimeInputs(task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) {
    const taskInputs = this.parseJsonObject(task.runtime_inputs);
    const defaultInputs = this.parseJsonObject(item.default_runtime_inputs);
    const merged = {
      ...defaultInputs,
      ...taskInputs,
    };
    if (!merged.connection_address && item.connection_address) {
      merged.connection_address = String(item.connection_address).trim();
    }
    return merged;
  }

  private toSafeCommand(value: string) {
    return /^[A-Za-z0-9._-]+$/.test(value) ? value : "";
  }

  private checkCommandAvailability(command: string) {
    const normalized = this.toSafeCommand(command.trim());
    if (!normalized) {
      return { available: false, stdout: "", stderr: "invalid command name", exitCode: 1 };
    }
    const cached = this.commandAvailabilityCache.get(normalized);
    if (cached && Date.now() - cached.checkedAt < 15_000) {
      return { available: cached.available, stdout: cached.stdout, stderr: cached.stderr, exitCode: cached.available ? 0 : 1 };
    }
    const check = spawnSync("sh", ["-lc", `command -v ${normalized}`], { encoding: "utf8" });
    const stdout = String(check.stdout || "").trim();
    const stderr = String(check.stderr || "").trim();
    const available = check.status === 0;
    this.commandAvailabilityCache.set(normalized, { checkedAt: Date.now(), available, stdout, stderr });
    return { available, stdout, stderr, exitCode: available ? 0 : 1 };
  }

  private commandTokenFromPath(commandPath?: string | null) {
    const first = String(commandPath || "").trim().split(/\s+/)[0];
    return this.toSafeCommand(first);
  }

  private probeTcpPort(host: string, port: number, timeoutMs = 1800) {
    return new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
      const socket = net.createConnection({ host, port });
      let resolved = false;
      const settle = (payload: { success: boolean; stdout: string; stderr: string }) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(payload);
      };
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => settle({ success: true, stdout: `connected to ${host}:${port}`, stderr: "" }));
      socket.once("timeout", () => settle({ success: false, stdout: "", stderr: `connect timeout (${timeoutMs}ms)` }));
      socket.once("error", (error) => settle({ success: false, stdout: "", stderr: error.message }));
    });
  }

  private keywordMatches(text: string, keywords: string[]) {
    return keywords.some((keyword) => text.includes(keyword));
  }

  private classifyFailureCategory(
    result: TestResult,
    logs: string,
    summary: string,
    stepResults?: StepExecutionResult[],
  ): FailureCategory {
    if (result === TEST_RESULT.PASSED) return FAILURE_CATEGORY.NONE;
    const haystack = [logs, summary, ...(stepResults || []).map((step) => `${step.logs || ""}\n${step.output || ""}\n${step.stderr || ""}\n${step.conclusion || ""}`)]
      .join("\n")
      .toLowerCase();
    const permissionKeywords = [
      "permission denied",
      "access denied",
      "unauthorized",
      "forbidden",
      "authentication failed",
      "auth failed",
      "login failed",
      "credential",
      "权限",
      "鉴权",
      "未授权",
      "拒绝访问",
    ];
    const environmentKeywords = [
      "no route",
      "host unreachable",
      "timeout",
      "timed out",
      "connection refused",
      "not found",
      "command not found",
      "dns",
      "network is unreachable",
      "address is empty",
      "missing payload",
      "invalid port",
      "environment",
      "连接失败",
      "不可达",
      "超时",
      "前置",
      "blocked",
    ];
    if (this.keywordMatches(haystack, permissionKeywords)) return FAILURE_CATEGORY.PERMISSION;
    if (result === TEST_RESULT.BLOCKED || this.keywordMatches(haystack, environmentKeywords)) return FAILURE_CATEGORY.ENVIRONMENT;
    return FAILURE_CATEGORY.SCRIPT;
  }

  private normalizeStepEvidence(step: StepExecutionResult, evidence?: CommandEvidence): StepExecutionResult {
    const fallbackTimestamp = evidence?.finishedAt || new Date().toISOString();
    const normalizedCommandResult = step.command_result ? normalizeStepResult(step.command_result) : undefined;
    let derivedExitCode: number | null | undefined;
    if (typeof step.exit_code === "number") {
      derivedExitCode = step.exit_code;
    } else if (normalizedCommandResult) {
      if (normalizedCommandResult === "PASSED") derivedExitCode = 0;
      else if (normalizedCommandResult === "FAILED" || normalizedCommandResult === "ERROR" || normalizedCommandResult === "BLOCKED") derivedExitCode = 1;
    } else if (typeof evidence?.exitCode === "number") {
      derivedExitCode = evidence.exitCode;
    }
    const stdout = step.stdout ?? step.output ?? evidence?.stdout ?? "";
    const stderr = step.stderr ?? evidence?.stderr ?? "";
    const conclusion = step.conclusion || step.security_assessment || step.logs || "";
    return {
      ...step,
      result: normalizeStepResult(step.result),
      command_result: normalizedCommandResult || step.command_result,
      command: step.command || evidence?.command || step.command || "",
      output: step.output || stdout || stderr ? step.output || stdout || stderr : "",
      exit_code: derivedExitCode ?? null,
      stdout,
      stderr,
      timestamp: step.timestamp || fallbackTimestamp,
      conclusion,
      security_assessment: step.security_assessment || conclusion,
    };
  }

  private buildFallbackStepResult(result: TestResult, logs: string, evidence?: CommandEvidence): StepExecutionResult {
    const commandResult = result === TEST_RESULT.PASSED
      ? "PASSED"
      : result === TEST_RESULT.BLOCKED
        ? "BLOCKED"
        : "FAILED";
    return this.normalizeStepEvidence({
      name: "执行结果",
      result,
      logs,
      duration: 0,
      command: evidence?.command || "",
      command_result: commandResult,
      output: [evidence?.stdout, evidence?.stderr].filter(Boolean).join("\n"),
      conclusion: result === TEST_RESULT.PASSED ? "执行命令完成，结果通过。" : "执行命令未通过，请查看命令输出。",
    }, evidence);
  }

  private enrichStepResultsWithEvidence(
    stepResults: StepExecutionResult[] | undefined,
    result: TestResult,
    logs: string,
    evidence?: CommandEvidence,
  ) {
    if (!stepResults || stepResults.length === 0) {
      return [this.buildFallbackStepResult(result, logs, evidence)];
    }
    return stepResults.map((step) => this.normalizeStepEvidence(step, evidence));
  }

  private async runPreflightChecks(
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    adapter: ExecutorAdapter,
  ): Promise<PreflightResult> {
    const startedAt = Date.now();
    const steps: StepExecutionResult[] = [];
    const runtimeInputs = this.resolveTaskRuntimeInputs(task, item);
    const requiredInputs = this.parseJsonArray(item.required_inputs);
    const signature = [item.title, item.test_tool, item.script_path, item.description].filter(Boolean).join(" ").toLowerCase();
    const connectionAddress = String(runtimeInputs.connection_address || "").trim();
    const needsConnectionAddress = requiredInputs.includes("connection_address") ||
      requiredInputs.some((key) => key.endsWith("_port")) ||
      signature.includes("adb") ||
      signature.includes("ssh");
    const nowTimestamp = () => new Date().toISOString();

    const pushStep = (step: StepExecutionResult) => {
      steps.push(this.normalizeStepEvidence({
        ...step,
        timestamp: step.timestamp || nowTimestamp(),
      }));
    };

    if (needsConnectionAddress) {
      if (!connectionAddress) {
        pushStep({
          name: "前置检查：连接地址",
          result: "BLOCKED",
          logs: "未配置连接地址。",
          command: "validate connection_address",
          command_result: "BLOCKED",
          exit_code: 1,
          stderr: "connection_address is empty",
          conclusion: "任务缺少必要资产连接地址，无法执行。",
        });
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        return {
          ok: false,
          duration,
          logs: "前置检查失败：未配置连接地址。",
          summary: "前置检查失败：连接地址为空。",
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: "前置检查：连接地址",
        result: "PASSED",
        logs: `连接地址 ${connectionAddress} 已就绪。`,
        command: "validate connection_address",
        command_result: "PASSED",
        exit_code: 0,
        stdout: connectionAddress,
        conclusion: "已获取可用连接地址。",
      });
    }

    const requiredCommands = new Set<string>();
    if (adapter.name === "python" || adapter.name === "scapy") {
      requiredCommands.add(this.pythonExecutable);
    }
    if (adapter.name === "canoe") {
      const explicitCommand = this.commandTokenFromPath(item.command_template) || this.commandTokenFromPath(item.script_path);
      if (explicitCommand) {
        requiredCommands.add(explicitCommand);
      } else {
        requiredCommands.add("canoe");
      }
    }
    if (requiredInputs.includes("adb_port") || signature.includes("adb")) {
      requiredCommands.add("adb");
    }
    if (requiredInputs.includes("ssh_port") || signature.includes("ssh")) {
      requiredCommands.add("ssh");
    }

    for (const command of requiredCommands) {
      const started = Date.now();
      const checked = this.checkCommandAvailability(command);
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (!checked.available) {
        pushStep({
          name: `前置检查：命令 ${command}`,
          result: "BLOCKED",
          logs: `命令 ${command} 不可用。`,
          duration,
          command: `command -v ${command}`,
          command_result: "FAILED",
          exit_code: checked.exitCode,
          stdout: checked.stdout,
          stderr: checked.stderr || `${command} not found`,
          conclusion: `缺少 ${command}，任务无法启动。`,
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：命令 ${command} 不可用。`,
          summary: `前置检查失败：未安装或未配置 ${command}。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: `前置检查：命令 ${command}`,
        result: "PASSED",
        logs: `命令 ${command} 可用。`,
        duration,
        command: `command -v ${command}`,
        command_result: "PASSED",
        exit_code: 0,
        stdout: checked.stdout || command,
        stderr: checked.stderr,
        conclusion: `${command} 可执行。`,
      });
    }

    const portChecks: Array<{ key: string; label: string; fallback: number }> = [];
    if (requiredInputs.includes("adb_port") || signature.includes("adb")) {
      portChecks.push({ key: "adb_port", label: "ADB", fallback: 5555 });
    }
    if (requiredInputs.includes("ssh_port") || signature.includes("ssh")) {
      portChecks.push({ key: "ssh_port", label: "SSH", fallback: 22 });
    }

    for (const check of portChecks) {
      const portRaw = String(runtimeInputs[check.key] || check.fallback);
      const portValue = Number(portRaw);
      if (!Number.isInteger(portValue) || portValue <= 0 || portValue > 65535) {
        pushStep({
          name: `前置检查：${check.label} 端口`,
          result: "BLOCKED",
          logs: `${check.label} 端口配置无效: ${portRaw}`,
          command: `validate port ${check.key}`,
          command_result: "BLOCKED",
          exit_code: 1,
          stderr: `invalid port: ${portRaw}`,
          conclusion: "端口参数不合法，无法继续执行。",
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：${check.label} 端口配置无效。`,
          summary: `前置检查失败：${check.label} 端口配置无效。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      const started = Date.now();
      const tcp = await this.probeTcpPort(connectionAddress, portValue);
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (!tcp.success) {
        pushStep({
          name: `前置检查：${check.label} 端口连通性`,
          result: "BLOCKED",
          logs: `${check.label} 端口不可达：${tcp.stderr || "连接失败"}`,
          duration,
          command: `tcp_connect ${connectionAddress}:${portValue}`,
          command_result: "BLOCKED",
          exit_code: 1,
          stdout: tcp.stdout,
          stderr: tcp.stderr,
          conclusion: `${check.label} 端口不可达，任务在前置检查阶段阻塞。`,
        });
        return {
          ok: false,
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          logs: `前置检查失败：${check.label} 端口不可达。`,
          summary: `前置检查失败：${connectionAddress}:${portValue} 不可达。`,
          stepResults: steps,
          failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
        };
      }
      pushStep({
        name: `前置检查：${check.label} 端口连通性`,
        result: "PASSED",
        logs: `${check.label} 端口可达。`,
        duration,
        command: `tcp_connect ${connectionAddress}:${portValue}`,
        command_result: "PASSED",
        exit_code: 0,
        stdout: tcp.stdout,
        stderr: tcp.stderr,
        conclusion: `${check.label} 前置连通性通过。`,
      });
    }

    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    return {
      ok: true,
      duration,
      logs: "前置检查通过。",
      summary: "前置检查通过。",
      stepResults: steps,
    };
  }

  private renderExecutorTemplate(
    template: string,
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    extra: Record<string, string> = {},
  ) {
    return template
      .replace(/\{\{taskId\}\}/g, String(task.id))
      .replace(/\{\{testCaseId\}\}/g, String(item.test_case_id))
      .replace(/\{\{suiteId\}\}/g, String(task.suite_id || ""))
      .replace(/\{\{assetId\}\}/g, String(task.asset_id || ""))
      .replace(/\{\{title\}\}/g, item.title)
      .replace(/\{\{protocol\}\}/g, item.protocol || "")
      .replace(/\{\{target\}\}/g, item.connection_address || "")
      .replace(/\{\{assetName\}\}/g, item.asset_name || "")
      .replace(/\{\{pythonExecutable\}\}/g, this.pythonExecutable)
      .replace(/\{\{payloadPath\}\}/g, extra.payloadPath || "");
  }

  private buildScriptCommand(task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) {
    const baseCommand = item.command_template || item.script_path || this.executionScript;
    if (!baseCommand) return null;
    const rendered = this.renderExecutorTemplate(baseCommand, task, item);
    const renderedArgs = this.renderExecutorTemplate(item.args_template || "", task, item);
    return [rendered, renderedArgs].filter(Boolean).join(" ").trim();
  }

  private parseExecutorOutput(result: ExecutorResult) {
    const fallbackEvidence = result.evidence;
    const fallbackDuration = Number(result.duration || 0);
    try {
      const lines = result.logs.split("\n").filter(Boolean);
      const lastJsonLine = [...lines].reverse().find((line) => {
        const normalized = line.replace(/^\[(stdout|stderr)\]\s*/i, "").trim();
        return normalized.startsWith("{") && normalized.endsWith("}");
      });
      if (!lastJsonLine) {
        return {
          ...result,
          stepResults: this.enrichStepResultsWithEvidence(result.stepResults, result.result, result.logs, fallbackEvidence),
          failureCategory: result.failureCategory || this.classifyFailureCategory(result.result, result.logs, result.summary || "", result.stepResults),
        };
      }
      const parsed = JSON.parse(lastJsonLine.replace(/^\[(stdout|stderr)\]\s*/i, "").trim());
      const normalizedResult = normalizeTestResult(parsed.result, result.result);
      const normalizedLogs = parsed.logs || result.logs;
      const normalizedSummary = parsed.summary || parsed.logs || result.summary || "";
      const parsedSteps = Array.isArray(parsed.steps)
        ? parsed.steps.map((step: Record<string, unknown>) => ({
            ...step,
            result: normalizeStepResult(String(step?.result || "")),
            command_result: step?.command_result ? normalizeStepResult(String(step.command_result || "")) : undefined,
          } as StepExecutionResult))
        : result.stepResults;
      const normalizedStepResults = this.enrichStepResultsWithEvidence(parsedSteps, normalizedResult, normalizedLogs, fallbackEvidence);
      return {
        ...result,
        result: normalizedResult,
        duration: Number(parsed.duration || fallbackDuration),
        logs: normalizedLogs,
        summary: normalizedSummary,
        stepResults: normalizedStepResults,
        failureCategory: result.failureCategory || this.classifyFailureCategory(normalizedResult, normalizedLogs, normalizedSummary, normalizedStepResults),
      } as ExecutorResult;
    } catch {
      return {
        ...result,
        stepResults: this.enrichStepResultsWithEvidence(result.stepResults, result.result, result.logs, fallbackEvidence),
        failureCategory: result.failureCategory || this.classifyFailureCategory(result.result, result.logs, result.summary || "", result.stepResults),
      };
    }
  }

  private spawnCommandExecutor(
    command: string,
    task: ExecutionTaskRecord,
    item: ExecutionTaskItemRecord,
    broadcastEvent: (data: unknown) => void,
    registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
  ): Promise<ExecutorResult> {
    return new Promise<ExecutorResult>((resolve) => {
      if (!command) {
        resolve({
          result: TEST_RESULT.ERROR,
          duration: 0,
          logs: "EXECUTION_SCRIPT is not configured",
        });
        return;
      }

      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const output: string[] = [];
      const stdoutOutput: string[] = [];
      const stderrOutput: string[] = [];
      const child = spawn(command, { shell: true, cwd: process.cwd(), env: process.env });
      registerChild(child);

      const handleChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
        const text = chunk.toString().trim();
        if (!text) return;
        output.push(`[${stream}] ${text}`);
        if (stream === "stdout") stdoutOutput.push(text);
        if (stream === "stderr") stderrOutput.push(text);
        text.split("\n").forEach((line) => {
          broadcastEvent({
            type: "SIMULATION_LOG",
            taskId: task.id,
            testCaseId: item.test_case_id,
            message: line,
            timestamp: new Date().toISOString(),
          });
        });
      };

      child.stdout.on("data", (chunk) => handleChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk) => handleChunk(chunk, "stderr"));
      child.on("close", (code, signal) => {
        registerChild(null);
        const finishedAt = Date.now();
        const duration = Math.max(1, Math.round((finishedAt - startedAt) / 1000));
        const evidence: CommandEvidence = {
          command,
          exitCode: typeof code === "number" ? code : null,
          stdout: stdoutOutput.join("\n"),
          stderr: stderrOutput.join("\n"),
          startedAt: startedAtIso,
          finishedAt: new Date(finishedAt).toISOString(),
          signal,
        };
        if (signal === "SIGTERM") {
          resolve({
            result: TEST_RESULT.BLOCKED,
            duration,
            logs: output.join("\n") || "Execution cancelled",
            summary: "执行被中断（SIGTERM）。",
            evidence,
            failureCategory: FAILURE_CATEGORY.ENVIRONMENT,
            stepResults: this.enrichStepResultsWithEvidence(undefined, TEST_RESULT.BLOCKED, output.join("\n") || "Execution cancelled", evidence),
          });
          return;
        }
        resolve(this.parseExecutorOutput({
          result: code === 0 ? TEST_RESULT.PASSED : TEST_RESULT.FAILED,
          duration,
          logs: output.join("\n") || `Script exited with code ${code ?? -1}`,
          summary: code === 0 ? "命令执行完成。" : `命令退出码 ${code ?? -1}。`,
          evidence,
        }));
      });
    });
  }

  private readonly shellExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const inlineShellCommand = item.test_tool?.startsWith("shell:") ? item.test_tool.slice("shell:".length).trim() : null;
    const command = inlineShellCommand || this.buildScriptCommand(task, item);
    return this.spawnCommandExecutor(command || "", task, item, broadcastEvent, registerChild);
  };

  private readonly scapyExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const scriptPath = String(item.script_path || "").trim();
    if (!scriptPath && !String(item.command_template || "").trim()) {
      return Promise.resolve({
        result: TEST_RESULT.BLOCKED,
        duration: 0,
        logs: "Scapy 执行器未找到脚本路径或命令模板。",
        summary: "Scapy 用例缺少可执行脚本。",
        failureCategory: FAILURE_CATEGORY.SCRIPT,
        stepResults: this.enrichStepResultsWithEvidence(
          [{ name: "Scapy 脚本检查", result: "BLOCKED", logs: "script_path/command_template 为空", conclusion: "请在用例中配置 Scapy 脚本路径或命令模板。" }],
          TEST_RESULT.BLOCKED,
          "Scapy 用例缺少可执行脚本。",
        ),
      });
    }
    return this.pythonExecutor(task, item, broadcastEvent, registerChild);
  };

  private readonly canoeExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const hasInlineCommand = Boolean(String(item.command_template || "").trim());
    const hasScriptPath = Boolean(String(item.script_path || "").trim());
    if (!hasInlineCommand && !hasScriptPath) {
      return Promise.resolve({
        result: TEST_RESULT.BLOCKED,
        duration: 0,
        logs: "CANoe 执行器未找到脚本路径或命令模板。",
        summary: "CANoe 用例缺少可执行入口。",
        failureCategory: FAILURE_CATEGORY.SCRIPT,
        stepResults: this.enrichStepResultsWithEvidence(
          [{ name: "CANoe 命令检查", result: "BLOCKED", logs: "script_path/command_template 为空", conclusion: "请配置可执行命令（例如 CANoe 启动命令或脚本）。" }],
          TEST_RESULT.BLOCKED,
          "CANoe 用例缺少可执行入口。",
        ),
      });
    }
    return this.shellExecutor(task, item, broadcastEvent, registerChild);
  };

  private readonly pythonExecutor: TaskExecutor = (task, item, broadcastEvent, registerChild) => {
    const payloadDir = this.createTaskArtifactDir(task.id, item.id, "payloads");
    const payloadPath = path.join(payloadDir, "payload.json");
    const artifactDirs = {
      root: this.artifactRoot,
      payload_dir: payloadDir,
      adb_push_dir: this.createTaskArtifactDir(task.id, item.id, "adb-push"),
      adb_pull_dir: this.createTaskArtifactDir(task.id, item.id, "adb-pull"),
      logs_dir: this.createTaskArtifactDir(task.id, item.id, "logs"),
    };
    const runtimeInputs = this.resolveTaskRuntimeInputs(task, item);
    const payload = {
      task,
      item,
      runtimeInputs,
      testCase: {
        id: item.test_case_id,
        title: item.title,
        category: item.category,
        protocol: item.protocol,
        description: item.description,
        test_input: item.test_input,
        test_tool: item.test_tool,
        expected_result: item.expected_result,
        required_inputs: item.required_inputs,
      },
      artifact_dirs: artifactDirs,
    };
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf8");

    const pythonScript = item.script_path || this.pythonSecurityRunner;
    const command = item.command_template
      ? [
          this.renderExecutorTemplate(item.command_template, task, item, { payloadPath }),
          this.renderExecutorTemplate(item.args_template || "", task, item, { payloadPath }),
        ].filter(Boolean).join(" ").trim()
      : [
          this.pythonExecutable,
          pythonScript,
          this.renderExecutorTemplate(item.args_template || "{{payloadPath}}", task, item, { payloadPath }),
        ].filter(Boolean).join(" ").trim();
    return this.spawnCommandExecutor(command, task, item, broadcastEvent, registerChild);
  };

  private readonly simulateExecutor: TaskExecutor = async (task, item, broadcastEvent) => {
    const results: TestResult[] = [TEST_RESULT.PASSED, TEST_RESULT.FAILED, TEST_RESULT.BLOCKED];
    const protocol = item.protocol || "CAN";
    const duration = Math.floor(Math.random() * 240) + 60;

    for (let logIndex = 1; logIndex <= 4; logIndex += 1) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(" ");
      broadcastEvent({
        type: "SIMULATION_LOG",
        taskId: task.id,
        testCaseId: item.test_case_id,
        message: `[${protocol}] Step ${logIndex}: ID=0x${Math.floor(Math.random() * 2048).toString(16)} DATA=[${hex}]`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = results[Math.floor(Math.random() * results.length)];
    return {
      result,
      duration,
      logs: `Execution task ${task.id}: ${item.title} completed with ${result}`,
    };
  };

  private resolveExecutorAdapter(task: ExecutionTaskRecord, item: ExecutionTaskItemRecord): ExecutorAdapter {
    const matched = this.adapterRegistry.find((adapter) => adapter.matches(task, item));
    if (matched) return matched;
    return this.adapterRegistry[this.adapterRegistry.length - 1] || {
      name: "simulate",
      matches: () => true,
      run: this.simulateExecutor,
    };
  }
}
