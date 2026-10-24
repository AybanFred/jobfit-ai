import { describe, it, expect } from 'vitest';
import {
  clampPercent, countUpValue, easeOutCubic, justReachedFull, ringDashOffset,
} from '@/services/motion';

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1 and never goes backwards', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it('is fast at the start (more than half way after a third of the time)', () => {
    expect(easeOutCubic(1 / 3)).toBeGreaterThan(0.5);
  });
  it('clamps silly input', () => {
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(9)).toBe(1);
  });
});

describe('countUpValue', () => {
  it('counts from the start value to the target', () => {
    expect(countUpValue(0, 80, 0, 900)).toBe(0);
    expect(countUpValue(0, 80, 900, 900)).toBe(80);
    expect(countUpValue(0, 80, 5000, 900)).toBe(80);
    const mid = countUpValue(0, 80, 450, 900);
    expect(mid).toBeGreaterThan(40); // eased: ahead of a straight line
    expect(mid).toBeLessThan(80);
  });
  it('can also count down and starts from where it is', () => {
    expect(countUpValue(80, 40, 900, 900)).toBe(40);
    expect(countUpValue(80, 40, 450, 900)).toBeLessThan(80);
    expect(countUpValue(80, 40, 450, 900)).toBeGreaterThan(40);
  });
  it('jumps straight to the target when there is no duration', () => {
    expect(countUpValue(0, 55, 0, 0)).toBe(55);
  });
});

describe('ring maths', () => {
  const c = 2 * Math.PI * 40;
  it('clamps the percent', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(130)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(42)).toBe(42);
  });
  it('leaves the whole circle empty at 0 and fully drawn at 100', () => {
    expect(ringDashOffset(0, c)).toBeCloseTo(c);
    expect(ringDashOffset(100, c)).toBeCloseTo(0);
    expect(ringDashOffset(50, c)).toBeCloseTo(c / 2);
    expect(ringDashOffset(250, c)).toBeCloseTo(0);
  });
});

describe('justReachedFull (celebration moment)', () => {
  it('only fires when the value crosses up to 100', () => {
    expect(justReachedFull(88, 100)).toBe(true);
    expect(justReachedFull(0, 100)).toBe(true);
  });
  it('does not fire on first sight, when already full, or when below 100', () => {
    expect(justReachedFull(null, 100)).toBe(false);
    expect(justReachedFull(100, 100)).toBe(false);
    expect(justReachedFull(50, 88)).toBe(false);
    expect(justReachedFull(100, 88)).toBe(false);
  });
});
