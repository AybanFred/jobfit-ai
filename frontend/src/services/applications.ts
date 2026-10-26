import { api } from './api';
import {
  normalizeApplicationDetail, normalizeApplicationList, normalizeApplicationSummary,
  type ApplicationDetail, type ApplicationPatch, type ApplicationSummary,
} from './trackerLogic';

// Network calls for the Tracker (FastAPI backend, bearer token added by api()).
// New applications are created by POST /tailor (see tailor.ts).

const UNEXPECTED = 'API 502: {"detail":"The server sent an unexpected answer. Please try again."}';
const path = (id: string) => `/applications/${encodeURIComponent(id)}`;

/** All applications, newest first. */
export async function listApplications(): Promise<ApplicationSummary[]> {
  return normalizeApplicationList(await api<unknown>('/applications'));
}

/** One application with its documents, match and job post. */
export async function getApplication(id: string): Promise<ApplicationDetail> {
  const detail = normalizeApplicationDetail(await api<unknown>(path(id)));
  if (!detail) throw new Error(UNEXPECTED);
  return detail;
}

/**
 * Saves status, dates or notes. Answers with the updated row (or null if the answer was unreadable).
 * The backend fills in applied_at when the status becomes "applied" without a date.
 */
export async function updateApplication(id: string, patch: ApplicationPatch): Promise<ApplicationSummary | null> {
  const raw = await api<unknown>(path(id), { method: 'PATCH', body: JSON.stringify(patch) });
  return normalizeApplicationSummary(raw);
}

/** Removes the application together with its job, documents and files. Answers 204 with no body. */
export async function deleteApplication(id: string): Promise<void> {
  await api<void>(path(id), { method: 'DELETE' });
}
