const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = (process.env.CHATAPP_SMOKE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /welcome to chat\+/i }).waitFor();
    await page.locator('input[type="email"]').waitFor({ state: "visible" });
    const password = page.locator('input[autocomplete="current-password"]');
    await password.waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show password" }).click();
    assert.equal(await password.getAttribute("type"), "text", "password visibility toggle should reveal the input");
    await page.getByRole("button", { name: "Hide password" }).click();
    assert.equal(await password.getAttribute("type"), "password", "password visibility toggle should hide the input");

    const loginWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(loginWidth <= 391, `login page overflows mobile viewport: ${loginWidth}px`);

    await page.goto(`${baseUrl}/signup`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /create an account/i }).waitFor();
    await page.getByPlaceholder("Your Name").fill("Smoke Test");
    await page.locator('input[autocomplete="email"]').fill("smoke@example.test");
    await page.getByPlaceholder("Create a strong password").fill("abc");
    await page.getByPlaceholder("Re-enter your password").fill("abc");
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByText(/password does not satisfy the security requirements/i).waitFor();

    await page.getByPlaceholder("Create a strong password").fill("Abcdef12!");
    await page.getByPlaceholder("Re-enter your password").fill("Different12!");
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByText("Passwords do not match.").waitFor();

    const signupWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(signupWidth <= 391, `signup page overflows mobile viewport: ${signupWidth}px`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    assert.ok(await page.getByRole("heading", { name: /welcome to chat\+/i }).isVisible());

    assert.deepEqual(pageErrors, [], "no uncaught browser runtime errors should occur on auth flows");
    console.log("Browser smoke passed: login, password toggle, signup validation, desktop/mobile layout, no page errors.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("Browser smoke failed:", error);
  process.exitCode = 1;
});
