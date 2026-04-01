import type { CanonicalTestResult, ExecutionStatus, FailureCategory, StepExecutionResult } from '../api/types';

export const normalizeStepsText = (value: string) => {
  const split = value
    .replace(/[；;]+/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return split
    .map((step) => step
      .replace(/^步骤\s*\d+\s*[：:、.)-]?\s*/i, '')
      .replace(/^\d+\s*[：:、.)-]\s*/, '')
      .trim(),
    )
    .filter(Boolean)
    .map((content, index) => `步骤${index + 1}：${content}`);
};

export const hasDeterministicExpectedResult = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 8) return false;
  const keywords = ['通过', '失败', '拒绝', '允许', '禁止', '拦截', '判定', '告警', 'must', 'pass', 'fail', 'deny', 'allow', 'blocked'];
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
};

export const buildManualCaseTemplate = (params: { title: string; protocol: string; testTool: string }) => {
  const target = params.title.trim() || '该测试场景';
  const protocolHint = [params.protocol.trim(), params.testTool.trim()].filter(Boolean).join(' / ');
  const description = `手动验证${target}，通过人工操作与观察记录评估安全控制策略是否有效。`;
  const testInput = '测试资产连接地址（自动注入）；人工操作记录；必要测试样本。';
  const expectedResult = `${target}执行后，未授权或异常行为应被拒绝/拦截，并可明确判定通过或失败。`;
  const steps = [
    '步骤1：准备测试环境并确认前置条件（资产在线、权限与连接可用）。',
    `步骤2：按测试目标执行人工操作并记录关键现象与返回信息${protocolHint ? `（参考协议/工具：${protocolHint}）` : '。'}`,
    '步骤3：依据判定标准输出通过/失败结论并补充证据说明。',
  ];
  return { description, testInput, expectedResult, steps };
};

export const getFormControl = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
    ? (field as T)
    : null;
};

export const applyManualTemplateToForm = (form: HTMLFormElement) => {
  const titleField = getFormControl<HTMLInputElement>(form, 'title');
  const protocolField = getFormControl<HTMLSelectElement>(form, 'protocol');
  const toolField = getFormControl<HTMLInputElement>(form, 'test_tool');
  const descriptionField = getFormControl<HTMLTextAreaElement>(form, 'description');
  const inputField = getFormControl<HTMLInputElement | HTMLTextAreaElement>(form, 'test_input');
  const expectedField = getFormControl<HTMLTextAreaElement>(form, 'expected_result');
  const stepsField = getFormControl<HTMLTextAreaElement>(form, 'steps');
  const automationField = getFormControl<HTMLSelectElement>(form, 'automation_level');
  const executorField = getFormControl<HTMLSelectElement>(form, 'executor_type');
  const scriptField = getFormControl<HTMLInputElement>(form, 'script_path');

  const template = buildManualCaseTemplate({
    title: titleField?.value || '',
    protocol: protocolField?.value || '',
    testTool: toolField?.value || '',
  });

  if (toolField && !toolField.value.trim()) toolField.value = '人工检查';
  if (descriptionField && !descriptionField.value.trim()) descriptionField.value = template.description;
  if (inputField && !inputField.value.trim()) inputField.value = template.testInput;
  if (expectedField && !expectedField.value.trim()) expectedField.value = template.expectedResult;
  if (stepsField && normalizeStepsText(stepsField.value).length < 2) stepsField.value = template.steps.join('\n');
  if (automationField) automationField.value = automationField.value === 'A' ? 'B' : automationField.value || 'B';
  if (executorField) executorField.value = 'manual';
  if (scriptField) scriptField.value = '';
};

export const validateCaseQualityDraft = (draft: {
  securityDomain: string;
  steps: string[];
  expectedResult: string;
  type: string;
  executorType: string;
  scriptPath: string;
}) => {
  if (!draft.securityDomain || draft.securityDomain === '未分类') {
    return '安全分类不能为空，且不能为“未分类”';
  }
  if (draft.steps.length < 2) {
    return '测试步骤至少需要 2 步';
  }
  if (!hasDeterministicExpectedResult(draft.expectedResult)) {
    return '预期结果不可判定，请明确通过/失败或允许/拒绝判定标准';
  }
  if (draft.type === 'Manual' && draft.executorType !== 'manual') {
    return '手动用例执行器必须为 manual';
  }
  if (draft.type === 'Automated' && draft.executorType === 'manual') {
    return '自动化用例执行器不能为 manual';
  }
  if (draft.type === 'Automated' && !draft.scriptPath) {
    return '自动化用例必须填写脚本路径';
  }
  return null;
};

export const collectDefaultRuntimeInputs = (formData: FormData, inputKeys: string[]) => {
  const defaults: Record<string, string> = {};
  inputKeys.forEach((inputKey) => {
    if (inputKey === 'connection_address') return;
    const value = String(formData.get(`default_input_${inputKey}`) || '').trim();
    if (value) {
      defaults[inputKey] = value;
    }
  });
  return defaults;
};

type BuildCaseDraftParams = {
  formData: FormData;
  resolveRuntimeInputs: (scriptPath?: string | null, testTool?: string | null, fallback?: string | null) => string[];
  fallbackRequiredInputs?: string | null;
};

export const buildCaseDraftFromFormData = ({ formData, resolveRuntimeInputs, fallbackRequiredInputs }: BuildCaseDraftParams) => {
  const type = String(formData.get('type') || 'Automated').trim() === 'Manual' ? 'Manual' : 'Automated';
  const title = String(formData.get('title') || '').trim();
  const protocol = String(formData.get('protocol') || '').trim();
  const securityDomain = String(formData.get('security_domain') || '未分类').trim();
  const testToolRaw = String(formData.get('test_tool') || '').trim();
  let scriptPath = String(formData.get('script_path') || '').trim();
  let description = String(formData.get('description') || '').trim();
  let testInput = String(formData.get('test_input') || '').trim();
  let expectedResult = String(formData.get('expected_result') || '').trim();
  let steps = normalizeStepsText(String(formData.get('steps') || ''));

  const manualTemplate = type === 'Manual'
    ? buildManualCaseTemplate({ title, protocol, testTool: testToolRaw })
    : null;

  if (manualTemplate) {
    description = description || manualTemplate.description;
    testInput = testInput || manualTemplate.testInput;
    expectedResult = expectedResult || manualTemplate.expectedResult;
    if (steps.length < 2) {
      steps = manualTemplate.steps;
    }
    scriptPath = '';
  }

  const testTool = testToolRaw || (type === 'Manual' ? '人工检查' : '');
  const executorType = type === 'Manual' ? 'manual' : String(formData.get('executor_type') || 'python').trim();
  const automationLevelRaw = String(formData.get('automation_level') || '').trim();
  const automationLevel = type === 'Manual' && (!automationLevelRaw || automationLevelRaw === 'A') ? 'B' : automationLevelRaw;
  const required_inputs = type === 'Manual'
    ? ['connection_address']
    : resolveRuntimeInputs(scriptPath, testTool, fallbackRequiredInputs || null);
  const default_runtime_inputs = type === 'Manual' ? {} : collectDefaultRuntimeInputs(formData, required_inputs);

  const qualityError = validateCaseQualityDraft({
    securityDomain,
    steps,
    expectedResult,
    type,
    executorType,
    scriptPath,
  });

  if (qualityError) {
    return { ok: false as const, error: qualityError };
  }

  return {
    ok: true as const,
    value: {
      title,
      category: String(formData.get('category') || '').trim(),
      security_domain: securityDomain,
      type,
      protocol,
      description,
      steps,
      test_input: testInput,
      test_tool: testTool,
      expected_result: expectedResult,
      automation_level: automationLevel,
      executor_type: executorType,
      script_path: scriptPath,
      command_template: '',
      args_template: '',
      timeout_sec: String(formData.get('timeout_sec') || '').trim(),
      required_inputs,
      default_runtime_inputs,
    },
  };
};

export const inferInputsFromScript = (scriptPath?: string, testTool?: string) => {
  const normalized = `${scriptPath || ''} ${(testTool || '')}`.toLowerCase();
  if (normalized.includes('ssh_access_check')) {
    return ['connection_address', 'ssh_probe_username', 'ssh_probe_password', 'ssh_port'];
  }
  if (normalized.includes('adb_push_check')) {
    return ['connection_address', 'adb_port', 'adb_push_target_path'];
  }
  if (normalized.includes('adb_pull_check')) {
    return ['connection_address', 'adb_port', 'adb_pull_source_path'];
  }
  if (normalized.includes('adb_access_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('iptables_firewall_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('least_privilege_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('certificate_protection_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('open_port_scan_check')) {
    return ['connection_address'];
  }
  if (normalized.includes('telnet_access_check')) {
    return ['connection_address', 'telnet_port'];
  }
  if (normalized.includes('ftp_access_check')) {
    return ['connection_address', 'ftp_port', 'ftp_probe_username', 'ftp_probe_password'];
  }
  if (normalized.includes('ssh_root_login_disabled_check')) {
    return ['connection_address', 'ssh_probe_password', 'ssh_port'];
  }
  if (normalized.includes('ssh_weak_password_policy_check')) {
    return ['connection_address', 'ssh_port'];
  }
  if (normalized.includes('telnet_service_disabled_check')) {
    return ['connection_address', 'telnet_port'];
  }
  if (normalized.includes('ftp_anonymous_login_disabled_check')) {
    return ['connection_address', 'ftp_port'];
  }
  if (normalized.includes('key_directory_permission_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('suid_sgid_scan_check')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('tls_certificate_validation_check')) {
    return ['connection_address', 'tls_port', 'tls_server_name'];
  }
  if (normalized.includes('tls_weak_cipher_check')) {
    return ['connection_address', 'tls_port', 'tls_server_name'];
  }
  if (normalized.includes('ota_package_signature_check')) {
    return ['ota_package_path'];
  }
  if (normalized.includes('ota_package_integrity_check')) {
    return ['ota_package_path', 'ota_expected_sha256'];
  }
  if (normalized.includes('external_command_check')) {
    return ['probe_command'];
  }
  if (
    normalized.includes('app_package_signature_check') ||
    normalized.includes('app_package_integrity_check') ||
    normalized.includes('app_sensitive_data_scan_check') ||
    normalized.includes('app_certificate_validity_check') ||
    normalized.includes('app_backup_policy_check')
  ) {
    return ['app_package_path'];
  }
  if (normalized.includes('ssh_weak_credential_check')) {
    return ['connection_address', 'ssh_port'];
  }
  if (normalized.includes('ssh_account_lockout_check')) {
    return ['connection_address', 'ssh_probe_username', 'ssh_port'];
  }
  if (normalized.includes('ssh')) {
    return ['connection_address', 'ssh_probe_username', 'ssh_probe_password', 'ssh_port'];
  }
  if (normalized.includes('adb')) {
    return ['connection_address', 'adb_port'];
  }
  if (normalized.includes('telnet')) {
    return ['connection_address', 'telnet_port'];
  }
  if (normalized.includes('ftp')) {
    return ['connection_address', 'ftp_port', 'ftp_probe_username', 'ftp_probe_password'];
  }
  return [] as string[];
};

export const parseDefaultRuntimeInputs = (value?: string | null) => {
  if (!value) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {} as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, raw]) => [key, String(raw ?? '').trim()] as const)
        .filter(([, v]) => v !== ''),
    );
  } catch {
    return {} as Record<string, string>;
  }
};

export const parseCaseSteps = (value?: string | null) => {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((step) => String(step).trim()).filter(Boolean);
    }
    if (typeof parsed === 'string') {
      return parsed.split(/\r?\n/).map((step) => step.trim()).filter(Boolean);
    }
    return [] as string[];
  } catch {
    return String(value).split(/\r?\n/).map((step) => step.trim()).filter(Boolean);
  }
};

export const normalizeExecutionStatus = (status?: string | null): ExecutionStatus => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'RUNNING') return 'RUNNING';
  if (normalized === 'COMPLETED' || normalized === 'FAILED') return 'COMPLETED';
  if (normalized === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
};

export const normalizeTestResult = (result?: string | null): CanonicalTestResult | null => {
  if (!result) return null;
  const normalized = String(result).trim().toUpperCase();
  if (normalized === 'PASSED') return 'PASSED';
  if (normalized === 'FAILED') return 'FAILED';
  if (normalized === 'BLOCKED') return 'BLOCKED';
  if (normalized === 'ERROR') return 'ERROR';
  return null;
};

export const normalizeFailureCategory = (value?: string | null): FailureCategory => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ENVIRONMENT') return 'ENVIRONMENT';
  if (normalized === 'PERMISSION') return 'PERMISSION';
  if (normalized === 'SCRIPT') return 'SCRIPT';
  return 'NONE';
};

export const isExecutionActive = (status?: string | null) => {
  const normalized = normalizeExecutionStatus(status);
  return normalized === 'PENDING' || normalized === 'RUNNING';
};

export const formatServerDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T')
    ? (value.endsWith('Z') ? value : `${value}Z`)
    : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', { hour12: false });
};

export const parseStepResults = (value?: string | null): StepExecutionResult[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getStepExecutionBadge = (step: StepExecutionResult) => {
  const normalizedCommandResult = String(step.command_result || '').trim().toUpperCase();
  const normalizedStepResult = normalizeTestResult(step.result);
  if (normalizedCommandResult === 'PASSED' || normalizedCommandResult === 'SUCCEEDED') {
    return { label: '命令成功', className: 'text-success' };
  }
  if (normalizedCommandResult === 'FAILED') {
    return { label: '命令失败', className: 'text-danger' };
  }
  if (normalizedCommandResult === 'BLOCKED') {
    return { label: '命令阻塞', className: 'text-warning' };
  }
  if (normalizedCommandResult === 'ERROR') {
    return { label: '命令异常', className: 'text-danger' };
  }
  if (normalizedStepResult === 'BLOCKED') {
    return { label: '已阻止', className: 'text-warning' };
  }
  if (normalizedStepResult === 'PASSED') {
    return { label: '通过', className: 'text-success' };
  }
  if (normalizedStepResult === 'FAILED') {
    return { label: '未通过', className: 'text-danger' };
  }
  if (normalizedStepResult === 'ERROR') {
    return { label: '执行异常', className: 'text-danger' };
  }
  return { label: step.result, className: 'text-muted' };
};

export const getExecutionStatusLabel = (status?: string | null) => {
  switch (normalizeExecutionStatus(status)) {
    case 'PENDING':
      return '排队中';
    case 'RUNNING':
      return '执行中';
    case 'COMPLETED':
      return '已完成';
    case 'CANCELLED':
      return '已取消';
    default:
      return status || '排队中';
  }
};
