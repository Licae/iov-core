import { expect, type Locator, type Page } from "@playwright/test";

type SidebarTarget = {
  label: string;
  heading: string | RegExp;
};

export const uniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const gotoHome = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "车辆与组件测试概览" })).toBeVisible();
};

export const openSidebarView = async (page: Page, target: SidebarTarget) => {
  await page.goto("/");
  await page.getByRole("button", { name: target.label }).click();
  await expect(page.getByRole("heading", { name: target.heading })).toBeVisible();
};

export const openManagementPage = async (page: Page) => {
  await openSidebarView(page, { label: "用例管理", heading: "测试用例管理" });
};

export const openAssetsPage = async (page: Page) => {
  await openSidebarView(page, { label: "测试资产", heading: "测试资产库" });
};

export const openSuitesPage = async (page: Page) => {
  await openSidebarView(page, { label: "测试套件", heading: "测试套件编排" });
};

export const openRunningPage = async (page: Page) => {
  await openSidebarView(page, { label: "仿真执行", heading: "运行中测试任务" });
};

export const openRequirementsPage = async (page: Page) => {
  await openSidebarView(page, { label: "需求管理", heading: /安全需求|需求管理/ });
};

export const openTaraPage = async (page: Page) => {
  await openSidebarView(page, { label: "威胁分析 (TARA)", heading: "TARA 威胁分析与风险评估" });
};

export const openDefectsPage = async (page: Page) => {
  await openSidebarView(page, { label: "缺陷日志", heading: "缺陷与诊断日志" });
};

export const openReportsPage = async (page: Page) => {
  await openSidebarView(page, { label: "分析报告", heading: "测试分析报告" });
};

export const waitForToast = async (page: Page, message: string | RegExp) => {
  await expect(page.getByText(message)).toBeVisible();
};

export const searchManagementCase = async (page: Page, keyword: string) => {
  const searchBox = page.getByPlaceholder("搜索名称、类别、安全分类或工具...");
  await searchBox.fill(keyword);
  await expect(searchBox).toHaveValue(keyword);
};

export const getTableRowByText = (page: Page, text: string | RegExp) => page.getByRole("row", { name: text });

export const withinDialog = async (page: Page, title: string | RegExp) => {
  const dialog = page.locator(".modal-surface, .drawer-surface").filter({ has: page.getByRole("heading", { name: title }) }).first();
  await expect(dialog).toBeVisible();
  return dialog;
};

export const firstVisible = async (...locators: Locator[]) => {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }
  throw new Error("No visible locator found");
};

export const waitForTaskCard = async (page: Page, title: string) => {
  const activeCard = page.locator(".glass-card").filter({ has: page.getByRole("heading", { name: title }) }).first();
  if (await activeCard.isVisible().catch(() => false)) {
    return activeCard;
  }

  const fallbackCard = page.locator(".glass-card").filter({ hasText: title }).first();
  await expect(fallbackCard).toBeVisible();
  return fallbackCard;
};
