import { describe, it, expect } from 'vitest';
import { activityKind, computeCompleteness, describeAction, timeAgo } from '@/services/dashboard';
import { friendlyAuthError, friendlyApiError } from '@/services/errors';

describe('computeCompleteness', () => {
  it('starts low and points to the next step when there is little data', () => {
    const result = computeCompleteness(
      { full_name: 'Ivant', headline: null, email: null, phone: null, location: null, summary: null },
      { experiences: 0, education: 0, projects: 0, skills: 0 },
    );
    expect(result.done).toBe(1);
    expect(result.percent).toBe(13);
    expect(result.nextStep).toBe('Add a short headline');
  });

  it('handles a missing profile without inventing data', () => {
    const result = computeCompleteness(null, null);
    expect(result.percent).toBe(0);
  });

  it('reaches 100 when everything is filled', () => {
    const result = computeCompleteness(
      { full_name: 'A', headline: 'B', email: 'a@b.c', phone: '1', location: null, summary: 'S' },
      { experiences: 1, education: 1, projects: 1, skills: 3 },
    );
    expect(result.percent).toBe(100);
    expect(result.nextStep).toBe('');
  });
});

describe('dashboard helpers', () => {
  it('turns an action code into readable text', () => {
    expect(describeAction('job.parsed')).toBe('Job parsed');
  });

  it('says "just now" for very recent times', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(timeAgo('2026-01-01T11:59:50Z', now)).toBe('just now');
  });
});

describe('friendly errors', () => {
  it('hides technical auth messages', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toMatch(/email or password/);
    expect(friendlyAuthError(new Error('TypeError: Failed to fetch'))).toMatch(/internet/);
    expect(friendlyAuthError(undefined)).toMatch(/try again/);
  });

  it('hides technical backend messages', () => {
    expect(friendlyApiError(new Error('API 500: boom'))).not.toMatch(/boom/);
    expect(friendlyApiError(new TypeError('Failed to fetch'))).toMatch(/not reachable/);
  });
});

describe('activityKind (icon for the Recent activity list)', () => {
  it('uses the start of the action code', () => {
    expect(activityKind('skill.created')).toBe('skill');
    expect(activityKind('resume.parsed')).toBe('resume');
    expect(activityKind('auth.me_checked')).toBe('auth');
    expect(activityKind('job.parsed')).toBe('job');
    expect(activityKind('experience.updated')).toBe('experience');
    expect(activityKind('PROJECT_ADDED')).toBe('project');
  });
  it('falls back to a generic icon for unknown actions', () => {
    expect(activityKind('something.new')).toBe('other');
    expect(activityKind('')).toBe('other');
  });
});
