import { describe, it, expect } from 'vitest';
import {
  AVATAR_TONE_COUNT, REFRESH_MARGIN_MS, classifyAvatarError, friendlyAvatarError, hashString, initialsOf,
  isOwnAvatarPath, msUntilRefresh, needsUrlRefresh, newAvatarPath, toneIndex, urlExpiry, NOT_SET_UP_MESSAGE,
} from '@/services/avatarLogic';

describe('initialsOf', () => {
  it('uses the first and last word', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('  mary jane watson ')).toBe('MW');
  });
  it('handles one word, no name and odd characters', () => {
    expect(initialsOf('Ada')).toBe('A');
    expect(initialsOf('')).toBe('');
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf('   ')).toBe('');
    expect(initialsOf('(Ann) - Lee')).toBe('AL');
    expect(initialsOf('- ~')).toBe('');
  });
  it('works with accents and other alphabets', () => {
    expect(initialsOf('élodie Dupont')).toBe('ÉD');
    expect(initialsOf('Иван Петров')).toBe('ИП');
  });
});

describe('toneIndex (gradient seed)', () => {
  it('is deterministic and ignores case and extra spaces', () => {
    expect(toneIndex('Ada Lovelace')).toBe(toneIndex('Ada Lovelace'));
    expect(toneIndex('Ada Lovelace')).toBe(toneIndex('  ada   LOVELACE '));
  });
  it('always stays inside the available gradients', () => {
    for (const name of ['a', 'Bob', 'Zoë Ünal', 'x'.repeat(200), '1234', '日本語']) {
      const i = toneIndex(name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(AVATAR_TONE_COUNT);
    }
  });
  it('gives 0 for no name and spreads different names around', () => {
    expect(toneIndex('')).toBe(0);
    expect(toneIndex(null)).toBe(0);
    const names = ['Ada', 'Bob', 'Carla', 'Dmitri', 'Eve', 'Farid', 'Grace', 'Hugo', 'Ines', 'Jun'];
    expect(new Set(names.map((n) => toneIndex(n))).size).toBeGreaterThan(2);
  });
  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('storage paths', () => {
  it('builds a new unique path inside the user folder', () => {
    expect(newAvatarPath('u1', 1700000000000)).toBe('u1/1700000000000.jpg');
    expect(newAvatarPath('u1', 1)).not.toBe(newAvatarPath('u1', 2));
  });
  it('only accepts paths inside the own folder', () => {
    expect(isOwnAvatarPath('u1', 'u1/1.jpg')).toBe(true);
    expect(isOwnAvatarPath('u1', 'u2/1.jpg')).toBe(false);
    expect(isOwnAvatarPath('u1', 'u1/../u2/1.jpg')).toBe(false);
    expect(isOwnAvatarPath('u1', null)).toBe(false);
    expect(isOwnAvatarPath('', 'u1/1.jpg')).toBe(false);
  });
});

describe('signed link cache', () => {
  const now = 1_000_000;
  const expiresAt = urlExpiry(now); // one hour

  it('one hour of life by default', () => {
    expect(expiresAt - now).toBe(3600 * 1000);
  });
  it('needs a link when there is none', () => {
    expect(needsUrlRefresh(null, now)).toBe(true);
    expect(needsUrlRefresh({ url: null, expiresAt }, now)).toBe(true);
  });
  it('keeps a fresh link, renews it shortly before it expires', () => {
    const entry = { url: 'https://x/y', expiresAt };
    expect(needsUrlRefresh(entry, now)).toBe(false);
    expect(needsUrlRefresh(entry, expiresAt - REFRESH_MARGIN_MS - 1)).toBe(false);
    expect(needsUrlRefresh(entry, expiresAt - REFRESH_MARGIN_MS)).toBe(true);
    expect(needsUrlRefresh(entry, expiresAt + 5)).toBe(true);
  });
  it('works out how long to wait before refreshing', () => {
    expect(msUntilRefresh(expiresAt, now)).toBe(3600 * 1000 - REFRESH_MARGIN_MS);
    expect(msUntilRefresh(expiresAt, expiresAt)).toBe(0); // already late: refresh right away
    expect(msUntilRefresh(now + 1e15, now)).toBeLessThanOrEqual(2_000_000_000); // timers cannot be longer
  });
});

describe('friendly avatar errors', () => {
  it('detects that the database update has not been run', () => {
    expect(classifyAvatarError({ code: '42703', message: 'column profiles.avatar_path does not exist' })).toBe('not-set-up');
    expect(classifyAvatarError({ code: 'PGRST204', message: "Could not find the 'avatar_path' column" })).toBe('not-set-up');
    expect(classifyAvatarError({ message: 'Bucket not found', status: 404 })).toBe('not-set-up');
    expect(friendlyAvatarError({ message: 'Bucket not found' })).toBe(NOT_SET_UP_MESSAGE);
  });
  it('recognises the other common problems', () => {
    expect(classifyAvatarError({ message: 'The object exceeded the maximum allowed size', status: 413 })).toBe('too-large');
    expect(classifyAvatarError(new TypeError('Failed to fetch'))).toBe('offline');
    expect(classifyAvatarError({ message: 'new row violates row-level security policy', statusCode: '403' })).toBe('permission');
    expect(classifyAvatarError({ code: '42501', message: 'x' })).toBe('permission');
    expect(classifyAvatarError({ message: 'boom' })).toBe('other');
    expect(classifyAvatarError(null)).toBe('other');
  });
  it('never leaks raw error text', () => {
    expect(friendlyAvatarError({ message: 'SELECT * FROM secrets exploded' })).not.toMatch(/secrets|SELECT/);
  });
});
