const assert = require("node:assert/strict");
const { chromium, firefox, webkit } = require("playwright");

const baseUrl = (process.env.CHATAPP_SMOKE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const engines = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

async function exerciseBrowser(name, browserType) {
  const browser = await browserType.launch({ headless: true, args: name === "chromium" ? ["--no-sandbox"] : [] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /welcome to chat\+/i }).waitFor();
    await page.locator('input[type="email"]').waitFor({ state: "visible" });
    const password = page.locator('input[autocomplete="current-password"]');
    await password.waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show password" }).click();
    assert.equal(await password.getAttribute("type"), "text", `${name}: password visibility should reveal the input`);
    await page.getByRole("button", { name: "Hide password" }).click();
    assert.equal(await password.getAttribute("type"), "password", `${name}: password visibility should hide the input`);

    const loginWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(loginWidth <= 391, `${name}: login page overflows mobile viewport: ${loginWidth}px`);

    await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
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
    assert.ok(signupWidth <= 391, `${name}: signup page overflows mobile viewport: ${signupWidth}px`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    assert.ok(await page.getByRole("heading", { name: /welcome to chat\+/i }).isVisible());

    assert.deepEqual(pageErrors, [], `${name}: no uncaught browser errors should occur during authentication journeys`);
    console.log(`${name}: login, password toggle, signup validation, responsive viewports passed`);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const [name, browserType] of engines) await exerciseBrowser(name, browserType);
  console.log("Cross-browser smoke passed on Chromium, Firefox and WebKit.");
})().catch(error => {
  console.error("Cross-browser smoke failed:", error);
  process.exitCode = 1;
});
