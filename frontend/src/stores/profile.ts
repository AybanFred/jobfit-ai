import { defineStore } from 'pinia';
import {
  fetchProfile, fetchSectionCounts, computeCompleteness,
  type ProfileRow, type SectionCounts,
} from '@/services/dashboard';
import { savePersonalInfo, type PersonalInfoInput } from '@/services/profile';

/**
 * The single source of truth for the profile and the section counts.
 * Home (completeness ring) and the Profile screens both read from here,
 * so after any change they always agree.
 */
export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: null as ProfileRow | null,
    counts: null as SectionCounts | null,
    loading: false,
    loaded: false,
    profileError: '',
    countsError: '',
  }),

  getters: {
    completeness: (s) => computeCompleteness(s.profile, s.counts),
  },

  actions: {
    /** Loads the profile row and the section counts. Safe to call from several screens. */
    async loadOverview() {
      this.loading = true;
      this.profileError = '';
      this.countsError = '';
      try {
        this.profile = await fetchProfile();
      } catch {
        this.profileError = 'We could not load your profile. Please try again.';
      }
      try {
        this.counts = await fetchSectionCounts();
      } catch {
        this.countsError = 'We could not work out your progress. Please try again.';
      }
      this.loaded = true;
      this.loading = false;
    },

    /** Call after adding or deleting a row in any section, so the counts and the Home ring update. */
    async refreshCounts() {
      try {
        this.counts = await fetchSectionCounts();
        this.countsError = '';
      } catch {
        // keep the old numbers; the next full load will fix them
      }
    },

    /** Saves personal info and updates the local copy. Throws on failure so the form can show a message. */
    async savePersonal(input: PersonalInfoInput) {
      await savePersonalInfo(input);
      this.profile = { ...(this.profile ?? { email: null }), ...input } as ProfileRow;
    },

    /** Forget everything (used on log out so the next person never sees old data). */
    reset() {
      this.$reset();
    },
  },
});
