import { alertController, toastController } from '@ionic/vue';

// Small helpers for the short messages and "are you sure?" questions used on the profile screens.

/** A short message at the top of the screen (the bottom is taken by the tab bar). */
export async function showToast(message: string, kind: 'success' | 'error' = 'success'): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: kind === 'error' ? 3500 : 2200,
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
