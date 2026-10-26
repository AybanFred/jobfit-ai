import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';

vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/applications', () => ({
  listApplications: vi.fn(), getApplication: vi.fn(), updateApplication: vi.fn(), deleteApplication: vi.fn(),
  writeApplicationEmail: vi.fn(),
}));
vi.mock('@/services/documents', () => ({ downloadDocument: vi.fn() }));
vi.mock('@/services/feedback', () => ({ showToast: vi.fn(), confirmAction: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

import * as appsSvc from '@/services/applications';
import { confirmAction, showToast } from '@/services/feedback';
import ApplicationEmailPanel from '@/components/ApplicationEmailPanel.vue';
import { normalizeApplicationDetail, normalizeApplicationSummary } from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

const apps = vi.mocked(appsSvc);

const EMAIL = { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Application: Dev & Ops?', body: 'Dear Sam,\n\nHello.' };

function seed(over: Record<string, unknown> = {}) {
  const s = useTrackerStore();
  s.details.a = normalizeApplicationDetail({
    id: 'a',
    status: 'saved',
    recruiter_email: null,
    job: { id: 'j', title: 'Dev', company: 'Acme', raw_text: 'x' },
    match: { score: 60, matched: [], gaps: [], warnings: ['Check line 2.', 'The email mentions Go.'] },
    documents: [{ id: 'r1', type: 'resume' }, { id: 'c1', type: 'cover_letter' }],
    resume: { id: 'r1', content: { header: { name: 'Ana' } } },
    cover_letter: { id: 'c1', content: { greeting: 'Hi' } },
    email: EMAIL,
    ...over,
  })!;
  return s;
}

// Simple stand-ins for the Ionic parts, so the test can type, leave the field and click.
const stubs = {
  IonIcon: true,
  IonSpinner: true,
  IonInput: defineComponent({
    props: ['value', 'errorText', 'label', 'helperText'],
    emits: ['ionInput', 'ionBlur'],
    template: `<div class="stub-input"><input :aria-label="label" :value="value"
      @input="$emit('ionInput', { detail: { value: $event.target.value } })" @blur="$emit('ionBlur')" />
      <span class="helper">{{ helperText }}</span><span class="err">{{ errorText }}</span></div>`,
  }),
  IonButton: defineComponent({
    props: ['disabled', 'href'],
    template: '<button class="stub-btn" :disabled="disabled" :data-href="href"><slot /></button>',
  }),
};

let mounted: ReturnType<typeof mount> | null = null;

function mountPanel(markApplied = vi.fn(async () => true)) {
  const Host = defineComponent({
    setup() {
      const s = useTrackerStore();
      return () => h(ApplicationEmailPanel, { detail: s.details.a, modelId: 'groq:x', markApplied, active: true });
    },
  });
  mounted = mount(Host, { global: { stubs }, attachTo: document.body });
  return mounted;
}

const button = (w: ReturnType<typeof mount>, label: string) =>
  w.findAll('button.stub-btn').find((b) => b.text().includes(label) || b.attributes('aria-label') === label);
const toInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="To (recruiter email)"]');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

afterEach(() => {
  mounted?.unmount(); // the page only shows the panel while the application is loaded
  mounted = null;
  useTrackerStore().reset();
  document.body.innerHTML = '';
});

describe('ApplicationEmailPanel', () => {
  it('shows the email, only the email warnings, and a ready mailto link', () => {
    seed({ recruiter_email: 'sam@acme.com' });
    const w = mountPanel();
    expect(w.text()).toContain('Application: Dev & Ops?');
    expect(w.text()).toContain('The email mentions Go.');
    expect(w.text()).not.toContain('Check line 2.');
    const open = button(w, 'Open in email app')!;
    expect(open.attributes('disabled')).toBeUndefined();
    expect(open.attributes('data-href')).toBe('mailto:sam@acme.com?subject=Application%3A%20Dev%20%26%20Ops%3F&body=Dear%20Sam%2C%0D%0A%0D%0AHello.');
    expect(w.text()).toContain('Your email app opens with this message ready.');
    expect(w.text()).toContain('Attach your resume and cover letter');
  });

  it('without an email: offers "Write email" (with the Jobs tab model), then shows the new email', async () => {
    seed({ email: null });
    let answer!: (v: Awaited<ReturnType<typeof apps.writeApplicationEmail>>) => void;
    apps.writeApplicationEmail.mockReturnValue(new Promise((r) => { answer = r; }));
    const w = mountPanel();
    expect(w.text()).toContain('No email yet');
    expect(button(w, 'Open in email app')).toBeUndefined();
    expect(w.text()).not.toContain('Attach your resume');
    await button(w, 'Write email')!.trigger('click');
    expect(apps.writeApplicationEmail).toHaveBeenCalledWith('a', 'groq:x', expect.any(AbortSignal));
    expect(w.text()).toContain('Writing your email…');
    expect(button(w, 'Cancel writing the email')).toBeTruthy();
    expect(w.text()).not.toContain('No email yet');
    answer({ ...EMAIL, id: 'e2', subject: 'New subject', warnings: [] });
    await flushPromises();
    expect(w.text()).toContain('New subject');
    expect(showToast).toHaveBeenCalledWith('Your email is ready');
  });

  it('asks before writing a new version', async () => {
    seed();
    vi.mocked(confirmAction).mockResolvedValue(false);
    const w = mountPanel();
    await button(w, 'Write a new version of the email')!.trigger('click');
    await flushPromises();
    expect(confirmAction).toHaveBeenCalledWith(
      'Write a new version?',
      'This replaces the email you see now. Your resume and cover letter stay the same.',
      'Replace email',
    );
    expect(apps.writeApplicationEmail).not.toHaveBeenCalled();
  });

  it('To: a bad address shows the error, is not saved and disables Open', async () => {
    seed();
    const w = mountPanel();
    await toInput(w).setValue('sam@acme');
    await toInput(w).trigger('blur');
    expect(w.find('.err').text()).toBe('Please enter a valid email address, like name@company.com.');
    expect(apps.updateApplication).not.toHaveBeenCalled();
    expect(button(w, 'Open in email app')!.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Please fix the email address above first.');
  });

  it('To: a good address is trimmed and saved when leaving the field; empty saves null', async () => {
    seed();
    apps.updateApplication.mockResolvedValue(normalizeApplicationSummary({ id: 'a', recruiter_email: 'sam@acme.com' }));
    const w = mountPanel();
    await toInput(w).setValue('  sam@acme.com ');
    await toInput(w).trigger('blur');
    expect(apps.updateApplication).toHaveBeenCalledWith('a', { recruiter_email: 'sam@acme.com' });
    expect(w.text()).toContain('Saving…');
    await flushPromises();
    expect(w.text()).toContain('Saved');
    expect(button(w, 'Open in email app')!.attributes('data-href')).toMatch(/^mailto:sam@acme\.com\?/);
    // leaving the field without a change does not save again
    await toInput(w).trigger('blur');
    expect(apps.updateApplication).toHaveBeenCalledTimes(1);
    apps.updateApplication.mockResolvedValue(normalizeApplicationSummary({ id: 'a', recruiter_email: null }));
    await toInput(w).setValue('');
    await toInput(w).trigger('blur');
    expect(apps.updateApplication).toHaveBeenLastCalledWith('a', { recruiter_email: null });
  });

  it('To: a failed save shows the message and keeps the typed address', async () => {
    seed({ recruiter_email: 'old@acme.com' });
    apps.updateApplication.mockRejectedValue(new Error('API 500: x'));
    const w = mountPanel();
    await toInput(w).setValue('new@acme.com');
    await toInput(w).trigger('blur');
    await flushPromises();
    expect(w.text()).toContain('We could not save the address. Please try again.');
    expect((toInput(w).element as HTMLInputElement).value).toBe('new@acme.com');
    expect(useTrackerStore().details.a.recruiter_email).toBe('old@acme.com'); // the saved value is unchanged
  });

  it('"Sent it?" appears after opening the email app and coming back, and marks the job as Applied', async () => {
    seed();
    const markApplied = vi.fn(async () => true);
    const w = mountPanel(markApplied);
    expect(w.text()).not.toContain('Sent it?');
    await button(w, 'Open in email app')!.trigger('click');
    expect(w.text()).not.toContain('Sent it?');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(w.text()).toContain('Sent it?');
    await button(w, 'Mark as Applied')!.trigger('click');
    await flushPromises();
    expect(markApplied).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Marked as Applied');
    expect(w.text()).not.toContain('Sent it?');
  });

  it('"Sent it?" stays with a message when marking fails, and "Not yet" hides it', async () => {
    seed();
    const w = mountPanel(vi.fn(async () => false));
    await button(w, 'Open in email app')!.trigger('click');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    await button(w, 'Mark as Applied')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('We could not update the status. Please try again.');
    expect(w.text()).toContain('Sent it?');
    await button(w, 'Not yet, hide this message')!.trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
  });

  it('an email that cannot be put in a link (broken character) disables Open and says to copy the text', () => {
    seed({ email: { ...EMAIL, body: 'Dear Sam, broken \uD83D end' } });
    const w = mountPanel(); // must not throw while rendering
    const open = button(w, 'Open in email app')!;
    expect(open.attributes('disabled')).toBeDefined();
    expect(open.attributes('data-href')).toBeUndefined();
    expect(w.text()).toContain('This email cannot be opened in your email app. Copy the text above and paste it there.');
    expect(button(w, 'Copy message')!.attributes('disabled')).toBeUndefined();
  });

  it('To: says it is the recruiter address and that it is optional', () => {
    seed();
    const w = mountPanel();
    expect(toInput(w).exists()).toBe(true);
    expect(w.find('.helper').text()).toBe('Optional. If empty, you choose the recipient in your email app.');
  });

  it('headings: the warning and attach headings are h2 (same look as before), Open has no dead aria-describedby', () => {
    seed();
    const w = mountPanel();
    const h2s = w.findAll('h2').map((h) => h.text());
    expect(h2s).toEqual(['Please check these lines', 'Application email', 'Attach your resume and cover letter']);
    expect(w.findAll('h2.ui-h3').map((h) => h.text())).toEqual(['Please check these lines', 'Attach your resume and cover letter']);
    expect(w.findAll('h3').map((h) => h.text())).not.toContain('Please check these lines');
    expect(button(w, 'Open in email app')!.attributes('aria-describedby')).toBeUndefined();
  });

  it('a new email with warnings moves the focus to "Please check these lines"', async () => {
    seed({ email: null });
    apps.writeApplicationEmail.mockResolvedValue({ ...EMAIL, id: 'e2', warnings: ['The email mentions Rust.'] });
    const w = mountPanel();
    await button(w, 'Write email')!.trigger('click');
    await flushPromises();
    const warn = w.findAll('h2').find((h) => h.text() === 'Please check these lines')!;
    expect(warn.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(warn.element);
  });

  it('a new email without warnings moves the focus to the "Application email" title', async () => {
    seed({ email: null, match: { score: 60, matched: [], gaps: [], warnings: [] } });
    apps.writeApplicationEmail.mockResolvedValue({ ...EMAIL, id: 'e2', warnings: [] });
    const w = mountPanel();
    await button(w, 'Write email')!.trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('Please check these lines');
    expect(document.activeElement).toBe(w.find('h2.email-title').element);
  });

  it('"Sent it?" is not shown when the job is already past "Saved"', async () => {
    seed({ status: 'applied' });
    const w = mountPanel();
    await button(w, 'Open in email app')!.trigger('click');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
  });
});
