import { expect, type Page } from "@playwright/test";

export const MOCK_KEY = "mini-todo-mock-v1";

export type MockTask = {
  id: number;
  title: string;
  dueAt: number | null;
  tag: string;
  completedAt: number | null;
  sortOrder: number;
};

/** 打开页面并把 mock 数据清空，保证每个用例互不影响 */
export async function openEmpty(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate((key) => localStorage.setItem(key, "[]"), MOCK_KEY);
  await page.reload();
  await expect(page.locator(".shell, .pop-shell")).toBeVisible();
}

export async function readTasks(page: Page): Promise<MockTask[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as MockTask[],
    MOCK_KEY,
  );
}

/** mock 写库有 40ms 延迟，断言存储内容前先等它落盘 */
export async function waitForStoredCount(page: Page, count: number) {
  await expect
    .poll(async () => (await readTasks(page)).length, { timeout: 5000 })
    .toBe(count);
}

export async function waitForStoredTask(page: Page, title: string) {
  await expect
    .poll(
      async () => (await readTasks(page)).some((t) => t.title === title),
      { timeout: 5000 },
    )
    .toBe(true);
}

export function taskRow(page: Page, title: string) {
  return page.locator(".task").filter({ hasText: title });
}

export async function goView(
  page: Page,
  view: "today" | "upcoming" | "all" | "done",
) {
  const names = {
    today: "今天",
    upcoming: "即将到来",
    all: "全部",
    done: "已完成",
  } as const;
  await page.locator(`.rail-btn[title^="${names[view]}"]`).click();
  await expect(page.locator(".hero h1")).toHaveText(
    { today: "今日待办", upcoming: "即将到来", all: "全部任务", done: "已完成" }[view],
  );
}

/** 主窗口：通过 + 号添加，可选分类；返回解析后的输入内容便于断言 */
export async function addTask(page: Page, text: string, tag?: string) {
  await page.locator(".fab").click();
  const input = page.locator(".adder input");
  await expect(input).toBeFocused();
  await input.fill(text);
  if (tag) {
    await page.locator(".adder-foot .tag-pick", { hasText: tag }).click();
  }
  await input.press("Enter");
  await expect(page.locator(".adder")).toHaveCount(0);
}

/** 模拟 HTML5 拖拽：把 from 拖到 to 上 */
export async function dragTask(page: Page, from: string, to: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const source = taskRow(page, from);
  const target = taskRow(page, to);

  await source.dispatchEvent("dragstart", { dataTransfer });
  await page.waitForTimeout(60);
  await target.dispatchEvent("dragover", { dataTransfer });
  await page.waitForTimeout(60);
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}
