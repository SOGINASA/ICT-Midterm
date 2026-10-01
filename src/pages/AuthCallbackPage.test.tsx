import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthSession, clearApiSession } from '../services/apiClient';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallbackPage from './AuthCallbackPage';
import { authService } from '../services/authService';
import { clearRecoverySession, hasRecoverySession } from '../services/recoverySession';
import { useAuthStore } from '../store/useAuthStore';

function sessionFor(id: string, recovery = false): AuthSession {
  return { access_token: `access-${id}`, user: { id, email: `${id}@example.com` }, recovery };
}

const previousAccount = sessionFor('c58f5f21-920f-43a1-8f1b-9e28937cf001');
const verifiedAccount = sessionFor('c58f5f21-920f-43a1-8f1b-9e28937cf002');

function renderCallback(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<AuthCallbackPage recovery />} />
        <Route path="/app" element={<h1>Account workspace</h1>} />
        <Route path="/login" element={<h1>Sign in page</h1>} />
        <Route path="/forgot-password" element={<h1>Request a reset link</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

let exchangeCode: jest.SpyInstance<Promise<AuthSession>, [string, "signup" | "recovery"]>;
let updatePassword: jest.SpyInstance<Promise<AuthSession>, [string, string]>;

beforeEach(() => {
  clearApiSession();
  clearRecoverySession();
  sessionStorage.clear();
  useAuthStore.setState({ session: null, ready: true, demo: false, recovery: false, error: null });
  exchangeCode = jest.spyOn(authService, 'exchangeCode');
  updatePassword = jest.spyOn(authService, 'updatePassword').mockResolvedValue(verifiedAccount);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('never exposes reset fields for a failed link even when another account had recovery access', async () => {
  useAuthStore.getState().beginRecovery({ ...previousAccount, recovery: true });
  let rejectExchange!: (error: Error) => void;
  exchangeCode.mockReturnValue(new Promise<AuthSession>((_, reject) => { rejectExchange = reject; }));

  renderCallback('/reset-password?code=invalid-code');

  expect(screen.getByRole('heading', { name: 'Checking your email link…' })).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(useAuthStore.getState().recovery).toBe(false);
  expect(hasRecoverySession(previousAccount.user.id)).toBe(false);

  await act(async () => { rejectExchange(new Error('Invalid or expired code')); });

  expect(await screen.findByRole('heading', { name: 'This link couldn’t be verified.' })).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Account workspace' })).not.toBeInTheDocument();
  expect(useAuthStore.getState().session?.user.id).toBe(previousAccount.user.id);
  expect(updatePassword).not.toHaveBeenCalled();
});

it('switches a confirmed user out of demo only after the callback exchange succeeds', async () => {
  useAuthStore.getState().enterDemo();
  let resolveExchange!: (session: AuthSession) => void;
  exchangeCode.mockReturnValue(new Promise<AuthSession>(resolve => { resolveExchange = resolve; }));

  renderCallback('/auth/callback?code=confirmation-code');

  expect(useAuthStore.getState().demo).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Account workspace' })).not.toBeInTheDocument();
  await act(async () => { resolveExchange(verifiedAccount); });

  expect(await screen.findByRole('heading', { name: 'Account workspace' })).toBeInTheDocument();
  expect(exchangeCode).toHaveBeenCalledWith('confirmation-code', 'signup');
  expect(useAuthStore.getState().session?.user.id).toBe(verifiedAccount.user.id);
  expect(useAuthStore.getState().demo).toBe(false);
  expect(useAuthStore.getState().recovery).toBe(false);
});

it('allows password reset for the verified callback account and clears recovery after saving', async () => {
  useAuthStore.getState().acceptSession(previousAccount);
  exchangeCode.mockResolvedValue({ ...verifiedAccount, recovery: true });

  renderCallback('/reset-password?code=recovery-code');

  const password = await screen.findByLabelText('New password');
  expect(useAuthStore.getState().session?.user.id).toBe(verifiedAccount.user.id);
  expect(hasRecoverySession(verifiedAccount.user.id)).toBe(true);
  expect(hasRecoverySession(previousAccount.user.id)).toBe(false);
  expect(screen.getByRole('button', { name: 'Save new password' })).toBeEnabled();

  fireEvent.change(password, { target: { value: 'A new secure password' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'A new secure password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

  expect(await screen.findByRole('heading', { name: 'Your password is updated.' })).toBeInTheDocument();
  expect(updatePassword).toHaveBeenCalledWith('A new secure password', verifiedAccount.user.id);
  expect(useAuthStore.getState().recovery).toBe(false);
  expect(hasRecoverySession(verifiedAccount.user.id)).toBe(false);
});

it('rejects a reset route without a code for an existing unverified account', () => {
  useAuthStore.getState().acceptSession(previousAccount);

  renderCallback('/reset-password');

  expect(screen.getByRole('heading', { name: 'This link is no longer active.' })).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(updatePassword).not.toHaveBeenCalled();
});

it('does not reuse an existing session when a confirmation callback has no code', () => {
  useAuthStore.getState().acceptSession(previousAccount);

  renderCallback('/auth/callback');

  expect(screen.getByRole('heading', { name: 'This link couldn’t be verified.' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Account workspace' })).not.toBeInTheDocument();
  expect(exchangeCode).not.toHaveBeenCalled();
});

it('keeps an expired provider link on its error screen even when an account is signed in', () => {
  useAuthStore.getState().acceptSession(previousAccount);

  renderCallback('/reset-password#error_description=Email+link+has+expired');

  expect(screen.getByRole('heading', { name: 'This link couldn’t be verified.' })).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(exchangeCode).not.toHaveBeenCalled();
});

it('does not accept a callback response after the user has left the page', async () => {
  useAuthStore.getState().enterDemo();
  let resolveExchange!: (session: AuthSession) => void;
  exchangeCode.mockReturnValue(new Promise<AuthSession>(resolve => { resolveExchange = resolve; }));
  const view = renderCallback('/auth/callback?code=late-code');
  await waitFor(() => expect(exchangeCode).toHaveBeenCalledWith('late-code', 'signup'));

  view.unmount();
  await act(async () => { resolveExchange(verifiedAccount); });

  expect(useAuthStore.getState().session).toBeNull();
  expect(useAuthStore.getState().demo).toBe(true);
});
