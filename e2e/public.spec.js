const { test, expect } = require("@playwright/test");

const unavailable =
  "Account services are not connected yet. You can explore TengeFlow in demo mode.";

test("anonymous visitors are sent to sign in before opening a workspace", async ({
  page,
}) => {
  await page.goto("/app/transactions");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(
    page.getByRole("heading", { name: "Good to have you back." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toHaveCount(0);
});

test("landing navigation, FAQ, and account links work on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A little clarity/ })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Open navigation" });
  await toggle.click();
  const menu = page.getByRole("navigation", {
    name: "Mobile site navigation",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await menu.getByRole("link", { name: "Features", exact: true }).click();
  await expect(page).toHaveURL(/\/#features$/);
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Room for the little things/ }),
  ).toBeInViewport();

  await page
    .getByText("Can I try it before creating an account?", { exact: true })
    .click();
  await expect(
    page.getByText(/Yes\. Try demo opens a sample workspace/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(page.getByRole("heading", { name: /A little clarity/ })).toBeVisible();
});

test("product preview tabs reveal distinct data by click and keyboard before opening the demo", async ({
  page,
}) => {
  await page.goto("/");
  const tablist = page.getByRole("tablist", { name: "Explore TengeFlow", exact: true });
  const tabs = tablist.getByRole("tab");
  await expect(tabs).toHaveCount(3);

  async function expectSelected(name) {
    const selected = tablist.getByRole("tab", { name, exact: true });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(selected).toHaveAttribute("tabindex", "0");
    await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    for (const other of await tabs.all()) {
      if ((await other.getAttribute("aria-selected")) === "false") {
        await expect(other).toHaveAttribute("tabindex", "-1");
      }
    }
    const panel = page.getByRole("tabpanel", { name, exact: true });
    await expect(panel).toBeVisible();
    const tabId = await selected.getAttribute("id");
    const panelId = await panel.getAttribute("id");
    expect(tabId).toBeTruthy();
    expect(panelId).toBeTruthy();
    await expect(panel).toHaveAttribute("aria-labelledby", tabId);
    await expect(selected).toHaveAttribute("aria-controls", panelId);
    await expect(panel).toContainText(/\d/);
    return panel.innerText();
  }

  const overview = await expectSelected("Overview");
  await tablist.getByRole("tab", { name: "Budgets", exact: true }).click();
  const budgets = await expectSelected("Budgets");
  expect(budgets).not.toEqual(overview);

  for (const [key, name] of [
    ["ArrowRight", "Expenses"],
    ["ArrowRight", "Overview"],
    ["ArrowLeft", "Expenses"],
    ["Home", "Overview"],
    ["End", "Expenses"],
    ["ArrowLeft", "Budgets"],
  ]) {
    await page.keyboard.press(key);
    const content = await expectSelected(name);
    await expect(tablist.getByRole("tab", { name, exact: true })).toBeFocused();
    if (name === "Expenses") {
      expect(content).not.toEqual(overview);
      expect(content).not.toEqual(budgets);
    }
  }
  await page.getByRole("link", { name: "Open the demo", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
});

test("registration validates fields, explains password mismatch, and can reveal the password", async ({
  page,
}) => {
  await page.goto("/register");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Enter at least 2 characters.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Use at least 8 characters.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await page.getByLabel("Your name", { exact: true }).fill("Ayan");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ayan@example.com");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("My demo password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Something different");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Passwords don’t match.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("My demo password");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
});

test("sign in and password recovery provide actionable validation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("not-an-email");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Enter your password.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Forgot password?", exact: true })
    .click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "This link is no longer active." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Get a new reset link", exact: true })
    .click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("without backend configuration valid submissions report the limitation without creating an account", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "A fresh start for your money." })).toBeVisible();
  test.skip(!(await page.getByText(unavailable, { exact: false }).isVisible()), "This deployment is connected to a backend; account flows are covered by account.spec.js.");
  await expect(page.getByRole("status")).toContainText(unavailable);
  await page.getByLabel("Your name", { exact: true }).fill("Ayan");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ayan@example.com");
  await page.getByLabel("Password", { exact: true }).fill("My demo password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("My demo password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(unavailable);
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ayan@example.com");
  await page.getByLabel("Password", { exact: true }).fill("My demo password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(unavailable);
  await expect(page).toHaveURL(/\/login$/);
});

test("demo opens separately from accounts and exit restores the authentication boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Try demo", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open account menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
});

test("public screens and account forms fit small phones through desktop", async ({
  page,
}) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  for (const { width, height } of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 768, height: 1000 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize({ width, height });
    for (const [path, title] of [
      ["/", /A little clarity/],
      ["/login", "Good to have you back."],
      ["/register", "A fresh start for your money."],
      ["/forgot-password", "Let’s get you back in."],
      ["/reset-password", "This link is no longer active."],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, level: 1 }),
      ).toBeVisible();
      if (path === "/") {
        const artwork = page.locator("main img");
        expect(await artwork.count(), "Landing artwork should be present").toBeGreaterThan(0);
        for (const image of await artwork.all()) {
          if (!(await image.isVisible())) continue;
          await image.scrollIntoViewIfNeeded();
          await expect
            .poll(
              () => image.evaluate((element) => element.complete && element.naturalWidth > 0),
              { message: `Landing artwork failed to load at ${width}×${height}` },
            )
            .toBe(true);
        }
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${path} overflows at ${width}px`).toBe(false);
      const fields = page.locator("input");
      for (const field of await fields.all()) {
        const bounds = await field.boundingBox();
        expect(
          bounds,
          `${path} has a hidden field at ${width}px`,
        ).not.toBeNull();
        expect(
          bounds.height,
          `${path} field touch target at ${width}px`,
        ).toBeGreaterThanOrEqual(44);
        if (width < 768) {
          const fontSize = await field.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          );
          expect(
            fontSize,
            `${path} field font should avoid iOS input zoom`,
          ).toBeGreaterThanOrEqual(16);
        }
      }
      if (
        (width === 390 || width === 1440) &&
        (path === "/" || path === "/register")
      ) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `artifacts/public-${path === "/" ? "landing" : "register"}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  expect(runtimeErrors).toEqual([]);
});
