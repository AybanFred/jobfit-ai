import { defineStore } from 'pinia';
import { syncIonicRgb } from '@/theme/ionicBridge';

export const THEMES = [
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro',
  'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua', 'lofi', 'pastel',
  'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 'cmyk', 'autumn', 'business',
  'acid', 'lemonade', 'night', 'coffee', 'winter', 'dim', 'nord', 'sunset',
  'caramellatte', 'abyss', 'silk',
] as const;

export type ThemeName = (typeof THEMES)[number];

const STORAGE_KEY = 'jobfit-theme';

function isTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function readSaved(): ThemeName | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : null;
  } catch {
    return null; // storage can be blocked (private mode); the app still works
  }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: 'light' as ThemeName,
  }),

  actions: {
    /** Call once at startup: use the saved theme, or follow the phone's light/dark setting. */
    init() {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      this.apply(readSaved() ?? (prefersDark ? 'dark' : 'light'));
    },

    apply(theme: ThemeName) {
      this.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      syncIonicRgb();
    },

    set(theme: ThemeName) {
      this.apply(theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // ignore: the choice just will not be remembered
      }
    },
  },
});
