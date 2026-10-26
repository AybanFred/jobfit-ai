import { api } from './api';
import { normalizeTailorOut, type TailorRequest, type TailorResult } from './jobsLogic';

/**
 * Asks the AI to write a resume and cover letter for one job (POST /tailor).
 * The backend also saves the job and an application to the Tracker.
 * This can take 30 to 120 seconds: api() uses fetch, which has no time limit of its own,
 * so the store adds its own limit and the Cancel button uses `signal`.
 */
export async function tailorJob(body: TailorRequest, signal?: AbortSignal): Promise<TailorResult> {
  const raw = await api<unknown>('/tailor', { method: 'POST', body: JSON.stringify(body), signal });
  const result = normalizeTailorOut(raw);
  if (!result) throw new Error('API 502: {"detail":"The server sent an unexpected answer. Please try again."}');
  return result;
}
