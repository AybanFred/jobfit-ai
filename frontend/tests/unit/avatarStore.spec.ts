import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// The store talks to Supabase only through these two modules, so we replace them.
vi.mock('@/services/profile', () => ({ currentUserId: vi.fn() }));
vi.mock('@/services/avatar', () => ({
  fetchAvatarPath: vi.fn(),
  signAvatarUrl: vi.fn(),
  uploadAvatarObject: vi.fn(),
  saveAvatarPath: vi.fn(),
  removeAvatarObject: vi.fn(),
}));

import * as api from '@/services/avatar';
import { currentUserId } from '@/services/profile';
import { useAvatarStore } from '@/stores/avatar';
import { NOT_SET_UP_MESSAGE } from '@/services/avatarLogic';

const m = vi.mocked(api);
const blob = new Blob(['x'], { type: 'image/jpeg' });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(currentUserId).mockResolvedValue('u1');
  m.signAvatarUrl.mockResolvedValue('https://signed/url');
});

describe('avatar store: loading', () => {
  it('has no photo and keeps working when nobody uploaded one', async () => {
    m.fetchAvatarPath.mockResolvedValue(null);
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(store.loaded).toBe(true);
    expect(store.hasPhoto).toBe(false);
    expect(store.url).toBeNull();
    expect(m.signAvatarUrl).not.toHaveBeenCalled();
  });

  it('signs the saved path and caches the link', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/1.jpg');
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(m.signAvatarUrl).toHaveBeenCalledWith('u1/1.jpg');
    expect(store.url).toBe('https://signed/url');
    expect(store.expiresAt).toBeGreaterThan(Date.now());
    await store.ensureLoaded(); // second call must not fetch again
    expect(m.fetchAvatarPath).toHaveBeenCalledTimes(1);
  });

  it('survives a missing database column without crashing', async () => {
    m.fetchAvatarPath.mockRejectedValue({ code: '42703', message: 'column profiles.avatar_path does not exist' });
    const store = useAvatarStore();
    await expect(store.ensureLoaded()).resolves.toBeUndefined();
    expect(store.setup).toBe('missing');
    expect(store.hasPhoto).toBe(false);
  });

  it('ignores a path that is not in the own folder', async () => {
    m.fetchAvatarPath.mockResolvedValue('someone-else/1.jpg');
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(m.signAvatarUrl).not.toHaveBeenCalled();
    expect(store.url).toBeNull();
  });
});

describe('avatar store: upload', () => {
  it('uploads, saves the path, then deletes the previous file', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/old.jpg');
    m.uploadAvatarObject.mockResolvedValue('u1/new.jpg');
    const store = useAvatarStore();
    await store.ensureLoaded();

    const message = await store.upload(blob);
    expect(message).toBe('');
    expect(m.saveAvatarPath).toHaveBeenCalledWith('u1', 'u1/new.jpg');
    expect(store.path).toBe('u1/new.jpg');
    expect(m.removeAvatarObject).toHaveBeenCalledWith('u1/old.jpg');
    expect(m.removeAvatarObject).not.toHaveBeenCalledWith('u1/new.jpg');
  });

  it('removes the new file again if saving the path fails, and keeps the old photo', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/old.jpg');
    m.uploadAvatarObject.mockResolvedValue('u1/new.jpg');
    m.saveAvatarPath.mockRejectedValue({ code: '42703', message: 'column avatar_path does not exist' });
    const store = useAvatarStore();
    await store.ensureLoaded();

    const message = await store.upload(blob);
    expect(message).toBe(NOT_SET_UP_MESSAGE);
    expect(m.removeAvatarObject).toHaveBeenCalledWith('u1/new.jpg');
    expect(m.removeAvatarObject).not.toHaveBeenCalledWith('u1/old.jpg');
    expect(store.path).toBe('u1/old.jpg');
    expect(store.busy).toBe(false);
  });

  it('gives a friendly message when the bucket does not exist', async () => {
    m.fetchAvatarPath.mockResolvedValue(null);
    m.uploadAvatarObject.mockRejectedValue({ message: 'Bucket not found', status: 404 });
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(await store.upload(blob)).toBe(NOT_SET_UP_MESSAGE);
    expect(store.setup).toBe('missing');
    expect(m.saveAvatarPath).not.toHaveBeenCalled();
  });
});

describe('avatar store: remove and reset', () => {
  it('clears the path and deletes the file', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/a.jpg');
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(await store.remove()).toBe('');
    expect(m.saveAvatarPath).toHaveBeenCalledWith('u1', null);
    expect(m.removeAvatarObject).toHaveBeenCalledWith('u1/a.jpg');
    expect(store.hasPhoto).toBe(false);
    expect(store.url).toBeNull();
  });

  it('keeps the photo when clearing fails', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/a.jpg');
    m.saveAvatarPath.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = useAvatarStore();
    await store.ensureLoaded();
    expect(await store.remove()).toMatch(/internet connection/);
    expect(store.path).toBe('u1/a.jpg');
    expect(m.removeAvatarObject).not.toHaveBeenCalled();
  });

  it('forgets everything on logout', async () => {
    m.fetchAvatarPath.mockResolvedValue('u1/a.jpg');
    const store = useAvatarStore();
    await store.ensureLoaded();
    store.reset();
    expect(store.path).toBeNull();
    expect(store.url).toBeNull();
    expect(store.loaded).toBe(false);
  });
});
