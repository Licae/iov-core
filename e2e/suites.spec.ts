import { expect, test } from "@playwright/test";
import { openSuitesPage, uniqueName, waitForToast } from "./helpers/app";

test.describe("suites and execution flow", () => {
  test("creates and deletes a suite", async ({ page }) => {
    const suiteName = uniqueName("E2E-套件");

    await openSuitesPage(page);
    await page.getByRole("button", { name: "新建套件" }).click();
    await expect(page.getByRole("heading", { name: "新建测试套件" })).toBeVisible();

    await page.locator('input[name="name"]').fill(suiteName);
    await page.locator('textarea[name="description"]').fill("E2E 创建并删除的套件。");
    await page.locator('input[type="checkbox"]').nth(0).check();
    await page.locator('input[type="checkbox"]').nth(1).check();
    await page.getByRole("button", { name: "创建套件" }).click();

    await waitForToast(page, "测试套件创建成功");
    const suiteNameHeading = page.getByRole("heading", { name: suiteName, exact: true }).first();
    await expect(suiteNameHeading).toBeVisible();
    await suiteNameHeading.locator("xpath=ancestor::div[contains(@class,'p-6')][1]").getByRole("button", { name: "删除" }).click();
    await waitForToast(page, "测试套件已删除");
    await expect(page.getByRole("heading", { name: suiteName, exact: true })).toHaveCount(0);
  });

  test("runs a suite and opens task detail from running page", async ({ page }) => {
    const suiteName = uniqueName("E2E-执行套件");

    await openSuitesPage(page);
    await page.getByRole("button", { name: "新建套件" }).click();
    await page.locator('input[name="name"]').fill(suiteName);
    await page.locator('textarea[name="description"]').fill("E2E 执行链路套件。");
    await page.locator('input[type="checkbox"]').nth(0).check();
    await page.locator('input[type="checkbox"]').nth(1).check();
    await page.getByRole("button", { name: "创建套件" }).click();
    await waitForToast(page, "测试套件创建成功");

    const suiteNameHeading = page.getByRole("heading", { name: suiteName, exact: true }).first();
    await expect(suiteNameHeading).toBeVisible();
    await suiteNameHeading.locator("xpath=ancestor::div[contains(@class,'p-6')][1]").getByRole("button", { name: "选择资产执行" }).click();
    await expect(page.getByRole("heading", { name: "发起测试任务" })).toBeVisible();

    await page.getByRole("button", { name: /请选择一个在线资产/ }).click();
    await page.locator('input[name="selected-asset"]').first().check();
    await page.getByRole("button", { name: "对当前资产执行套件" }).click();

    await waitForToast(page, /任务已发起/);
    await expect(page.getByRole("heading", { name: "运行中测试任务" })).toBeVisible();

    const taskCard = page.locator(".glass-card").filter({ hasText: suiteName }).first();
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole("button", { name: "详情" }).click();

    await expect(page.locator(".modal-surface h3", { hasText: suiteName })).toBeVisible();
    await expect(page.getByText("执行明细")).toBeVisible();
  });
});
