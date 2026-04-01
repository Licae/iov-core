import { expect, test } from "@playwright/test";
import { openRequirementsPage, uniqueName, waitForToast } from "./helpers/app";

test.describe("requirements page", () => {
  test("creates, edits, and deletes a requirement", async ({ page }) => {
    const requirementKey = uniqueName("REQ-E2E").toUpperCase();
    const requirementTitle = uniqueName("E2E 需求");
    const updatedTitle = `${requirementTitle} 已更新`;

    await openRequirementsPage(page);
    await page.getByRole("button", { name: "新增安全需求" }).click();
    await expect(page.getByRole("heading", { name: "新增安全需求" })).toBeVisible();

    await page.getByPlaceholder("例如：REQ-SEC-001").fill(requirementKey);
    await page.getByPlaceholder("例如：CAN总线报文加密").fill(requirementTitle);
    await page.getByPlaceholder("详细描述该安全需求的技术要求...").fill("E2E 创建的需求，用于验证需求管理闭环。");
    await page.locator('label:has-text("适用资产（多选）")').locator('..').locator('input[type="checkbox"]').first().check();
    await page.locator('label:has-text("关联测试用例")').locator('..').locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "保存需求" }).click();

    await waitForToast(page, "需求已创建");

    const searchBox = page.getByPlaceholder("搜索需求 ID / 标题...");
    await searchBox.fill(requirementKey);
    const row = page.getByRole("row", { name: new RegExp(requirementKey) });
    await expect(row).toBeVisible();

    await row.click();
    await expect(page.getByRole("heading", { name: "编辑安全需求" })).toBeVisible();
    await page.getByPlaceholder("例如：CAN总线报文加密").fill(updatedTitle);
    await page.getByRole("button", { name: "保存需求" }).click();
    await waitForToast(page, "需求已更新");

    await searchBox.fill(requirementKey);
    const updatedRow = page.getByRole("row", { name: new RegExp(updatedTitle) });
    await expect(updatedRow).toBeVisible();
    await updatedRow.getByRole("button", { name: "删除" }).click();
    await expect(page.getByText("确认删除安全需求")).toBeVisible();
    await page.getByRole("button", { name: "确认删除" }).click();
    await waitForToast(page, "需求已删除");
    await expect(page.getByRole("row", { name: new RegExp(requirementKey) })).toHaveCount(0);
  });
});
