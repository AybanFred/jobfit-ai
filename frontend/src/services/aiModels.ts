import { api } from './api';

// Which AI model reads the resume. The server decides which providers are set up (free tiers of
// Groq, Google Gemini and OpenAI); the app only lists them and remembers the user's preference.

export interface AiModel {
  id: string; // for example "groq:llama-3.3-70b-versatile"
  provider: string;
  provider_label: string;
  model: string;
  label: string;
  /** False when that provider has no key on the server. */
  available: boolean;
}

export interface AiModelList {
  /** The id of the first available model, or null when none is available. */
  default: string | null;
  models: AiModel[];
}

export const MODEL_STORAGE_KEY = 'jobfit-ai-model';

/** Makes the backend answer safe to use even if something is missing or has the wrong type. */
export function normalizeModelList(raw: unknown): AiModelList {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(root.models) ? root.models : [];
  const models: AiModel[] = [];
  for (const item of list) {
    const m = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    if (typeof m.id !== 'string' || !m.id) continue;
    if (models.some((x) => x.id === m.id)) continue;
    models.push({
      id: m.id,
      provider: typeof m.provider === 'string' ? m.provider : '',
      provider_label: typeof m.provider_label === 'string' && m.provider_label ? m.provider_label : String(m.provider ?? ''),
      model: typeof m.model === 'string' ? m.model : m.id,
      label: typeof m.label === 'string' && m.label ? m.label : String(m.model ?? m.id),
      available: m.available === true,
    });
  }
  return { default: typeof root.default === 'string' ? root.default : null, models };
}

export async function fetchAiModels(): Promise<AiModelList> {
  return normalizeModelList(await api<unknown>('/ai/models'));
}

// ---------- Pure selection logic ----------

export const isAvailableChoice = (models: readonly AiModel[], id: string | null | undefined): boolean =>
  !!id && models.some((m) => m.id === id && m.available);

/** At least one model can be used. */
export const hasAvailableModel = (models: readonly AiModel[]): boolean => models.some((m) => m.available);

/**
 * The model to preselect: the saved choice if it is still in the list and available,
 * otherwise the backend default, otherwise the first available model, otherwise null.
 */
export function resolveInitialModel(
  models: readonly AiModel[],
  defaultId: string | null,
  savedId: string | null,
): string | null {
  if (isAvailableChoice(models, savedId)) return savedId;
  if (isAvailableChoice(models, defaultId)) return defaultId;
  return models.find((m) => m.available)?.id ?? null;
}

/** Text of one dropdown option. Models that are not set up on the server get a suffix and are disabled. */
export const optionLabel = (m: AiModel): string =>
  `${m.provider_label} - ${m.label}${m.available ? '' : ' - not set up'}`;

// ---------- Remembering the choice (a preference only, never resume data) ----------

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSavedModel(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(MODEL_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveModelChoice(id: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(MODEL_STORAGE_KEY, id);
  } catch {
    // storage may be blocked (private mode); the choice just will not be remembered
  }
}
