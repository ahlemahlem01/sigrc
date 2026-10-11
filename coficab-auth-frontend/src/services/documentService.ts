import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export interface DocumentDto {
  id: string;
  name: string;
  type: string;
  /** ISO date of the owner's last download, or "Never". */
  lastViewed: string;
  isFavorite: boolean;
  category?: string | null;
  description?: string | null;
  /** Name of the admin who added the document. */
  createdBy?: string | null;
  /** ISO date the document was added. */
  createdAt?: string | null;
}

interface ApiListResult<T> {
  data: T[];
}

export async function getMyDocuments(token: string): Promise<ApiListResult<DocumentDto>> {
  const res = await fetch(`${API_BASE}/documents/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

// Returns the raw Blob — caller decides what to do with it (trigger download, preview, etc.)
export async function downloadDocument(documentId: string, token: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.blob();
}

export async function toggleFavorite(
  documentId: string,
  token: string
): Promise<{ isFavorite: boolean }> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/favorite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}