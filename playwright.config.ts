import { defineConfig } from "@playwright/test";

/**
 * 前端 e2e 使用浏览器内存 mock（src/lib/api.ts），不依赖 Tauri / SQLite。
 * 本地先跑 `npx playwright install chromium` 安装浏览器。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    viewport: { width: 1200, height: 820 },
  },
  webServer: {
    command: "npm run dev -- --port 1420 --strictPort",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
