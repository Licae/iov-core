import { expect, test } from "@playwright/test";
import { openDefectsPage } from "./helpers/app";

test.describe("defects page", () => {
  test("renders empty state and exports a report", async ({ page }) => {
    await openDefectsPage(page);

    await expect(page.getByText("未发现缺陷记录")).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "导出报告" }).click();
    const popup = await popupPromise;
    await expect(popup).toBeTruthy();
  });
});
