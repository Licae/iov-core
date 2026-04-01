import { expect, test } from "@playwright/test";
import { gotoHome } from "./helpers/app";

test.describe("dashboard page", () => {
  test("loads dashboard metrics and opens launch modal", async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByText("系统可靠性")).toBeVisible();
    await expect(page.getByText("运行中仿真")).toBeVisible();
    await expect(page.getByText("最近测试执行")).toBeVisible();

    await page.getByRole("button", { name: "发起测试任务" }).click();
    await expect(page.getByRole("heading", { name: "发起测试任务" })).toBeVisible();
    await page.getByRole("button", { name: "资产 + 用例" }).click();
    await expect(page.getByText("选择要执行的测试用例")).toBeVisible();
  });

  test("opens the related test case drawer from recent runs", async ({ page }) => {
    await gotoHome(page);

    const recentRunRow = page.locator("table tbody tr").first();
    await expect(recentRunRow).toBeVisible();
    await recentRunRow.click();

    await expect(page.getByRole("heading", { name: "编辑用例" })).toBeVisible();
    await expect(page.getByText("执行历史")).toBeVisible();
  });
});
