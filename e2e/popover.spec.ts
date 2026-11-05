import { expect, test } from "@playwright/test";
import { MOCK_KEY, openEmpty, readTasks } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openEmpty(page, "/?view=popover");
});

async function quickAdd(page: import("@playwright/test").Page, text: string) {
  const input = page.locator(".pop-input input");
  await expect(input).toBeFocused();
  await input.fill(text);
  await input.press("Enter");
}

test("今日任务：回车保存后立刻出现在列表里", async ({ page }) => {
  await quickAdd(page, "买牛奶");
  await expect(page.locator(".pop-flash")).toHaveText("已添加");
  await expect(page.locator(".pop-input input")).toHaveValue("");
  await expect(page.locator(".pop-task span")).toHaveText("买牛奶");

  const tasks = await readTasks(page);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("买牛奶");
  expect(tasks[0].dueAt).toBeNull();
});

test("「明天3点xx」：确认条 + 接下来分组里都能看到这条任务", async ({ page }) => {
  await quickAdd(page, "明天3点提交日报");

  // 确认条说明加到了哪里
  await expect(page.locator(".pop-flash")).toHaveText(
    "已加入即将到来 · 明天 03:00",
  );
  await expect(page.locator(".pop-input input")).toHaveValue("");

  // 任务本身出现在「接下来」分组，并高亮闪一下——不是只弹一条提示
  await expect(page.locator(".pop-group")).toHaveText("接下来");
  const row = page.locator(".pop-task", { hasText: "提交日报" });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/just-added/);
  await expect(row.locator("em")).toHaveText("明天 03:00");
  await expect(page.locator(".pop-empty")).toHaveCount(0);

  const tasks = await readTasks(page);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("提交日报");
  const due = new Date(tasks[0].dueAt!);
  expect(due.getHours()).toBe(3);
  expect(due.getMinutes()).toBe(0);
  expect(due.getTime()).toBeGreaterThan(Date.now());
});

test("明晚/下午等说法按正确的小时保存，并在列表里出现", async ({ page }) => {
  await quickAdd(page, "明晚8点看电影");
  await expect(page.locator(".pop-flash")).toHaveText(
    "已加入即将到来 · 明天 20:00",
  );
  await expect(page.locator(".pop-task", { hasText: "看电影" })).toBeVisible();

  const task = (await readTasks(page))[0];
  expect(new Date(task.dueAt!).getHours()).toBe(20);
});

test("写入失败时保留输入并提示错误", async ({ page }) => {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new Error("磁盘写入失败");
      return original.call(this, k, v);
    };
  }, MOCK_KEY);

  await quickAdd(page, "买牛奶");
  await expect(page.locator(".pop-flash.error")).toContainText("添加失败");
  await expect(page.locator(".pop-input input")).toHaveValue("买牛奶");
});

test("弹窗内双击/铅笔可内联改标题", async ({ page }) => {
  await quickAdd(page, "买牛奶");
  const row = page.locator(".pop-task", { hasText: "买牛奶" });
  await row.hover();
  await row.locator(".pop-edit-btn").click();

  const edit = page.locator(".pop-edit-input");
  await expect(edit).toBeFocused();
  await edit.fill("买酸奶");
  await edit.press("Enter");

  await expect(page.locator(".pop-task span")).toHaveText("买酸奶");
  await expect
    .poll(async () => (await readTasks(page))[0]?.title, { timeout: 5000 })
    .toBe("买酸奶");
});

test("弹窗里勾选完成", async ({ page }) => {
  await quickAdd(page, "买牛奶");
  await page.locator(".pop-task .check").click();
  await expect(page.locator(".pop-task")).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator(".pop-empty")).toBeVisible();

  const task = (await readTasks(page))[0];
  expect(task.completedAt).not.toBeNull();
});

test("今天和接下来分组同时存在时都能看到", async ({ page }) => {
  await quickAdd(page, "买牛奶");
  await quickAdd(page, "明天下午3点喝茶");

  await expect(page.locator(".pop-group")).toHaveText(["今天", "接下来"]);
  await expect(page.locator(".pop-task", { hasText: "买牛奶" })).toBeVisible();
  await expect(page.locator(".pop-task", { hasText: "喝茶" })).toBeVisible();
  await expect(page.locator(".pop-flash")).toHaveText(
    "已加入即将到来 · 明天 15:00",
  );
});
