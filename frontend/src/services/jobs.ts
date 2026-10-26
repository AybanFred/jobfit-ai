import { api } from './api';
import { normalizeJobList, type Job } from './jobsLogic';

// Network calls for the saved jobs list (FastAPI backend, bearer token added by api()).
// New jobs are created by POST /tailor (see tailor.ts).

/** All saved jobs, newest first. */
export async function listJobs(): Promise<Job[]> {
  return normalizeJobList(await api<unknown>('/jobs'));
}

export async function deleteJob(id: string): Promise<void> {
  await api<void>(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }); // answers 204 with no body
}
