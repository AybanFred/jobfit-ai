import { actionSheetController, alertController, toastController } from '@ionic/vue';

// Small helpers for short messages, "are you sure?" questions and pick-one menus.

/** A short message at the top of the screen (the bottom is taken by the tab bar). `durationMs` for longer texts. */
export async function showToast(message: string, kind: 'success' | 'error' = 'success', durationMs?: number): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: durationMs ?? (kind === 'error' ? 3500 : 2200),
    position: 'top',
    color: kind === 'error' ? 'danger' : 'success',
  });
  await toast.present();
}

/** Asks "are you sure?" and resolves to true only when the user confirms. */
export async function confirmAction(header: string, message: string, confirmText = 'Delete'): Promise<boolean> {
  const alert = await alertController.create({
    header,
    message,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: confirmText, role: 'destructive' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'destructive';
}

export interface ChoiceOption<T extends string> {
  value: T;
  text: string;
  icon?: string;
  /** Marks the option that is chosen now (shown in bold, with "(current)" after the text). */
  current?: boolean;
}

/** A small menu from the bottom of the screen. Resolves to the picked value, or null when cancelled. */
export async function chooseAction<T extends string>(
  header: string,
  options: ChoiceOption<T>[],
  subHeader?: string,
): Promise<T | null> {
  const sheet = await actionSheetController.create({
    header,
    subHeader,
    cssClass: 'ui-sheet',
    buttons: [
      ...options.map((o) => ({
        text: o.current ? `${o.text} (current)` : o.text,
        icon: o.icon,
        cssClass: o.current ? 'ui-sheet-current' : undefined,
        data: { value: o.value },
      })),
      { text: 'Cancel', role: 'cancel' },
    ],
  });
  await sheet.present();
  const { data, role } = await sheet.onDidDismiss<{ value: T }>();
  if (role === 'cancel' || role === 'backdrop') return null;
  return data?.value ?? null;
}
