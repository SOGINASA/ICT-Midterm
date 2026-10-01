const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

// Opt in explicitly: these tests create real local accounts, never cloud users.
test.describe('local account lifecycle', () => {
  test.skip(process.env.RUN_ACCOUNT_E2E !== '1', 'Run with RUN_ACCOUNT_E2E=1 after npm run backend:start.');
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  const api = 'http://127.0.0.1:8000/api';
  const mail = `${api}/dev/inbox`;
  const origin = 'http://localhost:3000';
  let accounts = [];

  test.beforeAll(async ({}, testInfo) => {
    expect(testInfo.project.use.baseURL).toBe(origin);
    const response = await fetch(`${api}/health`);
    expect(response.status).toBe(200);
    mkdirSync('artifacts', { recursive: true });
  });

  test.beforeEach(async ({ context }) => {
    accounts = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/') && ![origin, 'http://127.0.0.1:8000'].includes(url.origin)) {
        await route.abort('blockedbyclient');
        throw new Error('Blocked an account-test request to a non-local backend.');
      }
      await route.continue();
    });
  });

  test.afterEach(async ({ context }) => {
    await context.setOffline(false);
    if (accounts.length) {
      execFileSync('backend/.venv/bin/python', ['scripts/cleanup-e2e.py', ...accounts.map((account) => account.email)], { stdio: ['ignore', 'pipe', 'pipe'] });
    }
  });

  function userHeaders(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin }; }

  async function confirmationLink(email, recovery = false) {
    let message;
    await expect.poll(async () => {
      const response = await fetch(`${api}/dev/messages`);
      const inbox = await response.json();
      message = inbox.messages.find((item) => item.to === email && (recovery ? /reset/i.test(item.subject) : /confirm/i.test(item.subject)));
      return Boolean(message);
    }, { timeout: 15000, message: 'A confirmation email should arrive in the local inbox' }).toBe(true);
    const links = [...message.html.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1].replaceAll('&amp;', '&'));
    const link = links.find((candidate) => {
      const url = new URL(candidate);
      return url.origin === origin && url.pathname === (recovery ? '/reset-password' : '/auth/callback') && url.searchParams.has('code');
    });
    if (!link) throw new Error('The expected local verification link is missing.');
    return link;
  }

  async function signUp(page, name = 'Ayan Test') {
    const account = { email: `tengeflow-e2e-${randomUUID()}@example.test`, password: `Local-${randomUUID()}!`, name };
    accounts.push(account);
    await page.goto('/register');
    await page.getByLabel('Your name', { exact: true }).fill(name);
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password', { exact: true }).fill(account.password);
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/register');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    expect((await responsePromise).ok(), 'Local signup should succeed').toBe(true);
    await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open local inbox', exact: true })).toHaveAttribute('href', mail);
    await confirmationLink(account.email); // Wait for delivery before opening the actual inbox.
    const inboxPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open local inbox', exact: true }).click();
    const inbox = await inboxPromise;
    const verifiedPromise = inbox.waitForEvent('popup');
    await inbox.locator('article').filter({ hasText: account.email }).first()
      .frameLocator('iframe').getByRole('link', { name: 'Confirm email', exact: true }).click();
    const verified = await verifiedPromise;
    await expect(verified).toHaveURL(/\/onboarding$/);
    await verified.close();
    await inbox.close();
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel('What should we call you?')).toHaveValue(name);
    return account;
  }

  async function session(page) {
    // Use the application's cookie lock: the test must not race a page-load refresh.
    const result = await page.evaluate(() => navigator.locks.request('tengeflow.auth.refresh', async () => {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: response.status, value: await response.json() };
    }));
    expect(result.status).toBe(200);
    return { token: result.value.access_token, id: result.value.user.id };
  }

  async function snapshot(page) {
    const auth = await session(page);
    const response = await fetch(`${api}/snapshot`, { headers: userHeaders(auth.token) });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function profile(page) { return (await snapshot(page)).profile; }

  async function signOut(page) {
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '/login');
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
  }

  async function signIn(page, account, password = account.password) {
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }

  async function finishSetup(page, budget = '90000') {
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Your monthly budget').fill(budget);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Use suggested limits', exact: true }).click();
    await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  }

  async function addExpense(page, note) {
    await page.goto('/app/add');
    await page.getByLabel('How much did you spend?').fill('2300');
    await page.getByText('Food', { exact: true }).click();
    await page.getByLabel('Note (optional)').fill(note);
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  }

  test('email signup, resumable setup, offline retry, persisted expense and password recovery work against the backend', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const account = await signUp(page);
    expect((await profile(page)).onboardingCompleted).toBe(false);
    await page.goto('/app/add');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel('What should we call you?').fill('Ayan Personal');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Your monthly budget').fill('95000');
    await page.reload();
    await expect(page.getByLabel('Your monthly budget')).toHaveValue('95000');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel('What should we call you?')).toHaveValue('Ayan Personal');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Food monthly limit', { exact: true }).fill('95001');
    await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('more than your monthly budget');
    expect((await profile(page)).onboardingCompleted).toBe(false);
    await page.getByRole('button', { name: 'Use suggested limits', exact: true }).click();
    await expect(page.getByLabel('Food monthly limit', { exact: true })).toHaveValue('38000');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/connection|online|internet/i);
    await expect(page).toHaveURL(/\/onboarding$/);
    await context.setOffline(false);
    expect((await profile(page)).onboardingCompleted).toBe(false);
    await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByText('0 transactions', { exact: true })).toBeVisible();
    await expect(page.getByText('₸95,000', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Welcome back, Ayan Personal/)).toBeVisible();
    expect(await profile(page)).toMatchObject({ displayName: 'Ayan Personal', monthlyBudget: 95000, onboardingCompleted: true });
    const note = `Private coffee ${randomUUID().slice(0, 8)}`;
    await addExpense(page, note);
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(note) })).toBeVisible();
    await signOut(page);
    await signIn(page, account);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(note) })).toBeVisible();
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app$/);
    await signOut(page);

    await page.goto('/forgot-password');
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
    await page.goto(await confirmationLink(account.email, true));
    await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
    const newPassword = `Updated-${randomUUID()}!`;
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your password is updated.' })).toBeVisible();
    await page.getByRole('link', { name: 'Open my workspace', exact: true }).click();
    await expect(page.getByRole('link', { name: new RegExp(note) })).toBeVisible();
    await signOut(page);
    await signIn(page, account);
    await expect(page.getByRole('alert')).toContainText(/email or password is incorrect/i);
    await signIn(page, account, newPassword);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).some((key) => /auth|token|session/i.test(key)))).toBe(false);
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.httpOnly && cookie.path === '/api/auth')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('two real accounts have separate setup, expenses and database access', async ({ page }) => {
    const first = await signUp(page, 'First Account');
    await finishSetup(page, '80000');
    const note = `First account only ${randomUUID().slice(0, 8)}`;
    await addExpense(page, note);
    const firstSession = await session(page);
    const firstRows = (await snapshot(page)).transactions;
    expect(firstRows).toHaveLength(1);
    await signOut(page);
    await signUp(page, 'Second Account');
    await finishSetup(page, '45000');
    await expect(page.getByText('0 transactions', { exact: true })).toBeVisible();
    await expect(page.getByText('₸45,000', { exact: true }).first()).toBeVisible();
    await page.goto('/app/transactions');
    await expect(page.getByText(note, { exact: true })).toHaveCount(0);
    const secondSession = await session(page);
    const privateRead = await fetch(`${api}/snapshot?user_id=${firstSession.id}`, { headers: userHeaders(secondSession.token) });
    expect(privateRead.status).toBe(200);
    expect((await privateRead.json()).transactions).toEqual([]);
    const privateWrite = await fetch(`${api}/transactions/${firstRows[0].id}`, {
      method: 'PATCH', headers: userHeaders(secondSession.token),
      body: JSON.stringify({ amount: 1, categoryId: 'food', paymentMethod: 'card', note: 'Should never change', occurredAt: '2026-10-01' }),
    });
    expect(privateWrite.status).toBe(404);
    const privateDelete = await fetch(`${api}/transactions/${firstRows[0].id}`, { method: 'DELETE', headers: userHeaders(secondSession.token) });
    expect(privateDelete.status).toBe(404);
    await signOut(page);
    await signIn(page, first);
    await expect(page.getByRole('link', { name: new RegExp(note) })).toBeVisible();
    await expect(page.getByText('₸80,000', { exact: true }).first()).toBeVisible();
  });

  test('signing out offline stays signed out after reconnection and reload', async ({ page, context }) => {
    const account = await signUp(page, 'Offline Logout');
    await finishSetup(page);
    const previous = await session(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/signed out on this device/)).toBeVisible();
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Good to have you back.' })).toBeVisible();
    await expect.poll(async () => (await fetch(`${api}/snapshot`, { headers: userHeaders(previous.token) })).status).toBe(401);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, account);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  });

  test('all three setup steps fit small phones, tablet and desktop with accessible touch fields', async ({ page }) => {
    await signUp(page, 'Dana Test');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
      for (let step = 1; step <= 3; step += 1) {
        await expect(page.getByText(`Step ${step} of 3`, { exact: true })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(overflow, `Setup step ${step} overflows at ${width}px`).toBe(false);
        for (const field of await page.locator('input').all()) {
          const box = await field.boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          if (width < 768) expect(await field.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
        }
        if (width === 390 || width === 1440) await page.screenshot({ path: `artifacts/onboarding-step-${step}-${width}.png`, fullPage: true, animations: 'disabled' });
        if (step < 3) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Back to About you', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login$/);
  });
});
