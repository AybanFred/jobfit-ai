// Turns technical errors into short, friendly sentences. Never show raw error text to users.

const OFFLINE = 'We could not reach the server. Please check your internet connection and try again.';

function messageOf(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return '';
}

/** Errors from Supabase sign in / sign up. */
export function friendlyAuthError(e: unknown): string {
  const msg = messageOf(e).toLowerCase();
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('invalid login credentials')) return 'That email or password does not look right.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (msg.includes('password') && (msg.includes('least') || msg.includes('weak'))) {
    return 'Please choose a stronger password (at least 6 characters).';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider')) {
    return 'Google login is not available right now. Please use your email and password.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) return OFFLINE;
  return 'Something went wrong. Please try again.';
}

/** Errors from reading or saving profile data in Supabase. */
export function friendlyDataError(e: unknown): string {
  const msg = messageOf(e).toLowerCase();
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) return OFFLINE;
  if (msg.includes('jwt') || msg.includes('not signed in')) return 'Your session has ended. Please log in again.';
  if (code === '23505') return 'That item is already in your profile.';
  if (code === '42501') return 'You do not have permission to do that.';
  return 'Something went wrong while saving. Please try again.';
}

/** Errors from our FastAPI backend (thrown by api() as "API 401: ..."). */
export function friendlyApiError(e: unknown): string {
  const msg = messageOf(e);
  if (/^API 40[13]/.test(msg)) return 'The backend did not accept your login. Try logging out and in again.';
  if (/^API 5\d\d/.test(msg)) return 'The backend had a problem. Please try again in a moment.';
  if (/^API \d+/.test(msg)) return 'The backend could not answer this request.';
  return 'The backend is not reachable. Make sure it is running, then retry.';
}
