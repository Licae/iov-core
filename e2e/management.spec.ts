import { expect, test } from "@playwright/test";
import { openManagementPage, searchManagementCase, uniqueName, waitForToast } from "./helpers/app";

test.describe("management page", () => {
  test("loads paginated test cases from server", async ({ page }) => {
    await openManagementPage(page);

    await expect(page.getByText("共 108 条用例，当前第 1 / 11 页")).toBeVisible();
    await expect(page.getByRole("cell", { name: "升级包签名校验" })).toBeVisible();
    await expect(page.getByRole("button", { name: "下一页" })).toBeEnabled();
  });

  test("supports search and resets pagination to filtered results", async ({ page }) => {
    await openManagementPage(page);

    await searchManagementCase(page, "升级包签名校验");
    await expect(page.getByRole("cell", { name: "升级包签名校验" })).toBeVisible();
    await expect(page.getByText("共 1 条用例，当前第 1 / 1 页")).toBeVisible();
    await expect(page.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  test("opens drawer and renders execution history section", async ({ page }) => {
    await openManagementPage(page);

    await page.getByRole("row", { name: /升级包签名校验/ }).click();
    await expect(page.getByRole("heading", { name: "编辑用例" })).toBeVisible();
    await expect(page.getByText("执行历史")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
  });

  test("paginates to next page", async ({ page }) => {
    await openManagementPage(page);

    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.getByText("当前第 2 / 11 页")).toBeVisible();
    await expect(page.getByRole("cell", { name: "11" })).toBeVisible();
  });

  test("creates a new automated test case", async ({ page }) => {
    const caseTitle = uniqueName("E2E-管理新建用例");

    await openManagementPage(page);
    await page.getByRole("button", { name: "新建用例" }).click();
    await expect(page.getByRole("heading", { name: "新建测试用例" })).toBeVisible();

    await page.locator('input[name="title"]').fill(caseTitle);
    await page.locator('select[name="category"]').selectOption("Gateway");
    await page.locator('select[name="protocol"]').selectOption("Ethernet");
    await page.locator('select[name="security_domain"]').selectOption("访问控制");
    await page.locator('input[name="test_tool"]').fill("ssh_access_check");
    await page.locator('input[name="test_input"]').fill("测试地址与测试账号");
    await page.locator('textarea[name="expected_result"]').fill("未授权访问必须被拒绝，系统应明确判定失败。");
    await page.locator('textarea[name="description"]').fill("E2E 自动创建的管理页测试用例。");
    await page.locator('input[name="script_path"]').fill("scripts/ssh_access_check.py");
    await page.locator('textarea[name="steps"]').fill("步骤1：准备连接环境\n步骤2：执行 SSH 访问校验");
    await page.locator('input[name="default_input_ssh_probe_username"]').fill("e2e-user");
    await page.locator('input[name="default_input_ssh_probe_password"]').fill("e2e-password");
    await page.locator('input[name="default_input_ssh_port"]').fill("22");

    await page.getByRole("button", { name: "确认创建" }).click();
    await waitForToast(page, "测试用例创建成功");

    await searchManagementCase(page, caseTitle);
    await expect(page.getByRole("row", { name: new RegExp(caseTitle) })).toBeVisible();
  });

  test("edits and saves an existing test case", async ({ page }) => {
    const originalTitle = "升级包签名校验";
    const updatedTitle = uniqueName("E2E-编辑后用例");

    await openManagementPage(page);
    await searchManagementCase(page, originalTitle);
    await page.getByRole("row", { name: new RegExp(originalTitle) }).click();
    await expect(page.getByRole("heading", { name: "编辑用例" })).toBeVisible();

    await page.locator('#test-case-drawer-form input[name="title"]').fill(updatedTitle);
    await page.locator('#test-case-drawer-form textarea[name="expected_result"]').fill("篡改签名的升级包必须被拒绝并记录失败结论。");
    await page.getByRole("button", { name: "保存" }).click();
    await waitForToast(page, "测试用例已更新");
    await expect(page.locator('#test-case-drawer-form input[name="title"]')).toHaveValue(updatedTitle);
  });

  test("imports test cases from markdown table", async ({ page }) => {
    const importTitle = uniqueName("E2E-批量导入用例");

    await openManagementPage(page);
    await page.getByRole("button", { name: "批量导入" }).click();
    await expect(page.getByRole("heading", { name: "批量导入测试用例" })).toBeVisible();

    await page.locator("textarea").fill(
      `| 目标模块/业务域 | 安全分类 | 用例名称 | 测试协议 | 测试类型 | 测试输入 | 测试工具 | 测试步骤 | 预期结果 | 自动化等级 | 描述 | 执行器类型 | 脚本路径 | 超时秒数 | 默认输入(JSON) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IVI | 访问控制 | ${importTitle} | Ethernet | Automated | 测试输入 | ssh_access_check | 尝试未授权登录；确认系统拒绝连接 | 必须拒绝未授权访问并判定失败 | A | E2E 导入测试 | python | scripts/ssh_access_check.py | 300 | {"ssh_port":"22"} |`,
    );

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/test-cases/import"));
    await page.getByRole("button", { name: "开始导入" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({ success: true, count: 1 });

    await openManagementPage(page);
    await searchManagementCase(page, importTitle);
    await expect(page.getByRole("row", { name: new RegExp(importTitle) })).toBeVisible();
  });

  test("deletes a created test case with confirmation", async ({ page }) => {
    const caseTitle = uniqueName("E2E-待删除用例");

    await openManagementPage(page);
    await page.getByRole("button", { name: "新建用例" }).click();
    await page.locator('input[name="title"]').fill(caseTitle);
    await page.locator('select[name="category"]').selectOption("IVI");
    await page.locator('select[name="protocol"]').selectOption("Ethernet");
    await page.locator('select[name="security_domain"]').selectOption("日志安全");
    await page.locator('input[name="test_tool"]').fill("system_log_check");
    await page.locator('input[name="test_input"]').fill("日志样本");
    await page.locator('textarea[name="expected_result"]').fill("异常日志必须被识别并可明确判定通过或失败。");
    await page.locator('textarea[name="description"]').fill("E2E 删除流程测试用例。");
    await page.locator('input[name="script_path"]').fill("scripts/system_log_check.py");
    await page.locator('textarea[name="steps"]').fill("步骤1：准备日志\n步骤2：执行检测");
    await page.getByRole("button", { name: "确认创建" }).click();
    await waitForToast(page, "测试用例创建成功");

    await searchManagementCase(page, caseTitle);
    await page.getByRole("row", { name: new RegExp(caseTitle) }).click();
    await page.getByRole("button", { name: "删除" }).click();
    await expect(page.getByText("确认删除测试用例")).toBeVisible();
    await page.getByRole("button", { name: "确认删除" }).click();
    await waitForToast(page, "测试用例已删除");

    await searchManagementCase(page, caseTitle);
    await expect(page.getByText("未找到匹配的测试用例")).toBeVisible();
  });
});
