/**
 * Copies text to the clipboard. Tries the modern Clipboard API first, then the older
 * "select a hidden text box and copy" way (some Android web views). Resolves to false when both fail,
 * so the screen can tell the user to select the text by hand. No plugin needed.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // blocked (no permission, not a secure page): try the older way below
  }
  const before = typeof document !== 'undefined' ? document.activeElement : null;
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.setAttribute('aria-hidden', 'true');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    box.style.pointerEvents = 'none';
    document.body.appendChild(box);
    box.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    box.remove();
    return !!ok;
  } catch {
    return false;
  } finally {
    // selecting the hidden box moved the focus: give it back to the Copy button
    if (before instanceof HTMLElement && document.activeElement !== before) before.focus({ preventScroll: true });
  }
}
