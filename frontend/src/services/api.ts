import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL as string;

/** Calls the FastAPI backend with the user's Supabase token attached. */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Error from apiUpload: the HTTP status plus the backend's `detail` text (if it sent one). */
export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

/**
 * Sends a file (multipart/form-data) to the backend with the user's token.
 * We must NOT set Content-Type ourselves: the browser adds it together with the multipart boundary.
 * `signal` lets the screen cancel the upload.
 */
export async function apiUpload<T = unknown>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: form,
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      // body was not JSON: keep detail empty and let the screen use its own wording
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
