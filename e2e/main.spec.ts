import { expect, test } from "@playwright/test";
import {
  addTask,
  dragTask,
  goView,
  MOCK_KEY,
  openEmpty,
  readTasks,
  taskRow,
  waitForStoredCount,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await openEmpty(page);
});

test("写「明天3点xx」会加入即将到来，并自动切到对应清单", async ({ page }) => {
  await page.locator(".fab").click();
  const input = page.locator(".adder input");
  await input.fill("明天3点提交日报");
  await expect(page.locator(".adder .parsed")).toHaveText("明天 03:00");
  await input.press("Enter");

  // 页面自动来到「即将到来」，新任务高亮可见
  await expect(page.locator(".hero h1")).toHaveText("即将到来");

  // 关键回归：任务真的存下来了
  const tasks = await readTasks(page);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("提交日报");
  expect(new Date(tasks[0].dueAt!).getDate()).toBe(
    new Date(Date.now() + 86_400_000).getDate(),
  );

  const row = taskRow(page, "提交日报");
  await expect(row).toBeVisible();
  await expect(row.locator(".task-time")).toHaveText(/明天 03:00/);
  await expect(row).toHaveClass(/just-added/);
  await expect(page.locator(".toast")).toContainText("已添加「提交日报」· 明天 03:00");
});

test("不带时间的任务留在今日清单", async ({ page }) => {
  await addTask(page, "买牛奶");
  await expect(page.locator(".hero h1")).toHaveText("今日待办");
  await expect(taskRow(page, "买牛奶")).toBeVisible();
  await expect(taskRow(page, "买牛奶").locator(".task-time")).toHaveCount(0);
});

test("在即将到来里记录今日任务会切回今日", async ({ page }) => {
  await goView(page, "upcoming");
  await addTask(page, "倒垃圾");
  await expect(page.locator(".hero h1")).toHaveText("今日待办");
  await expect(taskRow(page, "倒垃圾")).toBeVisible();
});

test("自然语言时间变体", async ({ page }) => {
  const cases = [
    { text: "明晚8点看电影", title: "看电影", time: "明天 20:00" },
    { text: "明天十点开会", title: "开会", time: "明天 10:00" },
    { text: "明天下午3点喝茶", title: "喝茶", time: "明天 15:00" },
    { text: "明天3点15分出发", title: "出发", time: "明天 03:15" },
    { text: "明天3点半启程", title: "启程", time: "明天 03:30" },
  ];

  for (const item of cases) {
    await addTask(page, item.text);
    const row = taskRow(page, item.title);
    await expect(row).toBeVisible();
    await expect(row.locator(".task-time")).toHaveText(item.time);
    await goView(page, "today");
  }
});

test("后天与周几也能正确落到即将到来", async ({ page }) => {
  await addTask(page, "后天9点交作业");
  await addTask(page, "下周三开会");

  await waitForStoredCount(page, 2);
  const tasks = await readTasks(page);
  const byTitle = new Map(tasks.map((t) => [t.title, t]));

  const afterTomorrow = new Date(byTitle.get("交作业")!.dueAt!);
  expect(afterTomorrow.getHours()).toBe(9);

  const nextWeek = new Date(byTitle.get("开会")!.dueAt!);
  expect(nextWeek.getDay()).toBe(3);
  expect(nextWeek.getTime()).toBeGreaterThan(Date.now());

  await expect(taskRow(page, "交作业")).toBeVisible();
  await expect(taskRow(page, "开会")).toBeVisible();
});

test("编辑标题与分类时不会丢掉时间", async ({ page }) => {
  await addTask(page, "明天3点提交日报", "工作");
  const row = taskRow(page, "提交日报");
  await row.hover();
  await row.locator(".task-edit-btn").click();

  const input = page.locator(".edit-sheet input");
  await expect(input).toBeFocused();
  await input.fill("提交周报");
  await page.locator(".edit-tags .tag-pick", { hasText: "学习" }).click();
  await page.locator(".edit-sheet .btn.primary").click();

  const edited = taskRow(page, "提交周报");
  await expect(edited).toBeVisible();
  await expect(edited.locator(".tag")).toHaveText("学习");
  await expect(edited.locator(".task-time")).toHaveText(/明天 03:00/);

  await waitForStoredCount(page, 1);
  await expect
    .poll(async () => (await readTasks(page)).find((t) => t.title === "提交周报")?.tag)
    .toBe("学习");
  const stored = (await readTasks(page)).find((t) => t.title === "提交周报");
  expect(stored?.dueAt).not.toBeNull();
});

test("新建时选择的分类会保存", async ({ page }) => {
  await addTask(page, "去跑步", "健康");
  const row = taskRow(page, "去跑步");
  await expect(row.locator(".tag")).toHaveText("健康");
  await expect(row.locator(".tag")).toHaveClass(/health/);
});

test("完成任务后进入已完成，并能取消完成", async ({ page }) => {
  await addTask(page, "买牛奶");
  await taskRow(page, "买牛奶").locator(".check").click();
  await expect(taskRow(page, "买牛奶")).toHaveCount(0, { timeout: 3000 });

  await goView(page, "done");
  const doneRow = taskRow(page, "买牛奶");
  await expect(doneRow).toBeVisible();
  await expect(doneRow).toHaveClass(/done/);

  await doneRow.locator(".check").click();
  await expect(taskRow(page, "买牛奶")).toHaveCount(0, { timeout: 3000 });

  await goView(page, "today");
  await expect(taskRow(page, "买牛奶")).toBeVisible();
});

test("删除任务", async ({ page }) => {
  await addTask(page, "临时任务");
  const row = taskRow(page, "临时任务");
  await row.hover();
  await row.locator(".task-del").click();
  await expect(taskRow(page, "临时任务")).toHaveCount(0);
  await waitForStoredCount(page, 0);
});

test("搜索会实时过滤当前清单", async ({ page }) => {
  await addTask(page, "买牛奶");
  await addTask(page, "写周报");

  const search = page.locator(".search input");
  await search.fill("牛奶");
  await expect(taskRow(page, "买牛奶")).toBeVisible();
  await expect(taskRow(page, "写周报")).toHaveCount(0);

  await search.fill("");
  await expect(taskRow(page, "写周报")).toBeVisible();
});

test("清除已完成后列表清空", async ({ page }) => {
  await addTask(page, "买牛奶");
  await taskRow(page, "买牛奶").locator(".check").click();
  await expect(taskRow(page, "买牛奶")).toHaveCount(0, { timeout: 3000 });

  await page.locator('.rail-btn[title="设置"]').click();
  await page.locator(".sheet .btn.ghost", { hasText: "清除已完成" }).click();

  await goView(page, "done");
  await expect(page.locator(".empty")).toBeVisible();
  expect(await readTasks(page)).toHaveLength(0);
});

test("拖拽排序后顺序变化，并在刷新后保留", async ({ page }) => {
  await addTask(page, "任务A");
  await addTask(page, "任务B");
  await addTask(page, "任务C");
  await waitForStoredCount(page, 3);

  await expect(page.locator(".task-title")).toHaveText(["任务A", "任务B", "任务C"]);

  await dragTask(page, "任务C", "任务A");
  await expect(page.locator(".task-title")).toHaveText(["任务C", "任务A", "任务B"]);

  // 等 mock 把新顺序落盘后再刷新
  await expect
    .poll(async () =>
      (await readTasks(page))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => t.title),
    )
    .toEqual(["任务C", "任务A", "任务B"]);

  await page.reload();
  await expect(page.locator(".task-title")).toHaveText(["任务C", "任务A", "任务B"]);
});

test("键盘快捷键：新建、搜索、切换视图、Esc 取消", async ({ page }) => {
  await page.keyboard.press("Control+n");
  await expect(page.locator(".adder")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".adder")).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await expect(page.locator(".search input")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+2");
  await expect(page.locator(".hero h1")).toHaveText("即将到来");
  await page.keyboard.press("Control+1");
  await expect(page.locator(".hero h1")).toHaveText("今日待办");
});

test("刷新后任务仍然存在", async ({ page }) => {
  await addTask(page, "买牛奶");
  await waitForStoredCount(page, 1);
  await page.reload();
  await expect(taskRow(page, "买牛奶")).toBeVisible();
});

test("写入失败时会给出错误提示", async ({ page }) => {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new Error("磁盘写入失败");
      return original.call(this, k, v);
    };
  }, MOCK_KEY);

  await page.locator(".fab").click();
  await page.locator(".adder input").fill("买牛奶");
  await page.locator(".adder input").press("Enter");

  await expect(page.locator(".toast.error")).toContainText("添加失败");
});
