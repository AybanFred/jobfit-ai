import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } },
}));

import {
  normalizeModelList, resolveInitialModel, isAvailableChoice, hasAvailableModel, optionLabel,
  loadSavedModel, saveModelChoice, fetchAiModels, MODEL_STORAGE_KEY, type AiModel,
} from '@/services/aiModels';
import { uploadResume, friendlyImportError } from '@/services/resumeImport';
import { ApiError } from '@/services/api';

const m = (id: string, available: boolean, provider = 'groq', label = 'Llama'): AiModel => ({
  id, provider, provider_label: provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Google Gemini' : 'OpenAI',
  model: id.split(':')[1] ?? id, label, available,
});

const models = [
  m('groq:llama', false),
  m('gemini:flash', true, 'gemini', 'Gemini Flash'),
  m('openai:mini', true, 'openai', 'GPT mini'),
];

describe('resolveInitialModel', () => {
  it('prefers the saved choice when it is in the list and available', () => {
    expect(resolveInitialModel(models, 'gemini:flash', 'openai:mini')).toBe('openai:mini');
  });

  it('falls back to the backend default when the saved choice is gone', () => {
    expect(resolveInitialModel(models, 'gemini:flash', 'old:model')).toBe('gemini:flash');
  });

  it('falls back to the default when the saved choice is no longer available', () => {
    expect(resolveInitialModel(models, 'gemini:flash', 'groq:llama')).toBe('gemini:flash');
  });

  it('uses the default when nothing was saved', () => {
    expect(resolveInitialModel(models, 'openai:mini', null)).toBe('openai:mini');
  });

  it('uses the first available model if the default is missing or unusable', () => {
    expect(resolveInitialModel(models, null, null)).toBe('gemini:flash');
    expect(resolveInitialModel(models, 'groq:llama', null)).toBe('gemini:flash');
  });

  it('returns null when no model is available', () => {
    expect(resolveInitialModel([m('groq:llama', false)], null, 'groq:llama')).toBeNull();
    expect(resolveInitialModel([], null, null)).toBeNull();
  });
});

describe('availability helpers', () => {
  it('accepts only available ids that are in the list', () => {
    expect(isAvailableChoice(models, 'gemini:flash')).toBe(true);
    expect(isAvailableChoice(models, 'groq:llama')).toBe(false);
    expect(isAvailableChoice(models, 'nope')).toBe(false);
    expect(isAvailableChoice(models, null)).toBe(false);
  });

  it('knows when nothing can be used', () => {
    expect(hasAvailableModel(models)).toBe(true);
    expect(hasAvailableModel([m('a:b', false)])).toBe(false);
    expect(hasAvailableModel([])).toBe(false);
  });

  it('labels options by provider and model, with a suffix when not set up', () => {
    expect(optionLabel(models[1]!)).toBe('Google Gemini - Gemini Flash');
    expect(optionLabel(models[0]!)).toBe('Groq - Llama - not set up');
  });
});

describe('normalizeModelList', () => {
  it('keeps good entries and drops broken ones', () => {
    const list = normalizeModelList({
      default: 'gemini:flash',
      models: [
        { id: 'gemini:flash', provider: 'gemini', provider_label: 'Google Gemini', model: 'flash', label: 'Gemini Flash', available: true },
        { id: 'gemini:flash', available: true }, // duplicate id
        { provider: 'x' }, // no id
        'junk',
        { id: 'groq:llama', provider: 'groq', available: 'yes' }, // not strictly true
      ],
    });
    expect(list.default).toBe('gemini:flash');
    expect(list.models.map((x) => x.id)).toEqual(['gemini:flash', 'groq:llama']);
    expect(list.models[1]?.available).toBe(false);
  });

  it('copes with a wrong answer', () => {
    expect(normalizeModelList(null)).toEqual({ default: null, models: [] });
    expect(normalizeModelList({ default: 5, models: 'x' })).toEqual({ default: null, models: [] });
  });
});

describe('remembered choice (preference only)', () => {
  it('saves and loads under the agreed key', () => {
    const store: Record<string, string> = {};
    const fake = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    saveModelChoice('openai:mini', fake);
    expect(store[MODEL_STORAGE_KEY]).toBe('openai:mini');
    expect(loadSavedModel(fake)).toBe('openai:mini');
  });

  it('never throws when storage is blocked or missing', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => saveModelChoice('x', broken)).not.toThrow();
    expect(loadSavedModel(broken)).toBeNull();
    expect(loadSavedModel(null)).toBeNull();
    expect(() => saveModelChoice('x', null)).not.toThrow();
  });

  it('returns null when nothing was saved', () => {
    expect(loadSavedModel({ getItem: () => null, setItem: () => undefined })).toBeNull();
  });
});

describe('network: GET /ai/models and model_id upload field', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches the list with the token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ default: 'gemini:flash', models: [{ id: 'gemini:flash', available: true }] }),
    });
    const list = await fetchAiModels();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/ai/models')).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(list.default).toBe('gemini:flash');
    expect(list.models[0]?.id).toBe('gemini:flash');
  });

  it('sends model_id as a form field when a model is chosen', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadResume(new File(['x'], 'cv.pdf'), undefined, 'openai:mini');
    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.get('model_id')).toBe('openai:mini');
    expect((form.get('file') as File).name).toBe('cv.pdf');
  });

  it('leaves model_id out when there is none', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadResume(new File(['x'], 'cv.pdf'));
    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.has('model_id')).toBe(false);
  });
});

describe('errors that name the provider', () => {
  it('shows the backend text for a provider that is not set up', () => {
    expect(friendlyImportError(new ApiError(503, 'Groq is not set up on the server')).message)
      .toBe('Groq is not set up on the server');
    expect(friendlyImportError(new ApiError(503, 'AI is not set up on the server')).message)
      .toBe('AI is not set up on the server');
  });

  it('shows "Unknown AI model" for a 400 and keeps the generic text for a bare 503', () => {
    expect(friendlyImportError(new ApiError(400, 'Unknown AI model')).message).toBe('Unknown AI model');
    expect(friendlyImportError(new ApiError(503, '')).message).toBe('Resume import is not set up yet on the server.');
  });
});
