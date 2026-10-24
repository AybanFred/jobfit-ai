import { ref, type Ref } from 'vue';
import { friendlyDataError } from '@/services/errors';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { useProfileStore } from '@/stores/profile';

export interface CrudOptions<T, I> {
  /** Lower-case singular name used in messages, e.g. "experience". */
  noun: string;
  /** Friendly text when the list cannot be loaded. */
  loadError: string;
  fetch: () => Promise<T[]>;
  /** `editing` is the item being edited, or null when adding a new one. */
  save: (input: I, editing: T | null) => Promise<void>;
  remove: (item: T) => Promise<void>;
  /** Name of an item for the "are you sure?" question. */
  label: (item: T) => string;
  /** Button text in the confirmation, "Delete" (default) or "Remove". */
  removeVerb?: string;
  /** Turns a save error into friendly text (default: generic data error). */
  saveError?: (e: unknown) => string;
}

/**
 * Shared list + add/edit/delete flow for the Experience, Projects, Education and Skills screens:
 * loading and error state, the add/edit modal state, saving, confirm-before-delete, toasts,
 * and refreshing the profile counts so the Home ring stays correct.
 */
export function useSectionCrud<T, I>(opts: CrudOptions<T, I>) {
  const store = useProfileStore();
  const items = ref([]) as Ref<T[]>;
  const loading = ref(true);
  const error = ref('');

  const modalOpen = ref(false);
  const editing = ref(null) as Ref<T | null>;
  const saving = ref(false);
  const formError = ref('');

  const verb = opts.removeVerb ?? 'Delete';
  const capitalised = opts.noun.charAt(0).toUpperCase() + opts.noun.slice(1);

  /** `silent` keeps the current list on screen (no skeleton) while it refreshes. */
  async function load(silent = false) {
    if (!silent) loading.value = true;
    if (!silent) error.value = '';
    try {
      items.value = await opts.fetch();
    } catch {
      if (!silent) error.value = opts.loadError;
    } finally {
      loading.value = false;
    }
  }

  function openAdd() {
    tapHaptic();
    editing.value = null;
    formError.value = '';
    modalOpen.value = true;
  }

  function openEdit(item: T) {
    editing.value = item;
    formError.value = '';
    modalOpen.value = true;
  }

  function closeModal() {
    modalOpen.value = false;
  }

  async function afterChange() {
    await load(true);
    store.refreshCounts();
  }

  async function onSave(input: I) {
    if (saving.value) return;
    saving.value = true;
    formError.value = '';
    try {
      const wasEditing = !!editing.value;
      await opts.save(input, editing.value);
      modalOpen.value = false;
      showToast(wasEditing ? `${capitalised} updated.` : `${capitalised} added.`);
      await afterChange();
    } catch (e) {
      formError.value = (opts.saveError ?? friendlyDataError)(e);
    } finally {
      saving.value = false;
    }
  }

  async function onDelete(item: T) {
    const ok = await confirmAction(`${verb} this ${opts.noun}?`, `"${opts.label(item)}" will be removed from your profile.`, verb);
    if (!ok) return;
    try {
      await opts.remove(item);
      modalOpen.value = false;
      showToast(`${capitalised} ${verb === 'Remove' ? 'removed' : 'deleted'}.`);
      await afterChange();
    } catch (e) {
      showToast(friendlyDataError(e), 'error');
    }
  }

  return { items, loading, error, modalOpen, editing, saving, formError, load, openAdd, openEdit, closeModal, onSave, onDelete };
}
