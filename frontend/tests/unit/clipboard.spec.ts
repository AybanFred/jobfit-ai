import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/services/clipboard';

// copyText: the modern Clipboard API first, then the old "hidden text box + execCommand" way.

const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true });

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true });
});

afterEach(() => {
  setClipboard(undefined);
  document.body.innerHTML = '';
});

describe('copyText', () => {
  it('uses the Clipboard API when it works', async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    expect(await copyText('Dear Sam,\n\nHello & goodbye')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Dear Sam,\n\nHello & goodbye');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to the hidden text box when the Clipboard API is blocked, and cleans up', async () => {
    setClipboard({ writeText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) });
    let copiedFromBox = '';
    execCommand.mockImplementation(() => {
      copiedFromBox = (document.querySelector('textarea') as HTMLTextAreaElement).value;
      return true;
    });
    expect(await copyText('Line 1\nLine 2')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copiedFromBox).toBe('Line 1\nLine 2'); // line breaks survive
    expect(document.querySelector('textarea')).toBeNull(); // the box is removed again
  });

  it('falls back when there is no Clipboard API at all (older Android web views)', async () => {
    setClipboard(undefined);
    expect(await copyText('x')).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(1);
  });

  it('returns false when both ways fail, and still removes the box', async () => {
    setClipboard({ writeText: vi.fn(async () => { throw new Error('no'); }) });
    execCommand.mockReturnValue(false);
    expect(await copyText('x')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('returns false (and does not throw) when execCommand itself throws', async () => {
    setClipboard(undefined);
    execCommand.mockImplementation(() => { throw new Error('boom'); });
    expect(await copyText('x')).toBe(false);
  });

  it('gives the focus back to the button that was pressed', async () => {
    setClipboard(undefined);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    await copyText('x');
    expect(document.activeElement).toBe(button);
  });
});
