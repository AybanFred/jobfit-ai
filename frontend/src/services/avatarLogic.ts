// Pure helpers for the profile picture (no network, no browser APIs), so they are easy to test.

// ---------- Initials and the colour of the placeholder ----------

/** First letter or digit of a word ("(Ann" -> "A"). Works with accents and emoji-free scripts. */
function firstChar(word: string): string {
  const match = word.match(/[\p{L}\p{N}]/u);
  return match ? match[0] : '';
}

/** "Ada Lovelace" -> "AL", "Ada" -> "A", "" -> "". First and last word only. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter((w) => firstChar(w) !== '');
  if (!words.length) return '';
  const first = firstChar(words[0] as string);
  const last = words.length > 1 ? firstChar(words[words.length - 1] as string) : '';
  return (first + last).toUpperCase();
}

/** Small, stable string hash (djb2). Same text always gives the same number. */
export function hashString(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** How many gradient styles UserAvatar.vue has (tone-0 ... tone-5). */
export const AVATAR_TONE_COUNT = 6;

/** Picks one of the gradient styles from the name. Case and spacing do not matter; no name gives 0. */
export function toneIndex(name: string | null | undefined, count = AVATAR_TONE_COUNT): number {
  const key = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || count <= 0) return 0;
  return hashString(key) % count;
}

// ---------- Storage paths ----------

/** A NEW path for every upload, so a browser can never show an old cached photo. */
export function newAvatarPath(userId: string, now: number): string {
  return `${userId}/${now}.jpg`;
}

/** Only paths inside the user's own folder are ever signed or deleted. */
export function isOwnAvatarPath(userId: string, path: string | null | undefined): path is string {
  return !!userId && !!path && path.startsWith(`${userId}/`) && !path.includes('..');
}

// ---------- Signed URL cache ----------

/** Signed links last one hour. */
export const SIGNED_URL_SECONDS = 3600;
/** We ask for a new link this long before the old one stops working. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface UrlEntry {
  url: string | null;
  /** When the link stops working, in ms since 1970. */
  expiresAt: number;
}

export function urlExpiry(now: number, ttlSeconds = SIGNED_URL_SECONDS): number {
  return now + ttlSeconds * 1000;
}

/** True when there is no usable link, or it is (almost) expired. */
export function needsUrlRefresh(entry: UrlEntry | null, now: number, marginMs = REFRESH_MARGIN_MS): boolean {
  if (!entry || !entry.url) return true;
  return now >= entry.expiresAt - marginMs;
}

/** How long to wait before refreshing the link (never negative, never above the timer limit). */
export function msUntilRefresh(expiresAt: number, now: number, marginMs = REFRESH_MARGIN_MS): number {
  const wait = expiresAt - marginMs - now;
  return Math.min(Math.max(wait, 0), 2_000_000_000);
}

// ---------- Friendly errors ----------

export type AvatarErrorKind = 'not-set-up' | 'too-large' | 'permission' | 'offline' | 'other';

export const NOT_SET_UP_MESSAGE = 'Photo upload is not set up yet - run the database update.';

const MESSAGES: Record<AvatarErrorKind, string> = {
  'not-set-up': NOT_SET_UP_MESSAGE,
  'too-large': 'That photo is too large. Please choose a smaller one.',
  permission: 'You do not have permission to change this photo. Please log in again.',
  offline: 'We could not reach the server. Please check your internet connection and try again.',
  other: 'We could not save your photo. Please try again.',
};

function field(e: unknown, key: string): string {
  if (e && typeof e === 'object' && key in e) return String((e as Record<string, unknown>)[key] ?? '');
  return '';
}

/** Works out what went wrong from a Supabase (database or storage) error, without exposing raw text. */
export function classifyAvatarError(e: unknown): AvatarErrorKind {
  const msg = (typeof e === 'string' ? e : field(e, 'message')).toLowerCase();
  const code = field(e, 'code');
  const status = field(e, 'status') || field(e, 'statusCode');

  // The column or the bucket does not exist yet: the migration has not been run.
  if (code === '42703' || code === 'PGRST204') return 'not-set-up';
  if (msg.includes('avatar_path') && (msg.includes('column') || msg.includes('schema cache'))) return 'not-set-up';
  if (msg.includes('bucket not found')) return 'not-set-up';

  if (status === '413' || /exceed|too large|maximum allowed size|payload too large/.test(msg)) return 'too-large';
  if (/failed to fetch|network|load failed/.test(msg)) return 'offline';
  if (code === '42501' || status === '403' || status === '401' || /row-level security|unauthorized|forbidden|jwt/.test(msg)) {
    return 'permission';
  }
  return 'other';
}

export function friendlyAvatarError(e: unknown): string {
  return MESSAGES[classifyAvatarError(e)];
}
