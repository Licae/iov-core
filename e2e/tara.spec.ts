import { expect, test } from "@playwright/test";
import { openTaraPage, uniqueName, waitForToast } from "./helpers/app";

test.describe("tara page", () => {
  test("creates, edits, and deletes a TARA item", async ({ page }) => {
    const threatScenario = uniqueName("E2E 威胁场景");
    const updatedThreatScenario = `${threatScenario} 已更新`;

    await openTaraPage(page);
    await page.getByRole("button", { name: "新增威胁分析" }).click();
    await expect(page.getByRole("heading", { name: "新增威胁分析" })).toBeVisible();

    const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "创建威胁分析" }) });
    const assetSelect = createForm.locator("select").first();
    const assetValue = await assetSelect.locator("option").nth(1).getAttribute("value");
    expect(assetValue).toBeTruthy();
    await assetSelect.selectOption(assetValue!);
    await createForm.getByPlaceholder("例如：诊断接口 -> 以太网服务 -> SSH控制面").fill("诊断接口 -> SSH 控制面");
    await createForm.getByPlaceholder("例如：认证链路被绕过后，系统控制面被非授权访问").fill("攻击成功后导致控制面遭到未授权访问。");
    await createForm.getByPlaceholder("例如：日志清理或篡改导致认证异常无法追溯").fill(threatScenario);
    await createForm.getByPlaceholder("例如：利用弱鉴权接口注入恶意请求或执行口令爆破").fill("利用弱鉴权接口执行口令爆破。");
    await createForm.getByPlaceholder("例如：导致权限提升、关键服务中断或关键数据被篡改").fill("导致权限提升并篡改关键配置。");

    const numberInputs = createForm.locator('input[type="number"]');
    await numberInputs.nth(0).fill("2");
    await numberInputs.nth(1).fill("1");
    await numberInputs.nth(2).fill("2");
    await numberInputs.nth(3).fill("1");
    await numberInputs.nth(4).fill("5");
    await numberInputs.nth(5).fill("4");
    await numberInputs.nth(6).fill("3");
    await numberInputs.nth(7).fill("2");
    await createForm.locator('input[type="checkbox"]').first().check();
    const createResponsePromise = page.waitForResponse((response) => response.url().includes("/api/tara-items") && response.request().method() === "POST");
    await createForm.getByRole("button", { name: "创建威胁分析" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();

    const searchBox = page.getByPlaceholder("搜索威胁 ID / 场景 / 需求ID...");
    await searchBox.fill(threatScenario);
    const row = page.getByRole("row", { name: new RegExp(threatScenario) });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByRole("heading", { name: "编辑威胁" })).toBeVisible();
    await page.locator('.drawer-surface input').nth(0).fill(updatedThreatScenario);
    await page.getByRole("button", { name: "保存" }).click();
    await waitForToast(page, "威胁项已更新");

    const updatedRow = page.getByRole("row", { name: new RegExp(updatedThreatScenario) });
    await expect(updatedRow).toBeVisible();
    await updatedRow.getByRole("button", { name: "删除" }).click();
    await expect(page.getByText("确认删除威胁分析")).toBeVisible();
    await page.getByRole("button", { name: "确认删除" }).click();
    await waitForToast(page, "威胁项已删除");
    await searchBox.fill(updatedThreatScenario);
    await expect(page.getByText("暂无 TARA 数据")).toBeVisible();
  });
});
