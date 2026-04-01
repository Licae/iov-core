import { expect, test } from "@playwright/test";
import { openReportsPage } from "./helpers/app";

test.describe("reports page", () => {
  test("renders report sections and exports HTML", async ({ page }) => {
    await openReportsPage(page);

    await expect(page.getByText("测试通过率趋势")).toBeVisible();
    await expect(page.getByText("ECU 模块测试覆盖率")).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "导出 HTML 报告" }).click();
    const popup = await popupPromise;
    await expect(popup).toBeTruthy();
  });
});
