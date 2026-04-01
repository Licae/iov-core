import { expect, test } from "@playwright/test";
import { openAssetsPage, uniqueName, waitForToast } from "./helpers/app";

test.describe("assets page", () => {
  test("registers, edits, and deletes an asset", async ({ page }) => {
    const assetName = uniqueName("E2E-资产");
    const updatedAssetName = `${assetName}-已更新`;

    await openAssetsPage(page);

    await page.getByRole("button", { name: "注册新资产" }).click();
    await expect(page.getByRole("heading", { name: "注册新资产" })).toBeVisible();

    await page.locator('input[name="name"]').fill(assetName);
    await page.locator('select[name="type"]').selectOption("Hardware");
    await page.locator('input[name="hardware_version"]').fill("HW-E2E");
    await page.locator('input[name="software_version"]').fill("v9.9.9");
    await page.locator('input[name="connection_address"]').fill("192.168.0.88");
    await page.locator('textarea[name="description"]').fill("E2E 自动创建的测试资产。");
    await page.getByRole("button", { name: "确认注册" }).click();

    await waitForToast(page, "资产注册成功");
    await expect(page.getByText(assetName)).toBeVisible();

    await page.getByText(assetName).click();
    await expect(page.locator(".modal-surface h3", { hasText: assetName })).toBeVisible();
    await expect(page.getByText("连接地址")).toBeVisible();

    await page.getByRole("button", { name: "编辑资产" }).click();
    await expect(page.getByRole("heading", { name: "编辑资产" })).toBeVisible();
    await page.locator('input[name="name"]').fill(updatedAssetName);
    await page.locator('input[name="connection_address"]').fill("192.168.0.99");
    await page.getByRole("button", { name: "保存修改" }).click();

    await waitForToast(page, "资产已更新");
    await expect(page.locator(".modal-surface h3", { hasText: updatedAssetName })).toBeVisible();
    await expect(page.getByText("192.168.0.99")).toBeVisible();

    await page.getByRole("button", { name: "删除资产" }).click();
    await waitForToast(page, "资产已删除");
    await expect(page.getByText(updatedAssetName)).toHaveCount(0);
  });
});
