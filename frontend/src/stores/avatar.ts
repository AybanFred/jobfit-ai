import { defineStore } from 'pinia';
import { currentUserId } from '@/services/profile';
import {
  fetchAvatarPath, signAvatarUrl, uploadAvatarObject, saveAvatarPath, removeAvatarObject,
} from '@/services/avatar';
import {
  classifyAvatarError, friendlyAvatarError, isOwnAvatarPath, msUntilRefresh, needsUrlRefresh, urlExpiry,
} from '@/services/avatarLogic';

// The profile picture: which file it is, and a short-lived signed link kept in memory only.
// The app works fine with no photo, and also when the database update has not been run yet.

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let lastErrorRefresh = 0;

export const useAvatarStore = defineStore('avatar', {
  state: () => ({
    userId: '',
    path: null as string | null,
    url: null as string | null,
    expiresAt: 0,
    loaded: false,
    loading: false,
    busy: false, // uploading or removing
    /** 'missing' = the database update (migration) has not been run yet. */
    setup: 'unknown' as 'unknown' | 'ready' | 'missing',
  }),

  getters: {
    hasPhoto: (s) => !!s.path,
  },

  actions: {
    /** Loads the photo once per login. Safe to call from several screens. Never throws. */
    async ensureLoaded() {
      let uid = '';
      try {
        uid = await currentUserId();
      } catch {
        return; // not signed in
      }
      if (this.userId && this.userId !== uid) this.reset(); // another account on the same device
      this.userId = uid;
      if (this.loading) return;
      if (this.loaded) {
        await this.ensureFresh();
        return;
      }

      this.loading = true;
      try {
        this.path = await fetchAvatarPath(uid);
        if (this.setup === 'unknown') this.setup = 'ready';
        await this.refreshUrl();
      } catch (e) {
        this.path = null;
        this.url = null;
        if (classifyAvatarError(e) === 'not-set-up') this.setup = 'missing';
      } finally {
        this.loaded = true;
        this.loading = false;
      }
    },

    /** Looks again whether photo upload is set up (for example right after the developer ran the migration). */
    async recheck() {
      this.loaded = false;
      this.setup = 'unknown';
      await this.ensureLoaded();
    },

    /** Gets a new signed link for the current photo. On failure the initials stay on screen. */
    async refreshUrl() {
      clearTimeout(refreshTimer);
      const path = this.path;
      if (!path || !isOwnAvatarPath(this.userId, path)) {
        this.url = null;
        return;
      }
      try {
        const url = await signAvatarUrl(path);
        if (this.path !== path) return; // the photo changed while we were waiting
        this.url = url;
        this.expiresAt = urlExpiry(Date.now());
        this.scheduleRefresh();
      } catch (e) {
        this.url = null;
        if (classifyAvatarError(e) === 'not-set-up') this.setup = 'missing';
      }
    },

    scheduleRefresh() {
      clearTimeout(refreshTimer);
      if (!this.url) return;
      refreshTimer = setTimeout(() => void this.refreshUrl(), msUntilRefresh(this.expiresAt, Date.now()));
    },

    /** Called when a screen opens or the app comes back to the front: renews the link if it is nearly expired. */
    async ensureFresh() {
      if (!this.path || this.busy) return;
      if (needsUrlRefresh({ url: this.url, expiresAt: this.expiresAt }, Date.now())) await this.refreshUrl();
    },

    /** The <img> could not load (maybe the link expired). Try once in a while for a fresh link. */
    async onImageError() {
      if (!this.path || Date.now() - lastErrorRefresh < 30_000) return;
      lastErrorRefresh = Date.now();
      await this.refreshUrl();
    },

    /**
     * Uploads a new photo, points the profile at it, then deletes the old file.
     * Returns '' on success or a friendly message. Never throws.
     */
    async upload(blob: Blob): Promise<string> {
      if (this.busy) return '';
      this.busy = true;
      let newPath: string | null = null;
      try {
        const uid = await currentUserId();
        this.userId = uid;
        const previous = this.path;
        newPath = await uploadAvatarObject(uid, blob);
        await saveAvatarPath(uid, newPath);

        this.path = newPath;
        this.loaded = true;
        this.setup = 'ready';
        await this.refreshUrl();
        if (isOwnAvatarPath(uid, previous) && previous !== newPath) void removeAvatarObject(previous);
        return '';
      } catch (e) {
        if (newPath) void removeAvatarObject(newPath); // do not leave an unused file behind
        if (classifyAvatarError(e) === 'not-set-up') this.setup = 'missing';
        return friendlyAvatarError(e);
      } finally {
        this.busy = false;
      }
    },

    /** Clears the profile photo and deletes the file. Returns '' on success or a friendly message. */
    async remove(): Promise<string> {
      if (this.busy || !this.path) return '';
      this.busy = true;
      try {
        const uid = await currentUserId();
        const old = this.path;
        await saveAvatarPath(uid, null);
        this.path = null;
        this.url = null;
        clearTimeout(refreshTimer);
        if (isOwnAvatarPath(uid, old)) void removeAvatarObject(old);
        return '';
      } catch (e) {
        return friendlyAvatarError(e);
      } finally {
        this.busy = false;
      }
    },

    /** Forget everything (log out), so the next person never sees this photo. */
    reset() {
      clearTimeout(refreshTimer);
      this.$reset();
    },
  },
});
