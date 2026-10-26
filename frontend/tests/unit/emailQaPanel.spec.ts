import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';

// QA review of ApplicationEmailPanel: states and edge cases next to the developer's own spec.

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
import { confirmAction } from '@/services/feedback';
import ApplicationEmailPanel from '@/components/ApplicationEmailPanel.vue';
import { normalizeApplicationDetail } from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

const apps = vi.mocked(appsSvc);

const EMAIL = { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Application for Dev', body: 'Dear Sam,\n\nHello.' };

function seed(id: string, over: Record<string, unknown> = {}) {
  const s = useTrackerStore();
  s.details[id] = normalizeApplicationDetail({
    id,
    status: 'saved',
    recruiter_email: null,
    job: { id: `j-${id}`, title: 'Dev', company: 'Acme', raw_text: 'x' },
    match: { score: 60, matched: [], gaps: [], warnings: ['The email mentions Go.'] },
    documents: [{ id: `r-${id}`, type: 'resume' }, { id: `c-${id}`, type: 'cover_letter' }],
    resume: { id: `r-${id}`, content: { header: { name: 'Ana' } } },
    cover_letter: { id: `c-${id}`, content: { greeting: 'Hi' } },
    email: EMAIL,
    ...over,
  })!;
  return s;
}

const stubs = {
  IonIcon: true,
  IonSpinner: true,
  IonInput: defineComponent({
    props: ['value', 'errorText', 'label'],
    emits: ['ionInput', 'ionBlur'],
    template: `<div class="stub-input"><input :aria-label="label" :value="value"
      @input="$emit('ionInput', { detail: { value: $event.target.value } })" @blur="$emit('ionBlur')" />
      <span class="err">{{ errorText }}</span></div>`,
  }),
  IonButton: defineComponent({
    props: ['disabled', 'href'],
    template: '<button class="stub-btn" :disabled="disabled" :data-href="href"><slot /></button>',
  }),
};

let mounted: ReturnType<typeof mount> | null = null;
const currentId = ref('a');
const active = ref(true);

function mountPanel(markApplied = vi.fn(async () => true)) {
  const Host = defineComponent({
    setup() {
      const s = useTrackerStore();
      return () => h(ApplicationEmailPanel, { detail: s.details[currentId.value], modelId: null, markApplied, active: active.value });
    },
  });
  mounted = mount(Host, { global: { stubs }, attachTo: document.body });
  return mounted;
}

const button = (w: ReturnType<typeof mount>, label: string) =>
  w.findAll('button.stub-btn').find((b) => b.text().includes(label) || b.attributes('aria-label') === label);
const toInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="To (recruiter email)"]');
const hrefOfOpen = (w: ReturnType<typeof mount>) => button(w, 'Open in email app')!.attributes('data-href');

function hangUntilAbort() {
  return (_id: string, _m: string | null, signal?: AbortSignal) => new Promise<never>((_res, rej) => {
    signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  currentId.value = 'a';
  active.value = true;
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  useTrackerStore().reset();
  document.body.innerHTML = '';
});

describe('ApplicationEmailPanel: states', () => {
  it('an email with an empty message cannot be opened or copied, and says why', () => {
    seed('a', { email: { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Only a subject', body: '' } });
    const w = mountPanel();
    expect(w.text()).toContain('The email came back empty. Please write a new version.');
    const open = button(w, 'Open in email app')!;
    expect(open.attributes('disabled')).toBeDefined();
    expect(open.attributes('data-href')).toBeUndefined();
    expect(w.text()).toContain('There is no message to send yet. Write a new version first.');
    expect(button(w, 'Copy subject')!.attributes('disabled')).toBeUndefined();
    expect(button(w, 'Copy message')!.attributes('disabled')).toBeDefined();
  });

  it('a subject-less email can still be opened (the user types the subject in the email app)', () => {
    seed('a', { email: { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: '', body: 'Hello there' } });
    const w = mountPanel();
    expect(w.text()).toContain('No subject');
    expect(hrefOfOpen(w)).toBe('mailto:?body=Hello%20there');
    expect(button(w, 'Copy subject')!.attributes('disabled')).toBeDefined();
  });

  it('typing an invalid address disables Open at once; fixing it enables Open again (no need to leave the field)', async () => {
    seed('a', { recruiter_email: 'sam@acme.com' });
    const w = mountPanel();
    expect(hrefOfOpen(w)).toMatch(/^mailto:sam@acme\.com\?/);
    await toInput(w).setValue('sam@acme');
    expect(button(w, 'Open in email app')!.attributes('disabled')).toBeDefined();
    await toInput(w).setValue('sam@acme.org');
    expect(hrefOfOpen(w)).toMatch(/^mailto:sam@acme\.org\?/);
    expect(apps.updateApplication).not.toHaveBeenCalled(); // nothing is saved until the field is left
  });

  it('a failed new version keeps the current email, shows the error and keeps Open working', async () => {
    seed('a', { recruiter_email: 'sam@acme.com' });
    vi.mocked(confirmAction).mockResolvedValue(true);
    apps.writeApplicationEmail.mockRejectedValue(new Error('API 502: {"detail":"x"}'));
    const w = mountPanel();
    await button(w, 'Write a new version of the email')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('We could not write a new version. Your current email is still here.');
    expect(w.text()).toContain('Application for Dev');
    expect(hrefOfOpen(w)).toMatch(/^mailto:sam@acme\.com\?/);
  });

  it('a failed first try shows the error and the button says "Try again"', async () => {
    seed('a', { email: null });
    apps.writeApplicationEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const w = mountPanel();
    await button(w, 'Write email')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('No internet connection. Please check it and try again.');
    expect(button(w, 'Try again')).toBeTruthy();
    expect(button(w, 'Open in email app')).toBeUndefined();
  });

  it('while a new version is written the warnings, downloads and Open are hidden; Cancel brings everything back', async () => {
    seed('a');
    apps.writeApplicationEmail.mockImplementation(hangUntilAbort());
    const w = mountPanel();
    expect(w.text()).toContain('Please check these lines');
    await button(w, 'Write a new version of the email')!.trigger('click'); // confirmAction is mocked: undefined = no
    expect(apps.writeApplicationEmail).not.toHaveBeenCalled();
    vi.mocked(confirmAction).mockResolvedValue(true);
    await button(w, 'Write a new version of the email')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Writing your email…');
    expect(w.text()).not.toContain('Please check these lines');
    expect(button(w, 'Open in email app')).toBeUndefined();
    expect(w.text()).not.toContain('Attach your resume');
    await button(w, 'Cancel writing the email')!.trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('Writing your email…');
    expect(w.text()).toContain('Application for Dev');
    expect(w.text()).toContain('Please check these lines');
    expect(w.text()).not.toContain('We could not write'); // cancelling is not an error
    expect(button(w, 'Open in email app')).toBeTruthy();
  });

  it('hides the attach section when the application has neither resume nor cover letter', () => {
    seed('a', { documents: [], resume: null, cover_letter: null });
    const w = mountPanel();
    expect(w.text()).not.toContain('Attach your resume and cover letter');
    expect(button(w, 'Open in email app')).toBeTruthy();
  });

  it('shows a Download button per format for each document, and nothing else about the email text is editable', () => {
    seed('a');
    const w = mountPanel();
    const labels = w.findAll('button.stub-btn').map((b) => b.text()).filter((t) => t.startsWith('Download'));
    expect(labels).toEqual(['Download PDF', 'Download DOCX', 'Download PDF', 'Download DOCX']);
    expect(w.findAll('textarea')).toHaveLength(0);
  });

  it('shows the email text as plain text, never as HTML', () => {
    seed('a', { email: { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: '<img src=x onerror=alert(1)>', body: '<b>bold</b>\n\n<script>alert(1)</script>' } });
    const w = mountPanel();
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('script').exists()).toBe(false);
    expect(w.find('b').exists()).toBe(false);
    expect(w.text()).toContain('<b>bold</b>');
  });
});

describe('ApplicationEmailPanel: the To field and the "Sent it?" question', () => {
  it('takes a new address from a refresh when the box was not touched', async () => {
    const s = seed('a', { recruiter_email: 'old@acme.com' });
    const w = mountPanel();
    s.details.a = { ...s.details.a, recruiter_email: 'new@acme.com' };
    await flushPromises();
    expect((toInput(w).element as HTMLInputElement).value).toBe('new@acme.com');
  });

  it('keeps what the user is typing when a refresh brings another address', async () => {
    const s = seed('a', { recruiter_email: 'old@acme.com' });
    const w = mountPanel();
    await toInput(w).setValue('typing@acme.com');
    s.details.a = { ...s.details.a, recruiter_email: 'server@acme.com' };
    await flushPromises();
    expect((toInput(w).element as HTMLInputElement).value).toBe('typing@acme.com');
  });

  it('starts fresh when the same panel is shown for another application', async () => {
    const s = seed('a', { recruiter_email: 'a@acme.com' });
    seed('b', { recruiter_email: 'b@acme.com', email: null });
    const w = mountPanel();
    await toInput(w).setValue('half-typed');
    await toInput(w).trigger('blur'); // invalid: error shown, nothing saved
    expect(w.find('.err').text()).not.toBe('');
    currentId.value = 'b';
    await flushPromises();
    expect((toInput(w).element as HTMLInputElement).value).toBe('b@acme.com');
    expect(w.find('.err').text()).toBe('');
    expect(w.text()).toContain('No email yet');
    expect(s.details.a.recruiter_email).toBe('a@acme.com');
    expect(apps.updateApplication).not.toHaveBeenCalled();
  });

  it('"Sent it?" disappears when the page is no longer in front, and does not come back by itself', async () => {
    seed('a');
    const w = mountPanel();
    await button(w, 'Open in email app')!.trigger('click');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(w.text()).toContain('Sent it?');
    active.value = false;
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
    active.value = true;
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
  });

  it('"Sent it?" is not armed when Open is disabled (nothing was opened)', async () => {
    seed('a', { email: { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'S', body: '' } });
    const w = mountPanel();
    await button(w, 'Open in email app')!.trigger('click');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
  });

  it('"Sent it?" while marking: both buttons are disabled and the question stays until the save is done', async () => {
    seed('a');
    let finish!: (ok: boolean) => void;
    const markApplied = vi.fn(() => new Promise<boolean>((r) => { finish = r; }));
    const w = mountPanel(markApplied);
    await button(w, 'Open in email app')!.trigger('click');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    await button(w, 'Mark as Applied')!.trigger('click');
    expect(button(w, 'Saving…')!.attributes('disabled')).toBeDefined();
    expect(button(w, 'Not yet, hide this message')!.attributes('disabled')).toBeDefined();
    await button(w, 'Saving…')!.trigger('click'); // a second tap does nothing
    expect(markApplied).toHaveBeenCalledTimes(1);
    finish(true);
    await flushPromises();
    expect(w.text()).not.toContain('Sent it?');
  });
});
