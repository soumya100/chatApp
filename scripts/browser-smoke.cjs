const assert = require("node:assert/strict");

// Playwright is intentionally NOT a package.json dependency: it would pull the
// multi-hundred-megabyte browser download into every yarn install. CI installs
// the pinned global build instead (see chatapp-ci.yml, "Install pinned
// Playwright and browser engines"). The version here must match that pin.
const PLAYWRIGHT_PIN = "1.65.1";
let playwright;
try {
  playwright = require("playwright");
} catch {
  throw new Error(
    `Playwright is required by the browser smoke test but is not installed. ` +
    `Install the pinned build: npm install --global playwright@${PLAYWRIGHT_PIN} ` +
    `&& playwright install --with-deps chromium firefox webkit`
  );
}
const { chromium, firefox, webkit } = playwright;

const baseUrl = (process.env.CHATAPP_SMOKE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const engines = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

async function togglePasswordVisibility(page, selector, reveal, engine) {
  // React hydrates after the first paint, and a click delivered before
  // hydration completes is silently dropped (notably against a cold dev
  // server that is still compiling the page). The toggle is therefore
  // asserted through a bounded retry loop instead of a single racy click.
  const label = reveal ? "Show password" : "Hide password";
  const expectedType = reveal ? "text" : "password";
  const expectedAction = reveal ? "reveal" : "hide";
  const deadline = Date.now() + 20_000;
  let lastType = "";
  while (Date.now() < deadline) {
    await page.getByRole("button", { name: label }).click();
    try {
      await page.waitForFunction(
        ([inputSelector, type]) => document.querySelector(inputSelector)?.getAttribute("type") === type,
        [selector, expectedType],
        { timeout: 2_000 }
      );
      return;
    } catch {
      lastType = await page.locator(selector).getAttribute("type");
    }
  }
  assert.equal(lastType, expectedType, `${engine}: password visibility should ${expectedAction} the input`);
}

async function submitSignupExpecting(page, engine, fill, expectedText) {
  // React hydrates after the first paint, and a Create Account click
  // delivered before hydration completes falls through to a native form
  // submission that reloads the page and clears every field. Clicking again
  // immediately would keep reloading the page before it ever hydrates, so
  // every attempt waits for the page to settle (network idle plus a grace
  // period) before interacting, and the submission is retried within a
  // bounded window.
  const deadline = Date.now() + 90_000;
  let lastError = "";
  for (;;) {
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2_500);
    await fill(page);
    await page.getByRole("button", { name: "Create Account" }).click();
    try {
      await page.getByText(expectedText).waitFor({ timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error.message;
    }
    if (Date.now() > deadline) break;
  }
  assert.fail(`${engine}: signup validation message "${expectedText}" never appeared: ${lastError}`);
}

async function exerciseBrowser(name, browserType) {
  const browser = await browserType.launch({ headless: true, args: name === "chromium" ? ["--no-sandbox"] : [] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`));

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /welcome to chat\+/i }).waitFor();
    await page.locator('input[type="email"]').waitFor({ state: "visible" });
    const passwordSelector = 'input[autocomplete="current-password"]';
    await page.locator(passwordSelector).waitFor({ state: "visible" });
    await togglePasswordVisibility(page, passwordSelector, true, name);
    await togglePasswordVisibility(page, passwordSelector, false, name);

    const loginWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(loginWidth <= 391, `${name}: login page overflows mobile viewport: ${loginWidth}px`);

    await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /create an account/i }).waitFor();
    const fillSignup = (password, confirmation) => p => {
      p.getByPlaceholder("Your Name").fill("Smoke Test");
      p.locator('input[autocomplete="email"]').fill("smoke@example.test");
      p.getByPlaceholder("Create a strong password").fill(password);
      p.getByPlaceholder("Re-enter your password").fill(confirmation);
    };
    await submitSignupExpecting(
      page, name,
      fillSignup("abc", "abc"),
      /password does not satisfy the security requirements/i
    );
    await submitSignupExpecting(
      page, name,
      fillSignup("Abcdef12!", "Different12!"),
      "Passwords do not match."
    );

    const signupWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(signupWidth <= 391, `${name}: signup page overflows mobile viewport: ${signupWidth}px`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    const desktopHeading = page.getByRole("heading", { name: /welcome to chat\+/i });
    await desktopHeading.waitFor({ state: "visible", timeout: 15_000 });
    assert.equal(await desktopHeading.isVisible(), true, `${name}: login heading should be visible on desktop`);

    assert.deepEqual(pageErrors, [], `${name}: no uncaught browser errors should occur during authentication journeys`);
    assert.deepEqual(failedRequests, [], `${name}: no network requests should fail during authentication journeys`);
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
