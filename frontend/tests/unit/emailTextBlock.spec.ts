import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('@/services/feedback', () => ({ showToast: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));
vi.mock('@/services/clipboard', () => ({ copyText: vi.fn() }));

import EmailTextBlock from '@/components/EmailTextBlock.vue';
import { copyText } from '@/services/clipboard';
import { showToast } from '@/services/feedback';

const stubs = {
  IonIcon: true,
  IonButton: defineComponent({ props: ['disabled'], template: '<button class="stub-btn" :disabled="disabled"><slot /></button>' }),
};
const props = {
  label: 'Subject', text: 'Hello & welcome', fieldId: 'f1', copyLabel: 'Copy subject', copiedMessage: 'Subject copied',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EmailTextBlock', () => {
  it('shows the label and the text as read-only text', () => {
    const w = mount(EmailTextBlock, { props, global: { stubs } });
    expect(w.find('.text-label').text()).toBe('Subject');
    expect(w.find('.text-block').text()).toBe('Hello & welcome');
    expect(w.find('.text-block').attributes('aria-labelledby')).toBe('f1-label');
    expect(w.find('input, textarea').exists()).toBe(false);
  });

  it('copies, says "Copied" for 2 seconds and announces it', async () => {
    vi.mocked(copyText).mockResolvedValue(true);
    const w = mount(EmailTextBlock, { props, global: { stubs } });
    const btn = w.find('button.stub-btn');
    expect(btn.attributes('aria-label')).toBe('Copy subject');
    await btn.trigger('click');
    await flushPromises();
    expect(copyText).toHaveBeenCalledWith('Hello & welcome');
    expect(btn.text()).toBe('Copied');
    expect(w.find('[role="status"]').text()).toBe('Subject copied');
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(btn.text()).toBe('Copy');
    expect(w.find('[role="status"]').text()).toBe('');
  });

  it('tells the user how to copy by hand when the clipboard fails', async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const w = mount(EmailTextBlock, { props, global: { stubs } });
    await w.find('button.stub-btn').trigger('click');
    await flushPromises();
    expect(showToast).toHaveBeenCalledWith('Could not copy. Press and hold the text to select it.', 'error');
    expect(w.find('button.stub-btn').text()).toBe('Copy');
  });

  it('shows the empty text and disables Copy when there is nothing to copy', () => {
    const w = mount(EmailTextBlock, {
      props: { ...props, label: 'Message', text: '', multiline: true, emptyText: 'The email came back empty. Please write a new version.' },
      global: { stubs },
    });
    expect(w.find('.text-block').text()).toBe('The email came back empty. Please write a new version.');
    expect(w.find('button.stub-btn').attributes('disabled')).toBeDefined();
  });
});
