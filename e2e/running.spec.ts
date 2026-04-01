import { expect, test } from "@playwright/test";
import { gotoHome, waitForToast } from "./helpers/app";

test.describe("task launch and running page", () => {
  test("launches a case-based task from dashboard", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "发起测试任务" }).click();
    await page.getByRole("button", { name: "资产 + 用例" }).click();

    await page.getByRole("button", { name: /请选择一个在线资产/ }).click();
    await page.locator('input[name="selected-asset"]').first().check();
    await page.getByRole("button", { name: /请选择一个或多个测试用例/ }).click();
    const casePicker = page.locator(".max-h-64").last();
    const firstCase = casePicker.locator('input[type="checkbox"]').first();
    const firstCaseLabel = firstCase.locator("xpath=ancestor::label[1]").locator(".text-sm").first();
    const caseTitle = (await firstCaseLabel.textContent())?.trim() || "未知用例";
    await firstCase.check();
    const launchButton = page.getByRole("button", { name: "对当前资产开始执行" });
    await expect(launchButton).toBeEnabled();
    await launchButton.evaluate((button: HTMLButtonElement) => button.click());

    await waitForToast(page, "测试任务已发起");
    await expect(page.getByRole("heading", { name: "运行中测试任务" })).toBeVisible();

    const taskCard = page.locator(".glass-card").filter({ hasText: caseTitle }).first();
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole("button", { name: "详情" }).click();
    await expect(page.getByText("执行明细")).toBeVisible();
  });
});
