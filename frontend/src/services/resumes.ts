import { api, apiUpload, ApiError } from './api';
import { normalizeResume, normalizeResumeList, type SavedResume } from './jobsLogic';

// Saved resume files (FastAPI backend, private Storage). The app only keeps the list in memory.

/** The user's saved resumes, newest first. */
export async function listResumes(): Promise<SavedResume[]> {
  return normalizeResumeList(await api<unknown>('/resumes'));
}

/**
 * Uploads a resume file (PDF or DOCX, already checked on the device) and returns the saved entry.
 * `signal` lets the screen cancel the upload.
 */
export async function uploadResumeFile(file: File, signal?: AbortSignal): Promise<SavedResume> {
  const form = new FormData();
  form.append('file', file);
  const saved = normalizeResume(await apiUpload<unknown>('/resumes', form, signal));
  if (!saved) throw new ApiError(502, 'The server sent an unexpected answer. Please try again.');
  return { ...saved, file_name: saved.file_name || file.name, size_bytes: saved.size_bytes || file.size };
}
