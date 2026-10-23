import { defineStore } from 'pinia';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null as Session | null,
    user: null as User | null,
    ready: false,
  }),

  getters: {
    isLoggedIn: (s) => !!s.session,
  },

  actions: {
    async init() {
      if (this.ready) return;
      const { data } = await supabase.auth.getSession();
      this.session = data.session;
      this.user = data.session?.user ?? null;

      supabase.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        this.user = session?.user ?? null;
      });
      this.ready = true;
    },

    async signUp(email: string, password: string, fullName: string) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
    },

    async signIn(email: string, password: string) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async signOut() {
      await supabase.auth.signOut();
    },
  },
});
