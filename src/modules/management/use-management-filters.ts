import { useMemo } from "react";
import type { TestCase } from "../../api/types";

type ManagementFilterState = {
  searchQuery: string;
  categoryFilter: string;
  securityDomainFilter: string;
  automationFilter: string;
};

export const useManagementFilters = (
  testCases: TestCase[],
  filters: ManagementFilterState,
) => {
  const managementCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          testCases
            .map((tc) => String(tc.category || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [testCases],
  );

  const managementSecurityDomainOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          testCases
            .map((tc) => String(tc.security_domain || "未分类").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [testCases],
  );

  const managementFilteredTestCases = useMemo(
    () =>
      testCases
        .filter((tc) => {
          const query = filters.searchQuery.trim().toLowerCase();
          const normalizedSecurityDomain = (tc.security_domain || "未分类").trim();
          const normalizedAutomationLevel = (tc.automation_level || "B").trim();
          const matchesQuery =
            !query ||
            tc.title.toLowerCase().includes(query) ||
            tc.category.toLowerCase().includes(query) ||
            normalizedSecurityDomain.toLowerCase().includes(query) ||
            (tc.test_tool && tc.test_tool.toLowerCase().includes(query));
          const matchesCategory = filters.categoryFilter === "All" || tc.category === filters.categoryFilter;
          const matchesSecurityDomain =
            filters.securityDomainFilter === "All" || normalizedSecurityDomain === filters.securityDomainFilter;
          const matchesAutomation =
            filters.automationFilter === "All" || normalizedAutomationLevel === filters.automationFilter;
          return matchesQuery && matchesCategory && matchesSecurityDomain && matchesAutomation;
        })
        .sort((a, b) => a.id - b.id),
    [testCases, filters],
  );

  return {
    managementCategoryOptions,
    managementSecurityDomainOptions,
    managementFilteredTestCases,
  };
};

