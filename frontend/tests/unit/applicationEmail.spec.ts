import { describe, expect, it, vi } from 'vitest';

// trackerLogic is pure, but jobsLogic imports a helper from resumeImport, which pulls in the Supabase client.
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import {
  CANNOT_OPEN_EMAIL_HINT, CHOOSE_OTHER_MODEL, EMAIL_WARNING_PREFIX, OPEN_EMAIL_HINTS, buildMailtoUrl, emailSendState,
  emailWarningsOf, friendlyEmailError,
  isEmailWarning, matchWarningsOf, newestEmail, normalizeApplicationDetail, normalizeApplicationSummary,
  normalizeStoredEmail, normalizeWrittenEmail, summaryOf, validateRecruiterEmail,
} from '@/services/trackerLogic';

/** Reads a mailto: link back, the way an email app does. */
function parseMailto(url: string) {
  const m = /^mailto:([^?]*)(?:\?(.*))?$/.exec(url);
  if (!m) throw new Error(`not a mailto link: ${url}`);
  const params = new Map<string, string>();
  for (const pair of (m[2] ?? '').split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=');
    params.set(k, decodeURIComponent(v));
  }
  return { to: decodeURIComponent(m[1]), subject: params.get('subject'), body: params.get('body'), raw: m };
}

describe('recruiter email on applications', () => {
  it('is read from the list row and the detail (trimmed, blank or wrong type = null)', () => {
    expect(normalizeApplicationSummary({ id: 'a', recruiter_email: ' sam@globex.com ' })!.recruiter_email).toBe('sam@globex.com');
    expect(normalizeApplicationSummary({ id: 'a', recruiter_email: '  ' })!.recruiter_email).toBeNull();
    expect(normalizeApplicationSummary({ id: 'a', recruiter_email: 42 })!.recruiter_email).toBeNull();
    expect(normalizeApplicationSummary({ id: 'a' })!.recruiter_email).toBeNull();
    const d = normalizeApplicationDetail({ id: 'a', recruiter_email: 'sam@globex.com' })!;
    expect(d.recruiter_email).toBe('sam@globex.com');
    expect(summaryOf(d).recruiter_email).toBe('sam@globex.com');
  });

  it('uses the Jobs form rules and message for the To field', () => {
    expect(validateRecruiterEmail('')).toBe('');
    expect(validateRecruiterEmail(null)).toBe('');
    expect(validateRecruiterEmail(' sam@globex.com ')).toBe('');
    expect(validateRecruiterEmail('sam@globex')).toBe('Please enter a valid email address, like name@company.com.');
    expect(validateRecruiterEmail('sam smith@globex.com')).not.toBe('');
  });
});

describe('the saved email', () => {
  it('is part of the detail, cleaned', () => {
    const d = normalizeApplicationDetail({
      id: 'a',
      email: { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: ' Backend Engineer \n application ', body: 'Dear Sam,\r\n\r\nHello.\r\n' },
    })!;
    expect(d.email).toEqual({ id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Backend Engineer application', body: 'Dear Sam,\n\nHello.' });
  });

  it('is null for older entries and unusable answers; missing text becomes empty', () => {
    expect(normalizeApplicationDetail({ id: 'a' })!.email).toBeNull();
    expect(normalizeApplicationDetail({ id: 'a', email: null })!.email).toBeNull();
    expect(normalizeApplicationDetail({ id: 'a', email: { subject: 'No id' } })!.email).toBeNull();
    expect(normalizeStoredEmail({ id: 9, subject: 3 })).toEqual({ id: '9', created_at: '', subject: '', body: '' });
    expect(normalizeStoredEmail('x')).toBeNull();
  });

  it('reads the POST /email answer and keeps only email warnings', () => {
    expect(normalizeWrittenEmail({
      id: 'e2', created_at: '2026-03-13T10:00:00Z', subject: 'S', body: 'B',
      warnings: ['The email mentions Kubernetes, which is not on your resume.', 'Check the 12% number.', 7, ''],
    })).toEqual({
      id: 'e2', created_at: '2026-03-13T10:00:00Z', subject: 'S', body: 'B',
      warnings: ['The email mentions Kubernetes, which is not on your resume.'],
    });
    expect(normalizeWrittenEmail({ id: 'e3', warnings: 'no' })!.warnings).toEqual([]);
    expect(normalizeWrittenEmail({ subject: 'no id' })).toBeNull();
  });

  it('keeps the newer of two versions', () => {
    const older = { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Old', body: 'Old' };
    const newer = { id: 'e2', created_at: '2026-03-12T10:05:00Z', subject: 'New', body: 'New' };
    expect(newestEmail(newer, older)).toBe(newer); // an email written while the refresh was on its way
    expect(newestEmail(older, newer)).toBe(newer);
    expect(newestEmail(null, older)).toBe(older);
    expect(newestEmail(newer, null)).toBe(newer);
    expect(newestEmail({ ...newer, created_at: '' }, older)).toBe(older); // no readable date: the server wins
  });
});

describe('email warnings', () => {
  const all = [
    'Check the 12% number in the summary.',
    'The email mentions Kubernetes, which is not on your resume.',
    '  The email is longer than usual.',
    'Theemail typo is not an email warning.',
  ];

  it('splits the warnings between the Email tab and the Match tab', () => {
    expect(EMAIL_WARNING_PREFIX).toBe('The email');
    expect(emailWarningsOf(all)).toEqual([all[1], all[2]]);
    expect(matchWarningsOf(all)).toEqual([all[0], all[3]]);
    expect(isEmailWarning('the email lower case')).toBe(false);
    expect(emailWarningsOf([])).toEqual([]);
  });
});

describe('buildMailtoUrl', () => {
  it('builds a plain link with the address, subject and message', () => {
    expect(buildMailtoUrl('sam@globex.com', 'Hello', 'Hi Sam')).toBe('mailto:sam@globex.com?subject=Hello&body=Hi%20Sam');
  });

  it('encodes &, ?, #, %, +, = and quotes so nothing is cut off', () => {
    const subject = 'R&D role? #1 at 100% + "more" = yes';
    const body = 'Q&A: is it ok? See #2. 50% done & a+b=c';
    const url = buildMailtoUrl('sam@globex.com', subject, body);
    expect(url).not.toMatch(/[#\s"]/);
    expect(url.split('?')).toHaveLength(2); // only the one "?" after the address
    expect(url.split('&')).toHaveLength(2); // only the one "&" between subject and body
    const parsed = parseMailto(url);
    expect(parsed.subject).toBe(subject);
    expect(parsed.body).toBe(body);
  });

  it('turns line breaks into CRLF (%0D%0A), whatever they were before', () => {
    const url = buildMailtoUrl('sam@globex.com', 'S', 'Dear Sam,\n\nLine two\r\nLine three\rEnd');
    expect(url).toContain('Dear%20Sam%2C%0D%0A%0D%0ALine%20two%0D%0ALine%20three%0D%0AEnd');
    expect(url).not.toMatch(/%0A(?<!%0D%0A)/);
    expect(parseMailto(url).body).toBe('Dear Sam,\r\n\r\nLine two\r\nLine three\r\nEnd');
  });

  it('keeps non-English letters and symbols (UTF-8)', () => {
    const subject = 'Bewerbung – Müller, Zoë 日本 ✓';
    const url = buildMailtoUrl('sam@globex.com', subject, 'Grüße, José');
    expect(url).toContain('M%C3%BCller');
    expect(parseMailto(url).subject).toBe(subject);
    expect(parseMailto(url).body).toBe('Grüße, José');
  });

  it('leaves the address out when it is empty, so the user picks it in the email app', () => {
    expect(buildMailtoUrl('', 'Hello', 'Hi')).toBe('mailto:?subject=Hello&body=Hi');
    expect(buildMailtoUrl(null, 'Hello', 'Hi')).toBe('mailto:?subject=Hello&body=Hi');
    expect(buildMailtoUrl('   ', 'Hello', 'Hi')).toBe('mailto:?subject=Hello&body=Hi');
  });

  it('trims the address and encodes special characters in it, but not the @', () => {
    expect(buildMailtoUrl('  sam@globex.com ', 'S', 'B')).toBe('mailto:sam@globex.com?subject=S&body=B');
    const url = buildMailtoUrl('jobs+it#1@globex.com', 'S', 'B');
    expect(url.startsWith('mailto:jobs%2Bit%231@globex.com?')).toBe(true);
    expect(parseMailto(url).to).toBe('jobs+it#1@globex.com');
  });

  it('skips an empty subject or message', () => {
    expect(buildMailtoUrl('sam@globex.com', '  ', 'Hi')).toBe('mailto:sam@globex.com?body=Hi');
    expect(buildMailtoUrl('sam@globex.com', 'Hello', '')).toBe('mailto:sam@globex.com?subject=Hello');
    expect(buildMailtoUrl('', '', '')).toBe('mailto:');
  });

  it('returns null (cannot build) for text with a broken character instead of throwing', () => {
    expect(buildMailtoUrl('sam@globex.com', 'S', 'broken \uD83D end')).toBeNull(); // half of an emoji
    expect(buildMailtoUrl('sam@globex.com', 'Hi \uDE00', 'Body')).toBeNull();
    expect(buildMailtoUrl('sam@globex.com', 'S', 'Whole emoji 😀 is fine')).toMatch(/%F0%9F%98%80/);
  });
});

describe('emailSendState', () => {
  it('gives the link and the two hints when everything is ready', () => {
    const s = emailSendState('sam@globex.com', 'Hello', 'Hi Sam');
    expect(s.href).toBe('mailto:sam@globex.com?subject=Hello&body=Hi%20Sam');
    expect(s.hints).toEqual([...OPEN_EMAIL_HINTS]);
    expect(s.hints[0]).toBe('Your email app opens with this message ready. You check it and press send yourself.');
    expect(emailSendState('', 'Hello', 'Hi').href).toBe('mailto:?subject=Hello&body=Hi');
  });

  it('is disabled when there is no message, or the address is not valid', () => {
    expect(emailSendState('sam@globex.com', 'Hello', '  ')).toEqual({
      href: null, hints: ['There is no message to send yet. Write a new version first.'],
    });
    expect(emailSendState('sam@globex', 'Hello', 'Hi')).toEqual({
      href: null, hints: ['Please fix the email address above first.'],
    });
  });

  it('is disabled with a "copy the text" hint when the link cannot be built', () => {
    expect(emailSendState('sam@globex.com', 'Hello', 'broken \uD83D end')).toEqual({ href: null, hints: [CANNOT_OPEN_EMAIL_HINT] });
    expect(CANNOT_OPEN_EMAIL_HINT).toBe('This email cannot be opened in your email app. Copy the text above and paste it there.');
  });
});

describe('friendlyEmailError', () => {
  it('says what failed, first time and for a new version', () => {
    expect(friendlyEmailError(new Error('API 500: x'), 'first')).toBe('We could not write the email. Please try again.');
    expect(friendlyEmailError(new Error('API 500: x'), 'regenerate'))
      .toBe('We could not write a new version. Your current email is still here.');
    // the AI could not write it (502): the backend sentence is close, but ours says the old email is kept
    expect(friendlyEmailError(new Error('API 502: {"detail":"The AI service could not write the email. Please try again."}'), 'regenerate'))
      .toBe('We could not write a new version. Your current email is still here.');
    expect(friendlyEmailError(null, 'first')).toBe('We could not write the email. Please try again.');
  });

  it('handles offline, busy and session problems', () => {
    expect(friendlyEmailError(new TypeError('Failed to fetch'), 'first')).toBe('No internet connection. Please check it and try again.');
    expect(friendlyEmailError(new Error('API 429: {"detail":"Rate limited"}'), 'regenerate')).toBe('The AI service is busy. Please try again in a minute.');
    expect(friendlyEmailError(new Error('API 401: x'), 'first')).toBe('Your session has ended. Please log in again.');
    expect(friendlyEmailError(new Error('API 404: {"detail":"Application not found"}'), 'first')).toMatch(/could not find this application/);
  });

  it('shows a short plain backend sentence for "not set up" and "unknown model"', () => {
    expect(friendlyEmailError(new Error('API 503: {"detail":"Groq is not set up on the server."}'), 'first')).toBe('Groq is not set up on the server.');
    // "unknown model" also says where to choose another one (the Email tab uses the Jobs tab model)
    expect(friendlyEmailError(new Error('API 400: {"detail":"Unknown AI model."}'), 'regenerate'))
      .toBe('Unknown AI model. Please choose another AI model on the Jobs tab.');
    expect(friendlyEmailError(new Error('API 400: {"detail":"Unknown AI model"}'), 'first')) // the backend's exact text
      .toBe(`Unknown AI model. ${CHOOSE_OTHER_MODEL}`);
    expect(CHOOSE_OTHER_MODEL).toBe('Please choose another AI model on the Jobs tab.');
    // other 400s keep their own sentence, without the hint
    expect(friendlyEmailError(new Error('API 400: {"detail":"The uploaded file is empty"}'), 'first')).toBe('The uploaded file is empty');
    expect(friendlyEmailError(new Error('API 400: x'), 'first')).toBe('We could not write the email. Please try again.');
    // FastAPI validation errors are lists, not sentences
    expect(friendlyEmailError(new Error('API 422: {"detail":[{"loc":["body","model_id"]}]}'), 'first'))
      .toBe('We could not write the email. Please try again.');
    expect(friendlyEmailError(new Error('API 503: {"detail":"Traceback (most recent call last): File \\"x.py\\""}'), 'first'))
      .toBe('We could not write the email. Please try again.');
  });
});
