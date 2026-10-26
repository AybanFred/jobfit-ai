import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

const native = vi.hoisted(() => ({ value: false }));
const appPlugin = vi.hoisted(() => ({
  listeners: [] as { event: string; fn: () => void; removed: boolean }[],
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: string, fn: () => void) => {
      const entry = { event, fn, removed: false };
      appPlugin.listeners.push(entry);
      return { remove: async () => { entry.removed = true; } };
    }),
  },
}));

import { SENT_IT_FALLBACK_MS, useSentItBanner } from '@/composables/useSentItBanner';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** The banner inside its own effect scope (like a mounted component), with a reactive status. */
function setup(status = 'saved') {
  const current = ref(status);
  const scope = effectScope();
  const banner = scope.run(() => useSentItBanner(() => current.value === 'saved'))!;
  return { banner, current, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  native.value = false;
  appPlugin.listeners = [];
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('"Sent it?" banner', () => {
  it('stays hidden until "Open in email app" was tapped', () => {
    const { banner, scope } = setup();
    window.dispatchEvent(new Event('focus'));
    setVisibility('visible');
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS * 2);
    expect(banner.visible.value).toBe(false);
    scope.stop();
  });

  it('appears when the user comes back from the email app (page visible again)', () => {
    const { banner, scope } = setup();
    banner.arm();
    setVisibility('hidden'); // the email app is in front
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS * 2); // the fallback waits while the page is hidden
    expect(banner.visible.value).toBe(false);
    setVisibility('visible');
    expect(banner.visible.value).toBe(true);
    scope.stop();
  });

  it('appears when the window gets focus back (computer)', () => {
    const { banner, scope } = setup();
    banner.arm();
    window.dispatchEvent(new Event('focus'));
    expect(banner.visible.value).toBe(true);
    scope.stop();
  });

  it('appears after the fallback time when nothing else happens', () => {
    const { banner, scope } = setup();
    banner.arm();
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS - 1);
    expect(banner.visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(banner.visible.value).toBe(true);
    scope.stop();
  });

  it('does not appear when the status is not "saved"', () => {
    const { banner, scope } = setup('applied');
    banner.arm();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(false);
    scope.stop();
  });

  it('never hides by itself, but hides when the status changes or on hide()', async () => {
    const { banner, current, scope } = setup();
    banner.arm();
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(true);
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('focus'));
    expect(banner.visible.value).toBe(true);
    current.value = 'applied';
    await nextTick();
    expect(banner.visible.value).toBe(false);
    current.value = 'saved';
    await nextTick();
    expect(banner.visible.value).toBe(false); // not remembered
    banner.arm();
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(true);
    banner.hide();
    expect(banner.visible.value).toBe(false);
    scope.stop();
  });

  it('shows only once per tap, and tapping again re-arms it', () => {
    const { banner, scope } = setup();
    banner.arm();
    window.dispatchEvent(new Event('focus'));
    expect(banner.visible.value).toBe(true);
    banner.hide(); // "Not yet"
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(false);
    banner.arm(); // Open in email app again
    expect(banner.visible.value).toBe(false);
    setVisibility('hidden');
    setVisibility('visible');
    expect(banner.visible.value).toBe(true);
    scope.stop();
  });

  it('a hide before coming back cancels it (tab change, leaving the page)', () => {
    const { banner, scope } = setup();
    banner.arm();
    banner.hide();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(false);
    scope.stop();
  });

  it('cleans up when the component goes away', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { banner, scope } = setup();
    banner.arm();
    expect(add).toHaveBeenCalledWith('focus', expect.any(Function));
    scope.stop();
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function));
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(false);
  });

  it('in the phone app, also listens for the app coming back (and stops listening afterwards)', async () => {
    native.value = true;
    const { banner, scope } = setup();
    banner.arm();
    await Promise.resolve(); // addListener resolves
    await Promise.resolve();
    const resume = appPlugin.listeners.find((l) => l.event === 'resume');
    expect(resume).toBeTruthy();
    setVisibility('hidden');
    visibility = 'visible'; // some web views only send "resume"
    resume!.fn();
    expect(banner.visible.value).toBe(true);
    expect(resume!.removed).toBe(true);
    scope.stop();
  });
});
