import { popoverController } from '@ionic/vue';
import StatusMenu from '@/components/StatusMenu.vue';
import { chooseAction } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import {
  DOC_LABEL, appTitle,
  type AppJob, type AppStatus, type DocType, type ExportFormat,
} from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

type AppLike = { id: string; status: AppStatus; job: Pick<AppJob, 'title'> };

/** The two small menus used on the Tracker screens: change the status, and pick PDF or DOCX. */
export function useTrackerActions() {
  const store = useTrackerStore();

  /** Opens the status menu next to the tapped badge and saves the choice.
   *  Resolves to the new status, or null (cancelled or failed). */
  async function pickStatus(app: AppLike, event: Event): Promise<AppStatus | null> {
    void tapHaptic();
    // Open towards the middle of the screen, so the menu never hangs off the edge.
    const target = event.target instanceof Element ? event.target : null;
    const onRight = !!target && target.getBoundingClientRect().left > window.innerWidth / 2;
    const popover = await popoverController.create({
      component: StatusMenu,
      componentProps: { current: app.status, title: appTitle(app) },
      event,
      side: 'bottom',
      alignment: onRight ? 'end' : 'start',
      arrow: false,
      cssClass: 'status-popover',
    });
    await popover.present();
    const { data: picked } = await popover.onDidDismiss<AppStatus>();
    if (!picked || picked === app.status) return null;
    return (await store.changeStatus(app.id, picked)) ? picked : null;
  }

  /** Opens the "Download PDF / DOCX" menu for one document and starts the download. */
  async function pickDownload(app: AppLike, docId: string, type: DocType): Promise<void> {
    void tapHaptic();
    const format = await chooseAction<ExportFormat>(
      `Download ${DOC_LABEL[type].toLowerCase()}`,
      [
        { value: 'pdf', text: 'Download PDF' },
        { value: 'docx', text: 'Download DOCX (Word)' },
      ],
      appTitle(app),
    );
    if (format) await store.download(docId, format, type);
  }

  return { pickStatus, pickDownload };
}
