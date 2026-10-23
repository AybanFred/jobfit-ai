import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore, THEMES } from '@/stores/theme';

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setActivePinia(createPinia());
  });

  it('sets data-theme and remembers the choice', () => {
    const store = useThemeStore();
    store.set('synthwave');
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');
    expect(localStorage.getItem('jobfit-theme')).toBe('synthwave');
  });

  it('restores the saved theme on init', () => {
    localStorage.setItem('jobfit-theme', 'nord');
    useThemeStore().init();
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
  });

  it('ignores an unknown saved theme and falls back to light or dark', () => {
    localStorage.setItem('jobfit-theme', 'not-a-theme');
    useThemeStore().init();
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'));
  });

  it('offers all 35 daisyUI themes', () => {
    expect(THEMES).toHaveLength(35);
  });
});
