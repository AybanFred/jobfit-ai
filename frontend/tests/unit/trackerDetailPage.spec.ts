import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';

// The application detail page: which AI model the Email tab uses, "Mark as Applied" from the Email tab,
// the "Please check" pills and the delete note. Ionic parts are simple stand-ins.

const ionHooks = vi.hoisted(() => ({ enter: [] as (() => void)[] }));
vi.mock('@ionic/vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ionic/vue')>()),
  onIonViewWillEnter: (fn: () => void) => { ionHooks.enter.push(fn); },
  onIonViewWillLeave: () => {},
  useIonRouter: () => ({ back: vi.fn(), navigate: vi.fn() }),
}));
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/applications', () => ({
  listApplications: vi.fn(), getApplication: vi.fn(), updateApplication: vi.fn(), deleteApplication: vi.fn(),
  writeApplicationEmail: vi.fn(),
}));
vi.mock('@/services/documents', () => ({ downloadDocument: vi.fn() }));
vi.mock('@/services/feedback', () => ({ showToast: vi.fn(), confirmAction: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));

import * as appsSvc from '@/services/applications';
import { MODEL_STORAGE_KEY } from '@/services/aiModels';
import { normalizeApplicationDetail, normalizeApplicationSummary } from '@/services/trackerLogic';
import { useJobsStore } from '@/stores/jobs';
import { useTrackerStore } from '@/stores/tracker';
import TrackerDetailPage from '@/views/TrackerDetailPage.vue';

const apps = vi.mocked(appsSvc);

const EMAIL = { id: 'e1', created_at: '2026-03-12T10:00:00Z', subject: 'Application for Dev', body: 'Dear Sam,\n\nHello.' };

function seed(over: Record<string, unknown> = {}) {
  const s = useTrackerStore();
  s.details.a = normalizeApplicationDetail({
    id: 'a',
    status: 'saved',
    job: { id: 'j', title: 'Dev', company: 'Acme', raw_text: 'x' },
    match: { score: 60, matched: [], gaps: [], warnings: ['Check line 2.', 'The email mentions Go.'] },
    documents: [{ id: 'r1', type: 'resume' }],
    resume: { id: 'r1', content: { header: { name: 'Ana' } } },
    cover_letter: null,
    email: EMAIL,
    ...over,
  })!;
  s.detailStatus.a = 'ready';
  return s;
}

const slot = (cls: string) => defineComponent({ template: `<div class="${cls}"><slot /></div>` });
const SegmentStub = defineComponent({
  name: 'SegmentStub',
  props: ['value'],
  emits: ['ionChange'],
  template: '<div class="stub-seg" :data-value="value"><slot /></div>',
});
const PanelStub = defineComponent({
  name: 'PanelStub',
  props: ['detail', 'modelId', 'markApplied', 'active'],
  template: '<div class="stub-panel">Email panel</div>',
});

const stubs = {
  IonPage: slot('stub-page'), IonHeader: slot('stub-header'), IonToolbar: slot('stub-toolbar'), IonTitle: slot('stub-title'),
  IonContent: slot('stub-content'), IonButtons: slot('stub-buttons'), IonSegmentButton: slot('stub-seg-btn'),
  IonLabel: slot('stub-label'), IonAccordionGroup: slot('stub-acc-group'), IonAccordion: slot('stub-acc'), IonItem: slot('stub-item'),
  IonSelect: slot('stub-select'),
  IonSegment: SegmentStub,
  IonButton: defineComponent({ props: ['disabled'], template: '<button class="stub-btn" :disabled="disabled"><slot /></button>' }),
  IonIcon: true, IonSpinner: true, IonSkeletonText: true, IonRefresher: true, IonRefresherContent: true,
  IonSelectOption: true, IonTextarea: true,
  ApplicationEmailPanel: PanelStub,
  HarvardResumePreview: true, CoverLetterPreview: true, JobMatchSummary: true, JobDetails: true, TrackerDateField: true,
  EmptyState: true,
};

let mounted: ReturnType<typeof mount> | null = null;
function mountPage() {
  mounted = mount(TrackerDetailPage, { props: { id: 'a' }, global: { stubs } });
  return mounted;
}

async function openEmailTab(w: ReturnType<typeof mount>) {
  w.findComponent(SegmentStub).vm.$emit('ionChange', { detail: { value: 'email' } });
  await flushPromises();
  return w.findComponent(PanelStub);
}

const pills = (w: ReturnType<typeof mount>) => w.findAll('button.check-pill');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  ionHooks.enter.length = 0;
  localStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  useTrackerStore().reset();
  localStorage.clear();
});

describe('TrackerDetailPage: AI model for the Email tab', () => {
  it('uses the saved Jobs tab choice when the Jobs tab was not opened yet', async () => {
    seed();
    localStorage.setItem(MODEL_STORAGE_KEY, 'google:gemini-2.0-flash');
    const w = mountPage();
    expect(useJobsStore().modelId).toBeNull();
    expect((await openEmailTab(w)).props('modelId')).toBe('google:gemini-2.0-flash');
  });

  it('uses the model picked on the Jobs tab (jobs store) before the saved one', async () => {
    seed();
    localStorage.setItem(MODEL_STORAGE_KEY, 'google:gemini-2.0-flash');
    useJobsStore().setModel('groq:llama-3.3-70b-versatile');
    const w = mountPage();
    expect((await openEmailTab(w)).props('modelId')).toBe('groq:llama-3.3-70b-versatile');
  });

  it('reads the saved choice again each time the page is shown; null when there is none (server default)', async () => {
    seed();
    const w = mountPage();
    const panel = await openEmailTab(w);
    expect(panel.props('modelId')).toBeNull();
    localStorage.setItem(MODEL_STORAGE_KEY, 'openai:gpt-4o-mini');
    apps.getApplication.mockResolvedValue(useTrackerStore().details.a);
    ionHooks.enter.forEach((fn) => fn());
    await flushPromises();
    expect(w.findComponent(PanelStub).props('modelId')).toBe('openai:gpt-4o-mini');
  });
});

describe('TrackerDetailPage: "Mark as Applied" from the Email tab', () => {
  it('saves the status and resolves to true', async () => {
    seed();
    apps.updateApplication.mockResolvedValue(normalizeApplicationSummary({ id: 'a', status: 'applied' }));
    const w = mountPage();
    const markApplied = (await openEmailTab(w)).props('markApplied') as () => Promise<boolean>;
    expect(await markApplied()).toBe(true);
    expect(apps.updateApplication).toHaveBeenCalledWith('a', { status: 'applied' });
    expect(useTrackerStore().details.a.status).toBe('applied');
  });

  it('a failure resolves to false and is NOT shown on the Progress card (only in the banner)', async () => {
    seed();
    apps.updateApplication.mockRejectedValue(new Error('API 500: x'));
    const w = mountPage();
    const markApplied = (await openEmailTab(w)).props('markApplied') as () => Promise<boolean>;
    expect(await markApplied()).toBe(false);
    await flushPromises();
    expect(w.find('.save-error').exists()).toBe(false);
    expect(useTrackerStore().details.a.status).toBe('saved'); // undone
  });
});

describe('TrackerDetailPage: "Please check" pills', () => {
  it('shows one pill for the Match tab and one for the Email tab; each opens its tab', async () => {
    seed();
    const w = mountPage();
    expect(pills(w).map((p) => p.text())).toEqual([
      'Please check 1 line in the Match tab',
      'Please check 1 line in the Email tab',
    ]);
    await pills(w)[1].trigger('click');
    expect(w.find('.stub-seg').attributes('data-value')).toBe('email');
    expect(w.findComponent(PanelStub).exists()).toBe(true);
    await pills(w)[0].trigger('click');
    expect(w.find('.stub-seg').attributes('data-value')).toBe('match');
  });

  it('counts the email lines (plural) and shows only the email pill when the match has none', () => {
    seed({ match: { score: 60, matched: [], gaps: [], warnings: ['The email mentions Go.', 'The email is long.'] } });
    const w = mountPage();
    expect(pills(w).map((p) => p.text())).toEqual(['Please check 2 lines in the Email tab']);
  });

  it('has no email pill without an email, or while a new version is written', async () => {
    const s = seed({ email: null });
    const w = mountPage();
    expect(pills(w).map((p) => p.text())).toEqual(['Please check 1 line in the Match tab']);
    s.details.a = { ...s.details.a, email: EMAIL };
    await flushPromises();
    expect(pills(w)).toHaveLength(2);
    s.emailWriting.a = true;
    await flushPromises();
    expect(pills(w).map((p) => p.text())).toEqual(['Please check 1 line in the Match tab']);
  });

  it('shows no pills when there is nothing to check', () => {
    seed({ match: { score: 60, matched: [], gaps: [], warnings: [] } });
    const w = mountPage();
    expect(w.find('.check-row').exists()).toBe(false);
  });
});

describe('TrackerDetailPage: delete', () => {
  it('says the application email is removed too', () => {
    seed();
    const w = mountPage();
    expect(w.find('.danger .fine').text()).toBe('Removes the job, its resume, cover letter and application email from your Tracker.');
  });
});
