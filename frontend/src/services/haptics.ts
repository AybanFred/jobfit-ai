import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * A tiny "tap" vibration for buttons and tabs.
 * It only runs inside the real Android/iOS app. In the browser (or if anything fails)
 * it silently does nothing, so you can call it anywhere without checking.
 */
export async function tapHaptic(strength: 'light' | 'medium' = 'light'): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.impact({ style: strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // ignore: haptics are only a nice extra
  }
}
