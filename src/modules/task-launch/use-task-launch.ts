import { useMemo } from "react";
import type { Asset, TestCase, TestSuite } from "../../api/types";

type TaskLaunchDependencies = {
  testCases: TestCase[];
  testSuites: TestSuite[];
  assets: Asset[];
  selectedCaseIds: number[];
  selectedSuiteId: number | string;
  selectedAssetId: number | string;
  baselineSuiteName: string;
  resolveRuntimeInputs: (scriptPath?: string | null, testTool?: string | null, fallback?: string | null) => string[];
  parseDefaultRuntimeInputs: (value?: string | null) => Record<string, string>;
  defaultRuntimeInputSuggestions: Record<string, string>;
};

export const useTaskLaunch = ({
  testCases,
  testSuites,
  assets,
  selectedCaseIds,
  selectedSuiteId,
  selectedAssetId,
  baselineSuiteName,
  resolveRuntimeInputs,
  parseDefaultRuntimeInputs,
  defaultRuntimeInputSuggestions,
}: TaskLaunchDependencies) => {
  const selectedLaunchTestCases = useMemo(
    () => testCases.filter((tc) => selectedCaseIds.includes(tc.id)),
    [testCases, selectedCaseIds],
  );
  const selectedLaunchSuite = useMemo(
    () => testSuites.find((suite) => String(suite.id) === String(selectedSuiteId)),
    [testSuites, selectedSuiteId],
  );
  const selectedBaselineSuite = useMemo(
    () => testSuites.find((suite) => Number(suite.is_baseline || 0) === 1) || testSuites.find((suite) => suite.name === baselineSuiteName) || null,
    [testSuites, baselineSuiteName],
  );
  const selectedLaunchAsset = useMemo(
    () => assets.find((asset) => String(asset.id) === String(selectedAssetId)),
    [assets, selectedAssetId],
  );
  const onlineAssets = useMemo(
    () => assets.filter((asset) => asset.status === "Online"),
    [assets],
  );

  const selectedLaunchRequiredInputs = useMemo(
    () =>
      Array.from(
        new Set(
          selectedLaunchTestCases.flatMap((testCase) =>
            resolveRuntimeInputs(testCase.script_path, testCase.test_tool, testCase.required_inputs),
          ),
        ),
      ) as string[],
    [selectedLaunchTestCases, resolveRuntimeInputs],
  );

  const { selectedLaunchDefaultInputs, selectedLaunchInputConflicts } = useMemo(() => {
    const merged: Record<string, string> = {};
    const conflicts = new Set<string>();

    selectedLaunchTestCases.forEach((testCase) => {
      const defaults = parseDefaultRuntimeInputs(testCase.default_runtime_inputs);
      resolveRuntimeInputs(testCase.script_path, testCase.test_tool, testCase.required_inputs).forEach((inputKey) => {
        if (inputKey === "connection_address") return;
        const suggestedValue = defaults[inputKey];
        if (!suggestedValue) return;
        if (!(inputKey in merged)) {
          merged[inputKey] = suggestedValue;
          return;
        }
        if (merged[inputKey] !== suggestedValue) {
          merged[inputKey] = "";
          conflicts.add(inputKey);
        }
      });
    });

    selectedLaunchRequiredInputs.forEach((inputKey) => {
      if (inputKey === "connection_address") return;
      if (!(inputKey in merged) || merged[inputKey] === "") {
        const suggested = defaultRuntimeInputSuggestions[inputKey];
        if (suggested && !conflicts.has(inputKey)) {
          merged[inputKey] = suggested;
        }
      }
    });

    return {
      selectedLaunchDefaultInputs: merged,
      selectedLaunchInputConflicts: Array.from(conflicts),
    };
  }, [
    selectedLaunchRequiredInputs,
    selectedLaunchTestCases,
    parseDefaultRuntimeInputs,
    resolveRuntimeInputs,
    defaultRuntimeInputSuggestions,
  ]);

  const selectedAssetSummary = selectedLaunchAsset
    ? `${selectedLaunchAsset.name} · ${selectedLaunchAsset.connection_address || "未配置连接地址"}`
    : "请选择一个在线资产";
  const selectedCaseSummary = selectedLaunchTestCases.length === 0
    ? "请选择一个或多个测试用例"
    : selectedLaunchTestCases.map((testCase) => testCase.title).join("、");
  const selectedSuiteSummary = selectedLaunchSuite
    ? `${selectedLaunchSuite.name}（${selectedLaunchSuite.case_count} 条）`
    : "请选择一个测试套件";

  return {
    selectedLaunchTestCases,
    selectedLaunchSuite,
    selectedBaselineSuite,
    selectedLaunchAsset,
    onlineAssets,
    selectedLaunchRequiredInputs,
    selectedLaunchDefaultInputs,
    selectedLaunchInputConflicts,
    selectedAssetSummary,
    selectedCaseSummary,
    selectedSuiteSummary,
  };
};
