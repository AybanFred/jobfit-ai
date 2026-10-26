import { Capacitor } from '@capacitor/core';
import { api } from './api';
import {
  fallbackFileName, normalizeExport, type DocType, type ExportFormat, type ExportedFile,
} from './trackerLogic';

// Downloads of tailored documents. The backend makes the PDF/DOCX file and answers with a short-lived
// signed link that forces a download, so the file itself never passes through the app.

/** Asks the backend for a download link (POST /documents/{id}/export). */
export async function exportDocument(docId: string, format: ExportFormat, type: DocType = 'resume'): Promise<ExportedFile> {
  const raw = await api<unknown>(`/documents/${encodeURIComponent(docId)}/export`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
  const file = normalizeExport(raw, fallbackFileName(type, format));
  if (!file) throw new Error('API 502: {"detail":"The server sent an unexpected answer. Please try again."}');
  return file;
}

/**
 * Starts the download of a signed link.
 * Web: a temporary <a download> is clicked (the link itself tells the browser to save the file).
 * Android/iOS app: the link opens in the system browser, which saves the file.
 */
export function openDownload(url: string, fileName: string): void {
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_blank');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Export + download in one step. */
export async function downloadDocument(docId: string, format: ExportFormat, type: DocType = 'resume'): Promise<ExportedFile> {
  const file = await exportDocument(docId, format, type);
  openDownload(file.url, file.file_name);
  return file;
}
