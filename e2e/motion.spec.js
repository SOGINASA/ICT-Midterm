const { test, expect } = require('@playwright/test');

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = { access_token: 'ui-session-fixture', user: { id: userId, email: 'ui@example.test' }, recovery: false };
const account = {
  version: 1,
  profile: { id: userId, displayName: 'UI Account', currency: 'KZT', monthlyBudget: 90000, onboardingCompleted: true },
  categories: ['Food', 'Transport', 'Study', 'Leisure', 'Other'].map(name => ({ id: name.toLowerCase(), name, icon: 'wallet', monthlyLimit: 10000, color: '#15776E' })),
  transactions: [],
};

test('home restores account actions without a guest-button flash and leaves demo for the real account', async ({ page }) => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/refresh', async route => {
    await ready;
    await route.fulfill({ json: session });
  });
  await page.route('**/api/snapshot', route => route.fulfill({ json: account }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.locator('a[href="/login"], a[href="/register"]').count()).toBe(0);
  release();
  await expect(page.getByRole('link', { name: 'В приложение', exact: true }).first()).toBeVisible();
  expect(await page.locator('a[href="/login"], a[href="/register"]').count()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.getByRole('navigation', { name: 'Mobile site navigation' });
  await expect(navigation.getByRole('link', { name: 'В приложение', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'В приложение', exact: true }).click();
  await expect(page.getByText(/Welcome back, UI Account/)).toBeVisible();
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'В приложение', exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'В приложение', exact: true }).first()).toBeVisible();
  await page.locator('.tf-hero-actions').getByRole('link', { name: 'В приложение', exact: true }).click();
  await expect(page.getByText(/Welcome back, UI Account/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('tengeflow.demo-session'))).toBeNull();
});

for (const width of [390, 1440]) {
  test(`dialog animates both ways, traps focus and restores scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo');
    const trigger = page.getByRole('button', { name: 'Open account menu' });
    await expect(trigger).toBeVisible();
    const entering = await trigger.evaluate(async button => {
      button.focus();
      button.click();
      const values = [];
      for (let frame = 0; frame < 20; frame += 1) {
        await new Promise(requestAnimationFrame);
        const dialog = document.querySelector('dialog[open]');
        if (dialog) values.push(Number(getComputedStyle(dialog).opacity));
      }
      return values;
    });
    expect(entering.some(value => value > 0 && value < 1)).toBe(true);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))).toBe(true);
    const exiting = await dialog.getByRole('button', { name: 'Close dialog' }).evaluate(async button => {
      button.click();
      const values = [];
      for (let frame = 0; frame < 18; frame += 1) {
        await new Promise(requestAnimationFrame);
        const dialog = document.querySelector('dialog[open]');
        if (dialog) values.push({ opacity: Number(getComputedStyle(dialog).opacity), phase: dialog.dataset.presence });
      }
      return values;
    });
    expect(exiting.some(value => value.phase === 'closing' && value.opacity > 0 && value.opacity < 1)).toBe(true);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
    await trigger.click();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('menu, FAQ and filters can reverse quickly without leaving hidden interactive content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await toggle.click();
  await expect(page.locator('.tf-mobile-menu')).toHaveAttribute('data-presence', 'open');
  await page.getByRole('button', { name: 'Close navigation' }).evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('.tf-mobile-menu')).toHaveAttribute('data-presence', 'open');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tf-mobile-menu')).toHaveCount(0);
  const faq = page.locator('.tf-questions details').first();
  const summary = faq.locator('summary');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await summary.evaluate(element => { element.click(); element.click(); });
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await summary.click();
  await expect(faq).not.toHaveAttribute('open');
  await page.goto('/demo');
  await page.goto('/app/transactions');
  await page.getByRole('button', { name: 'Filter transactions' }).click();
  await expect(page.getByLabel('From date')).toBeVisible();
  await page.getByRole('button', { name: 'Filter transactions' }).click();
  await expect(page.locator('#transaction-filters')).toHaveCount(0);
});

test('reduced-motion preference makes dialogs and disclosures immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Open account menu' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCSS('opacity', '1');
  expect(await dialog.evaluate(element => getComputedStyle(element).transitionDuration.split(',').every(duration => parseFloat(duration) < 0.001))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.goto('/');
  const faq = page.locator('.tf-questions details').first();
  await faq.locator('summary').click();
  expect(await faq.evaluate(element => element.getAnimations().length)).toBe(0);
  await faq.locator('summary').click();
  await expect(faq).not.toHaveAttribute('open');
});
