import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/api', () => ({ api: vi.fn() }));
const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));

import { api } from '@/services/api';
import { downloadDocument, exportDocument, openDownload } from '@/services/documents';
import StatusBadge from '@/components/StatusBadge.vue';

const apiMock = vi.mocked(api);

beforeEach(() => {
  vi.resetAllMocks();
  native.value = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('documents service', () => {
  it('asks the backend for a download link in the chosen format', async () => {
    apiMock.mockResolvedValue({ url: 'https://files.example.com/cv.pdf?token=1', file_name: 'Ana-Lee-Resume.pdf', expires_in: 120 });
    const file = await exportDocument('doc 1', 'pdf', 'resume');
    expect(apiMock).toHaveBeenCalledWith('/documents/doc%201/export', { method: 'POST', body: JSON.stringify({ format: 'pdf' }) });
    expect(file).toEqual({ url: 'https://files.example.com/cv.pdf?token=1', file_name: 'Ana-Lee-Resume.pdf', expires_in: 120 });
  });

  it('fails with a readable error when the answer has no usable link', async () => {
    apiMock.mockResolvedValue({ url: 'javascript:alert(1)' });
    await expect(exportDocument('d1', 'docx', 'cover_letter')).rejects.toThrow(/API 502/);
  });

  it('on the web, clicks a temporary download link and removes it', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('https://files.example.com/x.pdf');
      expect(this.download).toBe('x.pdf');
      expect(document.body.contains(this)).toBe(true);
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openDownload('https://files.example.com/x.pdf', 'x.pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('in the phone app, opens the link in the system browser', () => {
    native.value = true;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openDownload('https://files.example.com/x.pdf', 'x.pdf');
    expect(open).toHaveBeenCalledWith('https://files.example.com/x.pdf', '_blank');
    expect(click).not.toHaveBeenCalled();
  });

  it('exports and downloads in one step', async () => {
    apiMock.mockResolvedValue({ url: 'https://files.example.com/l.docx' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const file = await downloadDocument('d2', 'docx', 'cover_letter');
    expect(file.file_name).toBe('cover-letter.docx');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('StatusBadge', () => {
  const stubs = { IonIcon: true };

  it('shows the label with the Ionic colour class of the status', () => {
    const w = mount(StatusBadge, { props: { status: 'interview' }, global: { stubs } });
    expect(w.text()).toBe('Interview');
    expect(w.element.tagName).toBe('SPAN');
    expect(w.classes()).toContain('ion-color-tertiary');
  });

  it('is a labelled button that emits click when interactive', async () => {
    const w = mount(StatusBadge, { props: { status: 'ghosted', interactive: true }, global: { stubs } });
    expect(w.element.tagName).toBe('BUTTON');
    expect(w.attributes('aria-label')).toBe('Status: Ghosted. Change status');
    expect(w.classes()).toContain('ion-color-warning');
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });
});
