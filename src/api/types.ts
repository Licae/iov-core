export interface TestCase {
  id: number;
  title: string;
  category: string;
  security_domain?: string;
  type: "Automated" | "Manual";
  protocol: string;
  description: string;
  test_input?: string;
  test_tool?: string;
  expected_result?: string;
  automation_level?: string;
  executor_type?: string;
  script_path?: string;
  command_template?: string;
  args_template?: string;
  timeout_sec?: number;
  required_inputs?: string;
  default_runtime_inputs?: string;
  verification_status?: "VERIFIED" | "PENDING_REVERIFICATION" | string;
  status: string;
  created_at: string;
  steps?: string;
  requirement_count?: number;
  tara_count?: number;
}

export interface Requirement {
  id: number;
  requirement_key: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  satisfaction_status?: "SATISFIED" | "UNSATISFIED" | "PENDING_REVERIFICATION" | "UNKNOWN" | string;
  verification_status?: "VERIFIED" | "PENDING_REVERIFICATION" | string;
  latest_result?: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | null;
  latest_result_at?: string | null;
  owner?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  test_case_count?: number;
  tara_count?: number;
  asset_count?: number;
  test_case_ids?: number[];
  tara_ids?: number[];
  asset_ids?: number[];
}

export interface RequirementCoverageRow {
  requirement_id: number;
  requirement_key: string;
  requirement_title: string;
  asset_id?: number | null;
  asset_name?: string | null;
  tara_covered: boolean;
  test_case_covered: boolean;
  satisfaction_status?: "SATISFIED" | "UNSATISFIED" | "PENDING_REVERIFICATION" | "UNKNOWN" | string;
  verification_status?: "VERIFIED" | "PENDING_REVERIFICATION" | string;
  latest_result?: "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | null;
  latest_result_at?: string | null;
  has_recent_evidence?: boolean;
  evidence_expired?: boolean;
  evidence_expiry_days?: number;
  pending_reverification_count?: number;
  pending_reverification_reasons?: string[];
  quality_tier?: "LINK_MISSING" | "NO_EVIDENCE" | "EVIDENCE_EXPIRED" | "PENDING_REVERIFICATION" | "VERIFIED_PASS" | "VERIFIED_FAIL" | string;
  closure_status: "COVERED" | "GAP";
  gap_reasons: string[];
}

export interface RequirementCoverageSnapshot {
  summary: {
    total: number;
    covered: number;
    gap: number;
    asset_count: number;
    pending_reverification?: number;
  };
  rows: RequirementCoverageRow[];
  uncovered: RequirementCoverageRow[];
}

export interface ReverificationTodo {
  id: number;
  entity_type: "REQUIREMENT" | "TARA" | "TEST_CASE";
  entity_id: number;
  label: string;
  reason: string;
  reasons: string[];
  source_entity_type?: "REQUIREMENT" | "TARA" | "TEST_CASE" | null;
  source_entity_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaraItem {
  id: number;
  threat_key: string;
  title: string;
  risk_level: string;
  status: string;
  verification_status?: "VERIFIED" | "PENDING_REVERIFICATION" | string;
  affected_asset?: string | null;
  attack_vector?: string | null;
  impact?: string | null;
  likelihood?: string | null;
  mitigation?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  requirement_count?: number;
  test_case_count?: number;
  requirement_ids?: number[];
  test_case_ids?: number[];
}

export interface TestRun {
  id: number;
  test_case_id: number;
  result: string;
  logs: string;
  summary?: string;
  step_results?: string;
  duration: number;
  executed_by: string;
  executed_at: string;
}

export interface RecentRun {
  id: number;
  test_case_id: number;
  result: string;
  logs: string;
  duration: number;
  executed_by: string;
  executed_at: string;
  test_case_title: string;
  category: string;
  protocol: string;
  test_case_status: string;
  task_id?: number | null;
  task_type?: string | null;
  task_status?: string | null;
  asset_name?: string | null;
}

export interface Stats {
  total: number;
  automated: number;
  manual: number;
  results: { result: string; count: number }[];
}

export interface TestSuite {
  id: number;
  name: string;
  description: string;
  is_baseline?: number;
  created_at: string;
  case_count: number;
}

export interface SuiteRun {
  id: number;
  suite_id: number;
  suite_name: string;
  status: string;
  total_cases: number;
  completed_cases: number;
  passed_cases: number;
  failed_cases: number;
  blocked_cases: number;
  current_case_id?: number | null;
  current_case_title?: string | null;
  started_at: string;
  finished_at?: string | null;
}

export interface ExecutionTask {
  id: number;
  type: "single" | "suite";
  status: string;
  asset_id?: number | null;
  asset_name?: string | null;
  suite_id?: number | null;
  suite_name?: string | null;
  test_case_id?: number | null;
  test_case_title?: string | null;
  total_items: number;
  completed_items: number;
  passed_items: number;
  failed_items: number;
  blocked_items: number;
  current_test_case_id?: number | null;
  current_case_title?: string | null;
  current_item_label?: string | null;
  started_at: string;
  finished_at?: string | null;
  stop_on_failure?: number;
  error_message?: string | null;
  executor?: string | null;
  retry_count?: number;
  source_task_id?: number | null;
  runtime_inputs?: string | null;
  failure_category?: "NONE" | "ENVIRONMENT" | "PERMISSION" | "SCRIPT" | string | null;
  can_retry?: boolean;
  retry_block_reason?: string | null;
}

export interface ExecutionTaskDetailItem {
  id: number;
  task_id: number;
  test_case_id: number;
  sort_order: number;
  status: string;
  result?: string | null;
  failure_category?: string | null;
  run_id?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  title: string;
  case_type?: "Automated" | "Manual" | string | null;
  category?: string | null;
  protocol?: string | null;
  steps?: string | null;
  executor_type?: string | null;
  test_tool?: string | null;
  test_input?: string | null;
  expected_result?: string | null;
  run_result?: string | null;
  logs?: string | null;
  summary?: string | null;
  step_results?: string | null;
  duration?: number | null;
  executed_at?: string | null;
}

export interface ExecutionTaskDetail {
  task: ExecutionTask;
  items: ExecutionTaskDetailItem[];
}

export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type CanonicalTestResult = "PASSED" | "FAILED" | "BLOCKED" | "ERROR";
export type FailureCategory = "NONE" | "ENVIRONMENT" | "PERMISSION" | "SCRIPT";

export interface StepExecutionResult {
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
}

export interface ManualTaskItemResultPayload {
  result: CanonicalTestResult;
  summary?: string;
  logs?: string;
  failure_category?: FailureCategory;
  operator?: string;
  step_results?: StepExecutionResult[];
}

export interface Defect {
  id: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  created_at?: string;
}

export interface Asset {
  id: number;
  name: string;
  status: string;
  type: string;
  hardware_version?: string;
  software_version?: string;
  connection_address?: string;
  description?: string;
  created_at?: string;
}

export type SettingsMap = Record<string, boolean>;
