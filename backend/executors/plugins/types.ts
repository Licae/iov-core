import type { ChildProcessWithoutNullStreams } from "child_process";

export type ExecutionTaskRecord = {
  id: number;
  type: "single" | "suite";
  status: string;
  asset_id?: number | null;
  suite_id?: number | null;
  runtime_inputs?: string | null;
};

export type ExecutionTaskItemRecord = {
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

export type ExecutorResult = {
  result: "PASSED" | "FAILED" | "BLOCKED" | "ERROR";
  duration: number;
  logs: string;
  summary?: string;
  stepResults?: StepExecutionResult[];
  failureCategory?: "NONE" | "ENVIRONMENT" | "PERMISSION" | "SCRIPT";
  evidence?: CommandEvidence;
};

export type StepExecutionResult = {
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

export type CommandEvidence = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  signal?: NodeJS.Signals | null;
};

export type TaskExecutor = (
  task: ExecutionTaskRecord,
  item: ExecutionTaskItemRecord,
  broadcast: (data: any) => void,
  registerChild: (child: ChildProcessWithoutNullStreams | null) => void,
) => Promise<ExecutorResult>;

export type ExecutorAdapter = {
  name: string;
  matches: (task: ExecutionTaskRecord, item: ExecutionTaskItemRecord) => boolean;
  run: TaskExecutor;
};

export type ExecutorAdapterPluginRuntime = {
  executionMode: string;
  shellExecutor: TaskExecutor;
  pythonExecutor: TaskExecutor;
  scapyExecutor: TaskExecutor;
  canoeExecutor: TaskExecutor;
  simulateExecutor: TaskExecutor;
};

export type ExecutorAdapterPlugin = {
  name: string;
  order: number;
  create: (runtime: ExecutorAdapterPluginRuntime) => ExecutorAdapter;
};
