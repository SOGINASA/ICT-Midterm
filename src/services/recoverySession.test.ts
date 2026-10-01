import { clearRecoverySession, hasRecoverySession, rememberRecoverySession } from './recoverySession';

beforeEach(() => {
  clearRecoverySession();
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('binds recovery access to the account that verified the email link', () => {
  rememberRecoverySession('account-a');

  expect(hasRecoverySession('account-a')).toBe(true);
  expect(hasRecoverySession('account-b')).toBe(false);

  rememberRecoverySession('account-b');

  expect(hasRecoverySession('account-a')).toBe(false);
  expect(hasRecoverySession('account-b')).toBe(true);
});

it('expires recovery access at the fifteen-minute boundary', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  rememberRecoverySession('account-a');

  clock.mockReturnValue(now + 15 * 60 * 1000 - 1);
  expect(hasRecoverySession('account-a')).toBe(true);

  clock.mockReturnValue(now + 15 * 60 * 1000);
  expect(hasRecoverySession('account-a')).toBe(false);
});

it('removes recovery access on completion or sign-out', () => {
  rememberRecoverySession('account-a');
  clearRecoverySession();

  expect(hasRecoverySession('account-a')).toBe(false);
  expect(sessionStorage.length).toBe(0);
});

it.each(['not json', 'null', '{}', '"account-a"', '{"userId":"account-a","expiresAt":"forever"}'])(
  'does not restore access from a malformed marker: %s',
  raw => {
    rememberRecoverySession('account-a');
    const markerKey = sessionStorage.key(0)!;
    clearRecoverySession();
    sessionStorage.setItem(markerKey, raw);

    expect(hasRecoverySession('account-a')).toBe(false);
  },
);

it('fails closed when browser storage cannot be read', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });

  expect(hasRecoverySession('account-a')).toBe(false);
});
