import { apiUpload, ApiError } from './api';
import { normalizeDraft, type ResumeDraft } from './importLogic';

// "Import from resume": checking the file on the device, sending it to the backend, friendly errors.
// The file and the answer are never logged or stored; they only live in memory while the user reviews them.

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The bits of a File we look at (a plain object works too, which keeps tests simple). */
export interface FileInfo {
  name: string;
  size: number;
}

/** Friendly message when the file cannot be sent, or '' when it is fine. Runs before any upload. */
export function validateResumeFile(file: FileInfo | null | undefined): string {
  if (!file) return 'Please choose your resume file.';
  const name = file.name.toLowerCase();
  if (name.endsWith('.doc')) {
    return 'Old Word files (.doc) cannot be read. Please save the resume as .docx or PDF and try again.';
  }
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    return 'Please choose a PDF or a Word (.docx) file.';
  }
  if (file.size <= 0) return 'That file is empty. Please choose your resume file.';
  if (file.size > MAX_RESUME_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That file is too large (${mb} MB). The limit is 5 MB.`;
  }
  return '';
}

export interface ImportError {
  message: string;
  /** True when sending the same file again could work (network, busy server...). */
  canRetry: boolean;
}

/** A backend message is safe to show when it is a short plain sentence (never a stack trace or JSON). */
export function isFriendlyDetail(detail: unknown): detail is string {
  if (typeof detail !== 'string') return false;
  const d = detail.trim();
  if (d.length < 3 || d.length > 300) return false;
  if (/[\r\n]/.test(d)) return false;
  if (/^[{[<]/.test(d)) return false;
  if (/traceback|exception|stack ?trace|file "|\.py\b|\bat \S+:\d+/i.test(d)) return false;
  return true;
}

export const isAbortError = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';

const OFFLINE = 'We could not reach the server. Please check your internet connection and try again.';

/** Turns an upload failure into a short, kind sentence. */
export function friendlyImportError(e: unknown): ImportError {
  if (e instanceof ApiError) {
    const nice = isFriendlyDetail(e.detail) ? e.detail.trim() : '';
    switch (e.status) {
      case 503:
        // The backend names the provider ("Groq is not set up on the server"): show it when it is friendly.
        return { message: nice || 'Resume import is not set up yet on the server.', canRetry: true };
      case 401:
        return { message: 'Your session has ended. Please log in again.', canRetry: false };
      case 413:
        return { message: nice || 'That file is too large. The limit is 5 MB.', canRetry: false };
      case 415:
        return { message: nice || 'Please choose a PDF or a Word (.docx) file.', canRetry: false };
      case 422:
        return {
          message: nice || 'We could not find readable text in that file. Scanned resumes cannot be read yet, so please try a text-based PDF or a .docx file.',
          canRetry: false,
        };
      case 429:
        return { message: nice || 'Too many tries. Please wait a minute and try again.', canRetry: true };
      case 502:
        return { message: nice || 'The reading service had a problem. Please try again in a moment.', canRetry: true };
      case 400:
        return { message: nice || 'We could not use that file. Please try another one.', canRetry: false };
      default:
        return {
          message: e.status >= 500
            ? 'The server had a problem. Please try again in a moment.'
            : (nice || 'We could not read that file. Please try again.'),
          canRetry: e.status >= 500,
        };
    }
  }
  if (e instanceof TypeError) return { message: OFFLINE, canRetry: true };
  return { message: 'Something went wrong while reading your resume. Please try again.', canRetry: true };
}

/** Sends the file to the backend and returns the draft (already cleaned up). */
export async function uploadResume(file: File, signal?: AbortSignal, modelId?: string | null): Promise<ResumeDraft> {
  const form = new FormData();
  form.append('file', file);
  if (modelId) form.append('model_id', modelId); // which AI model reads the resume (optional)
  const raw = await apiUpload<unknown>('/profile/import-resume', form, signal);
  return normalizeDraft(raw);
}
