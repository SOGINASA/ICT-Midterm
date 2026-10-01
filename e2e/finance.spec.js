const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});

test("all five screens work on desktop and mobile without overflow or runtime errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [route, heading] of [
      ["/app", "Overview"],
      ["/app/add", "Add expense"],
      ["/app/transactions", "Transactions"],
      ["/app/budgets", "Budgets"],
      ["/app/insights", "Insights"],
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: heading, exact: true, level: 1 }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${heading} overflows at ${viewport.width}px`).toBe(
        false,
      );
      if (viewport.width === 390 || viewport.width === 1440)
        await page.screenshot({
          path: `artifacts/${heading.toLowerCase().replaceAll(" ", "-")}-${viewport.width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  for (const route of ["/app/transactions", "/app/budgets", "/app/insights"]) {
    await page.goto(route);
    await page
      .getByRole("link", { name: "Add expense", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Add expense", exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("expense validates, preserves draft, saves, survives reload, edits and deletes", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: "Add expense", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByText("Enter an amount greater than ₸0."),
  ).toBeVisible();
  await page.getByLabel("How much did you spend?").fill("3500");
  await page.getByText("Food", { exact: true }).click();
  await page.getByLabel("Note (optional)").fill("E2E lunch");
  await page.getByRole("link", { name: "Back to overview" }).click();
  await page
    .getByRole("link", { name: "Add expense", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("How much did you spend?")).toHaveValue("3500");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("₸38,850", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("₸81,150", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("₸81,150", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: /E2E lunch/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit expense" }),
  ).toBeVisible();
  await page.getByLabel("Amount (₸)").fill("4000");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: /E2E lunch/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Delete this expense?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete expense", exact: true })
    .click();
  await page.goto("/app");
  await expect(
    page.getByText("₸77,650", { exact: true }).first(),
  ).toBeVisible();
});

test("offline expense remains pending until reconnection and then demo syncs", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Local demo" }).click();
  await expect(page.getByText("Demo offline mode is on")).toBeVisible();
  await page
    .getByRole("link", { name: "Add expense", exact: true })
    .first()
    .click();
  await page.getByLabel("How much did you spend?").fill("1200");
  await page.getByText("Transport", { exact: true }).click();
  await page.getByLabel("Note (optional)").fill("E2E offline bus");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByText(
      "Saved on this device — pending demo sync when the connection returns.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(page.getByText("Pending sync", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Go online", exact: true }).click();
  await expect(page.getByText("Pending sync", { exact: true })).toHaveCount(0);
  await page.goto("/app/add");
  await context.setOffline(true);
  await expect(page.getByText("You’re offline", { exact: true })).toBeVisible();
  await page.getByLabel("How much did you spend?").fill("300");
  await page.getByText("Food", { exact: true }).click();
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByText(
      "Saved on this device — pending demo sync when the connection returns.",
    ),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText(
      "Saved on this device — pending demo sync when the connection returns.",
    ),
  ).toHaveCount(0);
});

test("budget edits validate and update overspending warnings", async ({
  page,
}) => {
  await page.goto("/app/budgets");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const field = page.getByRole("dialog").getByRole("spinbutton");
  await field.fill("-1");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.getByText("Budget cannot be negative.")).toBeVisible();
  await field.fill("70000");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Over your monthly budget", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("₸70,000", { exact: true }).first(),
  ).toBeVisible();
});

test("mobile primary flow and history filters work with touch-sized layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("link", { name: "Add expense", exact: true })
    .first()
    .click();
  await page.getByLabel("How much did you spend?").fill("2450");
  await page.getByText("Study", { exact: true }).click();
  await page.getByText("Cash", { exact: true }).click();
  await page.getByLabel("Note (optional)").fill("Mobile printing");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Expense added" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/success-390.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page
    .getByLabel("Search transactions", { exact: true })
    .fill("Mobile printing");
  await expect(
    page.getByRole("button", { name: /Edit Mobile printing/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Filter transactions", exact: true })
    .click();
  await page.getByLabel("Payment", { exact: true }).selectOption("card");
  await expect(
    page.getByRole("button", { name: /Edit Mobile printing/ }),
  ).toHaveCount(0);
  await page.getByLabel("Payment", { exact: true }).selectOption("cash");
  await expect(
    page.getByRole("button", { name: /Edit Mobile printing/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Edit Mobile printing/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Edit Mobile printing/ }),
  ).toBeVisible();
});
