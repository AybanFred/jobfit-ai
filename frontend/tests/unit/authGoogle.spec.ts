import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const signInWithOAuth = vi.fn();
const signUp = vi.fn();
vi.mock('@/services/supabase', () => ({
  supabase: { auth: { signInWithOAuth: (a: unknown) => signInWithOAuth(a), signUp: (a: unknown) => signUp(a) } },
}));

import { useAuthStore } from '@/stores/auth';
import { friendlyAuthError } from '@/services/errors';

beforeEach(() => {
  setActivePinia(createPinia());
  signInWithOAuth.mockReset();
  signUp.mockReset();
});

describe('auth store: Google login', () => {
  it('asks Supabase for Google, shows the account picker and comes back to the home tab of this site', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    await useAuthStore().signInWithGoogle();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/tabs/home`,
        queryParams: { prompt: 'select_account' },
      },
    });
  });

  it('throws the Supabase error so the login page can show a friendly message', async () => {
    signInWithOAuth.mockResolvedValue({ error: new Error('Unsupported provider: provider is not enabled') });
    await expect(useAuthStore().signInWithGoogle()).rejects.toThrow('provider is not enabled');
  });
});

describe('friendlyAuthError: Google', () => {
  it('explains when Google login is switched off in Supabase', () => {
    expect(friendlyAuthError(new Error('Unsupported provider: provider is not enabled'))).toBe(
      'Google login is not available right now. Please use your email and password.',
    );
  });
});

describe('auth store: email sign up', () => {
  it('says the user is logged in when Supabase returns a session (confirmation off)', async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    await expect(useAuthStore().signUp('a@b.co', 'secret1', 'Alex')).resolves.toBe(true);
  });

  it('says the user must confirm the email when there is no session yet', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(useAuthStore().signUp('a@b.co', 'secret1', 'Alex')).resolves.toBe(false);
  });

  it('throws the Supabase error', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: new Error('User already registered') });
    await expect(useAuthStore().signUp('a@b.co', 'secret1', '')).rejects.toThrow('already registered');
  });
});
