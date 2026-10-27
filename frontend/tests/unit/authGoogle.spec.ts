import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const signInWithOAuth = vi.fn();
vi.mock('@/services/supabase', () => ({ supabase: { auth: { signInWithOAuth: (a: unknown) => signInWithOAuth(a) } } }));

import { useAuthStore } from '@/stores/auth';
import { friendlyAuthError } from '@/services/errors';

beforeEach(() => {
  setActivePinia(createPinia());
  signInWithOAuth.mockReset();
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
